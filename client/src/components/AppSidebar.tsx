import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "wouter";
import { Plus, Folder, ChevronRight, MoreHorizontal, Pencil, Trash2, LogOut, Search, X, Check, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Project } from "@shared/schema";

const DEFAULT_PROJECT_ICON = "folder";

export function AppSidebar() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [location] = useLocation();
  const params = useParams();
  const currentProjectId = params?.projectId;
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  const [showInlineCreate, setShowInlineCreate] = useState(false);
  const [showEditProject, setShowEditProject] = useState(false);
  const [showDeleteProject, setShowDeleteProject] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectName, setProjectName] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const inlineInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showInlineCreate && inlineInputRef.current) {
      inlineInputRef.current.focus();
    }
  }, [showInlineCreate]);

  // Keyboard shortcut for search (Cmd+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setShowSearch(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const { data: projects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const createProjectMutation = useMutation({
    mutationFn: async (data: { name: string; icon: string }) => {
      return await apiRequest("POST", "/api/projects", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      cancelInlineCreate();
      toast({ title: "Project created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create project", variant: "destructive" });
    },
  });

  const cancelInlineCreate = () => {
    setShowInlineCreate(false);
    setProjectName("");
  };

  const updateProjectMutation = useMutation({
    mutationFn: async (data: { id: string; name: string }) => {
      return await apiRequest("PATCH", `/api/projects/${data.id}`, { name: data.name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setShowEditProject(false);
      setSelectedProject(null);
      setProjectName("");
      toast({ title: "Project updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update project", variant: "destructive" });
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/projects/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      setShowDeleteProject(false);
      setSelectedProject(null);
      toast({ title: "Project deleted successfully" });
    },
    onError: () => {
      toast({ title: "Failed to delete project", variant: "destructive" });
    },
  });

  const [, setLocation] = useLocation();

  const logoutMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.clear();
      setLocation("/");
    },
    onError: () => {
      toast({ title: "Failed to log out", variant: "destructive" });
    },
  });

  const handleLogout = useCallback(() => {
    logoutMutation.mutate();
  }, [logoutMutation]);

  const handleCreateProject = () => {
    if (!projectName.trim() || createProjectMutation.isPending) return;
    createProjectMutation.mutate({ name: projectName.trim(), icon: DEFAULT_PROJECT_ICON });
  };

  const handleInlineKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCreateProject();
    } else if (e.key === "Escape") {
      cancelInlineCreate();
    }
  };

  const handleUpdateProject = () => {
    if (!selectedProject || !projectName.trim()) return;
    updateProjectMutation.mutate({ id: selectedProject.id, name: projectName.trim() });
  };

  const handleDeleteProject = () => {
    if (!selectedProject) return;
    deleteProjectMutation.mutate(selectedProject.id);
  };

  const openEditDialog = (project: Project) => {
    setSelectedProject(project);
    setProjectName(project.name);
    setShowEditProject(true);
  };

  const openDeleteDialog = (project: Project) => {
    setSelectedProject(project);
    setShowDeleteProject(true);
  };

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

  const userName = user?.firstName && user?.lastName
    ? `${user.firstName} ${user.lastName}`
    : user?.email || "User";

  const userInitials = user?.firstName && user?.lastName
    ? `${user.firstName[0]}${user.lastName[0]}`
    : user?.email?.[0]?.toUpperCase() || "U";

  return (
    <>
      <Sidebar collapsible="icon">
        <SidebarHeader className={`border-b border-sidebar-border p-3 ${isCollapsed ? 'hidden' : ''}`}>
          <div className="flex items-center gap-2">
            <Link href="/">
              <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center cursor-pointer hover-elevate">
                <Folder className="w-4 h-4 text-primary-foreground" />
              </div>
            </Link>
            <span className="font-semibold text-sm" data-testid="text-sidebar-brand">DocuFlow</span>
          </div>
        </SidebarHeader>

        <SidebarContent className="custom-scrollbar">
          {/* Search - Popover instead of Modal */}
          <div className="p-3">
            <Popover open={showSearch} onOpenChange={setShowSearch}>
              <PopoverTrigger asChild>
                {isCollapsed ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-8 h-8"
                    data-testid="button-search-collapsed"
                  >
                    <Search className="w-4 h-4" />
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    className="w-full justify-start gap-2 text-muted-foreground"
                    data-testid="button-search"
                  >
                    <Search className="w-4 h-4" />
                    <span className="flex-1 text-left">Search...</span>
                    <span className="kbd text-xs">⌘K</span>
                  </Button>
                )}
              </PopoverTrigger>
              <PopoverContent 
                side="right" 
                align="start" 
                className="w-80 p-0"
                data-testid="popover-search"
              >
                <SearchPopoverContent onClose={() => setShowSearch(false)} />
              </PopoverContent>
            </Popover>
          </div>

          <SidebarGroup>
            <SidebarGroupLabel className="flex items-center justify-between group-data-[collapsible=icon]:hidden">
              <span>Projects</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={() => setShowInlineCreate(true)}
                disabled={showInlineCreate}
                data-testid="button-new-project"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {isLoading ? (
                  <div className="px-3 py-2 text-sm text-muted-foreground group-data-[collapsible=icon]:hidden">Loading...</div>
                ) : projects.length === 0 && !showInlineCreate ? (
                  <div className="px-3 py-4 text-center group-data-[collapsible=icon]:hidden">
                    <p className="text-sm text-muted-foreground mb-2">No projects yet</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowInlineCreate(true)}
                      data-testid="button-create-first-project"
                    >
                      <Plus className="w-4 h-4 mr-1" />
                      Create Project
                    </Button>
                  </div>
                ) : (
                  <>
                  {projects.map((project) => (
                    <SidebarMenuItem key={project.id} className="group">
                      <SidebarMenuButton
                        asChild
                        isActive={currentProjectId === project.id}
                      >
                        <Link
                          href={`/project/${project.id}`}
                          className="flex items-center gap-2 w-full"
                          data-testid={`link-project-${project.id}`}
                        >
                          <span className="text-base">{getProjectIcon(project.icon)}</span>
                          <span className="flex-1 truncate group-data-[collapsible=icon]:hidden">{project.name}</span>
                          <ChevronRight className="w-4 h-4 opacity-50 group-data-[collapsible=icon]:hidden" />
                        </Link>
                      </SidebarMenuButton>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 opacity-0 group-hover:opacity-100 group-data-[collapsible=icon]:hidden"
                            data-testid={`button-project-menu-${project.id}`}
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => openEditDialog(project)}>
                            <Pencil className="w-4 h-4 mr-2" />
                            Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => openDeleteDialog(project)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </SidebarMenuItem>
                  ))}
                  
                  {/* Inline create row */}
                  {showInlineCreate && !isCollapsed && (
                    <SidebarMenuItem>
                      <div className="px-2 py-1.5">
                        <div className="flex items-center gap-1">
                          <span className="text-base pl-1">📁</span>
                          <Input
                            ref={inlineInputRef}
                            value={projectName}
                            onChange={(e) => setProjectName(e.target.value)}
                            onKeyDown={handleInlineKeyDown}
                            onBlur={() => {
                              if (!projectName.trim()) {
                                cancelInlineCreate();
                              }
                            }}
                            placeholder="Project name..."
                            className="h-7 text-sm flex-1"
                            data-testid="input-project-name-sidebar"
                          />
                          <Button
                            size="icon"
                            className="h-7 w-7"
                            onClick={handleCreateProject}
                            disabled={!projectName.trim() || createProjectMutation.isPending}
                            data-testid="button-create-project-sidebar"
                          >
                            <Check className="w-3 h-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={cancelInlineCreate}
                            data-testid="button-cancel-project-sidebar"
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </SidebarMenuItem>
                  )}
                  </>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border p-3">
          {isCollapsed ? (
            <div className="flex flex-col items-center">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 p-0"
                    data-testid="button-user-menu-collapsed"
                  >
                    <Avatar className="h-7 w-7">
                      <AvatarImage src={user?.profileImageUrl || undefined} className="object-cover" />
                      <AvatarFallback className="text-xs">{userInitials}</AvatarFallback>
                    </Avatar>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent side="right" align="end" className="w-56">
                  <div className="px-2 py-1.5 border-b border-border mb-1">
                    <p className="text-sm font-medium">{userName}</p>
                    {user?.email && <p className="text-xs text-muted-foreground">{user.email}</p>}
                  </div>
                  <DropdownMenuItem
                    onClick={handleLogout}
                    className="cursor-pointer"
                    data-testid="button-logout"
                  >
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="w-full justify-start gap-2 h-auto py-2 px-2"
                  data-testid="button-user-menu"
                >
                  <Avatar className="h-7 w-7">
                    <AvatarImage src={user?.profileImageUrl || undefined} className="object-cover" />
                    <AvatarFallback className="text-xs">{userInitials}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 text-left min-w-0">
                    <p className="text-sm font-medium truncate">{userName}</p>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuItem
                  onClick={handleLogout}
                  className="cursor-pointer"
                  data-testid="button-logout"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </SidebarFooter>
      </Sidebar>

      <Dialog open={showEditProject} onOpenChange={setShowEditProject}>
        <DialogContent data-testid="dialog-edit-project">
          <DialogHeader>
            <DialogTitle>Rename Project</DialogTitle>
            <DialogDescription>
              Update your project name.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Project Name</label>
              <Input
                placeholder="Enter project name"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleUpdateProject()}
                data-testid="input-edit-project-name"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditProject(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdateProject}
              disabled={!projectName.trim() || updateProjectMutation.isPending}
              data-testid="button-save-project"
            >
              {updateProjectMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteProject} onOpenChange={setShowDeleteProject}>
        <AlertDialogContent data-testid="dialog-delete-project">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedProject?.name}"? This action cannot be undone.
              All pages within this project will also be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteProject}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteProjectMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function SearchPopoverContent({ onClose }: { onClose: () => void }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [, setLocation] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const { data: results = [], isLoading } = useQuery<Array<{ type: string; id: string; title: string; projectName?: string }>>({
    queryKey: ["/api/search", { q: searchQuery }],
    queryFn: async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Search failed");
      return res.json();
    },
    enabled: searchQuery.length > 0,
  });

  const handleSelect = (result: { type: string; id: string }) => {
    if (result.type === "project") {
      setLocation(`/project/${result.id}`);
    } else {
      setLocation(`/document/${result.id}`);
    }
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
    }
  };

  return (
    <div onKeyDown={handleKeyDown}>
      <div className="p-3 border-b border-border">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            placeholder="Search projects and pages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 border-0 focus-visible:ring-0 bg-transparent"
            data-testid="input-search"
          />
        </div>
      </div>
      <div className="max-h-[280px] overflow-y-auto p-2">
        {searchQuery.length === 0 ? (
          <p className="text-center text-muted-foreground py-6 text-sm">
            Type to search projects and pages
          </p>
        ) : isLoading ? (
          <p className="text-center text-muted-foreground py-6 text-sm">
            Searching...
          </p>
        ) : results.length === 0 ? (
          <p className="text-center text-muted-foreground py-6 text-sm">
            No results found
          </p>
        ) : (
          <div className="space-y-1">
            {results.map((result) => (
              <button
                key={`${result.type}-${result.id}`}
                onClick={() => handleSelect(result)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-md hover-elevate text-left"
                data-testid={`search-result-${result.id}`}
              >
                {result.type === "project" ? (
                  <Folder className="w-4 h-4 text-muted-foreground shrink-0" />
                ) : (
                  <FileText className="w-4 h-4 text-muted-foreground shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate text-sm">{result.title}</p>
                  {result.projectName && (
                    <p className="text-xs text-muted-foreground truncate">
                      {result.projectName}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
