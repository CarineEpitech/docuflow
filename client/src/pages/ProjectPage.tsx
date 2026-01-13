import { useEffect, useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { FileText, ArrowLeft, PanelLeftClose, PanelLeft, Menu, MessageSquare, Pencil, Trash2, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { PageTree } from "@/components/PageTree";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { NoteInput } from "@/components/NoteInput";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import type { Project, CrmProjectNoteWithCreator, SafeUser } from "@shared/schema";
import { Send } from "lucide-react";

export default function ProjectPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const { toast } = useToast();
  const { user: currentUser, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSheetOpen, setIsMobileSheetOpen] = useState(false);
  const isMobile = useIsMobile();

  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteContent, setEditingNoteContent] = useState("");
  const [newNoteContent, setNewNoteContent] = useState("");
  const [newNoteMentions, setNewNoteMentions] = useState<string[]>([]);
  const notesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Session Expired",
        description: "Please sign in again.",
        variant: "destructive",
      });
      setLocation("/auth");
    }
  }, [isAuthenticated, authLoading, toast, setLocation]);

  const { data: project, isLoading: projectLoading } = useQuery<Project>({
    queryKey: ["/api/projects", projectId],
    enabled: !!projectId,
  });

  const { data: notes = [], isLoading: notesLoading } = useQuery<CrmProjectNoteWithCreator[]>({
    queryKey: ["/api/crm/projects", projectId, "notes"],
    queryFn: async () => {
      const res = await fetch(`/api/crm/projects/${projectId}/notes`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch notes");
      return res.json();
    },
    enabled: !!projectId,
  });

  const { data: users = [] } = useQuery<SafeUser[]>({
    queryKey: ["/api/users"],
  });

  const createNoteMutation = useMutation({
    mutationFn: async (data: { content: string; mentions?: string[] }) => {
      return apiRequest("POST", `/api/crm/projects/${projectId}/notes`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", projectId, "notes"] });
      setNewNoteContent("");
      setNewNoteMentions([]);
      setTimeout(() => {
        if (notesContainerRef.current) {
          notesContainerRef.current.scrollTop = notesContainerRef.current.scrollHeight;
        }
      }, 100);
    },
    onError: (error: Error) => {
      toast({ title: "Failed to add note", description: error.message, variant: "destructive" });
    },
  });

  const updateNoteMutation = useMutation({
    mutationFn: async ({ noteId, data }: { noteId: string; data: { content: string } }) => {
      return apiRequest("PATCH", `/api/crm/projects/${projectId}/notes/${noteId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", projectId, "notes"] });
      setEditingNoteId(null);
      setEditingNoteContent("");
    },
    onError: (error: Error) => {
      toast({ title: "Failed to update note", description: error.message, variant: "destructive" });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      return apiRequest("DELETE", `/api/crm/projects/${projectId}/notes/${noteId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", projectId, "notes"] });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to delete note", description: error.message, variant: "destructive" });
    },
  });

  const handleAddNote = () => {
    if (!newNoteContent.trim()) return;
    createNoteMutation.mutate({ content: newNoteContent.trim(), mentions: newNoteMentions });
  };

  const handleStartEditNote = (note: CrmProjectNoteWithCreator) => {
    setEditingNoteId(note.id);
    setEditingNoteContent(note.content);
  };

  const handleSaveEditNote = () => {
    if (editingNoteId && editingNoteContent.trim()) {
      updateNoteMutation.mutate({ noteId: editingNoteId, data: { content: editingNoteContent.trim() } });
    }
  };

  const handleCancelEditNote = () => {
    setEditingNoteId(null);
    setEditingNoteContent("");
  };

  const renderNoteContent = (content: string) => {
    const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
    const parts: (string | JSX.Element)[] = [];
    let lastIndex = 0;
    let match;
    while ((match = mentionRegex.exec(content)) !== null) {
      if (match.index > lastIndex) {
        parts.push(content.slice(lastIndex, match.index));
      }
      parts.push(
        <span key={match.index} className="text-primary font-medium">
          @{match[1]}
        </span>
      );
      lastIndex = match.index + match[0].length;
    }
    if (lastIndex < content.length) {
      parts.push(content.slice(lastIndex));
    }
    return parts;
  };

  if (authLoading || projectLoading) {
    return (
      <div className="flex h-full">
        <div className="hidden md:block w-64 border-r border-sidebar-border bg-sidebar p-4">
          <Skeleton className="h-6 w-24 mb-4" />
          <div className="space-y-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </div>
        <div className="flex-1 p-4 md:p-8">
          <Skeleton className="h-10 w-48 mb-6" />
          <Skeleton className="h-6 w-full md:w-96" />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-2">Project not found</h2>
          <p className="text-muted-foreground mb-4">
            The project you're looking for doesn't exist or you don't have access.
          </p>
          <Button onClick={() => setLocation("/")} data-testid="button-back-home">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Home
          </Button>
        </div>
      </div>
    );
  }

  const sidebarContent = (
    <div className="h-full flex flex-col bg-sidebar">
      {!isMobile && (
        <div className="flex items-center justify-end p-1 border-b border-sidebar-border">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsSidebarCollapsed(true)}
            className="h-7 w-7"
            data-testid="button-collapse-sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </Button>
        </div>
      )}
      <div className="flex-1 overflow-hidden">
        <PageTree projectId={projectId} />
      </div>
    </div>
  );

  return (
    <div className="flex h-full" data-testid="project-page">
      {isMobile && (
        <Sheet open={isMobileSheetOpen} onOpenChange={setIsMobileSheetOpen}>
          <SheetContent side="left" className="w-[280px] p-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Navigation</SheetTitle>
            </SheetHeader>
            {sidebarContent}
          </SheetContent>
        </Sheet>
      )}

      {!isMobile && !isSidebarCollapsed && (
        <div className="w-[280px] border-r border-sidebar-border flex-shrink-0">
          {sidebarContent}
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden h-full">
        <div className="border-b border-border px-3 md:px-6 py-3 flex items-center justify-between gap-2 md:gap-4">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {isMobile ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsMobileSheetOpen(true)}
                className="h-8 w-8 flex-shrink-0"
                data-testid="button-mobile-menu"
              >
                <Menu className="h-4 w-4" />
              </Button>
            ) : isSidebarCollapsed ? (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsSidebarCollapsed(false)}
                className="h-8 w-8 flex-shrink-0"
                data-testid="button-expand-sidebar"
              >
                <PanelLeft className="h-4 w-4" />
              </Button>
            ) : null}
            <div className="min-w-0 flex-1">
              <Breadcrumbs project={project} />
            </div>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setLocation("/documentation")}
            data-testid="button-back-to-docs"
            className="flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4 mr-1" />
            <span className="hidden sm:inline">Back</span>
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 md:p-6">
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="text-center py-6">
              <FileText className="w-12 h-12 mx-auto text-muted-foreground/20 mb-4" />
              <h3 className="text-lg font-medium text-muted-foreground mb-2" data-testid="text-select-page-prompt">
                Select a page to get started
              </h3>
              <p className="text-muted-foreground/60 text-sm max-w-sm mx-auto">
                Choose a page from the sidebar or create a new one to begin documenting your project.
              </p>
              {project.description && (
                <div className="mt-4 pt-4 border-t border-border max-w-md mx-auto">
                  <p className="text-sm text-muted-foreground" data-testid="text-project-description">
                    {project.description}
                  </p>
                </div>
              )}
            </div>

            <Card data-testid="card-project-notes">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  Notes
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col h-[400px]">
                <div 
                  ref={notesContainerRef}
                  className="flex-1 overflow-y-auto custom-scrollbar space-y-3 mb-4"
                >
                  {notesLoading ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Loading notes...</p>
                  ) : notes.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No notes yet. Add the first note below.</p>
                  ) : (
                    notes.map((note) => {
                      const isCurrentUser = currentUser?.id === note.createdById;
                      return (
                        <div
                          key={note.id}
                          className={`flex gap-2 ${isCurrentUser ? "flex-row-reverse" : "flex-row"}`}
                          data-testid={`note-${note.id}`}
                        >
                          <Avatar className="w-8 h-8 flex-shrink-0">
                            <AvatarImage src={note.createdBy?.profileImageUrl || undefined} />
                            <AvatarFallback className="text-xs">
                              {note.createdBy?.firstName?.[0] || note.createdBy?.email?.[0] || "?"}
                            </AvatarFallback>
                          </Avatar>
                          <div className={`flex-1 max-w-[80%] ${isCurrentUser ? "text-right" : "text-left"}`}>
                            <div className={`inline-block rounded-lg px-3 py-2 ${isCurrentUser ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                              {editingNoteId === note.id ? (
                                <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                                  <Textarea
                                    value={editingNoteContent}
                                    onChange={(e) => setEditingNoteContent(e.target.value)}
                                    className="min-h-[60px] text-sm bg-background text-foreground"
                                    data-testid="textarea-edit-note"
                                  />
                                  <div className="flex gap-1 justify-end">
                                    <Button size="sm" variant="ghost" onClick={handleCancelEditNote} className="h-7 px-2" data-testid="button-cancel-edit-note">
                                      <X className="w-3 h-3" />
                                    </Button>
                                    <Button size="sm" onClick={handleSaveEditNote} className="h-7 px-2" data-testid="button-save-edit-note">
                                      Save
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-sm whitespace-pre-wrap">{renderNoteContent(note.content)}</p>
                              )}
                            </div>
                            <div className={`flex items-center gap-2 mt-1 text-xs text-muted-foreground ${isCurrentUser ? "justify-end" : "justify-start"}`}>
                              <span>{note.createdBy?.firstName || note.createdBy?.email?.split("@")[0] || "Unknown"}</span>
                              <span>{note.createdAt ? format(new Date(note.createdAt), "MMM d, h:mm a") : ""}</span>
                              {isCurrentUser && editingNoteId !== note.id && (
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5"
                                    onClick={() => handleStartEditNote(note)}
                                    data-testid={`button-edit-note-${note.id}`}
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 text-destructive"
                                    onClick={() => deleteNoteMutation.mutate(note.id)}
                                    data-testid={`button-delete-note-${note.id}`}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <div className="border-t pt-3">
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <NoteInput
                        value={newNoteContent}
                        onChange={setNewNoteContent}
                        users={users}
                        mentionedUserIds={newNoteMentions}
                        onMentionAdd={(userId) => setNewNoteMentions(prev => [...prev, userId])}
                        onSubmit={handleAddNote}
                        placeholder="Type a message... (@ to mention)"
                        testId="textarea-new-note"
                      />
                    </div>
                    <Button
                      size="icon"
                      onClick={handleAddNote}
                      disabled={!newNoteContent.trim() || createNoteMutation.isPending}
                      data-testid="button-add-note"
                      className="rounded-full h-9 w-9"
                    >
                      <Send className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
