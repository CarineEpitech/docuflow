import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Plus,
  MoreHorizontal,
  Pencil,
  Trash2,
  Copy,
  X,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
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
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Document, DocumentWithChildren } from "@shared/schema";
import { cn } from "@/lib/utils";
import { pageTemplates, type PageTemplate } from "@/lib/pageTemplates";

interface PageTreeProps {
  projectId: string;
  currentDocumentId?: string;
}

export function PageTree({ projectId, currentDocumentId }: PageTreeProps) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [showEditPage, setShowEditPage] = useState(false);
  const [showDeletePage, setShowDeletePage] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [pageName, setPageName] = useState("");
  
  // Inline creation state with template support
  const [inlineCreateParentId, setInlineCreateParentId] = useState<string | null | undefined>(undefined);
  const [inlinePageName, setInlinePageName] = useState("");
  const [inlineTemplate, setInlineTemplate] = useState<PageTemplate>(pageTemplates[0]);
  // Track which popover is open: "header", "empty", or a node id for subpages
  const [activePopover, setActivePopover] = useState<string | null>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);
  
  // Focus the inline input when it appears
  useEffect(() => {
    if (inlineCreateParentId !== undefined && inlineInputRef.current) {
      inlineInputRef.current.focus();
    }
  }, [inlineCreateParentId]);

  const { data: documents = [], isLoading } = useQuery<Document[]>({
    queryKey: ["/api/projects", projectId, "documents"],
  });

  const createDocumentMutation = useMutation({
    mutationFn: async (data: { title: string; parentId: string | null; content?: any; icon?: string }) => {
      return await apiRequest("POST", `/api/projects/${projectId}/documents`, data);
    },
    onSuccess: (newDoc: Document) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "documents"] });
      cancelInlineCreate();
      toast({ title: "Page created successfully" });
      setLocation(`/document/${newDoc.id}`);
    },
    onError: () => {
      toast({ title: "Failed to create page", variant: "destructive" });
    },
  });

  const updateDocumentMutation = useMutation({
    mutationFn: async (data: { id: string; title: string }) => {
      return await apiRequest("PATCH", `/api/documents/${data.id}`, { title: data.title });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "documents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      setShowEditPage(false);
      setSelectedDocument(null);
      setPageName("");
      toast({ title: "Page renamed successfully" });
    },
    onError: () => {
      toast({ title: "Failed to rename page", variant: "destructive" });
    },
  });

  const deleteDocumentMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/documents/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "documents"] });
      setShowDeletePage(false);
      setSelectedDocument(null);
      toast({ title: "Page deleted successfully" });
      if (currentDocumentId === selectedDocument?.id) {
        setLocation(`/project/${projectId}`);
      }
    },
    onError: () => {
      toast({ title: "Failed to delete page", variant: "destructive" });
    },
  });

  const duplicateDocumentMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("POST", `/api/documents/${id}/duplicate`);
    },
    onSuccess: (newDoc: Document) => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", projectId, "documents"] });
      toast({ title: "Page duplicated successfully" });
      setLocation(`/document/${newDoc.id}`);
    },
    onError: () => {
      toast({ title: "Failed to duplicate page", variant: "destructive" });
    },
  });

  const buildTree = (docs: Document[]): DocumentWithChildren[] => {
    const map = new Map<string, DocumentWithChildren>();
    const roots: DocumentWithChildren[] = [];

    docs.forEach((doc) => {
      map.set(doc.id, { ...doc, children: [] });
    });

    docs.forEach((doc) => {
      const node = map.get(doc.id)!;
      if (doc.parentId && map.has(doc.parentId)) {
        map.get(doc.parentId)!.children!.push(node);
      } else {
        roots.push(node);
      }
    });

    const sortNodes = (nodes: DocumentWithChildren[]) => {
      nodes.sort((a, b) => a.position - b.position);
      nodes.forEach((node) => {
        if (node.children && node.children.length > 0) {
          sortNodes(node.children);
        }
      });
    };

    sortNodes(roots);
    return roots;
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const openPopover = (popoverId: string) => {
    setActivePopover(popoverId);
  };

  const closePopover = () => {
    setActivePopover(null);
  };

  const selectTemplateAndStartInline = (template: PageTemplate, parentId: string | null) => {
    setInlineTemplate(template);
    setInlineCreateParentId(parentId);
    setInlinePageName("");
    setActivePopover(null);
    // If creating under a parent, expand it
    if (parentId) {
      setExpandedIds((prev) => new Set(Array.from(prev).concat(parentId)));
    }
  };

  const cancelInlineCreate = () => {
    setInlineCreateParentId(undefined);
    setInlinePageName("");
    setInlineTemplate(pageTemplates[0]);
  };

  const handleInlineCreate = () => {
    if (!inlinePageName.trim() || createDocumentMutation.isPending) return;
    createDocumentMutation.mutate({ 
      title: inlinePageName.trim(), 
      parentId: inlineCreateParentId ?? null,
      content: inlineTemplate.content,
      icon: inlineTemplate.icon,
    });
  };

  const handleInlineKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleInlineCreate();
    } else if (e.key === "Escape") {
      cancelInlineCreate();
    }
  };

  const openEditDialog = (doc: Document) => {
    setSelectedDocument(doc);
    setPageName(doc.title);
    setShowEditPage(true);
  };

  const openDeleteDialog = (doc: Document) => {
    setSelectedDocument(doc);
    setShowDeletePage(true);
  };

  const handleUpdatePage = () => {
    if (!selectedDocument || !pageName.trim()) return;
    updateDocumentMutation.mutate({ id: selectedDocument.id, title: pageName.trim() });
  };

  const handleDeletePage = () => {
    if (!selectedDocument) return;
    deleteDocumentMutation.mutate(selectedDocument.id);
  };

  const handleDuplicate = (doc: Document) => {
    duplicateDocumentMutation.mutate(doc.id);
  };

  const tree = buildTree(documents);

  // Inline creation row component
  const renderInlineCreateRow = (depth: number = 0) => {
    return (
      <div
        className="flex items-center gap-1 py-1 px-2 rounded-md bg-accent/50"
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center text-base">
          {inlineTemplate.icon}
        </span>
        <Input
          ref={inlineInputRef}
          value={inlinePageName}
          onChange={(e) => setInlinePageName(e.target.value)}
          onKeyDown={handleInlineKeyDown}
          onBlur={() => {
            // Only cancel if empty, otherwise keep it open
            if (!inlinePageName.trim()) {
              cancelInlineCreate();
            }
          }}
          placeholder="Page title..."
          className="h-7 text-sm flex-1 bg-background"
          data-testid="input-inline-page-title"
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 flex-shrink-0"
          onClick={handleInlineCreate}
          disabled={!inlinePageName.trim() || createDocumentMutation.isPending}
          data-testid="button-confirm-inline-create"
        >
          <Check className="w-3 h-3" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 flex-shrink-0"
          onClick={cancelInlineCreate}
          data-testid="button-cancel-inline-create"
        >
          <X className="w-3 h-3" />
        </Button>
      </div>
    );
  };

  const renderNode = (node: DocumentWithChildren, depth: number = 0) => {
    const hasChildren = node.children && node.children.length > 0;
    const isExpanded = expandedIds.has(node.id);
    const isActive = currentDocumentId === node.id;

    return (
      <div key={node.id}>
        <div
          className={cn(
            "page-tree-item group flex items-center gap-1 py-1 px-2 rounded-md hover-elevate",
            isActive && "bg-accent"
          )}
          style={{ paddingLeft: `${depth * 20 + 8}px` }}
        >
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 flex-shrink-0"
            onClick={() => hasChildren && toggleExpand(node.id)}
            data-testid={`button-expand-${node.id}`}
          >
            {hasChildren ? (
              isExpanded ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )
            ) : (
              <span className="w-3" />
            )}
          </Button>

          <Link
            href={`/document/${node.id}`}
            className="flex items-center gap-2 flex-1 min-w-0 py-1"
            data-testid={`link-page-${node.id}`}
          >
            <span className="text-base flex-shrink-0">
              {node.icon || "📄"}
            </span>
            <span className="truncate text-sm">{node.title}</span>
          </Link>

          <div className="actions flex items-center gap-0.5">
            <Popover 
              open={activePopover === `subpage-${node.id}`} 
              onOpenChange={(open) => {
                if (open) openPopover(`subpage-${node.id}`);
                else closePopover();
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => e.stopPropagation()}
                  data-testid={`button-add-subpage-${node.id}`}
                >
                  <Plus className="w-3 h-3" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-56 p-1" sideOffset={4}>
                <div className="text-xs font-medium text-muted-foreground px-2 py-1.5">
                  Choose a template
                </div>
                {pageTemplates.map((template) => (
                  <button
                    key={template.id}
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-sm hover-elevate text-left"
                    onClick={() => selectTemplateAndStartInline(template, node.id)}
                    data-testid={`button-template-${template.id}`}
                  >
                    <span className="text-base">{template.icon}</span>
                    <span>{template.name}</span>
                  </button>
                ))}
              </PopoverContent>
            </Popover>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  data-testid={`button-page-menu-${node.id}`}
                >
                  <MoreHorizontal className="w-3 h-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => openEditDialog(node)}>
                  <Pencil className="w-4 h-4 mr-2" />
                  Rename
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleDuplicate(node)}>
                  <Copy className="w-4 h-4 mr-2" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => openDeleteDialog(node)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Show children if expanded */}
        {isExpanded && (
          <div>
            {hasChildren && node.children!.map((child) => renderNode(child, depth + 1))}
            {/* Show inline create row under this parent */}
            {inlineCreateParentId === node.id && renderInlineCreateRow(depth + 1)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-sidebar border-r border-sidebar-border">
      <div className="p-3 border-b border-sidebar-border flex items-center justify-between">
        <h3 className="font-medium text-sm">Pages</h3>
        <Popover 
          open={activePopover === "header"} 
          onOpenChange={(open) => {
            if (open) openPopover("header");
            else closePopover();
          }}
        >
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              data-testid="button-new-page"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-56 p-1" sideOffset={4}>
            <div className="text-xs font-medium text-muted-foreground px-2 py-1.5">
              Choose a template
            </div>
            {pageTemplates.map((template) => (
              <button
                key={template.id}
                className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-sm hover-elevate text-left"
                onClick={() => selectTemplateAndStartInline(template, null)}
                data-testid={`button-template-root-${template.id}`}
              >
                <span className="text-base">{template.icon}</span>
                <span>{template.name}</span>
              </button>
            ))}
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Loading pages...
          </div>
        ) : tree.length === 0 && inlineCreateParentId === undefined ? (
          <div className="text-center py-8">
            <FileText className="w-10 h-10 mx-auto text-muted-foreground/50 mb-3" />
            <p className="text-sm text-muted-foreground mb-3">No pages yet</p>
            <Popover 
              open={activePopover === "empty"} 
              onOpenChange={(open) => {
                if (open) openPopover("empty");
                else closePopover();
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="button-create-first-page"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  New Page
                </Button>
              </PopoverTrigger>
              <PopoverContent align="center" className="w-56 p-1" sideOffset={4}>
                <div className="text-xs font-medium text-muted-foreground px-2 py-1.5">
                  Choose a template
                </div>
                {pageTemplates.map((template) => (
                  <button
                    key={template.id}
                    className="flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-sm hover-elevate text-left"
                    onClick={() => selectTemplateAndStartInline(template, null)}
                    data-testid={`button-template-empty-${template.id}`}
                  >
                    <span className="text-base">{template.icon}</span>
                    <span>{template.name}</span>
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          </div>
        ) : (
          <>
            {tree.map((node) => renderNode(node, 0))}
            {/* Show inline create row at root level */}
            {inlineCreateParentId === null && renderInlineCreateRow(0)}
          </>
        )}
      </div>

      <Dialog open={showEditPage} onOpenChange={setShowEditPage}>
        <DialogContent data-testid="dialog-edit-page">
          <DialogHeader>
            <DialogTitle>Rename Page</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              placeholder="Page title"
              value={pageName}
              onChange={(e) => setPageName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleUpdatePage()}
              autoFocus
              data-testid="input-edit-page-title"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditPage(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleUpdatePage}
              disabled={!pageName.trim() || updateDocumentMutation.isPending}
              data-testid="button-save-page"
            >
              {updateDocumentMutation.isPending ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeletePage} onOpenChange={setShowDeletePage}>
        <AlertDialogContent data-testid="dialog-delete-page">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Page</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{selectedDocument?.title}"? This action cannot be undone.
              All subpages will also be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeletePage}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-page"
            >
              {deleteDocumentMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}
