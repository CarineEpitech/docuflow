import { db } from "./db";
import { videoTranscripts, documents, projects, documentEmbeddings } from "@shared/schema";
import { eq, and, inArray, sql } from "drizzle-orm";
import { generateEmbeddings, chunkText } from "./embeddings";
import crypto from "crypto";

export interface VideoInfo {
  url: string;
  videoId: string;
  provider: "loom" | "fathom";
}

export interface TranscriptResult {
  success: boolean;
  transcript?: string;
  error?: string;
}

function computeHash(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex").substring(0, 64);
}

export function extractVideoInfo(url: string): VideoInfo | null {
  try {
    const urlObj = new URL(url);
    
    if (urlObj.hostname.includes("loom.com")) {
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      let videoId = "";
      
      if (pathParts[0] === "share" && pathParts[1]) {
        videoId = pathParts[1].split('?')[0];
      } else if (pathParts[0] === "embed" && pathParts[1]) {
        videoId = pathParts[1].split('?')[0];
      } else if (pathParts.length === 1) {
        videoId = pathParts[0].split('?')[0];
      }
      
      if (videoId) {
        return { url, videoId, provider: "loom" };
      }
    }
    
    if (urlObj.hostname.includes("fathom.video")) {
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      let videoId = "";
      
      if ((pathParts[0] === "share" || pathParts[0] === "embed" || pathParts[0] === "call") && pathParts[1]) {
        videoId = pathParts[1].split('?')[0];
      } else if (pathParts.length === 1) {
        videoId = pathParts[0].split('?')[0];
      }
      
      if (videoId) {
        return { url, videoId, provider: "fathom" };
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

export function extractVideosFromContent(content: any): VideoInfo[] {
  const videos: VideoInfo[] = [];
  
  function traverse(node: any) {
    if (!node) return;
    
    if (node.type === "videoEmbed" && node.attrs?.src) {
      const info = extractVideoInfo(node.attrs.src);
      if (info) {
        videos.push(info);
      }
    }
    
    if (node.content && Array.isArray(node.content)) {
      node.content.forEach(traverse);
    }
  }
  
  traverse(content);
  return videos;
}

async function fetchLoomTranscript(videoId: string): Promise<TranscriptResult> {
  try {
    const shareUrl = `https://www.loom.com/share/${videoId}`;
    
    const response = await fetch(shareUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    });
    
    if (!response.ok) {
      return { success: false, error: `Failed to fetch Loom page: ${response.status}` };
    }
    
    const html = await response.text();
    
    const apolloStateMatch = html.match(/window\.__APOLLO_STATE__\s*=\s*({[\s\S]*?});\s*<\/script>/);
    if (apolloStateMatch) {
      try {
        const apolloState = JSON.parse(apolloStateMatch[1]);
        
        for (const key of Object.keys(apolloState)) {
          if (key.startsWith('Transcription:')) {
            const transcription = apolloState[key];
            if (transcription.source_text) {
              return { success: true, transcript: transcription.source_text };
            }
          }
        }
        
        for (const key of Object.keys(apolloState)) {
          const value = apolloState[key];
          if (value && typeof value === 'object') {
            if (value.transcript_with_chapters || value.transcript) {
              const transcript = value.transcript_with_chapters || value.transcript;
              if (typeof transcript === 'string') {
                return { success: true, transcript };
              }
              if (Array.isArray(transcript)) {
                const text = transcript.map((t: any) => t.text || t.content || '').join(' ');
                if (text) {
                  return { success: true, transcript: text };
                }
              }
            }
          }
        }
      } catch (parseError) {
        console.error("Failed to parse Apollo state:", parseError);
      }
    }
    
    const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>({[\s\S]*?})<\/script>/);
    if (nextDataMatch) {
      try {
        const nextData = JSON.parse(nextDataMatch[1]);
        const transcriptData = findTranscriptInObject(nextData);
        if (transcriptData) {
          return { success: true, transcript: transcriptData };
        }
      } catch (parseError) {
        console.error("Failed to parse NEXT_DATA:", parseError);
      }
    }
    
    const embedUrl = `https://www.loom.com/embed/${videoId}`;
    const embedResponse = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    
    if (embedResponse.ok) {
      const embedHtml = await embedResponse.text();
      
      const embedApolloMatch = embedHtml.match(/window\.__APOLLO_STATE__\s*=\s*({[\s\S]*?});\s*<\/script>/);
      if (embedApolloMatch) {
        try {
          const apolloState = JSON.parse(embedApolloMatch[1]);
          for (const key of Object.keys(apolloState)) {
            if (key.startsWith('Transcription:')) {
              const transcription = apolloState[key];
              if (transcription.source_text) {
                return { success: true, transcript: transcription.source_text };
              }
            }
          }
        } catch (parseError) {
          console.error("Failed to parse embed Apollo state:", parseError);
        }
      }
    }
    
    return { success: false, error: "Transcript not found in Loom page. The video may not have transcription enabled." };
  } catch (error: any) {
    console.error("Error fetching Loom transcript:", error);
    return { success: false, error: `Failed to fetch Loom transcript: ${error.message}` };
  }
}

function findTranscriptInObject(obj: any): string | null {
  if (!obj || typeof obj !== 'object') return null;
  
  if (obj.transcript && typeof obj.transcript === 'string') {
    return obj.transcript;
  }
  
  if (obj.source_text && typeof obj.source_text === 'string') {
    return obj.source_text;
  }
  
  if (obj.transcription && typeof obj.transcription === 'object') {
    if (obj.transcription.source_text) {
      return obj.transcription.source_text;
    }
  }
  
  for (const key of Object.keys(obj)) {
    const result = findTranscriptInObject(obj[key]);
    if (result) return result;
  }
  
  return null;
}

async function fetchFathomTranscript(videoId: string): Promise<TranscriptResult> {
  const apiKey = process.env.FATHOM_API_KEY;
  
  if (!apiKey) {
    try {
      const shareUrl = `https://fathom.video/share/${videoId}`;
      const response = await fetch(shareUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      });
      
      if (response.ok) {
        const html = await response.text();
        
        const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>({[\s\S]*?})<\/script>/);
        if (nextDataMatch) {
          try {
            const nextData = JSON.parse(nextDataMatch[1]);
            const transcriptData = findTranscriptInObject(nextData);
            if (transcriptData) {
              return { success: true, transcript: transcriptData };
            }
          } catch (parseError) {
            console.error("Failed to parse Fathom NEXT_DATA:", parseError);
          }
        }
      }
    } catch (error) {
      console.error("Error scraping Fathom:", error);
    }
    
    return { 
      success: false, 
      error: "FATHOM_API_KEY not configured. Please add your Fathom API key in Secrets to enable transcript extraction." 
    };
  }
  
  try {
    const response = await fetch(`https://api.fathom.ai/external/v1/recordings/${videoId}/transcript`, {
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: "Video not found in Fathom" };
      }
      if (response.status === 401) {
        return { success: false, error: "Invalid Fathom API key" };
      }
      return { success: false, error: `Fathom API error: ${response.status}` };
    }
    
    const data = await response.json();
    
    if (data.transcript && Array.isArray(data.transcript)) {
      const transcript = data.transcript.map((segment: any) => {
        const speaker = segment.speaker?.display_name || 'Speaker';
        const text = segment.text || '';
        return `${speaker}: ${text}`;
      }).join('\n');
      
      return { success: true, transcript };
    }
    
    if (typeof data.transcript === 'string') {
      return { success: true, transcript: data.transcript };
    }
    
    return { success: false, error: "Unexpected transcript format from Fathom" };
  } catch (error: any) {
    console.error("Error fetching Fathom transcript:", error);
    return { success: false, error: `Failed to fetch Fathom transcript: ${error.message}` };
  }
}

export async function fetchTranscript(provider: string, videoId: string): Promise<TranscriptResult> {
  if (provider === "loom") {
    return fetchLoomTranscript(videoId);
  } else if (provider === "fathom") {
    return fetchFathomTranscript(videoId);
  }
  
  return { success: false, error: `Unsupported video provider: ${provider}` };
}

async function createTranscriptEmbeddings(
  transcriptId: string,
  transcript: string,
  documentId: string,
  projectId: string,
  ownerId: string,
  videoProvider: string,
  projectName: string,
  documentTitle: string,
  breadcrumbs: string[] = []
): Promise<void> {
  const title = `Video Transcript (${videoProvider})`;
  const chunks = chunkText(transcript, title);
  
  const existingEmbeddings = await db
    .select()
    .from(documentEmbeddings)
    .where(
      and(
        eq(documentEmbeddings.documentId, documentId),
        sql`metadata->>'transcriptId' = ${transcriptId}`
      )
    );
  
  const existingHashes = new Map(
    existingEmbeddings.map(e => [e.chunkIndex, e.contentHash])
  );
  
  let needsUpdate = existingEmbeddings.length !== chunks.length;
  if (!needsUpdate) {
    for (let i = 0; i < chunks.length; i++) {
      const hash = computeHash(chunks[i]);
      if (existingHashes.get(i) !== hash) {
        needsUpdate = true;
        break;
      }
    }
  }
  
  if (!needsUpdate) {
    return;
  }
  
  let embeddings: number[][];
  try {
    embeddings = await generateEmbeddings(chunks);
  } catch (error) {
    console.error("Failed to generate embeddings for transcript:", transcriptId, error);
    throw error;
  }
  
  await db.delete(documentEmbeddings).where(
    and(
      eq(documentEmbeddings.documentId, documentId),
      sql`metadata->>'transcriptId' = ${transcriptId}`
    )
  );
  
  const fullBreadcrumbs = [...breadcrumbs, documentTitle];
  
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
        ${JSON.stringify({ 
          title: `${documentTitle} - ${title}`, 
          projectName, 
          breadcrumbs: fullBreadcrumbs,
          transcriptId,
          isVideoTranscript: true,
          videoProvider
        })}::jsonb
      )
    `);
  }
}

async function deleteTranscriptEmbeddings(transcriptId: string, documentId: string): Promise<void> {
  await db.delete(documentEmbeddings).where(
    and(
      eq(documentEmbeddings.documentId, documentId),
      sql`metadata->>'transcriptId' = ${transcriptId}`
    )
  );
}

export async function deleteDocumentTranscripts(documentId: string): Promise<void> {
  const transcripts = await db
    .select()
    .from(videoTranscripts)
    .where(eq(videoTranscripts.documentId, documentId));
  
  for (const transcript of transcripts) {
    await deleteTranscriptEmbeddings(transcript.id, documentId);
  }
  
  await db.delete(videoTranscripts).where(eq(videoTranscripts.documentId, documentId));
}

export async function syncDocumentVideoTranscripts(
  documentId: string,
  projectId: string,
  ownerId: string,
  content: any,
  projectName: string,
  documentTitle: string,
  breadcrumbs: string[] = []
): Promise<{ added: number; removed: number; errors: string[] }> {
  const videosInContent = extractVideosFromContent(content);
  const videoIdsInContent = new Set(videosInContent.map(v => v.videoId));
  
  const existingTranscripts = await db
    .select()
    .from(videoTranscripts)
    .where(eq(videoTranscripts.documentId, documentId));
  
  const existingVideoIds = new Set(existingTranscripts.map(t => t.videoId));
  
  const result = { added: 0, removed: 0, errors: [] as string[] };
  
  for (const transcript of existingTranscripts) {
    if (!videoIdsInContent.has(transcript.videoId)) {
      try {
        await deleteTranscriptEmbeddings(transcript.id, documentId);
        await db.delete(videoTranscripts).where(eq(videoTranscripts.id, transcript.id));
        result.removed++;
      } catch (error: any) {
        result.errors.push(`Failed to remove transcript for video ${transcript.videoId}: ${error.message}`);
      }
    }
  }
  
  for (const video of videosInContent) {
    if (!existingVideoIds.has(video.videoId)) {
      try {
        const [inserted] = await db.insert(videoTranscripts).values({
          videoUrl: video.url,
          videoId: video.videoId,
          provider: video.provider,
          documentId,
          projectId,
          ownerId,
          status: "pending",
        }).returning();
        
        processTranscript(inserted.id, video.provider, video.videoId, documentId, projectId, ownerId, projectName, documentTitle, breadcrumbs)
          .catch(err => console.error("Background transcript processing failed:", err));
        
        result.added++;
      } catch (error: any) {
        result.errors.push(`Failed to add transcript for video ${video.videoId}: ${error.message}`);
      }
    }
  }
  
  return result;
}

async function processTranscript(
  transcriptId: string,
  provider: string,
  videoId: string,
  documentId: string,
  projectId: string,
  ownerId: string,
  projectName: string,
  documentTitle: string,
  breadcrumbs: string[] = []
): Promise<void> {
  await db.update(videoTranscripts)
    .set({ status: "processing", updatedAt: new Date() })
    .where(eq(videoTranscripts.id, transcriptId));
  
  const result = await fetchTranscript(provider, videoId);
  
  if (result.success && result.transcript) {
    await db.update(videoTranscripts)
      .set({ 
        transcript: result.transcript, 
        status: "completed", 
        errorMessage: null,
        updatedAt: new Date() 
      })
      .where(eq(videoTranscripts.id, transcriptId));
    
    try {
      await createTranscriptEmbeddings(
        transcriptId,
        result.transcript,
        documentId,
        projectId,
        ownerId,
        provider,
        projectName,
        documentTitle,
        breadcrumbs
      );
    } catch (error: any) {
      console.error("Failed to create transcript embeddings:", error);
    }
  } else {
    await db.update(videoTranscripts)
      .set({ 
        status: "error", 
        errorMessage: result.error,
        updatedAt: new Date() 
      })
      .where(eq(videoTranscripts.id, transcriptId));
  }
}

export async function retryTranscript(
  transcriptId: string,
  projectName: string,
  documentTitle: string,
  breadcrumbs: string[] = []
): Promise<{ success: boolean; error?: string }> {
  const [transcript] = await db
    .select()
    .from(videoTranscripts)
    .where(eq(videoTranscripts.id, transcriptId));
  
  if (!transcript) {
    return { success: false, error: "Transcript not found" };
  }
  
  await processTranscript(
    transcript.id,
    transcript.provider,
    transcript.videoId,
    transcript.documentId,
    transcript.projectId,
    transcript.ownerId,
    projectName,
    documentTitle,
    breadcrumbs
  );
  
  return { success: true };
}

export async function getDocumentTranscripts(documentId: string) {
  return db
    .select()
    .from(videoTranscripts)
    .where(eq(videoTranscripts.documentId, documentId));
}

export async function getTranscriptStatus(documentId: string): Promise<{
  total: number;
  pending: number;
  processing: number;
  completed: number;
  error: number;
  transcripts: Array<{
    id: string;
    videoId: string;
    provider: string;
    status: string;
    errorMessage: string | null;
  }>;
}> {
  const transcripts = await getDocumentTranscripts(documentId);
  
  return {
    total: transcripts.length,
    pending: transcripts.filter(t => t.status === "pending").length,
    processing: transcripts.filter(t => t.status === "processing").length,
    completed: transcripts.filter(t => t.status === "completed").length,
    error: transcripts.filter(t => t.status === "error").length,
    transcripts: transcripts.map(t => ({
      id: t.id,
      videoId: t.videoId,
      provider: t.provider,
      status: t.status,
      errorMessage: t.errorMessage,
    })),
  };
}
