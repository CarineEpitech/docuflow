import { Link } from "wouter";
import { ChevronRight, Home } from "lucide-react";
import type { Document, Project } from "@shared/schema";

interface BreadcrumbsProps {
  project?: Project;
  document?: Document;
  ancestors?: Document[];
}

export function Breadcrumbs({ project, document, ancestors = [] }: BreadcrumbsProps) {
  return (
    <nav className="flex items-center gap-1 text-sm text-muted-foreground min-w-0 overflow-hidden" data-testid="nav-breadcrumbs">
      {project && (
        <>
          <Link
            href={`/project/${project.id}`}
            className="flex items-center gap-1 hover:text-foreground transition-colors flex-shrink-0"
            data-testid="breadcrumb-project"
          >
            <span className="text-base">{getProjectIcon(project.icon)}</span>
            <span>{project.name}</span>
          </Link>
        </>
      )}

      {ancestors.length > 0 && (
        <span className="hidden md:flex items-center gap-1">
          {ancestors.map((ancestor) => (
            <span key={ancestor.id} className="flex items-center gap-1">
              <ChevronRight className="w-4 h-4 flex-shrink-0" />
              <Link
                href={`/document/${ancestor.id}`}
                className="hover:text-foreground transition-colors max-w-[100px] truncate"
                data-testid={`breadcrumb-ancestor-${ancestor.id}`}
              >
                {ancestor.title}
              </Link>
            </span>
          ))}
        </span>
      )}

      {ancestors.length > 0 && (
        <span className="flex md:hidden items-center gap-1 text-muted-foreground/60">
          <ChevronRight className="w-4 h-4 flex-shrink-0" />
          <span>...</span>
        </span>
      )}

      {document && (
        <span className="flex items-center gap-1 min-w-0">
          <ChevronRight className="w-4 h-4 flex-shrink-0" />
          <span className="text-foreground max-w-[100px] md:max-w-[200px] truncate" data-testid="breadcrumb-current">
            {document.title}
          </span>
        </span>
      )}
    </nav>
  );
}

function getProjectIcon(iconName: string | null | undefined) {
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
}
