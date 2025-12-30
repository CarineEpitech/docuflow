import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Search, 
  ChevronLeft, 
  ChevronRight,
  FileText,
  FolderOpen,
  FolderPlus,
  Trash2
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Project } from "@shared/schema";

const PAGE_SIZE = 15;

export default function DocumentationPage() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null);
  const [showCreateFolderDialog, setShowCreateFolderDialog] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [folderDescription, setFolderDescription] = useState("");
  const { toast } = useToast();

  const { data: allProjects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects/documentable"],
  });

  const createFolderMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      return apiRequest("POST", "/api/crm/projects", {
        name: data.name,
        description: data.description || null,
        status: "won_in_progress",
        startDate: new Date().toISOString().split('T')[0],
        documentationEnabled: true,
      });
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects/documentable"], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects"], refetchType: 'all' });
      toast({ title: "Documentation folder created" });
      setShowCreateFolderDialog(false);
      setFolderName("");
      setFolderDescription("");
      if (response?.project?.id) {
        setLocation(`/project/${response.project.id}`);
      }
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create folder", description: error.message, variant: "destructive" });
    },
  });

  const handleCreateFolder = () => {
    if (!folderName.trim()) {
      toast({ title: "Please enter a folder name", variant: "destructive" });
      return;
    }
    createFolderMutation.mutate({ name: folderName.trim(), description: folderDescription.trim() });
  };

  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      await apiRequest("DELETE", `/api/crm/projects/by-project/${projectId}`);
    },
    onSuccess: () => {
      toast({ title: "Project deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/documentable"], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ["/api/projects"], refetchType: 'all' });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects"], refetchType: 'all' });
      setProjectToDelete(null);
    },
    onError: () => {
      toast({ title: "Failed to delete project", variant: "destructive" });
      setProjectToDelete(null);
    },
  });

  const filteredProjects = allProjects.filter(project =>
    project.name.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(filteredProjects.length / PAGE_SIZE);
  const startIndex = (page - 1) * PAGE_SIZE;
  const paginatedProjects = filteredProjects.slice(startIndex, startIndex + PAGE_SIZE);

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Documentation</h1>
          <p className="text-muted-foreground">Access your project documentation</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1 sm:flex-initial sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search projects..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="pl-9"
              data-testid="input-search-docs"
            />
          </div>
          <Button 
            onClick={() => { setFolderName(""); setFolderDescription(""); setShowCreateFolderDialog(true); }} 
            data-testid="button-create-folder"
          >
            <FolderPlus className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">New Folder</span>
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">
          Loading projects...
        </div>
      ) : paginatedProjects.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p>{search ? "No projects match your search." : "No documented projects found."}</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedProjects.map((project) => (
              <Card
                key={project.id}
                className="hover-elevate cursor-pointer transition-all group"
                onClick={() => setLocation(`/project/${project.id}`)}
                data-testid={`row-doc-project-${project.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center shrink-0 group-hover:from-primary/30 group-hover:to-primary/10 transition-colors">
                      {project.icon && project.icon !== "folder" ? (
                        <span className="text-xl">{project.icon}</span>
                      ) : (
                        <FolderOpen className="w-6 h-6 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start gap-2">
                        <h3 className="font-semibold group-hover:text-primary transition-colors leading-tight">{project.name}</h3>
                        <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
                      </div>
                      {project.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{project.description}</p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        setProjectToDelete(project);
                      }}
                      data-testid={`button-delete-project-${project.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4">
              <span className="text-sm text-muted-foreground text-center sm:text-left">
                Showing {startIndex + 1}-{Math.min(startIndex + PAGE_SIZE, filteredProjects.length)} of {filteredProjects.length} projects
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-sm px-2">
                  Page {page} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  data-testid="button-next-page"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <AlertDialog open={!!projectToDelete} onOpenChange={(open) => !open && setProjectToDelete(null)}>
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{projectToDelete?.name}"? This will permanently remove the project and all its documentation. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:gap-0">
            <AlertDialogCancel className="w-full sm:w-auto" data-testid="button-cancel-delete">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => projectToDelete && deleteProjectMutation.mutate(projectToDelete.id)}
              className="w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteProjectMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showCreateFolderDialog} onOpenChange={setShowCreateFolderDialog}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Documentation Folder</DialogTitle>
            <DialogDescription>
              Create a new folder to organize your documentation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="folder-name">Folder Name</Label>
              <Input
                id="folder-name"
                placeholder="Enter folder name..."
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                data-testid="input-folder-name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="folder-description">Description (optional)</Label>
              <Textarea
                id="folder-description"
                placeholder="Enter description..."
                value={folderDescription}
                onChange={(e) => setFolderDescription(e.target.value)}
                rows={3}
                data-testid="input-folder-description"
              />
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:gap-0">
            <Button 
              variant="outline" 
              onClick={() => setShowCreateFolderDialog(false)}
              className="w-full sm:w-auto"
              data-testid="button-cancel-create-folder"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleCreateFolder}
              disabled={createFolderMutation.isPending}
              className="w-full sm:w-auto"
              data-testid="button-confirm-create-folder"
            >
              {createFolderMutation.isPending ? "Creating..." : "Create Folder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
