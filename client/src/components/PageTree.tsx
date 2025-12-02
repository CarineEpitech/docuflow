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
  LayoutTemplate,
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
  
  // Template selection state
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<PageTemplate | null>(null);
  const [templateParentId, setTemplateParentId] = useState<string | null>(null);
  const [templatePageName, setTemplatePageName] = useState("");
  const templateInputRef = useRef<HTMLInputElement>(null);
  
  // Inline creation state (legacy, kept for compatibility)
  const [inlineCreateParentId, setInlineCreateParentId] = useState<string | null | undefined>(undefined);
  const [inlinePageName, setInlinePageName] = useState("");
  const inlineInputRef = useRef<HTMLInputElement>(null);
  
  // Focus the inline input when it appears
  useEffect(() => {
    if (inlineCreateParentId !== undefined && inlineInputRef.current) {
      inlineInputRef.current.focus();
    }
  }, [inlineCreateParentId]);
  
  // Focus the template input when dialog opens
  useEffect(() => {
    if (showTemplateDialog && templateInputRef.current) {
      setTimeout(() => templateInputRef.current?.focus(), 100);
    }
  }, [showTemplateDialog]);

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
      closeTemplateDialog();
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

  const openTemplateDialog = (parentDocId: string | null = null) => {
    setTemplateParentId(parentDocId);
    setTemplatePageName("");
    setSelectedTemplate(pageTemplates[0]); // Default to blank template
    setShowTemplateDialog(true);
    // If creating under a parent, expand it
    if (parentDocId) {
      setExpandedIds((prev) => new Set(Array.from(prev).concat(parentDocId)));
    }
  };

  const closeTemplateDialog = () => {
    setShowTemplateDialog(false);
    setSelectedTemplate(null);
    setTemplatePageName("");
    setTemplateParentId(null);
  };

  const handleTemplateCreate = () => {
    if (!templatePageName.trim() || !selectedTemplate || createDocumentMutation.isPending) return;
    createDocumentMutation.mutate({ 
      title: templatePageName.trim(), 
      parentId: templateParentId,
      content: selectedTemplate.content,
      icon: selectedTemplate.icon,
    });
  };

  const startInlineCreate = (parentDocId: string | null = null) => {
    setInlineCreateParentId(parentDocId);
    setInlinePageName("");
    // If creating under a parent, expand it
    if (parentDocId) {
      setExpandedIds((prev) => new Set(Array.from(prev).concat(parentDocId)));
    }
  };

  const cancelInlineCreate = () => {
    setInlineCreateParentId(undefined);
    setInlinePageName("");
  };

  const handleInlineCreate = () => {
    if (!inlinePageName.trim() || createDocumentMutation.isPending) return;
    createDocumentMutation.mutate({ 
      title: inlinePageName.trim(), 
      parentId: inlineCreateParentId ?? null 
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
        <span className="w-5 h-5 flex-shrink-0 flex items-center justify-center">
          <FileText className="w-3.5 h-3.5 text-muted-foreground" />
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
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation();
                openTemplateDialog(node.id);
              }}
              data-testid={`button-add-subpage-${node.id}`}
            >
              <Plus className="w-3 h-3" />
            </Button>
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
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={() => openTemplateDialog(null)}
          disabled={showTemplateDialog}
          data-testid="button-new-page"
        >
          <Plus className="w-4 h-4" />
        </Button>
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => openTemplateDialog(null)}
              data-testid="button-create-first-page"
            >
              <Plus className="w-4 h-4 mr-1" />
              New Page
            </Button>
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

      <Dialog open={showTemplateDialog} onOpenChange={(open) => !open && closeTemplateDialog()}>
        <DialogContent className="max-w-lg" data-testid="dialog-template-select">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LayoutTemplate className="w-5 h-5" />
              Nouvelle Page
            </DialogTitle>
            <DialogDescription>
              Choisissez un template et donnez un nom à votre page
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Nom de la page</label>
              <Input
                ref={templateInputRef}
                placeholder="Titre de la page..."
                value={templatePageName}
                onChange={(e) => setTemplatePageName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && templatePageName.trim()) {
                    handleTemplateCreate();
                  }
                }}
                data-testid="input-template-page-title"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Template</label>
              <div className="grid gap-2">
                {pageTemplates.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-lg border text-left transition-colors",
                      "hover-elevate",
                      selectedTemplate?.id === template.id
                        ? "border-primary bg-primary/5"
                        : "border-border"
                    )}
                    onClick={() => setSelectedTemplate(template)}
                    data-testid={`button-template-${template.id}`}
                  >
                    <span className="text-2xl flex-shrink-0">{template.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{template.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {template.description}
                      </div>
                    </div>
                    {selectedTemplate?.id === template.id && (
                      <div className="w-2 h-2 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={closeTemplateDialog}>
              Annuler
            </Button>
            <Button
              onClick={handleTemplateCreate}
              disabled={!templatePageName.trim() || !selectedTemplate || createDocumentMutation.isPending}
              data-testid="button-create-page-with-template"
            >
              {createDocumentMutation.isPending ? "Création..." : "Créer la page"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
