import { chromium, Browser, Page, BrowserContext } from 'playwright';

const BROWSER_TIMEOUT = 30000;
const CHROMIUM_PATH = '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium';

async function launchBrowser(): Promise<Browser> {
  console.log('[Browser] Launching headless Chromium...');
  
  return await chromium.launch({
    executablePath: CHROMIUM_PATH,
    headless: true,
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
      '[class*="transcript-list"]',
      '[class*="TranscriptList"]',
      '[class*="transcript-content"]',
      '[class*="transcript-row"]',
      '[data-testid="transcript-text"]',
      '.transcript-text',
      '.transcript-content',
    ];
    
    for (const selector of transcriptSelectors) {
      const container = document.querySelector(selector);
      if (container && container.textContent && container.textContent.length > 50) {
        const text = container.textContent.replace(/\s+/g, ' ').trim();
        const cleaned = text.replace(/CopySearch|^\d{1,2}:\d{2}/gm, '').trim();
        if (cleaned.length > 50) {
          return cleaned;
        }
      }
    }
    
    const allTranscript = Array.from(document.querySelectorAll('[class*="transcript"]'));
    let bestText = '';
    for (let i = 0; i < allTranscript.length; i++) {
      const el = allTranscript[i];
      const text = el.textContent || '';
      if (text.length > bestText.length && text.length > 50) {
        const cleaned = text.replace(/\s+/g, ' ').replace(/CopySearch/g, '').trim();
        if (!cleaned.includes('Transcript') || cleaned.length > 200) {
          bestText = cleaned;
        }
      }
    }
    
    if (bestText.length > 50) {
      return bestText;
    }
    
    const segments = document.querySelectorAll('[class*="segment"], [class*="row"]');
    if (segments.length > 0) {
      const texts = Array.from(segments)
        .map(el => el.textContent?.trim() || '')
        .filter(t => t.length > 0 && !t.match(/^[\d:]+$/));
      const combined = texts.join(' ').replace(/\s+/g, ' ').trim();
      if (combined.length > 50) {
        return combined;
      }
    }
    
    return null;
  });
}

export async function extractLoomTranscript(videoId: string): Promise<{ success: boolean; transcript?: string; error?: string }> {
  let browser: Browser | null = null;
  
  try {
    const url = `https://www.loom.com/share/${videoId}`;
    console.log(`[Loom] Starting Playwright extraction from: ${url}`);
    
    browser = await launchBrowser();
    const context = await createContext(browser);
    const page = await context.newPage();
    
    console.log('[Loom] Navigating to URL...');
    await page.goto(url, { waitUntil: 'networkidle', timeout: BROWSER_TIMEOUT });
    console.log('[Loom] Page loaded');
    
    const urlObj = new URL(url);
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { 
      origin: `${urlObj.protocol}//${urlObj.host}` 
    });
    
    console.log('[Loom] Looking for transcript button/tab...');
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
        continue;
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
    
    let transcriptPanelFound = false;
    for (const selector of transcriptPanelSelectors) {
      try {
        await page.waitForSelector(selector, { state: 'visible', timeout: 5000 });
        console.log(`[Loom] Transcript panel found: ${selector}`);
        transcriptPanelFound = true;
        break;
      } catch (e) {
        continue;
      }
    }
    
    if (!transcriptPanelFound) {
      console.log('[Loom] No transcript panel found, trying DOM extraction');
    }
    
    try {
      const copyButton = page.locator('button:has-text("Copy")').first();
      await copyButton.waitFor({ state: 'visible', timeout: 5000 });
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
      
      if (transcript && transcript.trim().length > 50) {
        console.log(`[Loom] Transcript extracted via clipboard (${transcript.length} chars)`);
        return { success: true, transcript: transcript.trim() };
      }
    } catch (error) {
      console.log('[Loom] Copy button not found, trying DOM extraction');
    }
    
    const domTranscript = await extractTranscriptFromDOM(page);
    if (domTranscript && domTranscript.length > 50) {
      console.log(`[Loom] Transcript extracted via DOM (${domTranscript.length} chars)`);
      return { success: true, transcript: domTranscript };
    }
    
    const apolloTranscript = await page.evaluate(() => {
      const apolloState = (window as any).__APOLLO_STATE__;
      if (!apolloState) return null;
      
      for (const key of Object.keys(apolloState)) {
        if (key.startsWith('Transcription:')) {
          const transcription = apolloState[key];
          if (transcription.source_text) {
            return transcription.source_text;
          }
        }
        
        const value = apolloState[key];
        if (value && typeof value === 'object') {
          if (value.transcript_with_chapters || value.transcript) {
            const transcript = value.transcript_with_chapters || value.transcript;
            if (typeof transcript === 'string') {
              return transcript;
            }
          }
        }
      }
      
      return null;
    });
    
    if (apolloTranscript && apolloTranscript.length > 50) {
      console.log(`[Loom] Transcript extracted via Apollo state (${apolloTranscript.length} chars)`);
      return { success: true, transcript: apolloTranscript };
    }
    
    return { 
      success: false, 
      error: "Transcript not found. The video may not have transcription enabled or the transcript is not publicly available." 
    };
    
  } catch (error: any) {
    console.error('[Loom] Extraction failed:', error.message);
    return { success: false, error: `Failed to extract Loom transcript: ${error.message}` };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

export async function extractFathomTranscript(videoId: string): Promise<{ success: boolean; transcript?: string; error?: string }> {
  let browser: Browser | null = null;
  
  try {
    const url = `https://fathom.video/share/${videoId}`;
    console.log(`[Fathom] Starting Playwright extraction from: ${url}`);
    
    browser = await launchBrowser();
    const context = await createContext(browser);
    const page = await context.newPage();
    
    console.log('[Fathom] Navigating to URL...');
    await page.goto(url, { waitUntil: 'networkidle', timeout: BROWSER_TIMEOUT });
    console.log('[Fathom] Page loaded');
    
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
      console.log('[Fathom] No TRANSCRIPT tab found, continuing...');
    }
    
    const copySelectors = [
      'button:has-text("Copy transcript")',
      'button:has-text("Copy Transcript")',
      '[aria-label*="transcript" i]',
      '.transcript-copy-button',
    ];
    
    for (const selector of copySelectors) {
      try {
        const button = page.locator(selector).first();
        await button.waitFor({ state: 'visible', timeout: 5000 });
        await button.click();
        console.log(`[Fathom] Clicked: ${selector}`);
        
        await page.waitForTimeout(1000);
        
        const transcript = await page.evaluate(async () => {
          try {
            return await navigator.clipboard.readText();
          } catch (err) {
            return null;
          }
        });
        
        if (transcript && transcript.trim().length > 50) {
          console.log(`[Fathom] Transcript extracted via clipboard (${transcript.length} chars)`);
          return { success: true, transcript: transcript.trim() };
        }
      } catch {
        continue;
      }
    }
    
    console.log('[Fathom] Trying DOM extraction...');
    const domTranscript = await extractTranscriptFromDOM(page);
    if (domTranscript && domTranscript.length > 50) {
      console.log(`[Fathom] Transcript extracted via DOM (${domTranscript.length} chars)`);
      return { success: true, transcript: domTranscript };
    }
    
    return { 
      success: false, 
      error: "Transcript not found. The video may not have transcription available or the transcript is not publicly accessible." 
    };
    
  } catch (error: any) {
    console.error('[Fathom] Extraction failed:', error.message);
    return { success: false, error: `Failed to extract Fathom transcript: ${error.message}` };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}
