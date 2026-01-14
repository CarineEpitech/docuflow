import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, X, Tag, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { CrmTag } from "@shared/schema";

const TAG_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#6b7280", // gray
];

interface CrmTagManagerProps {
  crmProjectId: string;
}

export function CrmTagManager({ crmProjectId }: CrmTagManagerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [newTagColor, setNewTagColor] = useState(TAG_COLORS[0]);

  const { data: allTags = [], isLoading: isLoadingAllTags } = useQuery<CrmTag[]>({
    queryKey: ["/api/crm/tags"],
  });

  const { data: projectTags = [], isLoading: isLoadingProjectTags } = useQuery<CrmTag[]>({
    queryKey: ["/api/crm/projects", crmProjectId, "tags"],
  });

  const createTagMutation = useMutation({
    mutationFn: async (data: { name: string; color: string }) => {
      return apiRequest("POST", "/api/crm/tags", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/tags"] });
      setNewTagName("");
      setIsCreating(false);
    },
  });

  const addTagMutation = useMutation({
    mutationFn: async (tagId: string) => {
      return apiRequest("POST", `/api/crm/projects/${crmProjectId}/tags`, { tagId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", crmProjectId, "tags"] });
    },
  });

  const removeTagMutation = useMutation({
    mutationFn: async (tagId: string) => {
      return apiRequest("DELETE", `/api/crm/projects/${crmProjectId}/tags/${tagId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", crmProjectId, "tags"] });
    },
  });

  const projectTagIds = new Set(projectTags.map(t => t.id));
  const availableTags = allTags.filter(t => !projectTagIds.has(t.id));

  const handleCreateTag = () => {
    if (!newTagName.trim()) return;
    createTagMutation.mutate({ name: newTagName.trim(), color: newTagColor });
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {isLoadingProjectTags ? (
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      ) : (
        projectTags.map((tag) => (
          <Badge
            key={tag.id}
            className="group cursor-default px-2 py-0.5 text-xs font-medium gap-1"
            style={{ 
              backgroundColor: tag.color,
              color: "#fff",
              borderColor: tag.color,
            }}
            data-testid={`badge-tag-${tag.id}`}
          >
            {tag.name}
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeTagMutation.mutate(tag.id);
              }}
              className="opacity-60 hover:opacity-100 ml-0.5"
              data-testid={`button-remove-tag-${tag.id}`}
            >
              <X className="w-3 h-3" />
            </button>
          </Badge>
        ))
      )}

      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
            data-testid="button-add-tag"
          >
            <Tag className="w-3 h-3 mr-1" />
            Add Tag
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64 p-0" align="start">
          {isCreating ? (
            <div className="p-3 space-y-3">
              <Input
                placeholder="Tag name"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                autoFocus
                data-testid="input-new-tag-name"
              />
              <div className="flex flex-wrap gap-1.5">
                {TAG_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setNewTagColor(color)}
                    className="w-6 h-6 rounded-full flex items-center justify-center transition-transform hover:scale-110"
                    style={{ backgroundColor: color }}
                    data-testid={`button-color-${color}`}
                  >
                    {newTagColor === color && (
                      <Check className="w-3 h-3 text-white" />
                    )}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => {
                    setIsCreating(false);
                    setNewTagName("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={handleCreateTag}
                  disabled={!newTagName.trim() || createTagMutation.isPending}
                  data-testid="button-create-tag"
                >
                  {createTagMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    "Create"
                  )}
                </Button>
              </div>
            </div>
          ) : (
            <Command>
              <CommandInput placeholder="Search tags..." />
              <CommandList>
                <CommandEmpty>No tags found</CommandEmpty>
                {availableTags.length > 0 && (
                  <CommandGroup heading="Available Tags">
                    {availableTags.map((tag) => (
                      <CommandItem
                        key={tag.id}
                        value={tag.name}
                        onSelect={() => {
                          addTagMutation.mutate(tag.id);
                          setIsOpen(false);
                        }}
                        className="cursor-pointer"
                        data-testid={`item-tag-${tag.id}`}
                      >
                        <div
                          className="w-3 h-3 rounded-full mr-2"
                          style={{ backgroundColor: tag.color }}
                        />
                        {tag.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => setIsCreating(true)}
                    className="cursor-pointer"
                    data-testid="item-create-new-tag"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Create new tag
                  </CommandItem>
                </CommandGroup>
              </CommandList>
            </Command>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
