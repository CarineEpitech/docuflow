import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation, useParams } from "wouter";
import { Folder, ChevronRight, MoreHorizontal, Pencil, LogOut, Search, FileText, Sparkles, Briefcase } from "lucide-react";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Project } from "@shared/schema";

export function AppSidebar() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [location] = useLocation();
  const params = useParams();
  const currentProjectId = params?.projectId;
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  const [showEditProject, setShowEditProject] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [projectName, setProjectName] = useState("");
  const [showSearch, setShowSearch] = useState(false);

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
    queryKey: ["/api/projects/documentable"],
  });

  const updateProjectMutation = useMutation({
    mutationFn: async (data: { id: string; name: string }) => {
      return await apiRequest("PATCH", `/api/projects/${data.id}`, { name: data.name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/documentable"] });
      setShowEditProject(false);
      setSelectedProject(null);
      setProjectName("");
      toast({ title: "Project updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update project", variant: "destructive" });
    },
  });

  const [, setLocation] = useLocation();

  const logoutMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/auth/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/auth/user"], null);
      queryClient.clear();
      window.location.href = "/";
    },
    onError: () => {
      toast({ title: "Failed to log out", variant: "destructive" });
    },
  });

  const handleLogout = useCallback(() => {
    logoutMutation.mutate();
  }, [logoutMutation]);

  const handleUpdateProject = () => {
    if (!selectedProject || !projectName.trim()) return;
    updateProjectMutation.mutate({ id: selectedProject.id, name: projectName.trim() });
  };

  const openEditDialog = (project: Project) => {
    setSelectedProject(project);
    setProjectName(project.name);
    setShowEditProject(true);
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
        <SidebarHeader className="border-b border-sidebar-border p-3">
          <div className="flex items-center gap-2">
            <Link href="/">
              <div className={`rounded-md bg-primary flex items-center justify-center cursor-pointer hover-elevate ${isCollapsed ? 'w-8 h-8' : 'w-7 h-7'}`}>
                <Folder className="w-4 h-4 text-primary-foreground" />
              </div>
            </Link>
            {!isCollapsed && (
              <span className="font-semibold text-sm" data-testid="text-sidebar-brand">DocuFlow</span>
            )}
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

          {/* CRM Navigation */}
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location === "/crm"}
                  >
                    <Link
                      href="/crm"
                      className="flex items-center gap-2 w-full"
                      data-testid="link-crm"
                    >
                      <Briefcase className="w-4 h-4" />
                      {!isCollapsed && <span>Project Management</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location === "/documentation" || location.startsWith("/project/")}
                  >
                    <Link
                      href="/documentation"
                      className="flex items-center gap-2 w-full"
                      data-testid="link-documentation"
                    >
                      <FileText className="w-4 h-4" />
                      {!isCollapsed && <span>Documentation</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="border-t border-sidebar-border p-3">
          {isCollapsed ? (
            <div className="flex flex-col items-center gap-2">
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
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="flex-1 justify-start gap-2 h-auto py-2 px-2"
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
            </div>
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
