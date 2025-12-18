import { useState, useCallback, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BlockEditor } from "@/components/editor/BlockEditor";
import { ArrowLeft, Save, Loader2 } from "lucide-react";
import type { CompanyDocumentWithUploader } from "@shared/schema";

export default function CompanyDocumentEditorPage() {
  const [, params] = useRoute("/company-documents/:id/edit");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const documentId = params?.id;

  const [title, setTitle] = useState("");
  const [content, setContent] = useState<any>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const { data: companyDoc, isLoading } = useQuery<CompanyDocumentWithUploader>({
    queryKey: ["/api/company-documents", documentId],
    enabled: !!documentId,
  });

  useEffect(() => {
    if (companyDoc) {
      setTitle(companyDoc.name);
      setContent(companyDoc.content || { type: "doc", content: [{ type: "paragraph" }] });
    }
  }, [companyDoc]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("PATCH", `/api/company-documents/${documentId}`, {
        name: title,
        content,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/company-documents"] });
      setHasUnsavedChanges(false);
      toast({ title: "Document saved" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to save", description: error.message, variant: "destructive" });
    },
  });

  const handleContentChange = useCallback((newContent: any) => {
    setContent(newContent);
    setHasUnsavedChanges(true);
  }, []);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
    setHasUnsavedChanges(true);
  };

  const handleBack = () => {
    if (companyDoc?.folderId) {
      navigate(`/company-documents?folder=${companyDoc.folderId}`);
    } else {
      navigate("/company-documents");
    }
  };

  const handleImageUpload = useCallback(async (): Promise<string | null> => {
    return new Promise((resolve) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.style.display = "none";
      document.body.appendChild(input);
      
      const cleanup = () => {
        try {
          if (input.parentNode) {
            input.parentNode.removeChild(input);
          }
        } catch (e) {
          // Ignore cleanup errors
        }
      };
      
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) {
          cleanup();
          resolve(null);
          return;
        }
        try {
          const urlResponse = await apiRequest("POST", "/api/company-documents/upload-url");
          const { uploadURL } = urlResponse;
          await fetch(uploadURL, {
            method: "PUT",
            body: file,
            headers: { "Content-Type": file.type },
          });
          const imageUrl = uploadURL.split("?")[0];
          cleanup();
          resolve(imageUrl);
        } catch {
          toast({ title: "Image upload failed", variant: "destructive" });
          cleanup();
          resolve(null);
        }
      };
      
      // Handle cancel (user closes file picker without selecting)
      input.addEventListener("cancel", () => {
        cleanup();
        resolve(null);
      });
      
      input.click();
    });
  }, [toast]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!companyDoc) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-muted-foreground">Document not found</p>
        <Button variant="outline" onClick={() => navigate("/company-documents")}>
          Back to Documents
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="sticky top-0 z-20 bg-background border-b px-4 sm:px-6 py-2 sm:pt-3 flex flex-wrap items-center gap-2 sm:gap-4">
        <Input
          value={title}
          onChange={handleTitleChange}
          className="text-lg sm:text-xl font-semibold border-none shadow-none focus-visible:ring-0 px-0 flex-1 min-w-0 max-w-full sm:max-w-lg"
          placeholder="Untitled"
          data-testid="input-document-title"
        />
        <div className="flex items-center gap-2 ml-auto">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !hasUnsavedChanges}
            size="sm"
            data-testid="button-save-document"
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 sm:mr-2" />
            )}
            <span className="hidden sm:inline">{hasUnsavedChanges ? "Save" : "Saved"}</span>
          </Button>
          <Button variant="ghost" size="icon" onClick={handleBack} data-testid="button-back-to-docs">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto px-4 sm:px-6 py-4 sm:py-6">
        <div className="max-w-3xl mx-auto">
          <BlockEditor
            content={content}
            onChange={handleContentChange}
            onImageUpload={handleImageUpload}
            editable={true}
          />
        </div>
      </div>
    </div>
  );
}
