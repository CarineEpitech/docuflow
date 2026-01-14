import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, X, Tag, Check, Pencil, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { CrmTag } from "@shared/schema";

const TAG_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#eab308", // yellow
  "#84cc16", // lime
  "#22c55e", // green
  "#14b8a6", // teal
  "#06b6d4", // cyan
  "#0ea5e9", // sky
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#a855f7", // purple
  "#d946ef", // fuchsia
  "#ec4899", // pink
  "#64748b", // slate
];

interface CrmTagSelectorProps {
  crmProjectId: string;
  projectTags: CrmTag[];
  onTagsChange?: () => void;
}

export function CrmTagSelector({ crmProjectId, projectTags, onTagsChange }: CrmTagSelectorProps) {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[10]);
  const [editingTag, setEditingTag] = useState<CrmTag | null>(null);

  const { data: allTags = [] } = useQuery<CrmTag[]>({
    queryKey: ["/api/crm/tags"],
  });

  const addTagMutation = useMutation({
    mutationFn: async (tagId: string) => {
      await apiRequest("POST", `/api/crm/projects/${crmProjectId}/tags/${tagId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", crmProjectId, "tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects"] });
      onTagsChange?.();
    },
    onError: () => {
      toast({ title: "Failed to add tag", variant: "destructive" });
    },
  });

  const removeTagMutation = useMutation({
    mutationFn: async (tagId: string) => {
      await apiRequest("DELETE", `/api/crm/projects/${crmProjectId}/tags/${tagId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", crmProjectId, "tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects"] });
      onTagsChange?.();
    },
    onError: () => {
      toast({ title: "Failed to remove tag", variant: "destructive" });
    },
  });

  const createTagMutation = useMutation({
    mutationFn: async (data: { name: string; color: string }) => {
      const response = await apiRequest("POST", "/api/crm/tags", data);
      return response;
    },
    onSuccess: async (newTag: CrmTag) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/tags"] });
      setNewTagName("");
      setNewTagColor(TAG_COLORS[10]);
      setShowCreateDialog(false);
      
      // Automatically assign the new tag to the current project
      if (newTag?.id) {
        await apiRequest("POST", `/api/crm/projects/${crmProjectId}/tags/${newTag.id}`);
        queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", crmProjectId, "tags"] });
        queryClient.invalidateQueries({ queryKey: ["/api/crm/projects"] });
        onTagsChange?.();
      }
      
      toast({ title: "Tag created and assigned" });
    },
    onError: () => {
      toast({ title: "Failed to create tag", variant: "destructive" });
    },
  });

  const updateTagMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: { name?: string; color?: string } }) => {
      return await apiRequest("PATCH", `/api/crm/tags/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", crmProjectId, "tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects"] });
      setEditingTag(null);
      onTagsChange?.();
      toast({ title: "Tag updated" });
    },
    onError: () => {
      toast({ title: "Failed to update tag", variant: "destructive" });
    },
  });

  const deleteTagMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/crm/tags/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", crmProjectId, "tags"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects"] });
      onTagsChange?.();
      toast({ title: "Tag deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete tag", variant: "destructive" });
    },
  });

  const projectTagIds = new Set(projectTags.map(t => t.id));
  const availableTags = allTags.filter(t => !projectTagIds.has(t.id));

  const handleToggleTag = (tag: CrmTag) => {
    if (projectTagIds.has(tag.id)) {
      removeTagMutation.mutate(tag.id);
    } else {
      addTagMutation.mutate(tag.id);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {projectTags.map(tag => (
          <Badge 
            key={tag.id} 
            style={{ backgroundColor: tag.color, color: "white" }}
            className="flex items-center gap-1 pr-1"
            data-testid={`tag-badge-${tag.id}`}
          >
            <span>{tag.name}</span>
            <button
              onClick={() => removeTagMutation.mutate(tag.id)}
              className="hover:bg-white/20 rounded p-0.5"
              data-testid={`button-remove-tag-${tag.id}`}
            >
              <X className="w-3 h-3" />
            </button>
          </Badge>
        ))}
        
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button 
              variant="outline" 
              size="sm" 
              className="h-6 px-2"
              data-testid="button-add-tag"
            >
              <Plus className="w-3 h-3 mr-1" />
              <Tag className="w-3 h-3" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-2" align="start">
            <div className="space-y-2">
              <div className="text-sm font-medium">Available Tags</div>
              
              {availableTags.length === 0 && allTags.length === 0 && (
                <p className="text-xs text-muted-foreground">No tags created yet</p>
              )}
              
              {availableTags.length === 0 && allTags.length > 0 && (
                <p className="text-xs text-muted-foreground">All tags added</p>
              )}

              <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                {availableTags.map(tag => (
                  <div key={tag.id} className="flex items-center gap-1 group">
                    <Badge 
                      style={{ backgroundColor: tag.color, color: "white" }}
                      className="cursor-pointer hover-elevate"
                      onClick={() => handleToggleTag(tag)}
                      data-testid={`button-select-tag-${tag.id}`}
                    >
                      {tag.name}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 opacity-0 group-hover:opacity-100"
                      onClick={() => setEditingTag(tag)}
                      data-testid={`button-edit-tag-${tag.id}`}
                    >
                      <Pencil className="w-3 h-3" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="text-sm font-medium pt-2">Added Tags</div>
              <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto">
                {projectTags.map(tag => (
                  <Badge 
                    key={tag.id}
                    style={{ backgroundColor: tag.color, color: "white" }}
                    className="cursor-pointer flex items-center gap-1"
                    onClick={() => handleToggleTag(tag)}
                    data-testid={`button-deselect-tag-${tag.id}`}
                  >
                    <Check className="w-3 h-3" />
                    {tag.name}
                  </Badge>
                ))}
              </div>

              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setShowCreateDialog(true)}
                data-testid="button-create-new-tag"
              >
                <Plus className="w-3 h-3 mr-1" />
                Create New Tag
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Tag</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Name</label>
              <Input
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                placeholder="Tag name"
                data-testid="input-tag-name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Color</label>
              <div className="flex flex-wrap gap-2">
                {TAG_COLORS.map(color => (
                  <button
                    key={color}
                    className={`w-6 h-6 rounded-full border-2 ${newTagColor === color ? "border-foreground" : "border-transparent"}`}
                    style={{ backgroundColor: color }}
                    onClick={() => setNewTagColor(color)}
                    data-testid={`button-color-${color}`}
                  />
                ))}
              </div>
              <div className="pt-2">
                <Badge style={{ backgroundColor: newTagColor, color: "white" }}>
                  {newTagName || "Preview"}
                </Badge>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createTagMutation.mutate({ name: newTagName, color: newTagColor })}
              disabled={!newTagName.trim() || createTagMutation.isPending}
              data-testid="button-save-tag"
            >
              {createTagMutation.isPending ? "Creating..." : "Create Tag"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingTag} onOpenChange={(open) => !open && setEditingTag(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Tag</DialogTitle>
          </DialogHeader>
          {editingTag && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <Input
                  value={editingTag.name}
                  onChange={(e) => setEditingTag({ ...editingTag, name: e.target.value })}
                  placeholder="Tag name"
                  data-testid="input-edit-tag-name"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Color</label>
                <div className="flex flex-wrap gap-2">
                  {TAG_COLORS.map(color => (
                    <button
                      key={color}
                      className={`w-6 h-6 rounded-full border-2 ${editingTag.color === color ? "border-foreground" : "border-transparent"}`}
                      style={{ backgroundColor: color }}
                      onClick={() => setEditingTag({ ...editingTag, color })}
                      data-testid={`button-edit-color-${color}`}
                    />
                  ))}
                </div>
                <div className="pt-2">
                  <Badge style={{ backgroundColor: editingTag.color, color: "white" }}>
                    {editingTag.name || "Preview"}
                  </Badge>
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="flex justify-between sm:justify-between">
            <Button
              variant="destructive"
              onClick={() => editingTag && deleteTagMutation.mutate(editingTag.id)}
              disabled={deleteTagMutation.isPending}
              data-testid="button-delete-tag"
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Delete
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setEditingTag(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => editingTag && updateTagMutation.mutate({ 
                  id: editingTag.id, 
                  data: { name: editingTag.name, color: editingTag.color } 
                })}
                disabled={!editingTag?.name.trim() || updateTagMutation.isPending}
                data-testid="button-update-tag"
              >
                {updateTagMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
