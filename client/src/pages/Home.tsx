import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, FileText, Clock, Folder, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Project, Document } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

const PROJECT_ICONS = ["folder", "book", "code", "rocket", "star", "zap", "heart", "globe"];

export default function Home() {
  const { toast } = useToast();
  const [showInlineCreate, setShowInlineCreate] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [projectIcon, setProjectIcon] = useState("folder");
  const inlineInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showInlineCreate && inlineInputRef.current) {
      inlineInputRef.current.focus();
    }
  }, [showInlineCreate]);

  const { data: projects = [], isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: recentDocs = [], isLoading: docsLoading } = useQuery<Document[]>({
    queryKey: ["/api/documents/recent"],
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

  const handleCreateProject = () => {
    if (!projectName.trim() || createProjectMutation.isPending) return;
    createProjectMutation.mutate({ name: projectName.trim(), icon: projectIcon });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCreateProject();
    } else if (e.key === "Escape") {
      cancelInlineCreate();
    }
  };

  const cancelInlineCreate = () => {
    setShowInlineCreate(false);
    setProjectName("");
    setProjectIcon("folder");
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

  const getIconEmoji = (iconName: string) => {
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
    <div className="flex-1 overflow-y-auto custom-scrollbar">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight mb-2" data-testid="text-welcome-title">
            Welcome back
          </h1>
          <p className="text-muted-foreground" data-testid="text-welcome-subtitle">
            Pick up where you left off or start something new.
          </p>
        </div>

        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Clock className="w-5 h-5 text-muted-foreground" />
              Recent Pages
            </h2>
          </div>

          {docsLoading ? (
            <div className="grid gap-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : recentDocs.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-8">
                <FileText className="w-10 h-10 text-muted-foreground/50 mb-3" />
                <p className="text-muted-foreground text-sm mb-3">No recent pages</p>
                <p className="text-muted-foreground/70 text-xs">
                  Create a page in any project to see it here
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-2">
              {recentDocs.map((doc) => (
                <Link
                  key={doc.id}
                  href={`/document/${doc.id}`}
                  className="block"
                  data-testid={`link-recent-doc-${doc.id}`}
                >
                  <Card className="hover-elevate transition-all">
                    <CardContent className="flex items-center gap-4 py-3 px-4">
                      <span className="text-xl">{doc.icon || "📄"}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{doc.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {doc.updatedAt
                            ? `Updated ${formatDistanceToNow(new Date(doc.updatedAt), { addSuffix: true })}`
                            : "Recently created"}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Folder className="w-5 h-5 text-muted-foreground" />
              Your Projects
            </h2>
          </div>

          {projectsLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-32 rounded-lg" />
              ))}
            </div>
          ) : projects.length === 0 && !showInlineCreate ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Folder className="w-12 h-12 text-muted-foreground/50 mb-4" />
                <h3 className="font-medium mb-2">No projects yet</h3>
                <p className="text-muted-foreground text-sm text-center mb-4">
                  Create your first project to start organizing your documentation.
                </p>
                <Button 
                  onClick={() => setShowInlineCreate(true)}
                  data-testid="button-create-project-home"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  New Project
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((project) => (
                <Link
                  key={project.id}
                  href={`/project/${project.id}`}
                  className="block"
                  data-testid={`link-project-card-${project.id}`}
                >
                  <Card className="h-full hover-elevate transition-all">
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{getProjectIcon(project.icon)}</span>
                        <CardTitle className="text-base truncate">{project.name}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <CardDescription className="line-clamp-2">
                        {project.description || "No description"}
                      </CardDescription>
                      <p className="text-xs text-muted-foreground mt-3">
                        {project.updatedAt
                          ? `Updated ${formatDistanceToNow(new Date(project.updatedAt), { addSuffix: true })}`
                          : "Recently created"}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              ))}
              
              {/* Inline create card */}
              {showInlineCreate ? (
                <Card className="h-full border-primary/50 bg-accent/30">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-3">
                      <div className="flex flex-wrap gap-1">
                        {PROJECT_ICONS.map((icon) => (
                          <button
                            key={icon}
                            type="button"
                            onClick={() => setProjectIcon(icon)}
                            className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
                              projectIcon === icon 
                                ? "bg-primary text-primary-foreground" 
                                : "hover:bg-accent"
                            }`}
                            data-testid={`button-icon-home-${icon}`}
                          >
                            <span className="text-sm">{getIconEmoji(icon)}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Input
                      ref={inlineInputRef}
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onBlur={() => {
                        if (!projectName.trim()) {
                          cancelInlineCreate();
                        }
                      }}
                      placeholder="Project name..."
                      className="bg-background"
                      data-testid="input-project-name-home"
                    />
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={handleCreateProject}
                        disabled={!projectName.trim() || createProjectMutation.isPending}
                        data-testid="button-create-project-submit-home"
                      >
                        <Check className="w-4 h-4 mr-1" />
                        {createProjectMutation.isPending ? "Creating..." : "Create"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={cancelInlineCreate}
                        data-testid="button-cancel-project-home"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card 
                  className="h-full border-dashed hover-elevate cursor-pointer flex items-center justify-center min-h-[140px]"
                  onClick={() => setShowInlineCreate(true)}
                  data-testid="button-add-project-card"
                >
                  <CardContent className="flex flex-col items-center justify-center py-6">
                    <Plus className="w-8 h-8 text-muted-foreground/50 mb-2" />
                    <p className="text-sm text-muted-foreground">New Project</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
