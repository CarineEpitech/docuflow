import { sql } from "drizzle-orm";
import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)]
);

// User role enum values
export const userRoleValues = ["admin", "user"] as const;
export type UserRole = typeof userRoleValues[number];

// User storage table with email/password auth
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique().notNull(),
  password: varchar("password", { length: 255 }).notNull(),
  firstName: varchar("first_name"),
  lastName: varchar("last_name"),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role", { length: 20 }).notNull().default("user"),
  isMainAdmin: integer("is_main_admin").notNull().default(0),
  hoursPerDay: integer("hours_per_day").notNull().default(8),
  lastGeneratedPassword: varchar("last_generated_password", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  role: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type SafeUser = Omit<User, "password">;

// Projects table - folders containing documents
export const projects = pgTable("projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  icon: varchar("icon", { length: 50 }),
  ownerId: varchar("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const projectsRelations = relations(projects, ({ one, many }) => ({
  owner: one(users, {
    fields: [projects.ownerId],
    references: [users.id],
  }),
  documents: many(documents),
}));

export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  ownerId: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projects.$inferSelect;

// Documents table - pages with nested structure and block content
export const documents = pgTable("documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: varchar("title", { length: 500 }).notNull().default("Untitled"),
  content: jsonb("content").$type<any>(),
  icon: varchar("icon", { length: 50 }),
  coverImage: varchar("cover_image"),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  parentId: varchar("parent_id"),
  position: integer("position").notNull().default(0),
  createdById: varchar("created_by_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("IDX_document_project").on(table.projectId),
  index("IDX_document_parent").on(table.parentId),
  index("IDX_document_created_by").on(table.createdById),
]);

export const documentsRelations = relations(documents, ({ one, many }) => ({
  project: one(projects, {
    fields: [documents.projectId],
    references: [projects.id],
  }),
  parent: one(documents, {
    fields: [documents.parentId],
    references: [documents.id],
    relationName: "parentChild",
  }),
  children: many(documents, {
    relationName: "parentChild",
  }),
  createdBy: one(users, {
    fields: [documents.createdById],
    references: [users.id],
  }),
}));

export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;

// Type for document with children for tree structure
export type DocumentWithChildren = Document & {
  children?: DocumentWithChildren[];
};

// Type for document with creator info
export type DocumentWithCreator = Document & {
  createdBy?: SafeUser;
};

// Type for TipTap JSON content
export interface TipTapContent {
  type: string;
  content?: TipTapContent[];
  attrs?: Record<string, any>;
  marks?: Array<{ type: string; attrs?: Record<string, any> }>;
  text?: string;
}

// Document embeddings table for vector search (uses pgvector)
export const documentEmbeddings = pgTable("document_embeddings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  documentId: varchar("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  ownerId: varchar("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull().default(0),
  chunkText: text("chunk_text").notNull(),
  contentHash: varchar("content_hash", { length: 64 }).notNull(),
  metadata: jsonb("metadata").$type<{
    title?: string;
    projectName?: string;
    breadcrumbs?: string[];
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_embeddings_document").on(table.documentId),
  index("idx_embeddings_project").on(table.projectId),
  index("idx_embeddings_owner").on(table.ownerId),
  index("idx_embeddings_hash").on(table.contentHash),
]);

export const documentEmbeddingsRelations = relations(documentEmbeddings, ({ one }) => ({
  document: one(documents, {
    fields: [documentEmbeddings.documentId],
    references: [documents.id],
  }),
  project: one(projects, {
    fields: [documentEmbeddings.projectId],
    references: [projects.id],
  }),
  owner: one(users, {
    fields: [documentEmbeddings.ownerId],
    references: [users.id],
  }),
}));

export type DocumentEmbedding = typeof documentEmbeddings.$inferSelect;
export type InsertDocumentEmbedding = typeof documentEmbeddings.$inferInsert;

// Video transcripts table - tracks video embeds and their transcripts for the knowledge base
export const videoTranscripts = pgTable("video_transcripts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  videoUrl: varchar("video_url", { length: 2000 }).notNull(),
  videoId: varchar("video_id", { length: 255 }).notNull(),
  provider: varchar("provider", { length: 50 }).notNull(),
  documentId: varchar("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  ownerId: varchar("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  transcript: text("transcript"),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_video_transcripts_document").on(table.documentId),
  index("idx_video_transcripts_video_id").on(table.videoId),
  index("idx_video_transcripts_owner").on(table.ownerId),
  index("idx_video_transcripts_status").on(table.status),
]);

export const videoTranscriptsRelations = relations(videoTranscripts, ({ one }) => ({
  document: one(documents, {
    fields: [videoTranscripts.documentId],
    references: [documents.id],
  }),
  project: one(projects, {
    fields: [videoTranscripts.projectId],
    references: [projects.id],
  }),
  owner: one(users, {
    fields: [videoTranscripts.ownerId],
    references: [users.id],
  }),
}));

export const insertVideoTranscriptSchema = createInsertSchema(videoTranscripts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type VideoTranscript = typeof videoTranscripts.$inferSelect;
export type InsertVideoTranscript = z.infer<typeof insertVideoTranscriptSchema>;
export type VideoTranscriptStatus = "pending" | "processing" | "completed" | "error";

// CRM Project Status enum values
export const crmProjectStatusValues = [
  "lead",
  "discovering_call_completed",
  "proposal_sent",
  "follow_up",
  "in_negotiation",
  "won",
  "won_not_started",
  "won_in_progress",
  "won_in_review",
  "won_completed",
  "lost",
  "won_cancelled"
] as const;

export type CrmProjectStatus = typeof crmProjectStatusValues[number];

// CRM Project Type enum values
export const crmProjectTypeValues = [
  "one_time",
  "monthly",
  "hourly_budget",
  "internal"
] as const;

export type CrmProjectType = typeof crmProjectTypeValues[number];

// Contact Status enum values
export const contactStatusValues = [
  "lead",
  "prospect",
  "client",
  "client_recurrent"
] as const;

export type ContactStatus = typeof contactStatusValues[number];

// Client Source enum values
export const clientSourceValues = [
  "fiverr",
  "zoho",
  "direct"
] as const;

export type ClientSource = typeof clientSourceValues[number];

// CRM Clients table - companies/individuals associated with projects (now called Contacts)
export const crmClients = pgTable("crm_clients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  company: varchar("company", { length: 255 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  phoneFormat: varchar("phone_format", { length: 20 }).default("us"),
  notes: text("notes"),
  status: varchar("status", { length: 50 }).notNull().default("lead"),
  source: varchar("source", { length: 50 }),
  fiverrUsername: varchar("fiverr_username", { length: 100 }),
  ownerId: varchar("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_crm_clients_owner").on(table.ownerId),
  index("idx_crm_clients_status").on(table.status),
]);

export const crmClientsRelations = relations(crmClients, ({ one, many }) => ({
  owner: one(users, {
    fields: [crmClients.ownerId],
    references: [users.id],
  }),
  contacts: many(crmContacts),
  crmProjects: many(crmProjects),
}));

export const insertCrmClientSchema = createInsertSchema(crmClients).omit({
  id: true,
  ownerId: true,
  createdAt: true,
  updatedAt: true,
});

export type CrmClient = typeof crmClients.$inferSelect;
export type InsertCrmClient = z.infer<typeof insertCrmClientSchema>;

// CRM Contacts table - contact persons for clients
export const crmContacts = pgTable("crm_contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  clientId: varchar("client_id").notNull().references(() => crmClients.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  role: varchar("role", { length: 100 }),
  email: varchar("email", { length: 255 }),
  phone: varchar("phone", { length: 50 }),
  isPrimary: integer("is_primary").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_crm_contacts_client").on(table.clientId),
]);

export const crmContactsRelations = relations(crmContacts, ({ one }) => ({
  client: one(crmClients, {
    fields: [crmContacts.clientId],
    references: [crmClients.id],
  }),
}));

export const insertCrmContactSchema = createInsertSchema(crmContacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CrmContact = typeof crmContacts.$inferSelect;
export type InsertCrmContact = z.infer<typeof insertCrmContactSchema>;

// CRM Projects table - CRM metadata for projects
export const crmProjects = pgTable("crm_projects", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  projectId: varchar("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  clientId: varchar("client_id").references(() => crmClients.id, { onDelete: "set null" }),
  status: varchar("status", { length: 50 }).notNull().default("lead"),
  projectType: varchar("project_type", { length: 50 }).default("one_time"),
  assigneeId: varchar("assignee_id").references(() => users.id, { onDelete: "set null" }),
  startDate: timestamp("start_date"),
  dueDate: timestamp("due_date"),
  actualFinishDate: timestamp("actual_finish_date"),
  comments: text("comments"),
  budgetedHours: integer("budgeted_hours"),
  actualHours: integer("actual_hours"),
  documentationEnabled: integer("documentation_enabled").default(0),
  isDocumentationOnly: integer("is_documentation_only").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_crm_projects_project").on(table.projectId),
  index("idx_crm_projects_client").on(table.clientId),
  index("idx_crm_projects_assignee").on(table.assigneeId),
  index("idx_crm_projects_status").on(table.status),
  index("idx_crm_projects_doc_only").on(table.isDocumentationOnly),
]);

export const crmProjectsRelations = relations(crmProjects, ({ one }) => ({
  project: one(projects, {
    fields: [crmProjects.projectId],
    references: [projects.id],
  }),
  client: one(crmClients, {
    fields: [crmProjects.clientId],
    references: [crmClients.id],
  }),
  assignee: one(users, {
    fields: [crmProjects.assigneeId],
    references: [users.id],
  }),
}));

export const insertCrmProjectSchema = createInsertSchema(crmProjects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CrmProject = typeof crmProjects.$inferSelect;
export type InsertCrmProject = z.infer<typeof insertCrmProjectSchema>;

// Extended CRM Project type with joined data for API responses
export type CrmProjectWithDetails = CrmProject & {
  project?: Project;
  client?: CrmClient & { contacts?: CrmContact[] };
  assignee?: SafeUser;
  latestNote?: CrmProjectNoteWithCreator;
};

// CRM Project Stage History table - tracks status changes over time
export const crmProjectStageHistory = pgTable("crm_project_stage_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  crmProjectId: varchar("crm_project_id").notNull().references(() => crmProjects.id, { onDelete: "cascade" }),
  fromStatus: varchar("from_status", { length: 50 }),
  toStatus: varchar("to_status", { length: 50 }).notNull(),
  changedById: varchar("changed_by_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  changedAt: timestamp("changed_at").defaultNow(),
}, (table) => [
  index("idx_crm_stage_history_project").on(table.crmProjectId),
  index("idx_crm_stage_history_changed_at").on(table.changedAt),
]);

export const crmProjectStageHistoryRelations = relations(crmProjectStageHistory, ({ one }) => ({
  crmProject: one(crmProjects, {
    fields: [crmProjectStageHistory.crmProjectId],
    references: [crmProjects.id],
  }),
  changedBy: one(users, {
    fields: [crmProjectStageHistory.changedById],
    references: [users.id],
  }),
}));

export const insertCrmProjectStageHistorySchema = createInsertSchema(crmProjectStageHistory).omit({
  id: true,
  changedAt: true,
});

export type CrmProjectStageHistory = typeof crmProjectStageHistory.$inferSelect;
export type InsertCrmProjectStageHistory = z.infer<typeof insertCrmProjectStageHistorySchema>;

export type CrmProjectStageHistoryWithUser = CrmProjectStageHistory & {
  changedBy?: SafeUser;
};

// Company Document Folders table - folders for organizing company documents
export const companyDocumentFolders = pgTable("company_document_folders", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdById: varchar("created_by_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_company_document_folders_created_by").on(table.createdById),
]);

export const companyDocumentFoldersRelations = relations(companyDocumentFolders, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [companyDocumentFolders.createdById],
    references: [users.id],
  }),
  documents: many(companyDocuments),
}));

export const insertCompanyDocumentFolderSchema = createInsertSchema(companyDocumentFolders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CompanyDocumentFolder = typeof companyDocumentFolders.$inferSelect;
export type InsertCompanyDocumentFolder = z.infer<typeof insertCompanyDocumentFolderSchema>;

// Company document folder with creator info
export type CompanyDocumentFolderWithCreator = CompanyDocumentFolder & {
  createdBy?: SafeUser;
};

// Company Documents table - company terms, policies, and other documents
export const companyDocuments = pgTable("company_documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 500 }).notNull(),
  description: text("description"),
  content: jsonb("content"),
  fileName: varchar("file_name", { length: 500 }),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type", { length: 100 }),
  storagePath: varchar("storage_path", { length: 1000 }),
  folderId: varchar("folder_id").references(() => companyDocumentFolders.id, { onDelete: "cascade" }),
  uploadedById: varchar("uploaded_by_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_company_documents_uploaded_by").on(table.uploadedById),
  index("idx_company_documents_folder").on(table.folderId),
]);

export const companyDocumentsRelations = relations(companyDocuments, ({ one }) => ({
  uploadedBy: one(users, {
    fields: [companyDocuments.uploadedById],
    references: [users.id],
  }),
  folder: one(companyDocumentFolders, {
    fields: [companyDocuments.folderId],
    references: [companyDocumentFolders.id],
  }),
}));

export const insertCompanyDocumentSchema = createInsertSchema(companyDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CompanyDocument = typeof companyDocuments.$inferSelect;
export type InsertCompanyDocument = z.infer<typeof insertCompanyDocumentSchema>;

// Company document with uploader info
export type CompanyDocumentWithUploader = CompanyDocument & {
  uploadedBy?: SafeUser;
  folder?: CompanyDocumentFolder;
};

// Company Document embeddings table for vector search (uses pgvector)
export const companyDocumentEmbeddings = pgTable("company_document_embeddings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  companyDocumentId: varchar("company_document_id").notNull().references(() => companyDocuments.id, { onDelete: "cascade" }),
  folderId: varchar("folder_id").references(() => companyDocumentFolders.id, { onDelete: "cascade" }),
  chunkIndex: integer("chunk_index").notNull().default(0),
  chunkText: text("chunk_text").notNull(),
  contentHash: varchar("content_hash", { length: 64 }).notNull(),
  metadata: jsonb("metadata").$type<{
    title?: string;
    folderName?: string;
    mimeType?: string;
  }>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_company_embeddings_document").on(table.companyDocumentId),
  index("idx_company_embeddings_folder").on(table.folderId),
  index("idx_company_embeddings_hash").on(table.contentHash),
]);

export const companyDocumentEmbeddingsRelations = relations(companyDocumentEmbeddings, ({ one }) => ({
  companyDocument: one(companyDocuments, {
    fields: [companyDocumentEmbeddings.companyDocumentId],
    references: [companyDocuments.id],
  }),
  folder: one(companyDocumentFolders, {
    fields: [companyDocumentEmbeddings.folderId],
    references: [companyDocumentFolders.id],
  }),
}));

export type CompanyDocumentEmbedding = typeof companyDocumentEmbeddings.$inferSelect;
export type InsertCompanyDocumentEmbedding = typeof companyDocumentEmbeddings.$inferInsert;

// Teams table - for organizing users into groups
export const teams = pgTable("teams", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  ownerId: varchar("owner_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const teamsRelations = relations(teams, ({ one, many }) => ({
  owner: one(users, {
    fields: [teams.ownerId],
    references: [users.id],
  }),
  members: many(teamMembers),
  invites: many(teamInvites),
}));

export const insertTeamSchema = createInsertSchema(teams).omit({
  id: true,
  ownerId: true,
  createdAt: true,
  updatedAt: true,
});

export type Team = typeof teams.$inferSelect;
export type InsertTeam = z.infer<typeof insertTeamSchema>;

// Team member role enum
export const teamMemberRoleValues = ["owner", "admin", "member"] as const;
export type TeamMemberRole = typeof teamMemberRoleValues[number];

// Team Members table - junction between users and teams
export const teamMembers = pgTable("team_members", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 20 }).notNull().default("member"),
  joinedAt: timestamp("joined_at").defaultNow(),
}, (table) => [
  index("idx_team_members_team").on(table.teamId),
  index("idx_team_members_user").on(table.userId),
]);

export const teamMembersRelations = relations(teamMembers, ({ one }) => ({
  team: one(teams, {
    fields: [teamMembers.teamId],
    references: [teams.id],
  }),
  user: one(users, {
    fields: [teamMembers.userId],
    references: [users.id],
  }),
}));

export const insertTeamMemberSchema = createInsertSchema(teamMembers).omit({
  id: true,
  joinedAt: true,
});

export type TeamMember = typeof teamMembers.$inferSelect;
export type InsertTeamMember = z.infer<typeof insertTeamMemberSchema>;

// Team member with user info
export type TeamMemberWithUser = TeamMember & {
  user?: SafeUser;
};

// Team Invites table - invitation links for joining teams
export const teamInvites = pgTable("team_invites", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  teamId: varchar("team_id").notNull().references(() => teams.id, { onDelete: "cascade" }),
  code: varchar("code", { length: 64 }).notNull().unique(),
  createdById: varchar("created_by_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at"),
  maxUses: integer("max_uses"),
  useCount: integer("use_count").notNull().default(0),
  isActive: varchar("is_active", { length: 5 }).notNull().default("true"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_team_invites_team").on(table.teamId),
  index("idx_team_invites_code").on(table.code),
]);

export const teamInvitesRelations = relations(teamInvites, ({ one }) => ({
  team: one(teams, {
    fields: [teamInvites.teamId],
    references: [teams.id],
  }),
  createdBy: one(users, {
    fields: [teamInvites.createdById],
    references: [users.id],
  }),
}));

export const insertTeamInviteSchema = createInsertSchema(teamInvites).omit({
  id: true,
  useCount: true,
  createdAt: true,
});

export type TeamInvite = typeof teamInvites.$inferSelect;
export type InsertTeamInvite = z.infer<typeof insertTeamInviteSchema>;

// Team invite with team info
export type TeamInviteWithTeam = TeamInvite & {
  team?: Team;
  createdBy?: SafeUser;
};

// Team with members and owner info
export type TeamWithDetails = Team & {
  owner?: SafeUser;
  members?: TeamMemberWithUser[];
  memberCount?: number;
};

// CRM Project Notes table - notes with user mentions for project updates
export const crmProjectNotes = pgTable("crm_project_notes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  crmProjectId: varchar("crm_project_id").notNull().references(() => crmProjects.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdById: varchar("created_by_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  mentionedUserIds: text("mentioned_user_ids").array(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_crm_project_notes_project").on(table.crmProjectId),
  index("idx_crm_project_notes_created_by").on(table.createdById),
]);

export const crmProjectNotesRelations = relations(crmProjectNotes, ({ one }) => ({
  crmProject: one(crmProjects, {
    fields: [crmProjectNotes.crmProjectId],
    references: [crmProjects.id],
  }),
  createdBy: one(users, {
    fields: [crmProjectNotes.createdById],
    references: [users.id],
  }),
}));

export const insertCrmProjectNoteSchema = createInsertSchema(crmProjectNotes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CrmProjectNote = typeof crmProjectNotes.$inferSelect;
export type InsertCrmProjectNote = z.infer<typeof insertCrmProjectNoteSchema>;

// CRM Project Note with creator info
export type CrmProjectNoteWithCreator = CrmProjectNote & {
  createdBy?: SafeUser;
};

// Notifications table - for user mention notifications
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 50 }).notNull().default("mention"),
  noteId: varchar("note_id").references(() => crmProjectNotes.id, { onDelete: "cascade" }),
  crmProjectId: varchar("crm_project_id").references(() => crmProjects.id, { onDelete: "cascade" }),
  fromUserId: varchar("from_user_id").references(() => users.id, { onDelete: "set null" }),
  message: text("message"),
  isRead: integer("is_read").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_notifications_user").on(table.userId),
  index("idx_notifications_unread").on(table.userId, table.isRead),
]);

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, {
    fields: [notifications.userId],
    references: [users.id],
  }),
  fromUser: one(users, {
    fields: [notifications.fromUserId],
    references: [users.id],
  }),
  note: one(crmProjectNotes, {
    fields: [notifications.noteId],
    references: [crmProjectNotes.id],
  }),
  crmProject: one(crmProjects, {
    fields: [notifications.crmProjectId],
    references: [crmProjects.id],
  }),
}));

export const insertNotificationSchema = createInsertSchema(notifications).omit({
  id: true,
  createdAt: true,
});

export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

export type NotificationWithDetails = Notification & {
  fromUser?: SafeUser;
  crmProject?: { id: string; project?: { name: string } };
};
