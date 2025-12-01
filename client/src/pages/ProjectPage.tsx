import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageTree } from "@/components/PageTree";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Project, Document } from "@shared/schema";

export default function ProjectPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [showNewPage, setShowNewPage] = useState(false);
  const [pageName, setPageName] = useState("");

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

  const { data: project, isLoading: projectLoading } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  const { data: documents = [] } = useQuery<Document[]>({
    queryKey: ["/api/projects", projectId, "documents"],
    enabled: !!projectId,
  });

  const createDocumentMutation = useMutation({
    mutationFn: async (data: { title: string; parentId: string | null }) => {
      return await apiRequest("POST", `/api/projects/${projectId}/documents`, data);
    },
    onSuccess: (newDoc: Document) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "documents"] });
      setShowNewPage(false);
      setPageName("");
      toast({ title: "Page created successfully" });
      setLocation(`/document/${newDoc.id}`);
    },
    onError: () => {
      toast({ title: "Failed to create page", variant: "destructive" });
    },
  });

  const handleCreatePage = () => {
    if (!pageName.trim()) return;
    createDocumentMutation.mutate({ title: pageName.trim(), parentId: null });
  };

  if (authLoading || projectLoading) {
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
          <Skeleton className="h-10 w-48 mb-6" />
          <Skeleton className="h-6 w-96" />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Project not found</h2>
          <p className="text-muted-foreground mb-4">
            The project you're looking for doesn't exist or you don't have access.
          </p>
          <Button onClick={() => setLocation("/")} data-testid="button-back-home">
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  const getProjectIcon = (iconName: string | null) => {
    switch (iconName) {
      case "book": return "📚";
      case "code": return "💻";
      case "rocket": return "🚀";
      case "star": return "⭐";
      case "zap": return "⚡";
      case "heart": return "❤️";
      case "globe": return "🌍";
      default: return "📁";
    }
  };

  return (
    <div className="flex h-full" data-testid="project-page">
      <div className="w-64 flex-shrink-0">
        <PageTree projectId={projectId} />
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="border-b border-border px-6 py-3">
          <Breadcrumbs project={project} />
        </div>
        <div className="max-w-3xl mx-auto px-6 py-8">
          <div className="flex items-center gap-4 mb-6">
            <span className="text-4xl">{getProjectIcon(project.icon)}</span>
            <div>
              <h1 className="text-3xl font-bold tracking-tight" data-testid="text-project-name">
                {project.name}
              </h1>
              {project.description && (
                <p className="text-muted-foreground mt-1">{project.description}</p>
              )}
            </div>
          </div>

          {documents.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed border-border rounded-lg">
              <FileText className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-medium mb-2">No pages yet</h3>
              <p className="text-muted-foreground text-sm mb-6 max-w-sm mx-auto">
                Start documenting your project by creating your first page.
              </p>
              <Button 
                onClick={() => setShowNewPage(true)}
                data-testid="button-create-first-page-main"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create Page
              </Button>
            </div>
          ) : (
            <div>
              <h2 className="text-lg font-semibold mb-4">Pages</h2>
              <p className="text-muted-foreground">
                Select a page from the sidebar to view or edit its content.
              </p>
            </div>
          )}
        </div>
      </div>

      <Dialog open={showNewPage} onOpenChange={setShowNewPage}>
        <DialogContent data-testid="dialog-new-page-main">
          <DialogHeader>
            <DialogTitle>Create New Page</DialogTitle>
            <DialogDescription>
              Create a new top-level page for this project.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="Page title"
              value={pageName}
              onChange={(e) => setPageName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreatePage()}
              autoFocus
              data-testid="input-page-title-main"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewPage(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreatePage}
              disabled={!pageName.trim() || createDocumentMutation.isPending}
              data-testid="button-create-page-main"
            >
              {createDocumentMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
