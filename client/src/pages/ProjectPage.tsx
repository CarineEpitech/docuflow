import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { FileText, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageTree } from "@/components/PageTree";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import type { Project, Document } from "@shared/schema";

export default function ProjectPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Unauthorized",
        description: "You are logged out. Logging in again...",
        variant: "destructive",
      });
      const returnUrl = encodeURIComponent(window.location.pathname);
      setTimeout(() => {
        window.location.href = `/api/login?returnTo=${returnUrl}`;
      }, 500);
    }
  }, [isAuthenticated, authLoading, toast]);

  const { data: project, isLoading: projectLoading } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  const { data: documents = [] } = useQuery<Document[]>({
    queryKey: ["/api/projects", projectId, "documents"],
    enabled: !!projectId,
  });

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
              <Button data-testid="button-create-first-page-main">
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
    </div>
  );
}
