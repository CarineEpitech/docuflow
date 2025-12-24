import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Search, 
  ChevronLeft, 
  ChevronRight,
  FileText,
  FolderOpen
} from "lucide-react";
import type { Project } from "@shared/schema";

const PAGE_SIZE = 15;

export default function DocumentationPage() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data: allProjects = [], isLoading } = useQuery<Project[]>({
    queryKey: ["/api/projects/documentable"],
  });

  const filteredProjects = allProjects.filter(project =>
    project.name.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(filteredProjects.length / PAGE_SIZE);
  const startIndex = (page - 1) * PAGE_SIZE;
  const paginatedProjects = filteredProjects.slice(startIndex, startIndex + PAGE_SIZE);

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Documentation</h1>
          <p className="text-muted-foreground">Access your project documentation</p>
        </div>
        <div className="relative w-full sm:w-64">
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
      </div>

      <Card className="overflow-hidden bg-muted/30">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">
              Loading projects...
            </div>
          ) : paginatedProjects.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <FolderOpen className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{search ? "No projects match your search." : "No documented projects found."}</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {paginatedProjects.map((project) => (
                <div
                  key={project.id}
                  className="flex items-center gap-4 p-4 hover:bg-muted/50 cursor-pointer transition-colors group"
                  onClick={() => setLocation(`/project/${project.id}`)}
                  data-testid={`row-doc-project-${project.id}`}
                >
                  <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    {project.icon && project.icon !== "folder" ? (
                      <span className="text-lg">{project.icon}</span>
                    ) : (
                      <FolderOpen className="w-5 h-5 text-primary" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium truncate group-hover:text-primary transition-colors">{project.name}</h3>
                    {project.description && (
                      <p className="text-sm text-muted-foreground truncate">{project.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="p-3 sm:p-4 border-t">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
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
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
