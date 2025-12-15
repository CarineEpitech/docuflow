import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
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
} from "lucide-react";
import { format } from "date-fns";
import type { CompanyDocumentWithUploader } from "@shared/schema";

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

      <div className="flex-1 overflow-auto p-6">
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
      <div className="flex items-center justify-center h-full">
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
      <div className="flex items-center justify-center h-full">
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
      <div className="flex flex-col items-center justify-center h-full gap-6">
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
    return (
      <div className="flex flex-col h-full gap-4">
        <div className="flex items-center justify-center gap-2">
          <Button 
            variant="outline" 
            onClick={() => window.open(streamUrl, '_blank')}
            data-testid="button-open-pdf-new-tab"
          >
            <FileText className="h-4 w-4 mr-2" />
            Open PDF in New Tab
          </Button>
        </div>
        <object
          data={streamUrl}
          type="application/pdf"
          className="w-full flex-1 rounded-lg border shadow-lg"
          data-testid="pdf-preview"
        >
          <Card className="max-w-md mx-auto mt-12">
            <CardContent className="flex flex-col items-center gap-4 py-8">
              <FileText className="h-16 w-16 text-muted-foreground" />
              <div className="text-center">
                <h3 className="font-medium">{document.name}</h3>
                <p className="text-sm text-muted-foreground mt-2">
                  Your browser cannot display this PDF inline.
                </p>
              </div>
              <Button onClick={() => window.open(streamUrl, '_blank')}>
                Open PDF in New Tab
              </Button>
            </CardContent>
          </Card>
        </object>
      </div>
    );
  }

  if (mimeType.startsWith("text/") || mimeType === "application/json") {
    return <TextFileViewer streamUrl={streamUrl} document={document} />;
  }

  return (
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
    <div className="h-full overflow-auto">
      <pre 
        className="bg-muted/50 p-6 rounded-lg text-sm font-mono whitespace-pre-wrap break-words"
        data-testid="text-preview"
      >
        {content}
      </pre>
    </div>
  );
}
