import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, getUserId } from "./auth";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { ObjectPermission } from "./objectAcl";
import { insertProjectSchema, insertDocumentSchema } from "@shared/schema";
import { z } from "zod";
import OpenAI from "openai";

// Helper to get OpenAI client lazily (only when needed, not at import time)
function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }
  // the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
  return new OpenAI({ apiKey });
}

// Helper to extract text content from TipTap JSON
function extractTextFromContent(content: any): string {
  if (!content) return "";
  
  let text = "";
  
  function traverse(node: any) {
    if (!node) return;
    
    if (node.type === "text" && node.text) {
      text += node.text + " ";
    }
    
    if (node.content && Array.isArray(node.content)) {
      node.content.forEach(traverse);
    }
  }
  
  traverse(content);
  return text.trim();
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  setupAuth(app);

  app.get("/api/projects", isAuthenticated, async (req: Request, res) => {
    try {
      const userId = getUserId(req)!;
      const projects = await storage.getProjects(userId);
      res.json(projects);
    } catch (error) {
      console.error("Error fetching projects:", error);
      res.status(500).json({ message: "Failed to fetch projects" });
    }
  });

  app.get("/api/projects/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const project = await storage.getProject(req.params.id);

      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      if (project.ownerId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      res.json(project);
    } catch (error) {
      console.error("Error fetching project:", error);
      res.status(500).json({ message: "Failed to fetch project" });
    }
  });

  app.post("/api/projects", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const parsed = insertProjectSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }

      const project = await storage.createProject({
        ...parsed.data,
        ownerId: userId,
      });

      res.status(201).json(project);
    } catch (error) {
      console.error("Error creating project:", error);
      res.status(500).json({ message: "Failed to create project" });
    }
  });

  app.patch("/api/projects/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const project = await storage.getProject(req.params.id);

      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      if (project.ownerId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const updateSchema = insertProjectSchema.partial();
      const parsed = updateSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }

      const updated = await storage.updateProject(req.params.id, parsed.data);
      res.json(updated);
    } catch (error) {
      console.error("Error updating project:", error);
      res.status(500).json({ message: "Failed to update project" });
    }
  });

  app.delete("/api/projects/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const project = await storage.getProject(req.params.id);

      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      if (project.ownerId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      await storage.deleteProject(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting project:", error);
      res.status(500).json({ message: "Failed to delete project" });
    }
  });

  app.get("/api/projects/:projectId/documents", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const project = await storage.getProject(req.params.projectId);

      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      if (project.ownerId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const documents = await storage.getDocuments(req.params.projectId);
      res.json(documents);
    } catch (error) {
      console.error("Error fetching documents:", error);
      res.status(500).json({ message: "Failed to fetch documents" });
    }
  });

  app.post("/api/projects/:projectId/documents", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const project = await storage.getProject(req.params.projectId);

      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      if (project.ownerId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const createSchema = z.object({
        title: z.string().min(1),
        parentId: z.string().nullable().optional(),
        content: z.any().optional(),
        icon: z.string().optional(),
      });

      const parsed = createSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }

      const document = await storage.createDocument({
        title: parsed.data.title,
        parentId: parsed.data.parentId || null,
        content: parsed.data.content || null,
        icon: parsed.data.icon || null,
        projectId: req.params.projectId,
        position: 0,
      });

      res.status(201).json(document);
    } catch (error) {
      console.error("Error creating document:", error);
      res.status(500).json({ message: "Failed to create document" });
    }
  });

  app.get("/api/documents/recent", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const documents = await storage.getRecentDocuments(userId, 10);
      res.json(documents);
    } catch (error) {
      console.error("Error fetching recent documents:", error);
      res.status(500).json({ message: "Failed to fetch recent documents" });
    }
  });

  app.get("/api/documents/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const document = await storage.getDocument(req.params.id);

      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      const project = await storage.getProject(document.projectId);
      if (!project || project.ownerId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      res.json(document);
    } catch (error) {
      console.error("Error fetching document:", error);
      res.status(500).json({ message: "Failed to fetch document" });
    }
  });

  app.get("/api/documents/:id/ancestors", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const document = await storage.getDocument(req.params.id);

      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      const project = await storage.getProject(document.projectId);
      if (!project || project.ownerId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const ancestors = await storage.getDocumentAncestors(req.params.id);
      res.json(ancestors);
    } catch (error) {
      console.error("Error fetching ancestors:", error);
      res.status(500).json({ message: "Failed to fetch ancestors" });
    }
  });

  app.patch("/api/documents/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const document = await storage.getDocument(req.params.id);

      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      const project = await storage.getProject(document.projectId);
      if (!project || project.ownerId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const updateSchema = z.object({
        title: z.string().optional(),
        content: z.any().optional(),
        icon: z.string().nullable().optional(),
        parentId: z.string().nullable().optional(),
        position: z.number().optional(),
      });

      const parsed = updateSchema.safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }

      const updated = await storage.updateDocument(req.params.id, parsed.data);
      res.json(updated);
    } catch (error) {
      console.error("Error updating document:", error);
      res.status(500).json({ message: "Failed to update document" });
    }
  });

  app.delete("/api/documents/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const document = await storage.getDocument(req.params.id);

      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      const project = await storage.getProject(document.projectId);
      if (!project || project.ownerId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      await storage.deleteDocument(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting document:", error);
      res.status(500).json({ message: "Failed to delete document" });
    }
  });

  app.post("/api/documents/:id/duplicate", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const document = await storage.getDocument(req.params.id);

      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }

      const project = await storage.getProject(document.projectId);
      if (!project || project.ownerId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const newDoc = await storage.duplicateDocument(req.params.id);
      res.status(201).json(newDoc);
    } catch (error) {
      console.error("Error duplicating document:", error);
      res.status(500).json({ message: "Failed to duplicate document" });
    }
  });

  app.get("/api/search", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const query = (req.query.q as string) || "";

      if (!query || query.length < 1) {
        return res.json([]);
      }

      const results = await storage.search(userId, query);
      res.json(results);
    } catch (error) {
      console.error("Error searching:", error);
      res.status(500).json({ message: "Failed to search" });
    }
  });

  app.get("/public-objects/:filePath(*)", async (req, res) => {
    const filePath = req.params.filePath;
    const objectStorageService = new ObjectStorageService();
    try {
      const file = await objectStorageService.searchPublicObject(filePath);
      if (!file) {
        return res.status(404).json({ error: "File not found" });
      }
      objectStorageService.downloadObject(file, res);
    } catch (error) {
      console.error("Error searching for public object:", error);
      return res.status(500).json({ error: "Internal server error" });
    }
  });

  app.get("/objects/:objectPath(*)", isAuthenticated, async (req: any, res) => {
    const userId = getUserId(req);
    const objectStorageService = new ObjectStorageService();
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(req.path);
      const canAccess = await objectStorageService.canAccessObjectEntity({
        objectFile,
        userId: userId,
        requestedPermission: ObjectPermission.READ,
      });
      if (!canAccess) {
        return res.sendStatus(401);
      }
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error checking object access:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.sendStatus(404);
      }
      return res.sendStatus(500);
    }
  });

  app.post("/api/objects/upload", isAuthenticated, async (req, res) => {
    const objectStorageService = new ObjectStorageService();
    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  app.put("/api/document-images", isAuthenticated, async (req: Request, res) => {
    if (!req.body.imageURL) {
      return res.status(400).json({ error: "imageURL is required" });
    }

    const userId = getUserId(req)!;

    try {
      const objectStorageService = new ObjectStorageService();
      const objectPath = await objectStorageService.trySetObjectEntityAclPolicy(
        req.body.imageURL,
        {
          owner: userId,
          visibility: "public",
        }
      );

      res.status(200).json({
        objectPath: objectPath,
      });
    } catch (error) {
      console.error("Error setting image:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Chat API endpoint - uses projects and pages as knowledge base
  app.post("/api/chat", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      
      const chatSchema = z.object({
        message: z.string().min(1),
        conversationHistory: z.array(z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string()
        })).optional()
      });
      
      const parsed = chatSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.errors });
      }
      
      const { message, conversationHistory = [] } = parsed.data;
      
      // Lazily get OpenAI client - handles missing API key gracefully
      let openai: OpenAI;
      try {
        openai = getOpenAIClient();
      } catch (error: any) {
        console.error("OpenAI API key not configured:", error.message);
        return res.status(500).json({ message: "Chat service is not configured. Please add your OpenAI API key." });
      }
      
      // Build knowledge base from user's projects and pages with size limits
      const projects = await storage.getProjects(userId);
      let knowledgeBase = "";
      const MAX_KNOWLEDGE_BASE_CHARS = 50000; // Limit to prevent oversized prompts
      const MAX_PAGE_CONTENT_CHARS = 2000; // Limit per page
      
      for (const project of projects) {
        if (knowledgeBase.length >= MAX_KNOWLEDGE_BASE_CHARS) {
          knowledgeBase += "\n[Additional projects truncated due to size limits]\n";
          break;
        }
        
        knowledgeBase += `\n## Project: ${project.name}\n`;
        if (project.description) {
          knowledgeBase += `Description: ${project.description}\n`;
        }
        
        const documents = await storage.getDocuments(project.id);
        for (const doc of documents) {
          if (knowledgeBase.length >= MAX_KNOWLEDGE_BASE_CHARS) break;
          
          knowledgeBase += `\n### Page: ${doc.title}\n`;
          let textContent = extractTextFromContent(doc.content);
          
          // Truncate individual page content if too long
          if (textContent.length > MAX_PAGE_CONTENT_CHARS) {
            textContent = textContent.substring(0, MAX_PAGE_CONTENT_CHARS) + "... [truncated]";
          }
          
          if (textContent) {
            knowledgeBase += `${textContent}\n`;
          }
        }
      }
      
      // Build messages array for OpenAI
      const systemMessage = `You are DocuFlow Assistant, a helpful AI that assists users with their documentation projects. You have access to all of the user's projects and pages as your knowledge base.

Here is the user's documentation:
${knowledgeBase || "The user has no projects or pages yet."}

Instructions:
- Answer questions based on the user's documentation when relevant
- Help with documentation-related tasks like organizing content, suggesting improvements, or finding information
- Be concise and helpful
- If asked about something not in the documentation, you can still help but clarify that the information isn't in their docs`;

      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        { role: "system", content: systemMessage },
        ...conversationHistory.map(msg => ({
          role: msg.role as "user" | "assistant",
          content: msg.content
        })),
        { role: "user", content: message }
      ];
      
      // Call OpenAI with gpt-4.1-nano as requested by user
      const response = await openai.chat.completions.create({
        model: "gpt-4.1-nano",
        messages,
        max_completion_tokens: 1024,
      });
      
      const assistantMessage = response.choices[0]?.message?.content || "I'm sorry, I couldn't generate a response.";
      
      res.json({ 
        message: assistantMessage,
        model: "gpt-4.1-nano"
      });
    } catch (error: any) {
      console.error("Error in chat:", error);
      res.status(500).json({ message: "Failed to process chat request", error: error.message });
    }
  });

  return httpServer;
}
