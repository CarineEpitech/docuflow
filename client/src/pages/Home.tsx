import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Plus, FileText, Clock, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { Project, Document } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

export default function Home() {
  const { data: projects = [], isLoading: projectsLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const { data: recentDocs = [], isLoading: docsLoading } = useQuery<Document[]>({
    queryKey: ["/api/documents/recent"],
  });

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
          ) : projects.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Folder className="w-12 h-12 text-muted-foreground/50 mb-4" />
                <h3 className="font-medium mb-2">No projects yet</h3>
                <p className="text-muted-foreground text-sm text-center mb-4">
                  Create your first project to start organizing your documentation.
                </p>
                <Button data-testid="button-create-project-home">
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
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
