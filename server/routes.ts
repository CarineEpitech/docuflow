import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { randomBytes } from "crypto";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, getUserId, hashPassword, verifyPassword, regenerateSession } from "./auth";
import { z } from "zod";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { ObjectPermission } from "./objectAcl";
import { 
  insertProjectSchema, 
  insertDocumentSchema, 
  insertCrmClientSchema,
  insertCrmContactSchema,
  insertCrmProjectSchema,
  crmProjectStatusValues 
} from "@shared/schema";
import OpenAI from "openai";
import {
  updateDocumentEmbeddings,
  deleteDocumentEmbeddings,
  deleteProjectEmbeddings,
  searchSimilarChunks,
  hasEmbeddings,
  rebuildAllEmbeddings,
} from "./embeddings";
import {
  syncDocumentVideoTranscripts,
  getTranscriptStatus,
  retryTranscript,
} from "./transcripts";

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
  await setupAuth(app);

  // Auth user endpoint - returns current user info or null if not authenticated
  app.get("/api/auth/user", async (req: Request, res) => {
    try {
      const userId = getUserId(req);
      if (!userId) {
        return res.json(null);
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.json(null);
      }
      
      // Return user without password
      const { password, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      console.error("Error fetching auth user:", error);
      res.json(null);
    }
  });

  // Register endpoint
  const registerSchema = z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
  });

  app.post("/api/auth/register", async (req: Request, res) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }

      const { email, password, firstName, lastName } = parsed.data;

      // Check if user already exists
      const existingUser = await storage.getUserByEmail(email);
      if (existingUser) {
        return res.status(400).json({ message: "Email already registered" });
      }

      // Hash password and create user
      const hashedPassword = await hashPassword(password);
      const user = await storage.createUser({
        email,
        password: hashedPassword,
        firstName: firstName || null,
        lastName: lastName || null,
        profileImageUrl: null,
      });

      // Regenerate session to prevent fixation attacks, then set userId
      await regenerateSession(req);
      (req.session as any).userId = user.id;

      // Return user without password
      const { password: _, ...safeUser } = user;
      res.status(201).json(safeUser);
    } catch (error) {
      console.error("Error registering user:", error);
      res.status(500).json({ message: "Failed to register user" });
    }
  });

  // Login endpoint
  const loginSchema = z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(1, "Password is required"),
  });

  app.post("/api/auth/login", async (req: Request, res) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: parsed.error.errors[0].message });
      }

      const { email, password } = parsed.data;

      // Find user by email
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Verify password
      const isValid = await verifyPassword(password, user.password);
      if (!isValid) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      // Regenerate session to prevent fixation attacks, then set userId
      await regenerateSession(req);
      (req.session as any).userId = user.id;

      // Return user without password
      const { password: _, ...safeUser } = user;
      res.json(safeUser);
    } catch (error) {
      console.error("Error logging in:", error);
      res.status(500).json({ message: "Failed to login" });
    }
  });

  // Logout endpoint
  app.post("/api/auth/logout", (req: Request, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error("Error destroying session:", err);
        return res.status(500).json({ message: "Failed to logout" });
      }
      res.json({ message: "Logged out successfully" });
    });
  });

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

  // Get documentation-enabled projects only (for documentation sidebar)
  // NOTE: This must come BEFORE /api/projects/:id to avoid "documentable" matching :id
  app.get("/api/projects/documentable", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const projects = await storage.getDocumentationEnabledProjects(userId);
      res.json(projects);
    } catch (error) {
      console.error("Error fetching documentable projects:", error);
      res.status(500).json({ message: "Failed to fetch documentable projects" });
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

  // NOTE: This endpoint is deprecated - projects must be created through CRM
  // This endpoint now redirects to CRM project creation for backwards compatibility
  app.post("/api/projects", isAuthenticated, async (req: any, res) => {
    // Return error indicating projects must be created through CRM
    return res.status(400).json({ 
      message: "Projects must be created through Project Management. Use POST /api/crm/projects instead.",
      redirectTo: "/api/crm/projects"
    });
  });

  // NOTE: Project updates should go through CRM for metadata consistency
  // This endpoint is restricted to only allow name updates (for sidebar rename functionality)
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

      // Only allow name updates from this endpoint - other fields should go through CRM
      const updateSchema = z.object({
        name: z.string().min(1).optional(),
      });
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

  // NOTE: Project deletion should go through CRM to maintain business rules
  // This endpoint is deprecated - use DELETE /api/crm/projects/:id instead
  app.delete("/api/projects/:id", isAuthenticated, async (req: any, res) => {
    // Return error indicating projects must be deleted through CRM
    return res.status(400).json({ 
      message: "Projects must be deleted through Project Management. Use DELETE /api/crm/projects/:id instead.",
      redirectTo: "/api/crm/projects"
    });
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

      // Get breadcrumbs from parent if it exists
      let breadcrumbs: string[] = [];
      if (parsed.data.parentId) {
        const ancestors = await storage.getDocumentAncestors(document.id);
        breadcrumbs = ancestors.map(a => a.title);
      }

      // Generate embeddings for the new document asynchronously
      updateDocumentEmbeddings(
        document.id,
        req.params.projectId,
        userId,
        document.title,
        document.content,
        project.name,
        breadcrumbs
      ).catch(err => console.error("Error generating embeddings:", err));

      // Sync video transcripts asynchronously
      if (document.content) {
        syncDocumentVideoTranscripts(
          document.id,
          req.params.projectId,
          userId,
          document.content,
          project.name,
          document.title,
          breadcrumbs
        ).catch(err => console.error("Error syncing video transcripts:", err));
      }

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
      
      // Update embeddings if title or content changed
      if (updated && (parsed.data.title !== undefined || parsed.data.content !== undefined)) {
        const ancestors = await storage.getDocumentAncestors(req.params.id);
        const breadcrumbs = ancestors.map(a => a.title);
        
        updateDocumentEmbeddings(
          updated.id,
          updated.projectId,
          userId,
          updated.title,
          updated.content,
          project.name,
          breadcrumbs
        ).catch(err => console.error("Error updating embeddings:", err));

        // Sync video transcripts when content changes
        if (parsed.data.content !== undefined && updated.content) {
          syncDocumentVideoTranscripts(
            updated.id,
            updated.projectId,
            userId,
            updated.content,
            project.name,
            updated.title,
            breadcrumbs
          ).catch(err => console.error("Error syncing video transcripts:", err));
        }
      }
      
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

      // Delete embeddings first (cascade should handle this, but be explicit)
      try {
        await deleteDocumentEmbeddings(req.params.id);
      } catch (err) {
        console.error("Error deleting embeddings:", err);
      }
      
      // Delete video transcripts and their embeddings
      try {
        const { deleteDocumentTranscripts } = await import("./transcripts");
        await deleteDocumentTranscripts(req.params.id);
      } catch (err) {
        console.error("Error deleting video transcripts:", err);
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

  // Rebuild embeddings for all user documents
  // This is useful for initial setup or after bulk imports
  app.post("/api/embeddings/rebuild", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      
      // Get all user's projects and documents
      const projects = await storage.getProjects(userId);
      const projectMap = new Map(projects.map(p => [p.id, p]));
      const allDocuments = await storage.getAllUserDocuments(userId);
      
      // Rebuild embeddings for each document
      const results = { processed: 0, errors: 0 };
      
      for (const doc of allDocuments) {
        try {
          const project = projectMap.get(doc.projectId);
          if (!project) continue;
          
          const ancestors = await storage.getDocumentAncestors(doc.id);
          const breadcrumbs = ancestors.map(a => a.title);
          
          await updateDocumentEmbeddings(
            doc.id,
            doc.projectId,
            userId,
            doc.title,
            doc.content,
            project.name,
            breadcrumbs
          );
          
          results.processed++;
        } catch (error) {
          console.error(`Error rebuilding embeddings for document ${doc.id}:`, error);
          results.errors++;
        }
      }
      
      res.json({
        message: "Embeddings rebuild complete",
        ...results,
        total: allDocuments.length
      });
    } catch (error: any) {
      console.error("Error rebuilding embeddings:", error);
      res.status(500).json({ message: "Failed to rebuild embeddings", error: error.message });
    }
  });

  // Get transcript status for a document
  app.get("/api/documents/:id/transcripts", isAuthenticated, async (req: any, res) => {
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

      const status = await getTranscriptStatus(req.params.id);
      res.json(status);
    } catch (error) {
      console.error("Error fetching transcript status:", error);
      res.status(500).json({ message: "Failed to fetch transcript status" });
    }
  });

  // Retry a failed transcript extraction
  app.post("/api/transcripts/:id/retry", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      
      // Get transcript and verify ownership
      const { db } = await import("./db");
      const { videoTranscripts } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      
      const [transcript] = await db
        .select()
        .from(videoTranscripts)
        .where(eq(videoTranscripts.id, req.params.id));

      if (!transcript) {
        return res.status(404).json({ message: "Transcript not found" });
      }

      if (transcript.ownerId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const document = await storage.getDocument(transcript.documentId);
      const project = await storage.getProject(transcript.projectId);
      
      if (!document || !project) {
        return res.status(404).json({ message: "Document or project not found" });
      }

      // Get ancestors for breadcrumbs
      const ancestors = await storage.getDocumentAncestors(document.id);
      const breadcrumbs = ancestors.map(a => a.title);

      const result = await retryTranscript(
        transcript.id,
        project.name,
        document.title,
        breadcrumbs
      );

      if (result.success) {
        res.json({ message: "Transcript retry initiated" });
      } else {
        res.status(500).json({ message: result.error || "Failed to retry transcript" });
      }
    } catch (error) {
      console.error("Error retrying transcript:", error);
      res.status(500).json({ message: "Failed to retry transcript" });
    }
  });

  // Manually trigger transcript sync for a document
  app.post("/api/documents/:id/sync-transcripts", isAuthenticated, async (req: any, res) => {
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

      if (!document.content) {
        return res.json({ message: "No content to sync", added: 0, removed: 0 });
      }

      // Get ancestors for breadcrumbs
      const ancestors = await storage.getDocumentAncestors(document.id);
      const breadcrumbs = ancestors.map(a => a.title);

      const result = await syncDocumentVideoTranscripts(
        document.id,
        document.projectId,
        userId,
        document.content,
        project.name,
        document.title,
        breadcrumbs
      );

      res.json({
        message: "Transcript sync initiated",
        ...result
      });
    } catch (error) {
      console.error("Error syncing transcripts:", error);
      res.status(500).json({ message: "Failed to sync transcripts" });
    }
  });

  // Chat API endpoint - uses projects and pages as knowledge base
  // Knowledge base is dynamic: always fetches fresh data from database
  // When pages are created/updated/deleted, the next chat query will reflect those changes
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
      
      // Get project overview for context
      const projects = await storage.getProjects(userId);
      let projectOverview = "# Available Projects\n\n";
      for (const project of projects) {
        projectOverview += `- **${project.name}**`;
        if (project.description) {
          projectOverview += `: ${project.description}`;
        }
        projectOverview += "\n";
      }
      
      // Use vector search to find relevant documentation chunks
      // This allows unlimited access to all documentation without character limits
      let relevantContext = "";
      let searchResults: { chunkText: string; title: string; projectName: string; breadcrumbs: string[]; similarity: number }[] = [];
      let usedFallback = false;
      
      try {
        // Search for chunks related to the user's question
        searchResults = await searchSimilarChunks(userId, message, 15); // Get top 15 most relevant chunks
        
        if (searchResults.length > 0) {
          relevantContext = "# Relevant Documentation\n\n";
          
          // Group results by document for better context
          const byDocument = new Map<string, typeof searchResults>();
          for (const result of searchResults) {
            const key = `${result.projectName}/${result.title}`;
            const existing = byDocument.get(key) || [];
            existing.push(result);
            byDocument.set(key, existing);
          }
          
          for (const [docKey, chunks] of byDocument) {
            const first = chunks[0];
            const breadcrumbPath = first.breadcrumbs.length > 0 
              ? first.breadcrumbs.join(" > ") + " > " + first.title
              : first.title;
            
            relevantContext += `## ${first.projectName} / ${breadcrumbPath}\n\n`;
            
            // Combine chunks from the same document
            for (const chunk of chunks) {
              relevantContext += chunk.chunkText + "\n\n";
            }
          }
        }
      } catch (error) {
        console.error("Error searching embeddings:", error);
        // Fall back to loading all documents directly
      }
      
      // Fallback: If no embeddings found, load documents directly
      if (searchResults.length === 0) {
        usedFallback = true;
        const allDocuments = await storage.getAllUserDocuments(userId);
        const projectMap = new Map(projects.map(p => [p.id, p]));
        
        if (allDocuments.length > 0) {
          relevantContext = "# Documentation Content\n\n";
          const MAX_FALLBACK_CHARS = 50000;
          
          for (const doc of allDocuments) {
            if (relevantContext.length >= MAX_FALLBACK_CHARS) {
              relevantContext += "\n[Additional content available via semantic search...]\n";
              break;
            }
            
            const project = projectMap.get(doc.projectId);
            const projectName = project?.name || "Unknown Project";
            
            relevantContext += `## ${projectName} / ${doc.title}\n`;
            const textContent = extractTextFromContent(doc.content);
            if (textContent) {
              relevantContext += textContent + "\n\n";
            } else {
              relevantContext += "(Empty page)\n\n";
            }
          }
        }
      }
      
      // Build system message with semantic search results
      const systemMessage = `You are DocuFlow Assistant, a helpful AI that assists users with their documentation projects. You have access to ALL of the user's projects and pages through semantic search - there are no character limits. When pages are created, updated, or deleted, the knowledge base is automatically updated.

${projectOverview}

${relevantContext || "No specific documentation found related to this query. The user's documentation may be empty or their question may not relate to existing content."}

Instructions:
- Answer questions based on the user's documentation when the relevant content is shown above
- You can reference specific pages, projects, and their content
- Help with documentation-related tasks like organizing content, suggesting improvements, or finding information
- Be concise and helpful
- If the relevant documentation section is empty or doesn't contain what was asked about, you can still help but clarify that the specific information wasn't found in their docs
- When referencing documentation, be specific about which project and page the information comes from
- For general questions about projects, you have access to all project names listed above`;

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
        model: "gpt-4.1-nano",
        relevantDocs: searchResults.length,
        usedFallback
      });
    } catch (error: any) {
      console.error("Error in chat:", error);
      res.status(500).json({ message: "Failed to process chat request", error: error.message });
    }
  });

  // ========== CRM Routes ==========

  // Get all CRM clients for the user
  app.get("/api/crm/clients", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const clients = await storage.getCrmClients(userId);
      res.json(clients);
    } catch (error) {
      console.error("Error fetching CRM clients:", error);
      res.status(500).json({ message: "Failed to fetch clients" });
    }
  });

  // Get single CRM client with contacts
  app.get("/api/crm/clients/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const client = await storage.getCrmClient(req.params.id);
      
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      
      if (client.ownerId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      const contacts = await storage.getCrmContacts(client.id);
      res.json({ ...client, contacts });
    } catch (error) {
      console.error("Error fetching CRM client:", error);
      res.status(500).json({ message: "Failed to fetch client" });
    }
  });

  // Create CRM client
  app.post("/api/crm/clients", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const parsed = insertCrmClientSchema.safeParse(req.body);
      
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      
      const client = await storage.createCrmClient({ ...parsed.data, ownerId: userId });
      res.status(201).json(client);
    } catch (error) {
      console.error("Error creating CRM client:", error);
      res.status(500).json({ message: "Failed to create client" });
    }
  });

  // Update CRM client
  app.patch("/api/crm/clients/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const client = await storage.getCrmClient(req.params.id);
      
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      
      if (client.ownerId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      const updateSchema = insertCrmClientSchema.partial();
      const parsed = updateSchema.safeParse(req.body);
      
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      
      const updated = await storage.updateCrmClient(req.params.id, parsed.data);
      res.json(updated);
    } catch (error) {
      console.error("Error updating CRM client:", error);
      res.status(500).json({ message: "Failed to update client" });
    }
  });

  // Delete CRM client
  app.delete("/api/crm/clients/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const client = await storage.getCrmClient(req.params.id);
      
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      
      if (client.ownerId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      await storage.deleteCrmClient(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting CRM client:", error);
      res.status(500).json({ message: "Failed to delete client" });
    }
  });

  // Create CRM contact for a client
  app.post("/api/crm/clients/:clientId/contacts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const client = await storage.getCrmClient(req.params.clientId);
      
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      
      if (client.ownerId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      const parsed = insertCrmContactSchema.safeParse({ ...req.body, clientId: req.params.clientId });
      
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      
      const contact = await storage.createCrmContact(parsed.data);
      res.status(201).json(contact);
    } catch (error) {
      console.error("Error creating CRM contact:", error);
      res.status(500).json({ message: "Failed to create contact" });
    }
  });

  // Update CRM contact
  app.patch("/api/crm/contacts/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const contact = await storage.getCrmContact(req.params.id);
      
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      
      const client = await storage.getCrmClient(contact.clientId);
      if (!client || client.ownerId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      const updateSchema = insertCrmContactSchema.partial().omit({ clientId: true });
      const parsed = updateSchema.safeParse(req.body);
      
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      
      const updated = await storage.updateCrmContact(req.params.id, parsed.data);
      res.json(updated);
    } catch (error) {
      console.error("Error updating CRM contact:", error);
      res.status(500).json({ message: "Failed to update contact" });
    }
  });

  // Delete CRM contact
  app.delete("/api/crm/contacts/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const contact = await storage.getCrmContact(req.params.id);
      
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      
      const client = await storage.getCrmClient(contact.clientId);
      if (!client || client.ownerId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      await storage.deleteCrmContact(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting CRM contact:", error);
      res.status(500).json({ message: "Failed to delete contact" });
    }
  });

  // Get paginated CRM projects
  app.get("/api/crm/projects", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 10;
      const status = req.query.status as string | undefined;
      const search = req.query.search as string | undefined;
      
      const result = await storage.getCrmProjects(userId, { page, pageSize, status, search });
      res.json(result);
    } catch (error) {
      console.error("Error fetching CRM projects:", error);
      res.status(500).json({ message: "Failed to fetch CRM projects" });
    }
  });

  // Get single CRM project with details
  app.get("/api/crm/projects/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const crmProject = await storage.getCrmProject(req.params.id);
      
      if (!crmProject) {
        return res.status(404).json({ message: "CRM Project not found" });
      }
      
      // Verify ownership via the linked project
      if (crmProject.project && crmProject.project.ownerId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      res.json(crmProject);
    } catch (error) {
      console.error("Error fetching CRM project:", error);
      res.status(500).json({ message: "Failed to fetch CRM project" });
    }
  });

  // Create CRM project with base project atomically (new flow: CRM is source of truth)
  app.post("/api/crm/projects", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      
      const createSchema = z.object({
        name: z.string().min(1, "Project name is required"),
        description: z.string().nullable().optional(),
        icon: z.string().optional(),
        clientId: z.string().nullable().optional(),
        status: z.enum(crmProjectStatusValues).optional(),
        assigneeId: z.string().nullable().optional(),
        startDate: z.string().nullable().optional(),
        dueDate: z.string().nullable().optional(),
        actualFinishDate: z.string().nullable().optional(),
        comments: z.string().nullable().optional(),
      });
      
      const parsed = createSchema.safeParse(req.body);
      
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      
      const { project, crmProject } = await storage.createCrmProjectWithBase(
        {
          name: parsed.data.name,
          description: parsed.data.description || null,
          icon: parsed.data.icon || "folder",
          ownerId: userId,
        },
        {
          clientId: parsed.data.clientId || null,
          status: parsed.data.status || "lead",
          assigneeId: parsed.data.assigneeId || null,
          startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
          dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
          actualFinishDate: parsed.data.actualFinishDate ? new Date(parsed.data.actualFinishDate) : null,
          comments: parsed.data.comments || null,
        }
      );
      
      res.status(201).json({ project, crmProject });
    } catch (error) {
      console.error("Error creating CRM project:", error);
      res.status(500).json({ message: "Failed to create CRM project" });
    }
  });

  // Toggle documentation enabled for a CRM project
  app.patch("/api/crm/projects/:id/documentation", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const crmProject = await storage.getCrmProject(req.params.id);
      
      if (!crmProject) {
        return res.status(404).json({ message: "CRM Project not found" });
      }
      
      if (crmProject.project && crmProject.project.ownerId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      const toggleSchema = z.object({
        enabled: z.boolean(),
      });
      
      const parsed = toggleSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      
      const updated = await storage.toggleDocumentation(req.params.id, parsed.data.enabled);
      res.json(updated);
    } catch (error) {
      console.error("Error toggling documentation:", error);
      res.status(500).json({ message: "Failed to toggle documentation" });
    }
  });

  // Update CRM project
  app.patch("/api/crm/projects/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const crmProject = await storage.getCrmProject(req.params.id);
      
      if (!crmProject) {
        return res.status(404).json({ message: "CRM Project not found" });
      }
      
      // Verify ownership via the linked project
      if (crmProject.project && crmProject.project.ownerId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      const updateSchema = z.object({
        clientId: z.string().nullable().optional(),
        status: z.enum(crmProjectStatusValues).optional(),
        assigneeId: z.string().nullable().optional(),
        startDate: z.string().nullable().optional(),
        dueDate: z.string().nullable().optional(),
        actualFinishDate: z.string().nullable().optional(),
        comments: z.string().nullable().optional(),
      }).partial();
      
      const parsed = updateSchema.safeParse(req.body);
      
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      
      // Convert date strings to Date objects
      const updateData: any = { ...parsed.data };
      if (parsed.data.startDate !== undefined) {
        updateData.startDate = parsed.data.startDate ? new Date(parsed.data.startDate) : null;
      }
      if (parsed.data.dueDate !== undefined) {
        updateData.dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;
      }
      if (parsed.data.actualFinishDate !== undefined) {
        updateData.actualFinishDate = parsed.data.actualFinishDate ? new Date(parsed.data.actualFinishDate) : null;
      }
      
      const updated = await storage.updateCrmProject(req.params.id, updateData);
      res.json(updated);
    } catch (error) {
      console.error("Error updating CRM project:", error);
      res.status(500).json({ message: "Failed to update CRM project" });
    }
  });

  // Delete CRM project
  app.delete("/api/crm/projects/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const crmProject = await storage.getCrmProject(req.params.id);
      
      if (!crmProject) {
        return res.status(404).json({ message: "CRM Project not found" });
      }
      
      // Verify ownership via the linked project
      if (crmProject.project && crmProject.project.ownerId !== userId) {
        return res.status(403).json({ message: "Forbidden" });
      }
      
      await storage.deleteCrmProject(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting CRM project:", error);
      res.status(500).json({ message: "Failed to delete CRM project" });
    }
  });

  // Get all users for assignee dropdown
  app.get("/api/users", isAuthenticated, async (req: any, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // ==================== Company Document Folders ====================
  
  // List all folders
  app.get("/api/company-document-folders", isAuthenticated, async (req: any, res) => {
    try {
      const folders = await storage.getCompanyDocumentFolders();
      res.json(folders);
    } catch (error) {
      console.error("Error fetching company document folders:", error);
      res.status(500).json({ message: "Failed to fetch folders" });
    }
  });

  // Get single folder
  app.get("/api/company-document-folders/:id", isAuthenticated, async (req: any, res) => {
    try {
      const folder = await storage.getCompanyDocumentFolder(req.params.id);
      if (!folder) {
        return res.status(404).json({ message: "Folder not found" });
      }
      res.json(folder);
    } catch (error) {
      console.error("Error fetching folder:", error);
      res.status(500).json({ message: "Failed to fetch folder" });
    }
  });

  // Create folder
  app.post("/api/company-document-folders", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const createSchema = z.object({
        name: z.string().min(1, "Folder name is required"),
      });
      
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      
      const folder = await storage.createCompanyDocumentFolder({
        name: parsed.data.name,
        createdById: userId,
      });
      
      res.status(201).json(folder);
    } catch (error) {
      console.error("Error creating folder:", error);
      res.status(500).json({ message: "Failed to create folder" });
    }
  });

  // Update folder (rename)
  app.patch("/api/company-document-folders/:id", isAuthenticated, async (req: any, res) => {
    try {
      const updateSchema = z.object({
        name: z.string().min(1, "Folder name is required"),
      });
      
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      
      const folder = await storage.updateCompanyDocumentFolder(req.params.id, parsed.data);
      if (!folder) {
        return res.status(404).json({ message: "Folder not found" });
      }
      
      res.json(folder);
    } catch (error) {
      console.error("Error updating folder:", error);
      res.status(500).json({ message: "Failed to update folder" });
    }
  });

  // Delete folder
  app.delete("/api/company-document-folders/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const user = await storage.getUser(userId);
      
      // Only admins can delete folders
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can delete folders" });
      }
      
      const folder = await storage.deleteCompanyDocumentFolder(req.params.id);
      if (!folder) {
        return res.status(404).json({ message: "Folder not found" });
      }
      
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting folder:", error);
      res.status(500).json({ message: "Failed to delete folder" });
    }
  });

  // ==================== Company Documents ====================
  
  // List company documents (optionally by folder)
  app.get("/api/company-documents", isAuthenticated, async (req: any, res) => {
    try {
      const folderId = req.query.folderId as string | undefined;
      const documents = await storage.getCompanyDocuments(folderId);
      res.json(documents);
    } catch (error) {
      console.error("Error fetching company documents:", error);
      res.status(500).json({ message: "Failed to fetch company documents" });
    }
  });
  
  // Search company documents
  app.get("/api/company-documents/search", isAuthenticated, async (req: any, res) => {
    try {
      const query = req.query.q as string;
      if (!query || query.trim().length === 0) {
        return res.json([]);
      }
      const documents = await storage.searchCompanyDocuments(query);
      res.json(documents);
    } catch (error) {
      console.error("Error searching company documents:", error);
      res.status(500).json({ message: "Failed to search documents" });
    }
  });

  // Get upload URL for company document
  app.post("/api/company-documents/upload-url", isAuthenticated, async (req: any, res) => {
    try {
      const objectStorageService = new ObjectStorageService();
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting upload URL:", error);
      res.status(500).json({ message: "Failed to get upload URL" });
    }
  });

  // Get single company document
  app.get("/api/company-documents/:id", isAuthenticated, async (req: any, res) => {
    try {
      const document = await storage.getCompanyDocument(req.params.id);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }
      res.json(document);
    } catch (error) {
      console.error("Error fetching company document:", error);
      res.status(500).json({ message: "Failed to fetch document" });
    }
  });

  // Create company document record after upload (or create a text document)
  app.post("/api/company-documents", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      
      const createSchema = z.object({
        name: z.string().min(1, "Name is required"),
        description: z.string().optional(),
        content: z.any().optional(),
        fileName: z.string().optional(),
        fileSize: z.number().optional(),
        mimeType: z.string().optional(),
        storagePath: z.string().optional(),
        folderId: z.string().optional(),
      });
      
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      
      // If it's an uploaded file, set ACL policy
      if (parsed.data.storagePath) {
        const objectStorageService = new ObjectStorageService();
        await objectStorageService.trySetObjectEntityAclPolicy(
          parsed.data.storagePath,
          {
            owner: userId,
            visibility: "private",
          }
        );
      }
      
      const document = await storage.createCompanyDocument({
        name: parsed.data.name,
        description: parsed.data.description || null,
        content: parsed.data.content || null,
        fileName: parsed.data.fileName || null,
        fileSize: parsed.data.fileSize || null,
        mimeType: parsed.data.mimeType || null,
        storagePath: parsed.data.storagePath || null,
        folderId: parsed.data.folderId || null,
        uploadedById: userId,
      });
      
      res.status(201).json(document);
    } catch (error) {
      console.error("Error creating company document:", error);
      res.status(500).json({ message: "Failed to create company document" });
    }
  });

  // Update company document
  app.patch("/api/company-documents/:id", isAuthenticated, async (req: any, res) => {
    try {
      const updateSchema = z.object({
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        content: z.any().optional(),
      });
      
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      
      const document = await storage.updateCompanyDocument(req.params.id, parsed.data);
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }
      
      res.json(document);
    } catch (error) {
      console.error("Error updating company document:", error);
      res.status(500).json({ message: "Failed to update document" });
    }
  });

  // Download company document
  app.get("/api/company-documents/:id/download", isAuthenticated, async (req: any, res) => {
    try {
      const document = await storage.getCompanyDocument(req.params.id);
      
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }
      
      // Only uploaded files (not text documents) have storage paths
      if (!document.storagePath || !document.fileName || !document.mimeType) {
        return res.status(400).json({ message: "This document is not a downloadable file" });
      }
      
      const objectStorageService = new ObjectStorageService();
      
      try {
        // Normalize the storage path (converts full GCS URL to /objects/ path)
        const normalizedPath = objectStorageService.normalizeObjectEntityPath(document.storagePath);
        const objectFile = await objectStorageService.getObjectEntityFile(normalizedPath);
        
        // Set content disposition for download with original filename
        res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(document.fileName)}"`);
        res.setHeader('Content-Type', document.mimeType);
        
        objectStorageService.downloadObject(objectFile, res);
      } catch (error) {
        if (error instanceof ObjectNotFoundError) {
          return res.status(404).json({ message: "File not found in storage" });
        }
        throw error;
      }
    } catch (error) {
      console.error("Error downloading company document:", error);
      res.status(500).json({ message: "Failed to download document" });
    }
  });

  // Delete company document
  app.delete("/api/company-documents/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const user = await storage.getUser(userId);
      
      // Only admins can delete company documents
      if (user?.role !== 'admin') {
        return res.status(403).json({ message: "Only admins can delete company documents" });
      }
      
      const document = await storage.getCompanyDocument(req.params.id);
      
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }
      
      // Note: File remains in object storage but database record is deleted
      // Object storage files can be cleaned up separately if needed
      await storage.deleteCompanyDocument(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting company document:", error);
      res.status(500).json({ message: "Failed to delete document" });
    }
  });

  // ==================== Teams ====================
  
  // Get all teams for current user
  app.get("/api/teams", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const userTeams = await storage.getTeams(userId);
      res.json(userTeams);
    } catch (error) {
      console.error("Error fetching teams:", error);
      res.status(500).json({ message: "Failed to fetch teams" });
    }
  });

  // Get single team
  app.get("/api/teams/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const team = await storage.getTeam(req.params.id);
      
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }
      
      // Check if user is a member
      const isMember = await storage.isTeamMember(team.id, userId);
      if (!isMember && team.ownerId !== userId) {
        return res.status(403).json({ message: "Not authorized to view this team" });
      }
      
      res.json(team);
    } catch (error) {
      console.error("Error fetching team:", error);
      res.status(500).json({ message: "Failed to fetch team" });
    }
  });

  // Create team
  app.post("/api/teams", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      
      const createSchema = z.object({
        name: z.string().min(1, "Name is required"),
        description: z.string().optional(),
      });
      
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      
      const team = await storage.createTeam({
        ...parsed.data,
        ownerId: userId,
      });
      
      res.status(201).json(team);
    } catch (error) {
      console.error("Error creating team:", error);
      res.status(500).json({ message: "Failed to create team" });
    }
  });

  // Update team
  app.patch("/api/teams/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const team = await storage.getTeam(req.params.id);
      
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }
      
      // Only owner can update team
      if (team.ownerId !== userId) {
        return res.status(403).json({ message: "Only team owner can update the team" });
      }
      
      const updateSchema = z.object({
        name: z.string().min(1).optional(),
        description: z.string().optional(),
      });
      
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      
      const updated = await storage.updateTeam(req.params.id, parsed.data);
      res.json(updated);
    } catch (error) {
      console.error("Error updating team:", error);
      res.status(500).json({ message: "Failed to update team" });
    }
  });

  // Delete team
  app.delete("/api/teams/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const team = await storage.getTeam(req.params.id);
      
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }
      
      // Only owner can delete team
      if (team.ownerId !== userId) {
        return res.status(403).json({ message: "Only team owner can delete the team" });
      }
      
      await storage.deleteTeam(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting team:", error);
      res.status(500).json({ message: "Failed to delete team" });
    }
  });

  // Get team members
  app.get("/api/teams/:id/members", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const team = await storage.getTeam(req.params.id);
      
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }
      
      // Check if user is a member
      const isMember = await storage.isTeamMember(team.id, userId);
      if (!isMember && team.ownerId !== userId) {
        return res.status(403).json({ message: "Not authorized to view team members" });
      }
      
      const members = await storage.getTeamMembers(req.params.id);
      res.json(members);
    } catch (error) {
      console.error("Error fetching team members:", error);
      res.status(500).json({ message: "Failed to fetch team members" });
    }
  });

  // Remove team member
  app.delete("/api/teams/:teamId/members/:userId", isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = getUserId(req)!;
      const { teamId, userId: targetUserId } = req.params;
      
      const team = await storage.getTeam(teamId);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }
      
      // Only owner or the member themselves can remove
      const isOwner = team.ownerId === currentUserId;
      const isSelf = currentUserId === targetUserId;
      
      if (!isOwner && !isSelf) {
        return res.status(403).json({ message: "Not authorized to remove this member" });
      }
      
      // Owner cannot remove themselves
      if (team.ownerId === targetUserId) {
        return res.status(400).json({ message: "Team owner cannot be removed" });
      }
      
      await storage.removeTeamMember(teamId, targetUserId);
      res.status(204).send();
    } catch (error) {
      console.error("Error removing team member:", error);
      res.status(500).json({ message: "Failed to remove team member" });
    }
  });

  // Update member role
  app.patch("/api/teams/:teamId/members/:userId", isAuthenticated, async (req: any, res) => {
    try {
      const currentUserId = getUserId(req)!;
      const { teamId, userId: targetUserId } = req.params;
      
      const team = await storage.getTeam(teamId);
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }
      
      // Only owner can change roles
      if (team.ownerId !== currentUserId) {
        return res.status(403).json({ message: "Only team owner can change member roles" });
      }
      
      const updateSchema = z.object({
        role: z.enum(["admin", "member"]),
      });
      
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid role" });
      }
      
      const updated = await storage.updateTeamMemberRole(teamId, targetUserId, parsed.data.role);
      res.json(updated);
    } catch (error) {
      console.error("Error updating member role:", error);
      res.status(500).json({ message: "Failed to update member role" });
    }
  });

  // ==================== Team Invites ====================
  
  // Get team invites
  app.get("/api/teams/:id/invites", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const team = await storage.getTeam(req.params.id);
      
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }
      
      // Only owner or admin can view invites
      if (team.ownerId !== userId) {
        const member = team.members?.find(m => m.userId === userId);
        if (!member || member.role === "member") {
          return res.status(403).json({ message: "Not authorized to view invites" });
        }
      }
      
      const invites = await storage.getTeamInvites(req.params.id);
      res.json(invites);
    } catch (error) {
      console.error("Error fetching team invites:", error);
      res.status(500).json({ message: "Failed to fetch invites" });
    }
  });

  // Create invite link
  app.post("/api/teams/:id/invites", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const team = await storage.getTeam(req.params.id);
      
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }
      
      // Only owner or admin can create invites
      if (team.ownerId !== userId) {
        const member = team.members?.find(m => m.userId === userId);
        if (!member || member.role === "member") {
          return res.status(403).json({ message: "Not authorized to create invites" });
        }
      }
      
      const createSchema = z.object({
        expiresAt: z.string().datetime().optional(),
        maxUses: z.number().positive().optional(),
      });
      
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      
      // Generate unique invite code
      const code = randomBytes(16).toString("hex");
      
      const invite = await storage.createTeamInvite({
        teamId: req.params.id,
        code,
        createdById: userId,
        expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
        maxUses: parsed.data.maxUses || null,
        isActive: "true",
      });
      
      res.status(201).json(invite);
    } catch (error) {
      console.error("Error creating invite:", error);
      res.status(500).json({ message: "Failed to create invite" });
    }
  });

  // Deactivate invite
  app.delete("/api/teams/:teamId/invites/:inviteId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const team = await storage.getTeam(req.params.teamId);
      
      if (!team) {
        return res.status(404).json({ message: "Team not found" });
      }
      
      // Only owner can deactivate invites
      if (team.ownerId !== userId) {
        return res.status(403).json({ message: "Only team owner can deactivate invites" });
      }
      
      await storage.deactivateTeamInvite(req.params.inviteId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deactivating invite:", error);
      res.status(500).json({ message: "Failed to deactivate invite" });
    }
  });

  // Get invite info by code (public endpoint for invite link preview)
  // Returns minimal information to prevent enumeration attacks
  app.get("/api/invite/:code", async (req, res) => {
    try {
      const invite = await storage.getTeamInviteByCode(req.params.code);
      
      // Use generic error message to prevent enumeration
      const invalidMessage = "This invitation is no longer valid";
      
      if (!invite || invite.isActive !== "true") {
        return res.status(404).json({ message: invalidMessage });
      }
      
      if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
        return res.status(404).json({ message: invalidMessage });
      }
      
      if (invite.maxUses && invite.useCount >= invite.maxUses) {
        return res.status(404).json({ message: invalidMessage });
      }
      
      // Return only team name for minimal information exposure
      res.json({
        teamName: invite.team?.name || "Unknown Team",
      });
    } catch (error) {
      console.error("Error fetching invite:", error);
      res.status(500).json({ message: "Failed to fetch invite" });
    }
  });

  // Join team via invite code
  app.post("/api/invite/:code/join", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const result = await storage.useTeamInvite(req.params.code, userId);
      
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }
      
      res.json({ message: "Successfully joined team", team: result.team });
    } catch (error) {
      console.error("Error joining team:", error);
      res.status(500).json({ message: "Failed to join team" });
    }
  });

  return httpServer;
}
