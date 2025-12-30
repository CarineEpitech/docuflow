import { useEffect, useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PageTree } from "@/components/PageTree";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { BlockEditor } from "@/components/editor/BlockEditor";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Save, PanelLeftClose, PanelLeft, Menu } from "lucide-react";
import type { Document, Project, DocumentWithCreator, SafeUser } from "@shared/schema";
import { useDebouncedCallback } from "@/hooks/useDebounce";

export default function DocumentPage() {
  const params = useParams<{ documentId: string }>();
  const documentId = params.documentId;
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const isMobile = useIsMobile();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);

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
          const response = await apiRequest("POST", "/api/objects/upload");
          const { uploadURL } = response as { uploadURL: string };
          
          await fetch(uploadURL, {
            method: "PUT",
            body: file,
            headers: {
              "Content-Type": file.type,
            },
          });

          const updateResponse = await apiRequest("PUT", "/api/document-images", {
            imageURL: uploadURL,
          }) as { objectPath: string };

          toast({ 
            title: "Image uploaded", 
            description: "Image added to your document",
          });
          cleanup();
          resolve(updateResponse.objectPath);
        } catch (error) {
          toast({ title: "Failed to upload image", variant: "destructive" });
          cleanup();
          resolve(null);
        }
      };
      
      input.addEventListener("cancel", () => {
        cleanup();
        resolve(null);
      });
      
      input.click();
    });
  }, [toast]);

  if (authLoading || documentLoading) {
    return (
      <div className="flex h-full">
        <div className="hidden md:block w-64 border-r border-sidebar-border bg-sidebar p-4">
          <Skeleton className="h-6 w-24 mb-4" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </div>
        <div className="flex-1 p-4 md:p-8">
          <Skeleton className="h-12 w-full mb-6" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (!pageDoc) {
    return (
      <div className="flex items-center justify-center h-full p-4">
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

  const sidebarContent = (
    <div className="h-full flex flex-col bg-sidebar">
      {!isMobile && (
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
      )}
      <div className="flex-1 overflow-hidden">
        <PageTree projectId={pageDoc.projectId} currentDocumentId={documentId} />
      </div>
    </div>
  );

  return (
    <div className="flex h-full" data-testid="document-page">
      {isMobile && (
        <Sheet open={isMobileSheetOpen} onOpenChange={setIsMobileSheetOpen}>
          <SheetContent side="left" className="w-[280px] p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
            {sidebarContent}
          </SheetContent>
        </Sheet>
      )}

      {!isMobile && !isSidebarCollapsed && (
        <div className="w-[280px] border-r border-sidebar-border flex-shrink-0">
          {sidebarContent}
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden h-full">
        <div className="border-b border-border px-3 md:px-6 py-2 md:py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {isMobile ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsMobileSheetOpen(true)}
                className="h-8 w-8 flex-shrink-0"
                data-testid="button-mobile-menu"
              >
                <Menu className="h-4 w-4" />
              </Button>
            ) : isSidebarCollapsed ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsSidebarCollapsed(false)}
                className="h-8 w-8 flex-shrink-0"
                data-testid="button-expand-sidebar"
              >
                <PanelLeft className="h-4 w-4" />
              </Button>
            ) : null}
            <div className="min-w-0 flex-1">
              <Breadcrumbs project={project} document={pageDoc} ancestors={ancestors} />
            </div>
          </div>
          <div className="flex items-center gap-2 md:gap-3 flex-shrink-0">
            {pageDoc.createdBy && (
              <span className="hidden lg:inline text-sm text-muted-foreground" data-testid="text-page-creator">
                Created by {pageDoc.createdBy.firstName || pageDoc.createdBy.email}
              </span>
            )}
            <span className="hidden sm:inline text-sm text-muted-foreground whitespace-nowrap">
              {isSaving ? "Saving..." : hasUnsavedChanges ? "Unsaved" : ""}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualSave}
              disabled={!hasUnsavedChanges || isSaving}
              data-testid="button-save"
            >
              <Save className="w-4 h-4 md:mr-1" />
              <span className="hidden md:inline">Save</span>
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className={`mx-auto ${isMobile ? "px-4 w-full" : isSidebarCollapsed ? "px-6 w-full max-w-none" : "px-4 md:px-6 max-w-3xl"}`}>
            <BlockEditor
              content={content}
              onChange={handleContentChange}
              onImageUpload={handleImageUpload}
              title={title}
              onTitleChange={handleTitleChange}
              titlePlaceholder="Untitled"
            />
            <div className="pb-4 md:pb-8" />
          </div>
        </div>
      </div>
    </div>
  );
}
