import mammoth from "mammoth";
import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";

let pdfParse: any = null;

async function getPdfParser() {
  if (!pdfParse) {
    const module = await import("pdf-parse") as any;
    pdfParse = module.default || module;
  }
  return pdfParse;
}

export interface ContentExtractionResult {
  success: boolean;
  text: string;
  error?: string;
}

export async function extractTextFromFile(
  storagePath: string,
  mimeType: string,
  fileName: string
): Promise<ContentExtractionResult> {
  const objectStorageService = new ObjectStorageService();
  
  try {
    const normalizedPath = objectStorageService.normalizeObjectEntityPath(storagePath);
    const objectFile = await objectStorageService.getObjectEntityFile(normalizedPath);
    
    const chunks: Buffer[] = [];
    const stream = objectFile.createReadStream();
    
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    
    const buffer = Buffer.concat(chunks);
    
    if (isPdfFile(mimeType, fileName)) {
      return await extractTextFromPdf(buffer);
    } else if (isWordFile(mimeType, fileName)) {
      return await extractTextFromWord(buffer);
    } else if (isTextFile(mimeType, fileName)) {
      return await extractTextFromTextFile(buffer);
    } else {
      return {
        success: false,
        text: "",
        error: `Unsupported file type: ${mimeType || fileName}`
      };
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      return {
        success: false,
        text: "",
        error: "File not found in storage"
      };
    }
    console.error("Error extracting text from file:", error);
    return {
      success: false,
      text: "",
      error: error instanceof Error ? error.message : "Unknown error"
    };
  }
}

function isPdfFile(mimeType: string, fileName: string): boolean {
  return mimeType === 'application/pdf' || fileName?.toLowerCase().endsWith('.pdf');
}

function isWordFile(mimeType: string, fileName: string): boolean {
  return mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
         mimeType === 'application/msword' ||
         fileName?.toLowerCase().endsWith('.docx') ||
         fileName?.toLowerCase().endsWith('.doc');
}

function isTextFile(mimeType: string, fileName: string): boolean {
  const textMimeTypes = [
    'text/plain',
    'text/markdown',
    'text/csv',
    'text/html',
    'text/xml',
    'application/json',
    'application/xml'
  ];
  
  const textExtensions = ['.txt', '.md', '.csv', '.json', '.xml', '.html', '.htm', '.log', '.yaml', '.yml'];
  
  return textMimeTypes.includes(mimeType) || 
         textExtensions.some(ext => fileName?.toLowerCase().endsWith(ext));
}

export function isVideoFile(mimeType: string, fileName: string): boolean {
  const videoMimeTypes = [
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-ms-wmv'
  ];
  
  const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.wmv', '.mkv'];
  
  return videoMimeTypes.includes(mimeType) || 
         videoExtensions.some(ext => fileName?.toLowerCase().endsWith(ext));
}

async function extractTextFromPdf(buffer: Buffer): Promise<ContentExtractionResult> {
  try {
    const parser = await getPdfParser();
    const data = await parser(buffer);
    const text = data.text?.trim() || "";
    
    if (!text) {
      return {
        success: true,
        text: "",
        error: "PDF contains no extractable text (may be image-based)"
      };
    }
    
    return {
      success: true,
      text: text
    };
  } catch (error) {
    console.error("Error parsing PDF:", error);
    return {
      success: false,
      text: "",
      error: error instanceof Error ? error.message : "Failed to parse PDF"
    };
  }
}

async function extractTextFromWord(buffer: Buffer): Promise<ContentExtractionResult> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value?.trim() || "";
    
    return {
      success: true,
      text: text
    };
  } catch (error) {
    console.error("Error parsing Word document:", error);
    return {
      success: false,
      text: "",
      error: error instanceof Error ? error.message : "Failed to parse Word document"
    };
  }
}

async function extractTextFromTextFile(buffer: Buffer): Promise<ContentExtractionResult> {
  try {
    const text = buffer.toString('utf-8').trim();
    
    return {
      success: true,
      text: text
    };
  } catch (error) {
    console.error("Error reading text file:", error);
    return {
      success: false,
      text: "",
      error: error instanceof Error ? error.message : "Failed to read text file"
    };
  }
}

export function isSupportedForExtraction(mimeType: string, fileName: string): boolean {
  return isPdfFile(mimeType, fileName) || 
         isWordFile(mimeType, fileName) || 
         isTextFile(mimeType, fileName);
}
