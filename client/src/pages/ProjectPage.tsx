import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { FileText, ArrowLeft, PanelLeftClose, PanelLeft, Menu } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PageTree } from "@/components/PageTree";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import type { Project } from "@shared/schema";

export default function ProjectPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const { toast } = useToast();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);
  const isMobile = useIsMobile();

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
        <div className="hidden md:block w-64 border-r border-sidebar-border bg-sidebar p-4">
          <Skeleton className="h-6 w-24 mb-4" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </div>
        <div className="flex-1 p-4 md:p-8">
          <Skeleton className="h-10 w-48 mb-6" />
          <Skeleton className="h-6 w-full md:w-96" />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full p-4">
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
        <PageTree projectId={projectId} />
      </div>
    </div>
  );

  return (
    <div className="flex h-full" data-testid="project-page">
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
        <div className="border-b border-border px-3 md:px-6 py-3 flex items-center justify-between gap-2 md:gap-4">
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
              <Breadcrumbs project={project} />
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setLocation("/documentation")}
            data-testid="button-back-to-docs"
            className="flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            <span className="hidden sm:inline">Back</span>
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar flex items-center justify-center p-4">
          <div className="text-center py-8 md:py-16">
            <FileText className="w-12 h-12 md:w-16 md:h-16 mx-auto text-muted-foreground/20 mb-4 md:mb-6" />
            <h3 className="text-lg md:text-xl font-medium text-muted-foreground mb-2" data-testid="text-select-page-prompt">
              Select a page to get started
            </h3>
            <p className="text-muted-foreground/60 text-sm max-w-sm mx-auto px-4">
              Choose a page from the sidebar or create a new one to begin documenting your project.
            </p>
            {project.description && (
              <div className="mt-6 pt-6 border-t border-border max-w-md mx-auto">
                <p className="text-sm text-muted-foreground" data-testid="text-project-description">
                  {project.description}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
