import { randomUUID } from "node:crypto";
import {
  users,
  projects,
  documents,
  crmProjects,
  crmClients,
  crmContacts,
  companyDocuments,
  teams,
  teamMembers,
  teamInvites,
  type User,
  type SafeUser,
  type InsertUser,
  type Project,
  type InsertProject,
  type Document,
  type InsertDocument,
  type CrmProject,
  type InsertCrmProject,
  type CrmClient,
  type InsertCrmClient,
  type CrmContact,
  type InsertCrmContact,
  type CrmProjectWithDetails,
  type CompanyDocument,
  type InsertCompanyDocument,
  type CompanyDocumentWithUploader,
  type Team,
  type InsertTeam,
  type TeamMember,
  type InsertTeamMember,
  type TeamMemberWithUser,
  type TeamInvite,
  type InsertTeamInvite,
  type TeamInviteWithTeam,
  type TeamWithDetails,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, like, or, isNull, sql, gt, asc, count } from "drizzle-orm";

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(userData: InsertUser): Promise<User>;
  
  getProjects(userId: string): Promise<Project[]>;
  getProject(id: string): Promise<Project | undefined>;
  createProject(project: InsertProject & { ownerId: string }): Promise<Project>;
  updateProject(id: string, data: Partial<InsertProject>): Promise<Project | undefined>;
  deleteProject(id: string): Promise<void>;
  
  getDocuments(projectId: string): Promise<Document[]>;
  getDocument(id: string): Promise<Document | undefined>;
  getDocumentAncestors(id: string): Promise<Document[]>;
  getRecentDocuments(userId: string, limit?: number): Promise<Document[]>;
  createDocument(document: InsertDocument): Promise<Document>;
  updateDocument(id: string, data: Partial<InsertDocument>): Promise<Document | undefined>;
  deleteDocument(id: string): Promise<void>;
  duplicateDocument(id: string): Promise<Document | undefined>;
  
  search(userId: string, query: string): Promise<Array<{ type: string; id: string; title: string; projectName?: string }>>;
  
  // Get all documents for a user across all projects (for chatbot knowledge base)
  getAllUserDocuments(userId: string): Promise<Array<Document & { projectName: string }>>;
  
  // CRM Clients
  getCrmClients(userId: string): Promise<CrmClient[]>;
  getCrmClient(id: string): Promise<CrmClient | undefined>;
  createCrmClient(client: InsertCrmClient & { ownerId: string }): Promise<CrmClient>;
  updateCrmClient(id: string, data: Partial<InsertCrmClient>): Promise<CrmClient | undefined>;
  deleteCrmClient(id: string): Promise<void>;
  
  // CRM Contacts
  getCrmContacts(clientId: string): Promise<CrmContact[]>;
  getCrmContact(id: string): Promise<CrmContact | undefined>;
  createCrmContact(contact: InsertCrmContact): Promise<CrmContact>;
  updateCrmContact(id: string, data: Partial<InsertCrmContact>): Promise<CrmContact | undefined>;
  deleteCrmContact(id: string): Promise<void>;
  
  // CRM Projects
  getCrmProjects(userId: string, options?: { 
    page?: number; 
    pageSize?: number; 
    status?: string;
    search?: string;
  }): Promise<{ data: CrmProjectWithDetails[]; total: number; page: number; pageSize: number }>;
  getCrmProject(id: string): Promise<CrmProjectWithDetails | undefined>;
  getCrmProjectByProjectId(projectId: string): Promise<CrmProject | undefined>;
  createCrmProject(crmProject: InsertCrmProject): Promise<CrmProject>;
  createCrmProjectWithBase(projectData: InsertProject & { ownerId: string }, crmData?: Partial<InsertCrmProject>): Promise<{ project: Project; crmProject: CrmProject }>;
  updateCrmProject(id: string, data: Partial<InsertCrmProject>): Promise<CrmProject | undefined>;
  deleteCrmProject(id: string): Promise<void>;
  toggleDocumentation(crmProjectId: string, enabled: boolean): Promise<CrmProject | undefined>;
  getDocumentationEnabledProjects(userId: string): Promise<Project[]>;
  
  // Link orphan projects to CRM (for migration of existing projects)
  linkOrphanProjectsToCrm(): Promise<{ linkedCount: number }>;
  
  // Get all users for assignee dropdown
  getAllUsers(): Promise<SafeUser[]>;
  
  // Company Documents
  getCompanyDocuments(): Promise<CompanyDocumentWithUploader[]>;
  getCompanyDocument(id: string): Promise<CompanyDocument | undefined>;
  createCompanyDocument(doc: InsertCompanyDocument): Promise<CompanyDocument>;
  deleteCompanyDocument(id: string): Promise<CompanyDocument | undefined>;
  
  // Teams
  getTeams(userId: string): Promise<TeamWithDetails[]>;
  getTeam(id: string): Promise<TeamWithDetails | undefined>;
  createTeam(team: InsertTeam & { ownerId: string }): Promise<Team>;
  updateTeam(id: string, data: Partial<InsertTeam>): Promise<Team | undefined>;
  deleteTeam(id: string): Promise<void>;
  
  // Team Members
  getTeamMembers(teamId: string): Promise<TeamMemberWithUser[]>;
  addTeamMember(teamId: string, userId: string, role?: string): Promise<TeamMember>;
  updateTeamMemberRole(teamId: string, userId: string, role: string): Promise<TeamMember | undefined>;
  removeTeamMember(teamId: string, userId: string): Promise<void>;
  isTeamMember(teamId: string, userId: string): Promise<boolean>;
  
  // Team Invites
  getTeamInvites(teamId: string): Promise<TeamInviteWithTeam[]>;
  getTeamInviteByCode(code: string): Promise<TeamInviteWithTeam | undefined>;
  createTeamInvite(invite: InsertTeamInvite): Promise<TeamInvite>;
  useTeamInvite(code: string, userId: string): Promise<{ success: boolean; team?: Team; error?: string }>;
  deactivateTeamInvite(id: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async createUser(userData: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .returning();
    return user;
  }

  async getProjects(userId: string): Promise<Project[]> {
    return db
      .select()
      .from(projects)
      .where(eq(projects.ownerId, userId))
      .orderBy(desc(projects.updatedAt));
  }

  async getProject(id: string): Promise<Project | undefined> {
    const [project] = await db.select().from(projects).where(eq(projects.id, id));
    return project;
  }

  async createProject(project: InsertProject & { ownerId: string }): Promise<Project> {
    const [newProject] = await db.insert(projects).values(project).returning();
    return newProject;
  }

  async updateProject(id: string, data: Partial<InsertProject>): Promise<Project | undefined> {
    const [updated] = await db
      .update(projects)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(projects.id, id))
      .returning();
    return updated;
  }

  async deleteProject(id: string): Promise<void> {
    await db.delete(documents).where(eq(documents.projectId, id));
    await db.delete(projects).where(eq(projects.id, id));
  }

  async getDocuments(projectId: string): Promise<Document[]> {
    return db
      .select()
      .from(documents)
      .where(eq(documents.projectId, projectId))
      .orderBy(documents.position);
  }

  async getDocument(id: string): Promise<Document | undefined> {
    const [doc] = await db.select().from(documents).where(eq(documents.id, id));
    return doc;
  }

  async getDocumentAncestors(id: string): Promise<Document[]> {
    const ancestors: Document[] = [];
    let currentId: string | null = id;
    const visited = new Set<string>();

    while (currentId) {
      if (visited.has(currentId)) break;
      visited.add(currentId);

      const [doc] = await db.select().from(documents).where(eq(documents.id, currentId));
      if (!doc) break;

      if (doc.parentId && doc.id !== id) {
        ancestors.unshift(doc);
      }
      currentId = doc.parentId;
    }

    return ancestors;
  }

  async getRecentDocuments(userId: string, limit: number = 10): Promise<Document[]> {
    const userProjects = await this.getProjects(userId);
    const projectIds = userProjects.map((p) => p.id);

    if (projectIds.length === 0) return [];

    return db
      .select()
      .from(documents)
      .where(
        or(...projectIds.map((pid) => eq(documents.projectId, pid)))
      )
      .orderBy(desc(documents.updatedAt))
      .limit(limit);
  }

  async createDocument(document: InsertDocument): Promise<Document> {
    const existingDocs = await db
      .select()
      .from(documents)
      .where(
        and(
          eq(documents.projectId, document.projectId),
          document.parentId ? eq(documents.parentId, document.parentId) : isNull(documents.parentId)
        )
      );

    const maxPosition = existingDocs.reduce((max, doc) => Math.max(max, doc.position), -1);

    const [newDoc] = await db
      .insert(documents)
      .values({
        ...document,
        position: maxPosition + 1,
      })
      .returning();

    await db
      .update(projects)
      .set({ updatedAt: new Date() })
      .where(eq(projects.id, document.projectId));

    return newDoc;
  }

  async updateDocument(id: string, data: Partial<InsertDocument>): Promise<Document | undefined> {
    const [updated] = await db
      .update(documents)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(documents.id, id))
      .returning();

    if (updated) {
      await db
        .update(projects)
        .set({ updatedAt: new Date() })
        .where(eq(projects.id, updated.projectId));
    }

    return updated;
  }

  async deleteDocument(id: string): Promise<void> {
    const deleteRecursive = async (docId: string) => {
      const children = await db
        .select()
        .from(documents)
        .where(eq(documents.parentId, docId));

      for (const child of children) {
        await deleteRecursive(child.id);
      }

      await db.delete(documents).where(eq(documents.id, docId));
    };

    await deleteRecursive(id);
  }

  async duplicateDocument(id: string): Promise<Document | undefined> {
    const original = await this.getDocument(id);
    if (!original) return undefined;

    return await db.transaction(async (tx) => {
      const generateUniqueTitle = async (
        baseTitle: string,
        parentId: string | null,
        projectId: string
      ): Promise<string> => {
        const siblings = await tx
          .select()
          .from(documents)
          .where(
            and(
              eq(documents.projectId, projectId),
              parentId
                ? eq(documents.parentId, parentId)
                : isNull(documents.parentId)
            )
          );

        const existingTitles = new Set(siblings.map((d) => d.title));
        let title = baseTitle;
        let counter = 1;

        while (existingTitles.has(title)) {
          title = counter === 1 ? `${baseTitle} (Copy)` : `${baseTitle} (Copy ${counter})`;
          counter++;
        }

        return title;
      };

      const newPosition = original.position + 1;

      await tx
        .update(documents)
        .set({
          position: sql`${documents.position} + 1`,
        })
        .where(
          and(
            eq(documents.projectId, original.projectId),
            original.parentId
              ? eq(documents.parentId, original.parentId)
              : isNull(documents.parentId),
            sql`${documents.position} >= ${newPosition}`
          )
        );

      const duplicateRecursive = async (
        doc: Document,
        newParentId: string | null,
        isRoot: boolean
      ): Promise<Document> => {
        const title = await generateUniqueTitle(doc.title, newParentId, doc.projectId);

        const newId = randomUUID();
        const [newDoc] = await tx
          .insert(documents)
          .values({
            id: newId,
            title,
            content: doc.content,
            icon: doc.icon,
            projectId: doc.projectId,
            parentId: newParentId,
            position: isRoot ? newPosition : doc.position,
          })
          .returning();

        const children = await tx
          .select()
          .from(documents)
          .where(eq(documents.parentId, doc.id))
          .orderBy(documents.position);

        for (const child of children) {
          await duplicateRecursive(child, newDoc.id, false);
        }

        return newDoc;
      };

      const duplicatedDoc = await duplicateRecursive(original, original.parentId, true);

      await tx
        .update(projects)
        .set({ updatedAt: new Date() })
        .where(eq(projects.id, original.projectId));

      return duplicatedDoc;
    });
  }

  async search(userId: string, query: string): Promise<Array<{ type: string; id: string; title: string; projectName?: string }>> {
    const results: Array<{ type: string; id: string; title: string; projectName?: string }> = [];
    const searchPattern = `%${query}%`;

    const userProjects = await db
      .select()
      .from(projects)
      .where(and(eq(projects.ownerId, userId), like(projects.name, searchPattern)));

    for (const project of userProjects) {
      results.push({
        type: "project",
        id: project.id,
        title: project.name,
      });
    }

    const allUserProjects = await this.getProjects(userId);
    const projectIds = allUserProjects.map((p) => p.id);
    const projectMap = new Map(allUserProjects.map((p) => [p.id, p.name]));

    if (projectIds.length > 0) {
      const matchingDocs = await db
        .select()
        .from(documents)
        .where(
          and(
            or(...projectIds.map((pid) => eq(documents.projectId, pid))),
            like(documents.title, searchPattern)
          )
        )
        .limit(20);

      for (const doc of matchingDocs) {
        results.push({
          type: "document",
          id: doc.id,
          title: doc.title,
          projectName: projectMap.get(doc.projectId),
        });
      }
    }

    return results.slice(0, 20);
  }

  async getAllUserDocuments(userId: string): Promise<Array<Document & { projectName: string }>> {
    const userProjects = await this.getProjects(userId);
    const projectIds = userProjects.map((p) => p.id);
    const projectMap = new Map(userProjects.map((p) => [p.id, p.name]));

    if (projectIds.length === 0) return [];

    const allDocs = await db
      .select()
      .from(documents)
      .where(or(...projectIds.map((pid) => eq(documents.projectId, pid))))
      .orderBy(documents.projectId, documents.position);

    return allDocs.map(doc => ({
      ...doc,
      projectName: projectMap.get(doc.projectId) || "Unknown Project"
    }));
  }

  // CRM Clients
  async getCrmClients(userId: string): Promise<CrmClient[]> {
    return db
      .select()
      .from(crmClients)
      .where(eq(crmClients.ownerId, userId))
      .orderBy(asc(crmClients.name));
  }

  async getCrmClient(id: string): Promise<CrmClient | undefined> {
    const [client] = await db.select().from(crmClients).where(eq(crmClients.id, id));
    return client;
  }

  async createCrmClient(client: InsertCrmClient & { ownerId: string }): Promise<CrmClient> {
    const [newClient] = await db.insert(crmClients).values(client).returning();
    return newClient;
  }

  async updateCrmClient(id: string, data: Partial<InsertCrmClient>): Promise<CrmClient | undefined> {
    const [updated] = await db
      .update(crmClients)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(crmClients.id, id))
      .returning();
    return updated;
  }

  async deleteCrmClient(id: string): Promise<void> {
    await db.delete(crmClients).where(eq(crmClients.id, id));
  }

  // CRM Contacts
  async getCrmContacts(clientId: string): Promise<CrmContact[]> {
    return db
      .select()
      .from(crmContacts)
      .where(eq(crmContacts.clientId, clientId))
      .orderBy(desc(crmContacts.isPrimary), asc(crmContacts.name));
  }

  async getCrmContact(id: string): Promise<CrmContact | undefined> {
    const [contact] = await db.select().from(crmContacts).where(eq(crmContacts.id, id));
    return contact;
  }

  async createCrmContact(contact: InsertCrmContact): Promise<CrmContact> {
    const [newContact] = await db.insert(crmContacts).values(contact).returning();
    return newContact;
  }

  async updateCrmContact(id: string, data: Partial<InsertCrmContact>): Promise<CrmContact | undefined> {
    const [updated] = await db
      .update(crmContacts)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(crmContacts.id, id))
      .returning();
    return updated;
  }

  async deleteCrmContact(id: string): Promise<void> {
    await db.delete(crmContacts).where(eq(crmContacts.id, id));
  }

  // CRM Projects
  async getCrmProjects(userId: string, options?: { 
    page?: number; 
    pageSize?: number; 
    status?: string;
    search?: string;
  }): Promise<{ data: CrmProjectWithDetails[]; total: number; page: number; pageSize: number }> {
    const page = options?.page || 1;
    const pageSize = options?.pageSize || 10;
    const offset = (page - 1) * pageSize;

    // Get user's projects first
    const userProjects = await this.getProjects(userId);
    const projectIds = userProjects.map((p) => p.id);

    if (projectIds.length === 0) {
      return { data: [], total: 0, page, pageSize };
    }

    // Build conditions
    const conditions = [
      or(...projectIds.map((pid) => eq(crmProjects.projectId, pid)))
    ];

    if (options?.status) {
      conditions.push(eq(crmProjects.status, options.status));
    }

    // Count total
    const [countResult] = await db
      .select({ count: count() })
      .from(crmProjects)
      .where(and(...conditions));

    const total = countResult?.count || 0;

    // Get paginated data
    const crmProjectRows = await db
      .select()
      .from(crmProjects)
      .where(and(...conditions))
      .orderBy(desc(crmProjects.updatedAt))
      .limit(pageSize)
      .offset(offset);

    // Get all related data
    const projectMap = new Map(userProjects.map((p) => [p.id, p]));

    // Get clients
    const clientIds = crmProjectRows.map((cp) => cp.clientId).filter(Boolean) as string[];
    const clientsData = clientIds.length > 0 
      ? await db.select().from(crmClients).where(or(...clientIds.map((id) => eq(crmClients.id, id))))
      : [];
    const clientMap = new Map(clientsData.map((c) => [c.id, c]));

    // Get contacts for clients
    const contactsData = clientIds.length > 0
      ? await db.select().from(crmContacts).where(or(...clientIds.map((id) => eq(crmContacts.clientId, id))))
      : [];
    const contactsByClient = new Map<string, CrmContact[]>();
    contactsData.forEach((contact) => {
      const existing = contactsByClient.get(contact.clientId) || [];
      existing.push(contact);
      contactsByClient.set(contact.clientId, existing);
    });

    // Get assignees
    const assigneeIds = crmProjectRows.map((cp) => cp.assigneeId).filter(Boolean) as string[];
    const assigneesData = assigneeIds.length > 0
      ? await db.select().from(users).where(or(...assigneeIds.map((id) => eq(users.id, id))))
      : [];
    const assigneeMap = new Map(assigneesData.map((u) => [u.id, {
      id: u.id,
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      profileImageUrl: u.profileImageUrl,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    } as SafeUser]));

    // Build result with search filter if needed
    let data: CrmProjectWithDetails[] = crmProjectRows.map((cp) => {
      const project = projectMap.get(cp.projectId);
      const client = cp.clientId ? clientMap.get(cp.clientId) : undefined;
      const clientContacts = cp.clientId ? contactsByClient.get(cp.clientId) : undefined;
      const assignee = cp.assigneeId ? assigneeMap.get(cp.assigneeId) : undefined;

      return {
        ...cp,
        project,
        client: client ? { ...client, contacts: clientContacts } : undefined,
        assignee,
      };
    });

    // Filter by search if provided
    if (options?.search) {
      const searchLower = options.search.toLowerCase();
      data = data.filter((item) => 
        item.project?.name.toLowerCase().includes(searchLower) ||
        item.client?.name.toLowerCase().includes(searchLower) ||
        item.client?.company?.toLowerCase().includes(searchLower)
      );
    }

    return { data, total: Number(total), page, pageSize };
  }

  async getCrmProject(id: string): Promise<CrmProjectWithDetails | undefined> {
    const [crmProject] = await db.select().from(crmProjects).where(eq(crmProjects.id, id));
    if (!crmProject) return undefined;

    const project = await this.getProject(crmProject.projectId);
    
    let client: (CrmClient & { contacts?: CrmContact[] }) | undefined;
    if (crmProject.clientId) {
      const clientData = await this.getCrmClient(crmProject.clientId);
      if (clientData) {
        const contacts = await this.getCrmContacts(clientData.id);
        client = { ...clientData, contacts };
      }
    }

    let assignee: SafeUser | undefined;
    if (crmProject.assigneeId) {
      const user = await this.getUser(crmProject.assigneeId);
      if (user) {
        assignee = user;
      }
    }

    return { ...crmProject, project, client, assignee };
  }

  async getCrmProjectByProjectId(projectId: string): Promise<CrmProject | undefined> {
    const [crmProject] = await db.select().from(crmProjects).where(eq(crmProjects.projectId, projectId));
    return crmProject;
  }

  async createCrmProject(crmProject: InsertCrmProject): Promise<CrmProject> {
    const [newCrmProject] = await db.insert(crmProjects).values(crmProject).returning();
    return newCrmProject;
  }

  async updateCrmProject(id: string, data: Partial<InsertCrmProject>): Promise<CrmProject | undefined> {
    const [updated] = await db
      .update(crmProjects)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(crmProjects.id, id))
      .returning();
    return updated;
  }

  async deleteCrmProject(id: string): Promise<void> {
    // First get the CRM project to find the linked project ID
    const [crmProject] = await db.select().from(crmProjects).where(eq(crmProjects.id, id));
    
    if (crmProject && crmProject.projectId) {
      // Delete the CRM project first (FK constraint)
      await db.delete(crmProjects).where(eq(crmProjects.id, id));
      // Then delete the base project
      await db.delete(projects).where(eq(projects.id, crmProject.projectId));
    } else {
      // Just delete the CRM project if no linked project
      await db.delete(crmProjects).where(eq(crmProjects.id, id));
    }
  }

  async createCrmProjectWithBase(
    projectData: InsertProject & { ownerId: string }, 
    crmData?: Partial<InsertCrmProject>
  ): Promise<{ project: Project; crmProject: CrmProject }> {
    const project = await this.createProject(projectData);
    
    const crmProject = await this.createCrmProject({
      projectId: project.id,
      clientId: crmData?.clientId || null,
      status: crmData?.status || "lead",
      assigneeId: crmData?.assigneeId || null,
      startDate: crmData?.startDate || null,
      dueDate: crmData?.dueDate || null,
      actualFinishDate: crmData?.actualFinishDate || null,
      comments: crmData?.comments || null,
      documentationEnabled: crmData?.documentationEnabled || 0,
    });
    
    return { project, crmProject };
  }

  async toggleDocumentation(crmProjectId: string, enabled: boolean): Promise<CrmProject | undefined> {
    const [updated] = await db
      .update(crmProjects)
      .set({ documentationEnabled: enabled ? 1 : 0, updatedAt: new Date() })
      .where(eq(crmProjects.id, crmProjectId))
      .returning();
    return updated;
  }

  async getDocumentationEnabledProjects(userId: string): Promise<Project[]> {
    const result = await db
      .select({ project: projects })
      .from(projects)
      .innerJoin(crmProjects, eq(projects.id, crmProjects.projectId))
      .where(and(
        eq(projects.ownerId, userId),
        eq(crmProjects.documentationEnabled, 1)
      ))
      .orderBy(desc(projects.updatedAt));
    
    return result.map(r => r.project);
  }

  async linkOrphanProjectsToCrm(): Promise<{ linkedCount: number }> {
    // Find all projects that don't have a corresponding CRM project
    const orphanProjects = await db
      .select({ project: projects })
      .from(projects)
      .leftJoin(crmProjects, eq(projects.id, crmProjects.projectId))
      .where(isNull(crmProjects.id));
    
    let linkedCount = 0;
    
    for (const { project } of orphanProjects) {
      try {
        // Create CRM project for the orphan project
        // Default status is 'documented' since these are existing documentation projects
        // Enable documentation by default since these were accessible before the CRM system
        await db.insert(crmProjects).values({
          id: randomUUID(),
          projectId: project.id,
          clientId: null,
          status: "documented",
          assigneeId: null,
          startDate: null,
          dueDate: null,
          actualFinishDate: null,
          comments: "Auto-migrated from standalone documentation project",
          documentationEnabled: 1,
        });
        linkedCount++;
        console.log(`Linked orphan project to CRM: ${project.name} (${project.id})`);
      } catch (error) {
        console.error(`Failed to link orphan project ${project.id}:`, error);
      }
    }
    
    return { linkedCount };
  }

  async getAllUsers(): Promise<SafeUser[]> {
    const allUsers = await db.select().from(users).orderBy(asc(users.firstName), asc(users.lastName));
    return allUsers;
  }

  // Company Documents
  async getCompanyDocuments(): Promise<CompanyDocumentWithUploader[]> {
    const docs = await db
      .select()
      .from(companyDocuments)
      .orderBy(desc(companyDocuments.createdAt));
    
    // Get all uploaders
    const uploaderIds = [...new Set(docs.map(d => d.uploadedById))];
    const uploadersData = uploaderIds.length > 0
      ? await db.select().from(users).where(or(...uploaderIds.map(id => eq(users.id, id))))
      : [];
    const uploaderMap = new Map(uploadersData.map(u => [u.id, u]));
    
    return docs.map(doc => ({
      ...doc,
      uploadedBy: uploaderMap.get(doc.uploadedById),
    }));
  }

  async getCompanyDocument(id: string): Promise<CompanyDocument | undefined> {
    const [doc] = await db.select().from(companyDocuments).where(eq(companyDocuments.id, id));
    return doc;
  }

  async createCompanyDocument(doc: InsertCompanyDocument): Promise<CompanyDocument> {
    const [newDoc] = await db.insert(companyDocuments).values(doc).returning();
    return newDoc;
  }

  async deleteCompanyDocument(id: string): Promise<CompanyDocument | undefined> {
    const [deleted] = await db.delete(companyDocuments).where(eq(companyDocuments.id, id)).returning();
    return deleted;
  }

  // Teams
  async getTeams(userId: string): Promise<TeamWithDetails[]> {
    // Get teams where user is owner or member
    const ownedTeams = await db.select().from(teams).where(eq(teams.ownerId, userId));
    
    const memberTeamIds = await db
      .select({ teamId: teamMembers.teamId })
      .from(teamMembers)
      .where(eq(teamMembers.userId, userId));
    
    const memberTeams = memberTeamIds.length > 0
      ? await db.select().from(teams).where(or(...memberTeamIds.map(m => eq(teams.id, m.teamId))))
      : [];
    
    // Combine and deduplicate
    const allTeamsMap = new Map<string, Team>();
    [...ownedTeams, ...memberTeams].forEach(t => allTeamsMap.set(t.id, t));
    const allTeams = Array.from(allTeamsMap.values());
    
    // Get owners and member counts
    const ownerIds = [...new Set(allTeams.map(t => t.ownerId))];
    const ownersData = ownerIds.length > 0
      ? await db.select().from(users).where(or(...ownerIds.map(id => eq(users.id, id))))
      : [];
    const ownerMap = new Map(ownersData.map(u => [u.id, u]));
    
    // Get member counts
    const memberCounts = await Promise.all(
      allTeams.map(async (t) => {
        const [result] = await db.select({ count: count() }).from(teamMembers).where(eq(teamMembers.teamId, t.id));
        return { teamId: t.id, count: result?.count || 0 };
      })
    );
    const countMap = new Map(memberCounts.map(c => [c.teamId, c.count]));
    
    return allTeams.map(t => ({
      ...t,
      owner: ownerMap.get(t.ownerId),
      memberCount: countMap.get(t.id) || 0,
    }));
  }

  async getTeam(id: string): Promise<TeamWithDetails | undefined> {
    const [team] = await db.select().from(teams).where(eq(teams.id, id));
    if (!team) return undefined;
    
    const [owner] = await db.select().from(users).where(eq(users.id, team.ownerId));
    const members = await this.getTeamMembers(id);
    
    return {
      ...team,
      owner,
      members,
      memberCount: members.length,
    };
  }

  async createTeam(team: InsertTeam & { ownerId: string }): Promise<Team> {
    const [newTeam] = await db.insert(teams).values({
      ...team,
      id: randomUUID(),
    }).returning();
    
    // Add owner as a member with 'owner' role
    await this.addTeamMember(newTeam.id, team.ownerId, "owner");
    
    return newTeam;
  }

  async updateTeam(id: string, data: Partial<InsertTeam>): Promise<Team | undefined> {
    const [updated] = await db
      .update(teams)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(teams.id, id))
      .returning();
    return updated;
  }

  async deleteTeam(id: string): Promise<void> {
    await db.delete(teams).where(eq(teams.id, id));
  }

  // Team Members
  async getTeamMembers(teamId: string): Promise<TeamMemberWithUser[]> {
    const members = await db.select().from(teamMembers).where(eq(teamMembers.teamId, teamId));
    
    if (members.length === 0) return [];
    
    const userIds = members.map(m => m.userId);
    const usersData = await db.select().from(users).where(or(...userIds.map(id => eq(users.id, id))));
    const userMap = new Map(usersData.map(u => [u.id, u]));
    
    return members.map(m => ({
      ...m,
      user: userMap.get(m.userId),
    }));
  }

  async addTeamMember(teamId: string, userId: string, role: string = "member"): Promise<TeamMember> {
    const [member] = await db.insert(teamMembers).values({
      id: randomUUID(),
      teamId,
      userId,
      role,
    }).returning();
    return member;
  }

  async updateTeamMemberRole(teamId: string, userId: string, role: string): Promise<TeamMember | undefined> {
    const [updated] = await db
      .update(teamMembers)
      .set({ role })
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
      .returning();
    return updated;
  }

  async removeTeamMember(teamId: string, userId: string): Promise<void> {
    await db.delete(teamMembers).where(
      and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId))
    );
  }

  async isTeamMember(teamId: string, userId: string): Promise<boolean> {
    const [member] = await db
      .select()
      .from(teamMembers)
      .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)));
    return !!member;
  }

  // Team Invites
  async getTeamInvites(teamId: string): Promise<TeamInviteWithTeam[]> {
    const invites = await db
      .select()
      .from(teamInvites)
      .where(eq(teamInvites.teamId, teamId))
      .orderBy(desc(teamInvites.createdAt));
    
    if (invites.length === 0) return [];
    
    const [team] = await db.select().from(teams).where(eq(teams.id, teamId));
    const creatorIds = [...new Set(invites.map(i => i.createdById))];
    const creatorsData = await db.select().from(users).where(or(...creatorIds.map(id => eq(users.id, id))));
    const creatorMap = new Map(creatorsData.map(u => [u.id, u]));
    
    return invites.map(i => ({
      ...i,
      team,
      createdBy: creatorMap.get(i.createdById),
    }));
  }

  async getTeamInviteByCode(code: string): Promise<TeamInviteWithTeam | undefined> {
    const [invite] = await db.select().from(teamInvites).where(eq(teamInvites.code, code));
    if (!invite) return undefined;
    
    const [team] = await db.select().from(teams).where(eq(teams.id, invite.teamId));
    const [createdBy] = await db.select().from(users).where(eq(users.id, invite.createdById));
    
    return {
      ...invite,
      team,
      createdBy,
    };
  }

  async createTeamInvite(invite: InsertTeamInvite): Promise<TeamInvite> {
    const [newInvite] = await db.insert(teamInvites).values({
      ...invite,
      id: randomUUID(),
    }).returning();
    return newInvite;
  }

  async useTeamInvite(code: string, userId: string): Promise<{ success: boolean; team?: Team; error?: string }> {
    const invite = await this.getTeamInviteByCode(code);
    
    if (!invite) {
      return { success: false, error: "Invitation not found" };
    }
    
    if (invite.isActive !== "true") {
      return { success: false, error: "This invitation is no longer active" };
    }
    
    if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
      return { success: false, error: "This invitation has expired" };
    }
    
    if (invite.maxUses && invite.useCount >= invite.maxUses) {
      return { success: false, error: "This invitation has reached its maximum uses" };
    }
    
    // Check if already a member
    const isMember = await this.isTeamMember(invite.teamId, userId);
    if (isMember) {
      return { success: false, error: "You are already a member of this team" };
    }
    
    // Add as member
    await this.addTeamMember(invite.teamId, userId, "member");
    
    // Increment use count
    await db
      .update(teamInvites)
      .set({ useCount: invite.useCount + 1 })
      .where(eq(teamInvites.id, invite.id));
    
    return { success: true, team: invite.team };
  }

  async deactivateTeamInvite(id: string): Promise<void> {
    await db.update(teamInvites).set({ isActive: "false" }).where(eq(teamInvites.id, id));
  }
}

export const storage = new DatabaseStorage();
