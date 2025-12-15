import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ArrowLeft,
  Download,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  FileSpreadsheet,
  File,
  Loader2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { format } from "date-fns";
import type { CompanyDocumentWithUploader } from "@shared/schema";
import { getDocument, GlobalWorkerOptions, type PDFDocumentProxy } from "pdfjs-dist";

GlobalWorkerOptions.workerSrc = 'https://unpkg.com/pdfjs-dist@5.4.449/build/pdf.worker.min.mjs';

function getFileIcon(mimeType: string | null) {
  if (!mimeType) return FileText;
  if (mimeType.startsWith("image/")) return FileImage;
  if (mimeType.startsWith("video/")) return FileVideo;
  if (mimeType.startsWith("audio/")) return FileAudio;
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType === "text/csv") return FileSpreadsheet;
  if (mimeType.includes("pdf") || mimeType.includes("document") || mimeType.includes("text")) return FileText;
  return File;
}

function formatFileSize(bytes: number | null): string {
  if (!bytes || bytes === 0) return "";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export default function FileViewerPage() {
  const [, params] = useRoute("/company-documents/:id/view");
  const [, navigate] = useLocation();
  const documentId = params?.id;

  const { data: document, isLoading, error } = useQuery<CompanyDocumentWithUploader>({
    queryKey: ["/api/company-documents", documentId],
    enabled: !!documentId,
  });

  const handleDownload = () => {
    if (!document) return;
    const link = window.document.createElement("a");
    link.href = `/api/company-documents/${document.id}/download`;
    link.download = document.fileName || document.name;
    window.document.body.appendChild(link);
    link.click();
    window.document.body.removeChild(link);
  };

  const handleBack = () => {
    navigate("/company-documents");
  };

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !document) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4">
        <File className="h-16 w-16 text-muted-foreground" />
        <h2 className="text-xl font-semibold">File not found</h2>
        <p className="text-muted-foreground">The requested file could not be found.</p>
        <Button onClick={handleBack} data-testid="button-back-to-documents">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Documents
        </Button>
      </div>
    );
  }

  const FileIcon = getFileIcon(document.mimeType);
  const streamUrl = `/api/company-documents/${document.id}/stream`;
  const mimeType = document.mimeType || "";

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 border-b bg-background">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={handleBack} data-testid="button-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
              <FileIcon className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold" data-testid="text-file-name">{document.name}</h1>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {document.fileName && <span>{document.fileName}</span>}
                {document.fileSize && <span>{formatFileSize(document.fileSize)}</span>}
                {document.createdAt && (
                  <span>Uploaded {format(new Date(document.createdAt), "MMM d, yyyy")}</span>
                )}
              </div>
            </div>
          </div>
        </div>
        <Button onClick={handleDownload} data-testid="button-download">
          <Download className="h-4 w-4 mr-2" />
          Download
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        <FileContent mimeType={mimeType} streamUrl={streamUrl} document={document} />
      </div>
    </div>
  );
}

function FileContent({ mimeType, streamUrl, document }: { 
  mimeType: string; 
  streamUrl: string; 
  document: CompanyDocumentWithUploader;
}) {
  if (mimeType.startsWith("image/")) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <img 
          src={streamUrl} 
          alt={document.name} 
          className="max-w-full max-h-full object-contain rounded-lg shadow-lg" 
          data-testid="img-preview"
        />
      </div>
    );
  }

  if (mimeType.startsWith("video/")) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <video 
          controls 
          autoPlay
          className="max-w-full max-h-full rounded-lg shadow-lg"
          data-testid="video-preview"
        >
          <source src={streamUrl} type={mimeType} />
          Your browser does not support video playback.
        </video>
      </div>
    );
  }

  if (mimeType.startsWith("audio/")) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6 p-6">
        <div className="flex items-center justify-center w-32 h-32 rounded-full bg-primary/10">
          <FileAudio className="h-16 w-16 text-primary" />
        </div>
        <h2 className="text-xl font-medium">{document.name}</h2>
        <audio 
          controls 
          autoPlay
          className="w-full max-w-md"
          data-testid="audio-preview"
        >
          <source src={streamUrl} type={mimeType} />
          Your browser does not support audio playback.
        </audio>
      </div>
    );
  }

  if (mimeType === "application/pdf") {
    return <PdfViewer streamUrl={streamUrl} />;
  }

  if (mimeType.startsWith("text/") || mimeType === "application/json") {
    return <TextFileViewer streamUrl={streamUrl} document={document} />;
  }

  return (
    <div className="p-6">
      <Card className="max-w-md mx-auto mt-12">
        <CardContent className="flex flex-col items-center gap-4 py-8">
          <File className="h-16 w-16 text-muted-foreground" />
          <div className="text-center">
            <h3 className="font-medium">{document.fileName || document.name}</h3>
            {document.fileSize && (
              <p className="text-sm text-muted-foreground">{formatFileSize(document.fileSize)}</p>
            )}
          </div>
          <p className="text-sm text-muted-foreground text-center">
            Preview not available for this file type. Use the download button to view the file.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function PdfPage({ pdfDoc, pageNum, scale }: { pdfDoc: PDFDocumentProxy; pageNum: number; scale: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);

  useEffect(() => {
    const renderPage = async () => {
      if (!canvasRef.current) return;

      try {
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
        }

        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale });
        
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        
        if (!context) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        renderTaskRef.current = page.render({
          canvasContext: context,
          viewport: viewport,
        });

        await renderTaskRef.current.promise;
      } catch (err: any) {
        if (err?.name !== "RenderingCancelledException") {
          console.error("Error rendering page:", err);
        }
      }
    };

    renderPage();

    return () => {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
      }
    };
  }, [pdfDoc, pageNum, scale]);

  return (
    <div className="flex justify-center">
      <canvas 
        ref={canvasRef} 
        className="shadow-lg bg-white"
        data-testid={`pdf-canvas-page-${pageNum}`}
      />
    </div>
  );
}

function PdfViewer({ streamUrl }: { streamUrl: string }) {
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadPdf = async () => {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch(streamUrl);
        if (!response.ok) {
          throw new Error("Failed to load PDF");
        }
        
        const arrayBuffer = await response.arrayBuffer();
        const pdf = await getDocument({ data: arrayBuffer }).promise;
        
        setPdfDoc(pdf);
        setTotalPages(pdf.numPages);
      } catch (err) {
        console.error("Error loading PDF:", err);
        setError("Failed to load PDF document");
      } finally {
        setLoading(false);
      }
    };

    loadPdf();
  }, [streamUrl]);

  const zoomIn = () => {
    setScale(prev => Math.min(prev + 0.25, 3));
  };

  const zoomOut = () => {
    setScale(prev => Math.max(prev - 0.25, 0.5));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="text-muted-foreground">Loading PDF...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <Card className="max-w-md">
          <CardContent className="flex flex-col items-center gap-4 py-8">
            <FileText className="h-16 w-16 text-muted-foreground" />
            <p className="text-muted-foreground text-center">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const pageNumbers = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-center gap-4 py-3 px-6 border-b bg-muted/30 sticky top-0 z-10">
        <span className="text-sm text-muted-foreground" data-testid="text-page-count">
          {totalPages} page{totalPages !== 1 ? 's' : ''}
        </span>
        <div className="h-6 w-px bg-border" />
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="icon"
            onClick={zoomOut}
            disabled={scale <= 0.5}
            data-testid="button-zoom-out"
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm min-w-[60px] text-center" data-testid="text-zoom-level">
            {Math.round(scale * 100)}%
          </span>
          <Button 
            variant="outline" 
            size="icon"
            onClick={zoomIn}
            disabled={scale >= 3}
            data-testid="button-zoom-in"
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto bg-muted/20">
        <div className="flex flex-col items-center gap-4 p-6">
          {pdfDoc && pageNumbers.map(pageNum => (
            <PdfPage 
              key={pageNum} 
              pdfDoc={pdfDoc} 
              pageNum={pageNum} 
              scale={scale} 
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function TextFileViewer({ streamUrl, document }: { streamUrl: string; document: CompanyDocumentWithUploader }) {
  const { data: content, isLoading } = useQuery<string>({
    queryKey: ["/api/company-documents", document.id, "text-content"],
    queryFn: async () => {
      const response = await fetch(streamUrl);
      if (!response.ok) throw new Error("Failed to load file");
      return response.text();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto p-6">
      <pre 
        className="bg-muted/50 p-6 rounded-lg text-sm font-mono whitespace-pre-wrap break-words"
        data-testid="text-preview"
      >
        {content}
      </pre>
    </div>
  );
}
