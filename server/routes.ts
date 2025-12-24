import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { randomBytes } from "crypto";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, getUserId, hashPassword, verifyPassword, regenerateSession } from "./auth";
import { z } from "zod";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import { ObjectPermission } from "./objectAcl";
import mammoth from "mammoth";
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
  updateCompanyDocumentEmbeddings,
  deleteCompanyDocumentEmbeddings,
  searchCompanyDocumentChunks,
  rebuildAllCompanyDocumentEmbeddings,
} from "./embeddings";
import {
  syncDocumentVideoTranscripts,
  getTranscriptStatus,
  retryTranscript,
} from "./transcripts";
import { sendWelcomeEmail, sendPasswordUpdateEmail, sendProjectAssignmentEmail } from "./email";
import { extractTextFromFile, isSupportedForExtraction, isVideoFile } from "./contentExtraction";

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
      const project = await storage.getProject(req.params.id);

      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Company-wide visibility - all authenticated users can view any project
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
      const project = await storage.getProject(req.params.id);

      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Company-wide access - all authenticated users can update projects
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
      const project = await storage.getProject(req.params.projectId);

      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Company-wide visibility - all authenticated users can view documents
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

      // Company-wide access - all authenticated users can create documents
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
        createdById: userId,
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
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Company-wide visibility - all authenticated users can view documents
      // Get creator info if createdById is set
      let createdBy = null;
      if (document.createdById) {
        createdBy = await storage.getUser(document.createdById);
      }

      res.json({ ...document, createdBy });
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
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Company-wide visibility
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
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Company-wide access - all authenticated users can edit documents
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
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Company-wide access - all authenticated users can delete documents
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
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Company-wide access - all authenticated users can duplicate documents
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
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Company-wide visibility
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

      // Company-wide access - all authenticated users can retry transcripts
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
      if (!project) {
        return res.status(404).json({ message: "Project not found" });
      }

      // Company-wide access
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
  // Supports dual-mode: projects, company, or both
  app.post("/api/chat", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      
      const chatSchema = z.object({
        message: z.string().min(1),
        conversationHistory: z.array(z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string()
        })).optional(),
        mode: z.enum(["projects", "company", "both"]).optional().default("both")
      });
      
      const parsed = chatSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid request", errors: parsed.error.errors });
      }
      
      const { message, conversationHistory = [], mode } = parsed.data;
      
      // Lazily get OpenAI client - handles missing API key gracefully
      let openai: OpenAI;
      try {
        openai = getOpenAIClient();
      } catch (error: any) {
        console.error("OpenAI API key not configured:", error.message);
        return res.status(500).json({ message: "Chat service is not configured. Please add your OpenAI API key." });
      }
      
      let projectOverview = "";
      let companyDocsOverview = "";
      let relevantContext = "";
      let searchResults: { chunkText: string; title: string; projectName: string; breadcrumbs: string[]; similarity: number }[] = [];
      let usedFallback = false;
      
      // Get project overview and docs if mode includes projects
      if (mode === "projects" || mode === "both") {
        const projects = await storage.getProjects(userId);
        projectOverview = "# Available Projects\n\n";
        for (const project of projects) {
          projectOverview += `- **${project.name}**`;
          if (project.description) {
            projectOverview += `: ${project.description}`;
          }
          projectOverview += "\n";
        }
        
        // Use vector search to find relevant documentation chunks
        try {
          searchResults = await searchSimilarChunks(userId, message, mode === "both" ? 10 : 15);
          
          if (searchResults.length > 0) {
            relevantContext = "# Relevant Project Documentation\n\n";
            
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
              
              for (const chunk of chunks) {
                relevantContext += chunk.chunkText + "\n\n";
              }
            }
          }
        } catch (error) {
          console.error("Error searching embeddings:", error);
        }
        
        // Fallback for project docs
        if (searchResults.length === 0) {
          usedFallback = true;
          const allDocuments = await storage.getAllUserDocuments(userId);
          const projects = await storage.getProjects(userId);
          const projectMap = new Map(projects.map(p => [p.id, p]));
          
          if (allDocuments.length > 0) {
            relevantContext = "# Project Documentation Content\n\n";
            const MAX_FALLBACK_CHARS = mode === "both" ? 25000 : 50000;
            
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
      }
      
      // Get company documents if mode includes company
      if (mode === "company" || mode === "both") {
        const companyDocs = await storage.getCompanyDocuments();
        const folders = await storage.getCompanyDocumentFolders();
        const folderMap = new Map(folders.map(f => [f.id, f]));
        
        // Always build company docs overview when in company or both mode
        companyDocsOverview = "# Company Documents\n\n";
        if (companyDocs.length > 0) {
          for (const doc of companyDocs) {
            const folder = doc.folderId ? folderMap.get(doc.folderId) : null;
            companyDocsOverview += `- **${doc.name}**`;
            if (folder) {
              companyDocsOverview += ` (in ${folder.name})`;
            }
            if (doc.fileName) {
              companyDocsOverview += ` [File: ${doc.fileName}]`;
            }
            if (doc.description) {
              companyDocsOverview += `: ${doc.description}`;
            }
            companyDocsOverview += "\n";
          }
          
          // Use vector search for company documents
          try {
            const companySearchResults = await searchCompanyDocumentChunks(message, mode === "both" ? 8 : 12);
            
            if (companySearchResults.length > 0) {
              relevantContext += "\n\n# Relevant Company Documents\n\n";
              
              const byCompanyDoc = new Map<string, typeof companySearchResults>();
              for (const result of companySearchResults) {
                const key = `${result.folderName}/${result.title}`;
                const existing = byCompanyDoc.get(key) || [];
                existing.push(result);
                byCompanyDoc.set(key, existing);
              }
              
              for (const [docKey, chunks] of byCompanyDoc) {
                const first = chunks[0];
                const docPath = first.folderName !== "Root" 
                  ? `${first.folderName} / ${first.title}`
                  : first.title;
                
                relevantContext += `## Company: ${docPath}\n\n`;
                
                for (const chunk of chunks) {
                  relevantContext += chunk.chunkText + "\n\n";
                }
              }
            }
          } catch (companySearchError) {
            console.error("Error searching company document embeddings:", companySearchError);
          }
          
          // Fallback: If no embeddings found, include company docs directly
          if (!relevantContext.includes("# Relevant Company Documents")) {
            const companyContent: string[] = [];
            const MAX_COMPANY_CHARS = mode === "both" ? 15000 : 30000;
            let companyCharsUsed = 0;
            
            for (const doc of companyDocs) {
              if (companyCharsUsed >= MAX_COMPANY_CHARS) break;
              
              const folder = doc.folderId ? folderMap.get(doc.folderId) : null;
              const folderPath = folder ? `${folder.name} / ` : "";
              
              let docContent = `## Company: ${folderPath}${doc.name}\n`;
              
              if (doc.description) {
                docContent += `**Description:** ${doc.description}\n\n`;
              }
              
              if (doc.content) {
                const textContent = extractTextFromContent(doc.content);
                if (textContent) {
                  docContent += textContent + "\n\n";
                }
              }
              
              if (docContent.length + companyCharsUsed <= MAX_COMPANY_CHARS) {
                companyContent.push(docContent);
                companyCharsUsed += docContent.length;
              }
            }
            
            if (companyContent.length > 0) {
              relevantContext += "\n\n# Company Document Content\n\n" + companyContent.join("");
            }
          }
        } else {
          companyDocsOverview += "(No company documents available)\n";
        }
      }
      
      // Build system message based on mode
      const modeDescription = mode === "projects" 
        ? "project documentation" 
        : mode === "company" 
          ? "company documents" 
          : "both project documentation and company documents";
      
      const systemMessage = `You are DocuFlow Assistant, a helpful AI that assists users with their documentation. You currently have access to ${modeDescription}. When documents are created, updated, or deleted, the knowledge base is automatically updated.

${projectOverview}

${companyDocsOverview}

${relevantContext || "No specific documentation found related to this query. The documentation may be empty or the question may not relate to existing content."}

Instructions:
- Answer questions based on the documentation when the relevant content is shown above
- You can reference specific pages, projects, folders, and their content
- Help with documentation-related tasks like organizing content, suggesting improvements, or finding information
- Be concise and helpful
- If the relevant documentation section is empty or doesn't contain what was asked about, you can still help but clarify that the specific information wasn't found
- When referencing documentation, be specific about which source (project page or company document) the information comes from
- For questions about project documentation, reference the project and page names
- For questions about company documents, reference the folder and document names`;

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
      const client = await storage.getCrmClient(req.params.id);
      
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      
      // Company-wide visibility - all authenticated users can view clients
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
      const client = await storage.getCrmClient(req.params.id);
      
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      
      // Company-wide access - all authenticated users can update clients
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
      const client = await storage.getCrmClient(req.params.id);
      
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      
      // Company-wide access - all authenticated users can delete clients
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
      const client = await storage.getCrmClient(req.params.clientId);
      
      if (!client) {
        return res.status(404).json({ message: "Client not found" });
      }
      
      // Company-wide access - all authenticated users can create contacts
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
      const contact = await storage.getCrmContact(req.params.id);
      
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      
      // Company-wide access - all authenticated users can update contacts
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
      const contact = await storage.getCrmContact(req.params.id);
      
      if (!contact) {
        return res.status(404).json({ message: "Contact not found" });
      }
      
      // Company-wide access - all authenticated users can delete contacts
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
      
      // Company-wide visibility - all authenticated users can view CRM projects
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
      
      // Company-wide access - all authenticated users can toggle documentation
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
      
      // Company-wide access - all authenticated users can update CRM projects
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
      
      // Check if assignee is changing to a new person
      const oldAssigneeId = crmProject.assigneeId;
      const newAssigneeId = parsed.data.assigneeId;
      const isNewAssignment = newAssigneeId && newAssigneeId !== oldAssigneeId && newAssigneeId !== userId;
      
      const updated = await storage.updateCrmProject(req.params.id, updateData);
      
      // Send notification and email if assignee changed
      if (isNewAssignment && updated) {
        try {
          // Get assignee and assigner info
          const assignee = await storage.getUser(newAssigneeId);
          const assigner = await storage.getUser(userId);
          const projectName = crmProject.project?.name || "Untitled Project";
          
          if (assignee && assigner) {
            // Create in-app notification
            await storage.createNotification({
              userId: newAssigneeId,
              type: "assignment",
              crmProjectId: req.params.id,
              fromUserId: userId,
              message: `${assigner.firstName || 'Someone'} assigned you to "${projectName}"`,
            });
            
            // Send email notification
            const appUrl = `${req.protocol}://${req.get('host')}`;
            await sendProjectAssignmentEmail(
              assignee.email,
              assignee.firstName || 'Team Member',
              projectName,
              `${assigner.firstName || ''} ${assigner.lastName || ''}`.trim() || 'A team member',
              appUrl,
              req.params.id
            );
          }
        } catch (notifError) {
          console.error("Error sending assignment notification:", notifError);
          // Don't fail the update if notification fails
        }
      }
      
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
      
      // Company-wide access - all authenticated users can delete CRM projects
      await storage.deleteCrmProject(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting CRM project:", error);
      res.status(500).json({ message: "Failed to delete CRM project" });
    }
  });

  // ==================== CRM Project Notes ====================

  // Get notes for a CRM project
  app.get("/api/crm/projects/:id/notes", isAuthenticated, async (req: any, res) => {
    try {
      const notes = await storage.getCrmProjectNotes(req.params.id);
      res.json(notes);
    } catch (error) {
      console.error("Error fetching CRM project notes:", error);
      res.status(500).json({ message: "Failed to fetch notes" });
    }
  });

  // Create a note for a CRM project
  app.post("/api/crm/projects/:id/notes", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const createSchema = z.object({
        content: z.string().min(1, "Note content is required"),
        mentionedUserIds: z.array(z.string()).optional(),
      });
      
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      
      const note = await storage.createCrmProjectNote({
        crmProjectId: req.params.id,
        content: parsed.data.content,
        createdById: userId,
        mentionedUserIds: parsed.data.mentionedUserIds || null,
      });
      
      // Create notifications for mentioned users (excluding the note author)
      const mentionedUserIds = parsed.data.mentionedUserIds || [];
      for (const mentionedUserId of mentionedUserIds) {
        if (mentionedUserId !== userId) {
          await storage.createNotification({
            userId: mentionedUserId,
            type: "mention",
            noteId: note.id,
            crmProjectId: req.params.id,
            fromUserId: userId,
          });
        }
      }
      
      res.status(201).json(note);
    } catch (error) {
      console.error("Error creating CRM project note:", error);
      res.status(500).json({ message: "Failed to create note" });
    }
  });

  // Update a note
  app.patch("/api/crm/projects/:projectId/notes/:noteId", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const updateSchema = z.object({
        content: z.string().min(1, "Note content is required").optional(),
        mentionedUserIds: z.array(z.string()).optional().nullable(),
      });
      
      const parsed = updateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      
      // Get existing note to compare mentions
      const existingNotes = await storage.getCrmProjectNotes(req.params.projectId);
      const existingNote = existingNotes.find(n => n.id === req.params.noteId);
      const oldMentions = existingNote?.mentionedUserIds || [];
      
      const note = await storage.updateCrmProjectNote(req.params.noteId, parsed.data);
      if (!note) {
        return res.status(404).json({ message: "Note not found" });
      }
      
      // Create notifications only for newly mentioned users
      if (parsed.data.mentionedUserIds) {
        const newMentions = parsed.data.mentionedUserIds.filter(id => !oldMentions.includes(id));
        for (const mentionedUserId of newMentions) {
          if (mentionedUserId !== userId) {
            await storage.createNotification({
              userId: mentionedUserId,
              type: "mention",
              noteId: note.id,
              crmProjectId: req.params.projectId,
              fromUserId: userId,
            });
          }
        }
      }
      
      res.json(note);
    } catch (error) {
      console.error("Error updating CRM project note:", error);
      res.status(500).json({ message: "Failed to update note" });
    }
  });

  // Delete a note
  app.delete("/api/crm/projects/:projectId/notes/:noteId", isAuthenticated, async (req: any, res) => {
    try {
      await storage.deleteCrmProjectNote(req.params.noteId);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting CRM project note:", error);
      res.status(500).json({ message: "Failed to delete note" });
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
        description: z.string().optional(),
      });
      
      const parsed = createSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid data", errors: parsed.error.errors });
      }
      
      const folder = await storage.createCompanyDocumentFolder({
        name: parsed.data.name,
        description: parsed.data.description || null,
        createdById: userId,
      });
      
      res.status(201).json(folder);
    } catch (error) {
      console.error("Error creating folder:", error);
      res.status(500).json({ message: "Failed to create folder" });
    }
  });

  // Update folder (rename/update)
  app.patch("/api/company-document-folders/:id", isAuthenticated, async (req: any, res) => {
    try {
      const updateSchema = z.object({
        name: z.string().min(1, "Folder name is required").optional(),
        description: z.string().optional().nullable(),
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
  
  // Search company documents and folders
  app.get("/api/company-documents/search", isAuthenticated, async (req: any, res) => {
    try {
      const query = req.query.q as string;
      if (!query || query.trim().length === 0) {
        return res.json({ documents: [], folders: [] });
      }
      const documents = await storage.searchCompanyDocuments(query);
      const folders = await storage.searchCompanyDocumentFolders(query);
      res.json({ documents, folders });
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
      
      // Generate embeddings asynchronously (don't block response)
      const generateEmbeddingsAsync = async () => {
        try {
          const folder = parsed.data.folderId 
            ? await storage.getCompanyDocumentFolder(parsed.data.folderId)
            : null;
          const folderName = folder?.name || "Root";
          
          let textContent: string | null = null;
          
          // For text documents with TipTap content
          if (parsed.data.content) {
            textContent = JSON.stringify(parsed.data.content);
          }
          // For uploaded files, extract text content
          else if (parsed.data.storagePath && parsed.data.mimeType && parsed.data.fileName) {
            if (isSupportedForExtraction(parsed.data.mimeType, parsed.data.fileName)) {
              console.log(`[Embeddings] Extracting text from uploaded file: ${parsed.data.fileName}`);
              const extraction = await extractTextFromFile(
                parsed.data.storagePath,
                parsed.data.mimeType,
                parsed.data.fileName
              );
              
              if (extraction.success && extraction.text) {
                textContent = extraction.text;
                console.log(`[Embeddings] Extracted ${textContent.length} characters from ${parsed.data.fileName}`);
              } else if (extraction.error) {
                console.log(`[Embeddings] Extraction warning for ${parsed.data.fileName}: ${extraction.error}`);
              }
            } else if (isVideoFile(parsed.data.mimeType, parsed.data.fileName)) {
              console.log(`[Embeddings] Video file detected: ${parsed.data.fileName} - transcript extraction not yet implemented for direct uploads`);
            } else {
              console.log(`[Embeddings] Unsupported file type for extraction: ${parsed.data.mimeType}`);
            }
          }
          
          // Generate embeddings if we have content
          if (textContent) {
            await updateCompanyDocumentEmbeddings(
              document.id,
              parsed.data.folderId || null,
              parsed.data.name,
              { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: textContent }] }] },
              folderName,
              parsed.data.mimeType
            );
            console.log(`[Embeddings] Successfully generated embeddings for document: ${document.id}`);
          }
        } catch (embeddingError) {
          console.error("Failed to generate company document embeddings:", embeddingError);
        }
      };
      
      // Run async without blocking
      generateEmbeddingsAsync();
      
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
      
      // Update embeddings when content changes
      if (parsed.data.content || parsed.data.name) {
        try {
          const folder = document.folderId 
            ? await storage.getCompanyDocumentFolder(document.folderId)
            : null;
          await updateCompanyDocumentEmbeddings(
            document.id,
            document.folderId || null,
            document.name,
            document.content,
            folder?.name || "Root",
            document.mimeType || undefined
          );
        } catch (embeddingError) {
          console.error("Failed to update company document embeddings:", embeddingError);
        }
      }
      
      res.json(document);
    } catch (error) {
      console.error("Error updating company document:", error);
      res.status(500).json({ message: "Failed to update document" });
    }
  });

  // Stream company document (for inline viewing)
  app.get("/api/company-documents/:id/stream", isAuthenticated, async (req: any, res) => {
    try {
      const document = await storage.getCompanyDocument(req.params.id);
      
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }
      
      if (!document.storagePath || !document.fileName || !document.mimeType) {
        return res.status(400).json({ message: "This document is not a streamable file" });
      }
      
      const objectStorageService = new ObjectStorageService();
      
      try {
        const normalizedPath = objectStorageService.normalizeObjectEntityPath(document.storagePath);
        const objectFile = await objectStorageService.getObjectEntityFile(normalizedPath);
        
        // Set content disposition for inline viewing (not download)
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(document.fileName)}"`);
        res.setHeader('Content-Type', document.mimeType);
        
        objectStorageService.downloadObject(objectFile, res);
      } catch (error) {
        if (error instanceof ObjectNotFoundError) {
          return res.status(404).json({ message: "File not found in storage" });
        }
        throw error;
      }
    } catch (error) {
      console.error("Error streaming company document:", error);
      res.status(500).json({ message: "Failed to stream document" });
    }
  });

  // Convert Word document to HTML for preview
  app.get("/api/company-documents/:id/word-html", isAuthenticated, async (req: any, res) => {
    try {
      const document = await storage.getCompanyDocument(req.params.id);
      
      if (!document) {
        return res.status(404).json({ message: "Document not found" });
      }
      
      if (!document.storagePath || !document.fileName || !document.mimeType) {
        return res.status(400).json({ message: "This document is not a file" });
      }
      
      // Check if it's a Word document
      const isWordDoc = document.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                        document.mimeType === 'application/msword' ||
                        document.fileName?.endsWith('.docx') ||
                        document.fileName?.endsWith('.doc');
      
      if (!isWordDoc) {
        return res.status(400).json({ message: "Not a Word document" });
      }
      
      const objectStorageService = new ObjectStorageService();
      
      try {
        const normalizedPath = objectStorageService.normalizeObjectEntityPath(document.storagePath);
        const objectFile = await objectStorageService.getObjectEntityFile(normalizedPath);
        
        // Download file to buffer
        const chunks: Buffer[] = [];
        const stream = objectFile.createReadStream();
        
        for await (const chunk of stream) {
          chunks.push(Buffer.from(chunk));
        }
        
        const buffer = Buffer.concat(chunks);
        
        // Convert to HTML using mammoth
        const result = await mammoth.convertToHtml({ buffer });
        
        res.json({ 
          html: result.value,
          messages: result.messages 
        });
      } catch (error) {
        if (error instanceof ObjectNotFoundError) {
          return res.status(404).json({ message: "File not found in storage" });
        }
        throw error;
      }
    } catch (error) {
      console.error("Error converting Word document:", error);
      res.status(500).json({ message: "Failed to convert document" });
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
      
      // Delete embeddings first
      try {
        await deleteCompanyDocumentEmbeddings(req.params.id);
      } catch (embeddingError) {
        console.error("Failed to delete company document embeddings:", embeddingError);
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

  // ==================== Admin Routes ====================
  const isAdmin = async (req: any, res: any, next: any) => {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ message: "Not authenticated" });
    }
    const user = await storage.getUser(userId);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ message: "Access denied" });
    }
    next();
  };

  // Get all users (admin only)
  app.get("/api/admin/users", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Get single user details (admin only) - includes password info for admin viewing
  app.get("/api/admin/users/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const user = await storage.getAdminUserDetails(req.params.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Block non-SuperAdmins from viewing SuperAdmin details
      const requesterId = getUserId(req);
      const requester = await storage.getUser(requesterId!);
      if (user.isMainAdmin && !requester?.isMainAdmin) {
        return res.status(403).json({ message: "Cannot view SuperAdmin details" });
      }
      
      // Return user without the hashed password but with the last generated password
      const { password, ...userWithoutHash } = user;
      res.json(userWithoutHash);
    } catch (error) {
      console.error("Error fetching user details:", error);
      res.status(500).json({ message: "Failed to fetch user details" });
    }
  });

  // Update user role (admin only)
  app.patch("/api/admin/users/:id/role", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      // Check if target user is SuperAdmin
      const targetUser = await storage.getUser(req.params.id);
      if (targetUser?.isMainAdmin && targetUser.id !== getUserId(req)) {
        return res.status(403).json({ message: "Cannot modify the SuperAdmin" });
      }
      
      const roleSchema = z.object({
        role: z.enum(["user", "admin"]),
      });
      
      const parsed = roleSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid role", errors: parsed.error.errors });
      }
      
      const user = await storage.updateUserRole(req.params.id, parsed.data.role);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json(user);
    } catch (error) {
      console.error("Error updating user role:", error);
      res.status(500).json({ message: "Failed to update user role" });
    }
  });

  // Create new user (admin only)
  app.post("/api/admin/users", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const createUserSchema = z.object({
        email: z.string().email(),
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        role: z.enum(["user", "admin"]).default("user"),
      });
      
      const parsed = createUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid user data", errors: parsed.error.errors });
      }
      
      // Check if user already exists
      const existingUser = await storage.getUserByEmail(parsed.data.email);
      if (existingUser) {
        return res.status(409).json({ message: "User with this email already exists" });
      }
      
      // Generate random password
      const generatedPassword = randomBytes(8).toString('hex');
      const hashedPassword = await hashPassword(generatedPassword);
      
      // Create user with generated password stored for admin viewing
      const newUser = await storage.createUser({
        email: parsed.data.email,
        password: hashedPassword,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        lastGeneratedPassword: generatedPassword,
      });
      
      // Update role if not default
      if (parsed.data.role !== "user") {
        await storage.updateUserRole(newUser.id, parsed.data.role);
      }
      
      // Get app URL for email
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers.host || 'localhost:5000';
      const appUrl = `${protocol}://${host}`;
      
      // Send welcome email
      const emailResult = await sendWelcomeEmail(
        parsed.data.email,
        parsed.data.firstName,
        generatedPassword,
        appUrl
      );
      
      res.status(201).json({ 
        user: { ...newUser, password: undefined },
        generatedPassword,
        emailSent: emailResult.success,
        emailError: emailResult.error
      });
    } catch (error) {
      console.error("Error creating user:", error);
      res.status(500).json({ message: "Failed to create user" });
    }
  });

  // Update user info (admin only)
  app.patch("/api/admin/users/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      // Check if target user is SuperAdmin
      const targetUser = await storage.getUser(req.params.id);
      if (targetUser?.isMainAdmin && targetUser.id !== getUserId(req)) {
        return res.status(403).json({ message: "Cannot modify the SuperAdmin" });
      }
      
      const updateUserSchema = z.object({
        email: z.string().email().optional(),
        firstName: z.string().min(1).optional(),
        lastName: z.string().min(1).optional(),
      });
      
      const parsed = updateUserSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Invalid user data", errors: parsed.error.errors });
      }
      
      // If email is being changed, check it's not taken
      if (parsed.data.email) {
        const existingUser = await storage.getUserByEmail(parsed.data.email);
        if (existingUser && existingUser.id !== req.params.id) {
          return res.status(409).json({ message: "Email is already in use" });
        }
      }
      
      const user = await storage.updateUser(req.params.id, parsed.data);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      res.json(user);
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ message: "Failed to update user" });
    }
  });

  // Reset user password (admin only)
  app.post("/api/admin/users/:id/reset-password", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const user = await storage.getUserWithPassword(req.params.id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Check if target user is SuperAdmin
      if (user.isMainAdmin && user.id !== getUserId(req)) {
        return res.status(403).json({ message: "Cannot modify the SuperAdmin" });
      }
      
      // Generate new random password
      const newPassword = randomBytes(8).toString('hex');
      const hashedPassword = await hashPassword(newPassword);
      
      // Update password and store the generated password for admin viewing
      await storage.updateUserPassword(req.params.id, hashedPassword, newPassword);
      
      // Get app URL for email
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const host = req.headers.host || 'localhost:5000';
      const appUrl = `${protocol}://${host}`;
      
      // Send password update email
      const emailResult = await sendPasswordUpdateEmail(
        user.email,
        user.firstName || 'User',
        newPassword,
        appUrl
      );
      
      res.json({ 
        success: true, 
        newPassword,
        emailSent: emailResult.success,
        emailError: emailResult.error
      });
    } catch (error) {
      console.error("Error resetting password:", error);
      res.status(500).json({ message: "Failed to reset password" });
    }
  });

  // Delete user (admin only)
  app.delete("/api/admin/users/:id", isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const userId = req.params.id;
      
      // Don't allow deleting yourself
      if (userId === getUserId(req)) {
        return res.status(400).json({ message: "Cannot delete your own account" });
      }
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Don't allow deleting the SuperAdmin
      if (user.isMainAdmin) {
        return res.status(403).json({ message: "Cannot delete the SuperAdmin" });
      }
      
      await storage.deleteUser(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // ==================== Notifications ====================
  
  app.get("/api/notifications", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const notifications = await storage.getUserNotifications(userId);
      res.json(notifications);
    } catch (error) {
      console.error("Error fetching notifications:", error);
      res.status(500).json({ message: "Failed to fetch notifications" });
    }
  });

  app.get("/api/notifications/unread-count", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const count = await storage.getUnreadNotificationCount(userId);
      res.json({ count });
    } catch (error) {
      console.error("Error fetching unread count:", error);
      res.status(500).json({ message: "Failed to fetch unread count" });
    }
  });

  app.patch("/api/notifications/:id/read", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      await storage.markNotificationRead(req.params.id, userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking notification read:", error);
      res.status(500).json({ message: "Failed to mark notification read" });
    }
  });

  app.patch("/api/notifications/mark-all-read", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      await storage.markAllNotificationsRead(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking all notifications read:", error);
      res.status(500).json({ message: "Failed to mark all notifications read" });
    }
  });

  return httpServer;
}
