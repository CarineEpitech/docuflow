import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { FileText, ArrowLeft } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { PageTree } from "@/components/PageTree";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import type { Project } from "@shared/schema";

export default function ProjectPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();

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
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full" data-testid="project-page">
      <div className="w-64 flex-shrink-0">
        <PageTree projectId={projectId} />
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        <div className="border-b border-border px-6 py-3 flex items-center justify-between gap-4">
          <Breadcrumbs project={project} />
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setLocation("/documentation")}
            data-testid="button-back-to-docs"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
        </div>
        <div className="flex items-center justify-center h-full">
          <div className="text-center py-16">
            <FileText className="w-16 h-16 mx-auto text-muted-foreground/20 mb-6" />
            <h3 className="text-xl font-medium text-muted-foreground mb-2" data-testid="text-select-page-prompt">
              Select a page to get started
            </h3>
            <p className="text-muted-foreground/60 text-sm max-w-sm mx-auto">
              Choose a page from the sidebar or create a new one to begin documenting your project.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
