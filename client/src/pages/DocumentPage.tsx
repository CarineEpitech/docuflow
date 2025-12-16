import { useEffect, useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { PageTree } from "@/components/PageTree";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BlockEditor } from "@/components/editor/BlockEditor";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ImagePlus, Save, PanelLeftClose, PanelLeft } from "lucide-react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import type { Document, Project, DocumentWithCreator, SafeUser } from "@shared/schema";
import { useDebouncedCallback } from "@/hooks/useDebounce";

export default function DocumentPage() {
  const params = useParams<{ documentId: string }>();
  const documentId = params.documentId;
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Session Expired",
        description: "Please sign in again.",
        variant: "destructive",
      });
      setLocation("/auth");
    }
  }, [isAuthenticated, authLoading, toast, setLocation]);

  // Warn user about unsaved changes when closing browser tab
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = "";
        return "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const { data: pageDoc, isLoading: documentLoading } = useQuery<DocumentWithCreator>({
    queryKey: ["/api/documents", documentId],
    enabled: !!documentId,
  });

  const { data: project } = useQuery<Project>({
    queryKey: ["/api/projects", pageDoc?.projectId],
    enabled: !!pageDoc?.projectId,
  });

  const { data: ancestors = [] } = useQuery<Document[]>({
    queryKey: ["/api/documents", documentId, "ancestors"],
    enabled: !!documentId,
  });

  useEffect(() => {
    if (pageDoc) {
      setTitle(pageDoc.title);
      setContent(pageDoc.content);
      setHasUnsavedChanges(false);
    }
  }, [pageDoc]);

  const saveDocumentMutation = useMutation({
    mutationFn: async (data: { title: string; content: any }) => {
      return await apiRequest("PATCH", `/api/documents/${documentId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents", documentId] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", pageDoc?.projectId, "documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/documents/recent"] });
      setHasUnsavedChanges(false);
      setIsSaving(false);
    },
    onError: () => {
      toast({ title: "Failed to save document", variant: "destructive" });
      setIsSaving(false);
    },
  });

  const debouncedSave = useDebouncedCallback(
    (newTitle: string, newContent: any) => {
      setIsSaving(true);
      saveDocumentMutation.mutate({ title: newTitle, content: newContent });
    },
    1500
  );

  const handleTitleChange = (newTitle: string) => {
    setTitle(newTitle);
    setHasUnsavedChanges(true);
    debouncedSave(newTitle, content);
  };

  const handleContentChange = (newContent: any) => {
    setContent(newContent);
    setHasUnsavedChanges(true);
    debouncedSave(title, newContent);
  };

  const handleManualSave = () => {
    setIsSaving(true);
    saveDocumentMutation.mutate({ title, content });
  };

  const handleImageUpload = useCallback(async (): Promise<string | null> => {
    try {
      // Get presigned upload URL
      const response = await apiRequest("POST", "/api/objects/upload");
      const { uploadURL } = response as { uploadURL: string };
      
      return new Promise((resolve) => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        input.onchange = async (e) => {
          const file = (e.target as HTMLInputElement).files?.[0];
          if (!file) {
            resolve(null);
            return;
          }

          try {
            // Upload directly to storage (parallel with UI feedback already showing)
            await fetch(uploadURL, {
              method: "PUT",
              body: file,
              headers: {
                "Content-Type": file.type,
              },
            });

            // Register image and get final path
            const updateResponse = await apiRequest("PUT", "/api/document-images", {
              imageURL: uploadURL,
            }) as { objectPath: string };

            toast({ 
              title: "Image uploaded", 
              description: "Image added to your document",
            });
            resolve(updateResponse.objectPath);
          } catch (error) {
            toast({ title: "Failed to upload image", variant: "destructive" });
            resolve(null);
          }
        };
        input.click();
      });
    } catch (error) {
      toast({ title: "Failed to get upload URL", variant: "destructive" });
      return null;
    }
  }, [toast]);

  if (authLoading || documentLoading) {
    return (
      <div className="flex h-full">
        <div className="w-64 border-r border-sidebar-border bg-sidebar p-4">
          <Skeleton className="h-6 w-24 mb-4" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </div>
        <div className="flex-1 p-8">
          <Skeleton className="h-12 w-full mb-6" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (!pageDoc) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Page not found</h2>
          <p className="text-muted-foreground mb-4">
            The page you're looking for doesn't exist or you don't have access.
          </p>
          <Button onClick={() => setLocation("/")} data-testid="button-back-home-doc">
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full" data-testid="document-page">
      <PanelGroup direction="horizontal" autoSaveId="document-sidebar">
        {!isSidebarCollapsed && (
          <>
            <Panel 
              defaultSize={20} 
              minSize={15} 
              maxSize={40}
              className="border-r border-sidebar-border"
            >
              <div className="h-full flex flex-col bg-sidebar">
                <div className="flex items-center justify-end p-1 border-b border-sidebar-border">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsSidebarCollapsed(true)}
                    className="h-7 w-7"
                    data-testid="button-collapse-sidebar"
                  >
                    <PanelLeftClose className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex-1 overflow-hidden">
                  <PageTree projectId={pageDoc.projectId} currentDocumentId={documentId} />
                </div>
              </div>
            </Panel>
            <PanelResizeHandle className="w-1 bg-transparent hover:bg-primary/20 transition-colors cursor-col-resize flex items-center justify-center group">
              <div className="w-px h-8 bg-border group-hover:bg-primary/40 transition-colors" />
            </PanelResizeHandle>
          </>
        )}
        <Panel defaultSize={80}>
          <div className="flex-1 flex flex-col overflow-hidden h-full">
            <div className="border-b border-border px-6 py-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                {isSidebarCollapsed && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setIsSidebarCollapsed(false)}
                    className="h-8 w-8"
                    data-testid="button-expand-sidebar"
                  >
                    <PanelLeft className="h-4 w-4" />
                  </Button>
                )}
                <Breadcrumbs project={project} document={pageDoc} ancestors={ancestors} />
              </div>
              <div className="flex items-center gap-3">
                {pageDoc.createdBy && (
                  <span className="text-sm text-muted-foreground" data-testid="text-page-creator">
                    Created by {pageDoc.createdBy.firstName || pageDoc.createdBy.email}
                  </span>
                )}
                {hasUnsavedChanges && !isSaving && (
                  <span className="text-sm text-muted-foreground">Unsaved changes</span>
                )}
                {isSaving && (
                  <span className="text-sm text-muted-foreground">Saving...</span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleManualSave}
                  disabled={!hasUnsavedChanges || isSaving}
                  data-testid="button-save"
                >
                  <Save className="w-4 h-4 mr-1" />
                  Save
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <div className={isSidebarCollapsed ? "max-w-4xl mx-auto px-6 py-8" : "max-w-3xl mx-auto px-6 py-8"}>
                <Input
                  value={title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                  placeholder="Untitled"
                  className="text-4xl font-bold border-0 px-0 focus-visible:ring-0 placeholder:text-muted-foreground/50 mb-8"
                  data-testid="input-document-title"
                />
                <BlockEditor
                  content={content}
                  onChange={handleContentChange}
                  onImageUpload={handleImageUpload}
                />
              </div>
            </div>
          </div>
        </Panel>
      </PanelGroup>
    </div>
  );
}
