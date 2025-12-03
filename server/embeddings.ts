import OpenAI from "openai";
import { db } from "./db";
import { documentEmbeddings, documents, projects } from "@shared/schema";
import { eq, sql } from "drizzle-orm";
import crypto from "crypto";

const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

function getOpenAIClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }
  return new OpenAI({ apiKey });
}

export function extractTextFromContent(content: any): string {
  if (!content) return "";
  
  let text = "";
  
  function traverse(node: any) {
    if (!node) return;
    
    if (node.type === "text" && node.text) {
      text += node.text + " ";
    }
    
    if (node.type === "heading") {
      text += "\n";
    }
    
    if (node.type === "paragraph") {
      text += "\n";
    }
    
    if (node.type === "bulletList" || node.type === "orderedList") {
      text += "\n";
    }
    
    if (node.type === "listItem") {
      text += "- ";
    }
    
    if (node.type === "codeBlock") {
      text += "\n```\n";
    }
    
    if (node.content && Array.isArray(node.content)) {
      node.content.forEach(traverse);
    }
    
    if (node.type === "codeBlock") {
      text += "\n```\n";
    }
  }
  
  traverse(content);
  return text.trim().replace(/\n{3,}/g, "\n\n");
}

export function chunkText(text: string, title: string): string[] {
  if (!text || text.length === 0) {
    return [`Page: ${title}\n(Empty page)`];
  }
  
  const fullText = `Page: ${title}\n\n${text}`;
  
  if (fullText.length <= CHUNK_SIZE) {
    return [fullText];
  }
  
  const chunks: string[] = [];
  const words = fullText.split(/\s+/);
  let currentChunk = "";
  
  for (const word of words) {
    if ((currentChunk + " " + word).length > CHUNK_SIZE && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      const overlapWords = currentChunk.split(/\s+/).slice(-Math.floor(CHUNK_OVERLAP / 5));
      currentChunk = overlapWords.join(" ") + " " + word;
    } else {
      currentChunk = currentChunk ? currentChunk + " " + word : word;
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

function computeHash(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex").substring(0, 64);
}

export async function generateEmbedding(text: string): Promise<number[]> {
  const openai = getOpenAIClient();
  
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  
  return response.data[0].embedding;
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  
  const openai = getOpenAIClient();
  
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
    dimensions: EMBEDDING_DIMENSIONS,
  });
  
  return response.data.map(d => d.embedding);
}

export async function updateDocumentEmbeddings(
  documentId: string,
  projectId: string,
  ownerId: string,
  title: string,
  content: any,
  projectName: string,
  breadcrumbs: string[] = []
): Promise<void> {
  const textContent = extractTextFromContent(content);
  const chunks = chunkText(textContent, title);
  
  const existingEmbeddings = await db
    .select()
    .from(documentEmbeddings)
    .where(eq(documentEmbeddings.documentId, documentId));
  
  const existingHashes = new Map(
    existingEmbeddings.map(e => [e.chunkIndex, e.contentHash])
  );
  
  const chunksToEmbed: { index: number; text: string; hash: string }[] = [];
  
  for (let i = 0; i < chunks.length; i++) {
    const hash = computeHash(chunks[i]);
    if (existingHashes.get(i) !== hash) {
      chunksToEmbed.push({ index: i, text: chunks[i], hash });
    }
  }
  
  if (chunksToEmbed.length > 0 || existingEmbeddings.length !== chunks.length) {
    await db.delete(documentEmbeddings).where(eq(documentEmbeddings.documentId, documentId));
    
    const embeddings = await generateEmbeddings(chunks);
    
    for (let i = 0; i < chunks.length; i++) {
      const hash = computeHash(chunks[i]);
      const embeddingArray = embeddings[i];
      const embeddingString = `[${embeddingArray.join(",")}]`;
      
      await db.execute(sql`
        INSERT INTO document_embeddings (
          document_id, project_id, owner_id, chunk_index, chunk_text, content_hash, embedding, metadata
        ) VALUES (
          ${documentId}, ${projectId}, ${ownerId}, ${i}, ${chunks[i]}, ${hash}, 
          ${embeddingString}::vector,
          ${JSON.stringify({ title, projectName, breadcrumbs })}::jsonb
        )
      `);
    }
  }
}

export async function deleteDocumentEmbeddings(documentId: string): Promise<void> {
  await db.delete(documentEmbeddings).where(eq(documentEmbeddings.documentId, documentId));
}

export async function deleteProjectEmbeddings(projectId: string): Promise<void> {
  await db.delete(documentEmbeddings).where(eq(documentEmbeddings.projectId, projectId));
}

export interface SearchResult {
  documentId: string;
  projectId: string;
  chunkText: string;
  title: string;
  projectName: string;
  breadcrumbs: string[];
  similarity: number;
}

export async function searchSimilarChunks(
  userId: string,
  query: string,
  limit: number = 15
): Promise<SearchResult[]> {
  const queryEmbedding = await generateEmbedding(query);
  const embeddingString = `[${queryEmbedding.join(",")}]`;
  
  const results = await db.execute(sql`
    SELECT 
      document_id,
      project_id,
      chunk_text,
      metadata,
      1 - (embedding <=> ${embeddingString}::vector) as similarity
    FROM document_embeddings
    WHERE owner_id = ${userId}
    ORDER BY embedding <=> ${embeddingString}::vector
    LIMIT ${limit}
  `);
  
  return (results.rows as any[]).map(row => ({
    documentId: row.document_id,
    projectId: row.project_id,
    chunkText: row.chunk_text,
    title: row.metadata?.title || "Untitled",
    projectName: row.metadata?.projectName || "Unknown Project",
    breadcrumbs: row.metadata?.breadcrumbs || [],
    similarity: parseFloat(row.similarity),
  }));
}

export async function hasEmbeddings(userId: string): Promise<boolean> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(documentEmbeddings)
    .where(eq(documentEmbeddings.ownerId, userId));
  
  return (result[0]?.count || 0) > 0;
}

export async function rebuildAllEmbeddings(userId: string): Promise<{ processed: number; errors: string[] }> {
  const userProjects = await db
    .select()
    .from(projects)
    .where(eq(projects.ownerId, userId));
  
  let processed = 0;
  const errors: string[] = [];
  
  for (const project of userProjects) {
    const projectDocs = await db
      .select()
      .from(documents)
      .where(eq(documents.projectId, project.id));
    
    for (const doc of projectDocs) {
      try {
        const breadcrumbs = await getDocumentBreadcrumbs(doc.id);
        await updateDocumentEmbeddings(
          doc.id,
          project.id,
          userId,
          doc.title,
          doc.content,
          project.name,
          breadcrumbs
        );
        processed++;
      } catch (error: any) {
        errors.push(`Failed to embed document ${doc.id}: ${error.message}`);
      }
    }
  }
  
  return { processed, errors };
}

async function getDocumentBreadcrumbs(documentId: string): Promise<string[]> {
  const breadcrumbs: string[] = [];
  let currentId: string | null = documentId;
  const visited = new Set<string>();
  
  while (currentId) {
    if (visited.has(currentId)) break;
    visited.add(currentId);
    
    const [doc] = await db.select().from(documents).where(eq(documents.id, currentId));
    if (!doc) break;
    
    if (doc.id !== documentId) {
      breadcrumbs.unshift(doc.title);
    }
    currentId = doc.parentId;
  }
  
  return breadcrumbs;
}
