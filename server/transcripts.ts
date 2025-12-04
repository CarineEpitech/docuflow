import { chromium, Browser, Page, BrowserContext } from 'playwright';
import { db } from './db';
import { videoTranscripts } from '@shared/schema';
import { eq, and, sql } from 'drizzle-orm';
import { updateDocumentEmbeddings } from './embeddings';

const BROWSER_TIMEOUT = 30000;
const HEADLESS = true;
const CHROMIUM_PATH = '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium';

async function launchBrowser(): Promise<Browser> {
  console.log(`[Browser] Launching browser (headless: ${HEADLESS})`);
  
  return await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: HEADLESS,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });
}

async function createContext(browser: Browser): Promise<BrowserContext> {
  return await browser.newContext({
    permissions: ['clipboard-read', 'clipboard-write'],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
  });
}

async function extractTranscriptFromDOM(page: Page): Promise<string | null> {
  return await page.evaluate(() => {
    const transcriptSelectors = [
      '[data-testid="transcript-content"]',
      '.transcript-content',
      '.transcript-text',
      '[class*="transcript"] p',
      '[class*="Transcript"] p',
      '[data-qa="transcript"] p',
    ];
    
    for (const selector of transcriptSelectors) {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        const text = Array.from(elements).map(el => el.textContent?.trim()).filter(Boolean).join('\n');
        if (text.length > 50) return text;
      }
    }
    
    const allText = document.querySelectorAll('[class*="transcript"] *:not(script):not(style)');
    const textContent = Array.from(allText)
      .map(el => el.textContent?.trim())
      .filter(text => text && text.length > 10)
      .join('\n');
    
    return textContent.length > 50 ? textContent : null;
  });
}

export async function extractLoomTranscript(url: string): Promise<string> {
  let browser: Browser | null = null;
  
  try {
    console.log(`[Loom] Starting extraction from: ${url}`);
    
    browser = await launchBrowser();
    const context = await createContext(browser);
    const page = await context.newPage();
    
    console.log('[Loom] Navigating to URL...');
    await page.goto(url, { waitUntil: 'networkidle', timeout: BROWSER_TIMEOUT });
    console.log('[Loom] Page loaded successfully');
    
    const urlObj = new URL(url);
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { 
      origin: `${urlObj.protocol}//${urlObj.host}` 
    });
    
    const transcriptButtonSelectors = [
      'button:has-text("Transcript")',
      '[aria-label="Transcript"]',
      '[data-qa="transcript-button"]',
      'button:has-text("Show transcript")',
      '.transcript-toggle',
      '[role="tab"]:has-text("Transcript")'
    ];
    
    for (const selector of transcriptButtonSelectors) {
      try {
        const button = page.locator(selector).first();
        await button.waitFor({ state: 'visible', timeout: 3000 });
        await button.click();
        console.log(`[Loom] Clicked transcript button: ${selector}`);
        await page.waitForTimeout(2000);
        break;
      } catch (e) {
        // Try next selector
      }
    }
    
    const transcriptPanelSelectors = [
      '[data-testid="transcript-panel"]',
      '.transcript-container',
      '[data-qa="transcript-panel"]',
      '.transcript-list',
      '[role="region"][aria-label*="ranscript"]',
      '[class*="Transcript"]',
      'div[data-testid*="transcript"]'
    ];
    
    for (const selector of transcriptPanelSelectors) {
      try {
        await page.waitForSelector(selector, { state: 'visible', timeout: 5000 });
        console.log(`[Loom] Transcript panel found: ${selector}`);
        break;
      } catch (e) {
        // Try next selector
      }
    }
    
    try {
      const copyButton = page.locator('button:has-text("Copy")').first();
      await copyButton.waitFor({ state: 'visible', timeout: 10000 });
      await copyButton.click();
      console.log('[Loom] Copy button clicked');
      
      await page.waitForTimeout(1000);
      
      const transcript = await page.evaluate(async () => {
        try {
          return await navigator.clipboard.readText();
        } catch (err) {
          return null;
        }
      });
      
      if (transcript && transcript.trim().length > 0) {
        console.log(`[Loom] Transcript extracted via clipboard (${transcript.length} characters)`);
        return transcript;
      }
    } catch (error: any) {
      console.log('[Loom] Copy button not found, trying DOM extraction');
    }
    
    const domTranscript = await extractTranscriptFromDOM(page);
    if (!domTranscript) {
      throw new Error('Could not extract transcript via clipboard or DOM');
    }
    
    console.log(`[Loom] Transcript extracted via DOM (${domTranscript.length} characters)`);
    return domTranscript;
    
  } catch (error: any) {
    console.error('[Loom] Extraction failed:', error.message);
    throw new Error(`Failed to extract Loom transcript: ${error.message}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

export async function extractFathomTranscript(url: string): Promise<string> {
  let browser: Browser | null = null;
  
  try {
    console.log(`[Fathom] Starting extraction from: ${url}`);
    
    browser = await launchBrowser();
    const context = await createContext(browser);
    const page = await context.newPage();
    
    console.log('[Fathom] Navigating to URL...');
    await page.goto(url, { waitUntil: 'networkidle', timeout: BROWSER_TIMEOUT });
    console.log('[Fathom] Page loaded successfully');
    
    const urlObj = new URL(url);
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { 
      origin: `${urlObj.protocol}//${urlObj.host}` 
    });
    
    try {
      console.log('[Fathom] Looking for TRANSCRIPT tab...');
      const transcriptTab = page.locator('text=TRANSCRIPT').first();
      await transcriptTab.waitFor({ state: 'visible', timeout: 5000 });
      await transcriptTab.click();
      console.log('[Fathom] TRANSCRIPT tab clicked');
      await page.waitForTimeout(1500);
    } catch (error) {
      console.log('[Fathom] Could not find TRANSCRIPT tab, continuing anyway...');
    }
    
    await page.waitForSelector('video, [class*="player"]', { timeout: BROWSER_TIMEOUT });
    
    const transcriptSelectors = [
      'button:has-text("Copy transcript")',
      'button:has-text("Copy Transcript")',
      '[aria-label*="transcript" i]',
      '.transcript-copy-button',
    ];
    
    for (const selector of transcriptSelectors) {
      try {
        const button = page.locator(selector).first();
        await button.waitFor({ state: 'visible', timeout: 5000 });
        await button.click();
        console.log(`[Fathom] Copy button found and clicked: ${selector}`);
        
        await page.waitForTimeout(1000);
        
        const transcript = await page.evaluate(async () => {
          try {
            return await navigator.clipboard.readText();
          } catch (err) {
            return null;
          }
        });
        
        if (transcript && transcript.trim().length > 0) {
          console.log(`[Fathom] Transcript extracted via clipboard (${transcript.length} characters)`);
          return transcript;
        }
      } catch {
        continue;
      }
    }
    
    console.log('[Fathom] Copy button not found, trying DOM extraction');
    const domTranscript = await extractTranscriptFromDOM(page);
    if (!domTranscript) {
      throw new Error('Could not find transcript copy button or transcript text in DOM');
    }
    
    console.log(`[Fathom] Transcript extracted via DOM (${domTranscript.length} characters)`);
    return domTranscript;
    
  } catch (error: any) {
    console.error('[Fathom] Extraction failed:', error.message);
    throw new Error(`Failed to extract Fathom transcript: ${error.message}`);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

export function detectVideoProvider(url: string): 'loom' | 'fathom' | 'youtube' | 'zoom' | 'onedrive' | null {
  if (url.includes('loom.com')) return 'loom';
  if (url.includes('fathom.video')) return 'fathom';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
  if (url.includes('zoom.us')) return 'zoom';
  if (url.includes('onedrive.live.com') || url.includes('sharepoint.com')) return 'onedrive';
  return null;
}

export function extractVideoUrlsFromContent(content: any): Array<{ url: string; provider: string }> {
  const videos: Array<{ url: string; provider: string }> = [];
  
  function traverse(node: any) {
    if (!node) return;
    
    if (node.type === 'videoEmbed' && node.attrs?.src) {
      const provider = detectVideoProvider(node.attrs.src);
      if (provider && (provider === 'loom' || provider === 'fathom')) {
        videos.push({ url: node.attrs.src, provider });
      }
    }
    
    if (node.content && Array.isArray(node.content)) {
      node.content.forEach(traverse);
    }
  }
  
  traverse(content);
  return videos;
}

export async function extractTranscript(url: string, provider: string): Promise<string> {
  switch (provider) {
    case 'loom':
      return await extractLoomTranscript(url);
    case 'fathom':
      return await extractFathomTranscript(url);
    default:
      throw new Error(`Transcript extraction not supported for provider: ${provider}`);
  }
}

async function ensureTranscriptsTableExists(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS video_transcripts (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id VARCHAR NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        video_url VARCHAR(2048) NOT NULL,
        provider VARCHAR(50) NOT NULL,
        transcript TEXT,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        error TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_transcripts_document ON video_transcripts(document_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_transcripts_url ON video_transcripts(video_url)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_transcripts_status ON video_transcripts(status)`);
  } catch (error) {
    console.log('[Transcripts] Table might already exist, continuing...');
  }
}

let tableEnsured = false;

export async function processDocumentVideos(
  documentId: string,
  projectId: string,
  ownerId: string,
  title: string,
  content: any,
  projectName: string,
  breadcrumbs: string[] = []
): Promise<void> {
  if (!tableEnsured) {
    await ensureTranscriptsTableExists();
    tableEnsured = true;
  }
  
  const currentVideos = extractVideoUrlsFromContent(content);
  
  const existingTranscripts = await db
    .select()
    .from(videoTranscripts)
    .where(eq(videoTranscripts.documentId, documentId));
  
  const existingUrls = new Set(existingTranscripts.map(t => t.videoUrl));
  const currentUrls = new Set(currentVideos.map(v => v.url));
  
  const videosToRemove = existingTranscripts.filter(t => !currentUrls.has(t.videoUrl));
  for (const transcript of videosToRemove) {
    console.log(`[Transcripts] Removing transcript for deleted video: ${transcript.videoUrl}`);
    await db.delete(videoTranscripts).where(eq(videoTranscripts.id, transcript.id));
  }
  
  const videosToAdd = currentVideos.filter(v => !existingUrls.has(v.url));
  
  for (const video of videosToAdd) {
    console.log(`[Transcripts] Queueing new video for extraction: ${video.url}`);
    await db.insert(videoTranscripts).values({
      documentId,
      videoUrl: video.url,
      provider: video.provider,
      status: 'pending',
    });
  }
  
  // If there are videos to add, process them asynchronously
  // Error handling ensures embeddings are regenerated even if extraction fails
  if (videosToAdd.length > 0) {
    processTranscriptQueue(documentId, projectId, ownerId, title, content, projectName, breadcrumbs)
      .catch(err => {
        console.error("[Transcripts] Queue processing failed, regenerating embeddings anyway:", err);
        // Ensure embeddings are still generated even if transcript extraction fails
        regenerateDocumentEmbeddings(documentId, projectId, ownerId, title, content, projectName, breadcrumbs)
          .catch(embErr => console.error("[Transcripts] Fallback embedding generation also failed:", embErr));
      });
  } else {
    // No new videos to process - regenerate embeddings now
    // This handles: content changes, video removals, or documents with no videos
    await regenerateDocumentEmbeddings(documentId, projectId, ownerId, title, content, projectName, breadcrumbs);
  }
}

async function processTranscriptQueue(
  documentId: string,
  projectId: string,
  ownerId: string,
  title: string,
  content: any,
  projectName: string,
  breadcrumbs: string[]
): Promise<void> {
  const pendingTranscripts = await db
    .select()
    .from(videoTranscripts)
    .where(and(
      eq(videoTranscripts.documentId, documentId),
      eq(videoTranscripts.status, 'pending')
    ));
  
  for (const transcript of pendingTranscripts) {
    try {
      console.log(`[Transcripts] Processing: ${transcript.videoUrl}`);
      
      await db
        .update(videoTranscripts)
        .set({ status: 'processing', updatedAt: new Date() })
        .where(eq(videoTranscripts.id, transcript.id));
      
      const extractedText = await extractTranscript(transcript.videoUrl, transcript.provider);
      
      await db
        .update(videoTranscripts)
        .set({ 
          transcript: extractedText, 
          status: 'completed',
          error: null,
          updatedAt: new Date() 
        })
        .where(eq(videoTranscripts.id, transcript.id));
      
      console.log(`[Transcripts] Completed: ${transcript.videoUrl}`);
    } catch (error: any) {
      console.error(`[Transcripts] Failed: ${transcript.videoUrl}`, error.message);
      
      await db
        .update(videoTranscripts)
        .set({ 
          status: 'failed',
          error: error.message,
          updatedAt: new Date() 
        })
        .where(eq(videoTranscripts.id, transcript.id));
    }
  }
  
  await regenerateDocumentEmbeddings(documentId, projectId, ownerId, title, content, projectName, breadcrumbs);
}

async function regenerateDocumentEmbeddings(
  documentId: string,
  projectId: string,
  ownerId: string,
  title: string,
  content: any,
  projectName: string,
  breadcrumbs: string[]
): Promise<void> {
  try {
    const completedTranscripts = await db
      .select()
      .from(videoTranscripts)
      .where(and(
        eq(videoTranscripts.documentId, documentId),
        eq(videoTranscripts.status, 'completed')
      ));
    
    const transcriptTexts = completedTranscripts
      .filter(t => t.transcript)
      .map(t => `\n\n[Video Transcript - ${t.provider.toUpperCase()}]\n${t.transcript}`);
    
    const contentWithTranscripts = {
      ...content,
      _transcripts: transcriptTexts.join('\n')
    };
    
    await updateDocumentEmbeddings(
      documentId,
      projectId,
      ownerId,
      title,
      contentWithTranscripts,
      projectName,
      breadcrumbs
    );
    
    console.log(`[Transcripts] Embeddings regenerated for document: ${documentId}`);
  } catch (error: any) {
    console.error(`[Transcripts] Failed to regenerate embeddings:`, error.message);
  }
}

export async function getDocumentTranscripts(documentId: string): Promise<Array<{
  url: string;
  provider: string;
  status: string;
  transcript: string | null;
}>> {
  const transcripts = await db
    .select()
    .from(videoTranscripts)
    .where(eq(videoTranscripts.documentId, documentId));
  
  return transcripts.map(t => ({
    url: t.videoUrl,
    provider: t.provider,
    status: t.status,
    transcript: t.transcript,
  }));
}

export async function deleteDocumentTranscripts(documentId: string): Promise<void> {
  await db.delete(videoTranscripts).where(eq(videoTranscripts.documentId, documentId));
}
