import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format, addDays, differenceInHours, differenceInDays } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  ArrowLeft,
  User,
  Briefcase,
  Mail,
  Phone,
  CalendarDays,
  MessageSquare,
  ExternalLink,
  Pencil,
  Trash2,
  UserPlus,
  FileText,
  Save,
  Clock,
  CheckCircle,
  Plus,
  StickyNote,
  X,
  Send,
  History,
  Mic,
  Play,
  Pause,
  Loader2,
  ChevronDown,
  ChevronUp,
  Tag,
  Paperclip,
  Image as ImageIcon,
  Video,
  Music,
  File,
  Download,
  Copy
} from "lucide-react";
import { AudioRecorder } from "@/components/editor/AudioRecorder";
import { NoteAudioPlayer } from "@/components/NoteAudioPlayer";
import type { NoteAttachment } from "@/components/NoteInput";
import { Link } from "wouter";
import type { 
  CrmProjectWithDetails, 
  CrmClient, 
  CrmContact, 
  SafeUser,
  CrmProjectStatus,
  CrmProjectType,
  CrmProjectNoteWithCreator,
  CrmProjectStageHistoryWithUser,
  CrmModuleField
} from "@shared/schema";
import { NoteInput } from "@/components/NoteInput";
import { CrmTagSelector } from "@/components/CrmTagSelector";
import type { CrmTag } from "@shared/schema";

// Helper to parse field options from database format
interface ParsedOption {
  value: string;
  label: string;
  color: string;
}

function parseFieldOptions(options: string[] | null): ParsedOption[] {
  if (!options || options.length === 0) return [];
  return options.map(opt => {
    try {
      const parsed = JSON.parse(opt);
      if (parsed && typeof parsed === 'object' && parsed.label) {
        const value = parsed.label.toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '');
        return { value, label: parsed.label, color: parsed.color || "#64748b" };
      }
    } catch {
      // Legacy format: just a string
    }
    const value = opt.toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '');
    return { value, label: opt, color: "#64748b" };
  });
}

// Fallback static config (used if API hasn't loaded yet)
const fallbackStatusConfig: Record<string, { label: string; color: string }> = {
  lead: { label: "Lead", color: "#64748b" },
  discovering_call_completed: { label: "Discovery Call Completed", color: "#8b5cf6" },
  proposal_sent: { label: "Proposal Sent", color: "#f59e0b" },
  follow_up: { label: "Follow Up", color: "#06b6d4" },
  in_negotiation: { label: "In Negotiation", color: "#3b82f6" },
  won: { label: "Won", color: "#22c55e" },
  won_not_started: { label: "Won - Not Started", color: "#10b981" },
  won_in_progress: { label: "Won - In Progress", color: "#14b8a6" },
  won_in_review: { label: "Won - In Review", color: "#0ea5e9" },
  won_completed: { label: "Won - Completed", color: "#84cc16" },
  lost: { label: "Lost", color: "#ef4444" },
  won_cancelled: { label: "Won-Cancelled", color: "#f43f5e" },
};

// Fallback project type config
const fallbackProjectTypeConfig: Record<string, { label: string; color: string; description: string }> = {
  one_time: { label: "One-Time Project", color: "#3b82f6", description: "1 week duration" },
  monthly: { label: "Monthly Project", color: "#8b5cf6", description: "1 month duration" },
  hourly_budget: { label: "Hourly Budget", color: "#f59e0b", description: "Based on budgeted hours" },
  internal: { label: "Internal", color: "#64748b", description: "Internal project" },
};

export default function CrmProjectPage() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [, params] = useRoute("/crm/project/:id");
  const [, setLocation] = useLocation();
  const projectId = params?.id;

  const [formData, setFormData] = useState<{
    name: string;
    status: CrmProjectStatus;
    projectType: CrmProjectType;
    clientId: string | null;
    assigneeId: string | null;
    startDate: Date | null;
    dueDate: Date | null;
    actualFinishDate: Date | null;
    comments: string;
    documentationEnabled: boolean;
    budgetedHours: number | null;
    actualHours: number | null;
    description: string;
  } | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAddContactDialog, setShowAddContactDialog] = useState(false);
  const [editingClient, setEditingClient] = useState<CrmClient | null>(null);
  
  const isAdmin = currentUser?.role === "admin";

  const { data: project, isLoading } = useQuery<CrmProjectWithDetails>({
    queryKey: ["/api/crm/projects", projectId],
    queryFn: async () => {
      const res = await fetch(`/api/crm/projects/${projectId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch project");
      return res.json();
    },
    enabled: !!projectId,
  });

  const { data: clients = [] } = useQuery<CrmClient[]>({
    queryKey: ["/api/crm/clients"],
  });

  const { data: users = [] } = useQuery<SafeUser[]>({
    queryKey: ["/api/users"],
  });

  const { data: projectTags = [] } = useQuery<CrmTag[]>({
    queryKey: ["/api/crm/projects", projectId, "tags"],
    enabled: !!projectId,
  });

  // Fetch project module fields for dynamic status options
  const { data: projectFields = [] } = useQuery<CrmModuleField[]>({
    queryKey: ["/api/modules/projects/fields"],
  });

  // Parse status options from database
  const { statusOptions, statusConfig } = useMemo(() => {
    const statusField = projectFields.find(f => f.slug === "status");
    if (statusField && statusField.options && statusField.options.length > 0) {
      const parsed = parseFieldOptions(statusField.options);
      const config: Record<string, { label: string; color: string }> = {};
      const options: string[] = [];
      parsed.forEach(opt => {
        config[opt.value] = { label: opt.label, color: opt.color };
        options.push(opt.value);
      });
      return { statusOptions: options, statusConfig: config };
    }
    // Fallback to static config
    return { 
      statusOptions: Object.keys(fallbackStatusConfig), 
      statusConfig: fallbackStatusConfig 
    };
  }, [projectFields]);

  // Parse project type options from database
  const { projectTypeOptions, projectTypeConfig } = useMemo(() => {
    const typeField = projectFields.find(f => f.slug === "project_type");
    if (typeField && typeField.options && typeField.options.length > 0) {
      const parsed = parseFieldOptions(typeField.options);
      const config: Record<string, { label: string; color: string; description: string }> = {};
      const options: string[] = [];
      parsed.forEach(opt => {
        config[opt.value] = { label: opt.label, color: opt.color, description: "" };
        options.push(opt.value);
      });
      return { projectTypeOptions: options, projectTypeConfig: config };
    }
    // Fallback to static config
    return { 
      projectTypeOptions: Object.keys(fallbackProjectTypeConfig), 
      projectTypeConfig: fallbackProjectTypeConfig 
    };
  }, [projectFields]);

  useEffect(() => {
    if (project) {
      const startDate = project.startDate ? new Date(project.startDate) : null;
      const dueDate = project.dueDate 
        ? new Date(project.dueDate) 
        : (startDate ? addDays(startDate, 7) : null);
      
      setFormData({
        name: project.project?.name || "",
        status: project.status as CrmProjectStatus,
        projectType: (project.projectType as CrmProjectType) || "one_time",
        clientId: project.clientId,
        assigneeId: project.assigneeId,
        startDate,
        dueDate,
        actualFinishDate: project.actualFinishDate ? new Date(project.actualFinishDate) : null,
        comments: project.comments || "",
        documentationEnabled: project.documentationEnabled === 1,
        budgetedHours: project.budgetedHours ?? null,
        actualHours: project.actualHours ?? null,
        description: project.project?.description || "",
      });
      setHasChanges(startDate !== null && project.dueDate === null);
    }
  }, [project]);

  const updateFormField = <K extends keyof NonNullable<typeof formData>>(
    field: K, 
    value: NonNullable<typeof formData>[K]
  ) => {
    if (!formData) return;
    setFormData({ ...formData, [field]: value });
    setHasChanges(true);
  };

  // Calculate due date based on project type
  const hoursPerDay = currentUser?.hoursPerDay || 8;
  const calculateDueDateForType = (type: CrmProjectType, startDate: Date | null, budgetedHours: number | null): Date | null => {
    if (!startDate) return null;
    
    switch (type) {
      case "one_time":
        return addDays(startDate, 7);
      case "monthly":
        return addDays(startDate, 30);
      case "hourly_budget":
        if (budgetedHours) {
          return addDays(startDate, Math.ceil(budgetedHours / hoursPerDay));
        }
        return null;
      case "internal":
        return null; // Internal projects have no fixed duration
      default:
        return null;
    }
  };

  // Update project type and recalculate due date
  const handleProjectTypeChange = (newType: CrmProjectType) => {
    if (!formData) return;
    const newDueDate = calculateDueDateForType(newType, formData.startDate, formData.budgetedHours);
    setFormData({ 
      ...formData, 
      projectType: newType,
      dueDate: newDueDate
    });
    setHasChanges(true);
  };

  // Update budgeted hours and recalculate due date for hourly_budget type
  const handleBudgetedHoursChange = (hours: number | null) => {
    if (!formData) return;
    const newDueDate = formData.projectType === "hourly_budget" && formData.startDate
      ? calculateDueDateForType("hourly_budget", formData.startDate, hours)
      : formData.dueDate;
    setFormData({ 
      ...formData, 
      budgetedHours: hours,
      dueDate: newDueDate
    });
    setHasChanges(true);
  };

  const updateCrmProjectMutation = useMutation({
    mutationFn: async (data: Partial<CrmProjectWithDetails>) => {
      return apiRequest("PATCH", `/api/crm/projects/${projectId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects/all-kanban"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", projectId, "stage-history"] });
      setHasChanges(false);
      setIsEditing(false);
      toast({ title: "Project updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update project", variant: "destructive" });
    },
  });

  const toggleDocumentationMutation = useMutation({
    mutationFn: async ({ enabled }: { enabled: boolean }) => {
      return apiRequest("PATCH", `/api/crm/projects/${projectId}/documentation`, { enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects/documentable"] });
      toast({ title: "Documentation setting updated" });
    },
    onError: () => {
      toast({ title: "Failed to update documentation setting", variant: "destructive" });
    },
  });

  const updateClientMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CrmClient> }) => {
      return apiRequest("PATCH", `/api/crm/clients/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", projectId] });
      setEditingClient(null);
      toast({ title: "Client updated" });
    },
    onError: () => {
      toast({ title: "Failed to update client", variant: "destructive" });
    },
  });

  const createContactMutation = useMutation({
    mutationFn: async ({ clientId, data }: { clientId: string; data: { name: string; email?: string | null; phone?: string | null; role?: string | null; isPrimary?: boolean } }) => {
      return apiRequest("POST", `/api/crm/clients/${clientId}/contacts`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", projectId] });
      setShowAddContactDialog(false);
      toast({ title: "Contact added" });
    },
    onError: () => {
      toast({ title: "Failed to add contact", variant: "destructive" });
    },
  });

  // Notes state and queries
  const [newNoteContent, setNewNoteContent] = useState("");
  const [newNoteMentions, setNewNoteMentions] = useState<string[]>([]);
  const [newNoteAttachments, setNewNoteAttachments] = useState<NoteAttachment[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState<{id: string; filename: string; filetype: string; progress: number; previewUrl?: string}[]>([]);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editNoteContent, setEditNoteContent] = useState("");
  const [editNoteMentions, setEditNoteMentions] = useState<string[]>([]);
  // Audio recording state for notes
  const [isRecordingNote, setIsRecordingNote] = useState(false);
  const [isUploadingAudioNote, setIsUploadingAudioNote] = useState(false);

  const { data: notes = [], isLoading: notesLoading } = useQuery<CrmProjectNoteWithCreator[]>({
    queryKey: ["/api/crm/projects", projectId, "notes"],
    queryFn: async () => {
      const res = await fetch(`/api/crm/projects/${projectId}/notes`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch notes");
      return res.json();
    },
    enabled: !!projectId,
  });

  const { data: stageHistory = [], isLoading: stageHistoryLoading } = useQuery<CrmProjectStageHistoryWithUser[]>({
    queryKey: ["/api/crm/projects", projectId, "stage-history"],
    queryFn: async () => {
      const res = await fetch(`/api/crm/projects/${projectId}/stage-history`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch stage history");
      return res.json();
    },
    enabled: !!projectId,
  });

  const createNoteMutation = useMutation({
    mutationFn: async (data: { content: string; mentionedUserIds?: string[]; audioUrl?: string; audioRecordingId?: string; transcriptStatus?: string; attachments?: NoteAttachment[] }) => {
      return apiRequest("POST", `/api/crm/projects/${projectId}/notes`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", projectId, "notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", projectId] });
      setNewNoteContent("");
      setNewNoteMentions([]);
      setNewNoteAttachments([]);
    },
    onError: () => {
      toast({ title: "Failed to add note", variant: "destructive" });
    },
  });

  const updateNoteMutation = useMutation({
    mutationFn: async ({ noteId, data }: { noteId: string; data: { content: string; mentionedUserIds?: string[] } }) => {
      return apiRequest("PATCH", `/api/crm/projects/${projectId}/notes/${noteId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", projectId, "notes"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", projectId] });
      setEditingNoteId(null);
      setEditNoteContent("");
      setEditNoteMentions([]);
    },
    onError: () => {
      toast({ title: "Failed to update note", variant: "destructive" });
    },
  });

  const deleteNoteMutation = useMutation({
    mutationFn: async (noteId: string) => {
      return apiRequest("DELETE", `/api/crm/projects/${projectId}/notes/${noteId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", projectId, "notes"] });
      toast({ title: "Note deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete note", variant: "destructive" });
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("DELETE", `/api/crm/projects/${projectId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects/all-kanban"] });
      toast({ title: "Project deleted successfully" });
      setLocation("/crm?tab=projects");
    },
    onError: () => {
      toast({ title: "Failed to delete project", variant: "destructive" });
    },
  });

  const cloneProjectMutation = useMutation({
    mutationFn: async () => {
      const data = await apiRequest("POST", `/api/crm/projects/${projectId}/clone`);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects/all-kanban"] });
      toast({ title: "Project cloned successfully" });
      setLocation(`/crm/project/${data.crmProject.id}`);
    },
    onError: () => {
      toast({ title: "Failed to clone project", variant: "destructive" });
    },
  });

  const startEditing = () => {
    setIsEditing(true);
  };

  const cancelEditing = () => {
    if (project) {
      const startDate = project.startDate ? new Date(project.startDate) : null;
      const dueDate = project.dueDate 
        ? new Date(project.dueDate) 
        : (startDate ? addDays(startDate, 7) : null);
      
      setFormData({
        name: project.project?.name || "",
        status: project.status as CrmProjectStatus,
        projectType: (project.projectType as CrmProjectType) || "one_time",
        clientId: project.clientId,
        assigneeId: project.assigneeId,
        startDate,
        dueDate,
        actualFinishDate: project.actualFinishDate ? new Date(project.actualFinishDate) : null,
        comments: project.comments || "",
        documentationEnabled: project.documentationEnabled === 1,
        budgetedHours: project.budgetedHours ?? null,
        actualHours: project.actualHours ?? null,
        description: project.project?.description || "",
      });
    }
    setIsEditing(false);
    setHasChanges(false);
  };

  const handleAddNote = () => {
    if (!newNoteContent.trim() && newNoteAttachments.length === 0) return;
    createNoteMutation.mutate({ 
      content: newNoteContent.trim() || (newNoteAttachments.length > 0 ? "File attachment" : ""),
      mentionedUserIds: newNoteMentions.length > 0 ? newNoteMentions : undefined,
      attachments: newNoteAttachments.length > 0 ? newNoteAttachments : undefined
    });
  };

  const handleUpdateNote = (noteId: string) => {
    if (!editNoteContent.trim()) return;
    updateNoteMutation.mutate({ 
      noteId, 
      data: { 
        content: editNoteContent.trim(),
        mentionedUserIds: editNoteMentions.length > 0 ? editNoteMentions : undefined
      } 
    });
  };

  const handleSave = () => {
    if (!formData) return;
    
    const updateData: Record<string, unknown> = {
      projectName: formData.name,
      status: formData.status,
      projectType: formData.projectType,
      clientId: formData.clientId,
      assigneeId: formData.assigneeId,
      startDate: formData.startDate?.toISOString() || null,
      dueDate: formData.dueDate?.toISOString() || null,
      actualFinishDate: formData.actualFinishDate?.toISOString() || null,
      comments: formData.comments || null,
      budgetedHours: formData.budgetedHours,
      actualHours: formData.actualHours,
      projectDescription: formData.description || null,
    };
    
    updateCrmProjectMutation.mutate(updateData as Partial<CrmProjectWithDetails>);
  };

  const handleDocumentationToggle = (enabled: boolean) => {
    updateFormField("documentationEnabled", enabled);
    toggleDocumentationMutation.mutate({ enabled });
  };

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 w-full">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-4 md:p-6 w-full">
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground">Project not found</p>
            <Button variant="outline" className="mt-4" onClick={() => setLocation("/crm")}>
              Back to Project Management
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const selectedClient = clients.find(c => c.id === formData?.clientId);
  const selectedAssignee = users.find(u => u.id === formData?.assigneeId);

  return (
    <div className="p-4 md:p-6 w-full space-y-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 md:gap-3">
            {isEditing ? (
              <Input
                value={formData?.name || ""}
                onChange={(e) => updateFormField("name", e.target.value)}
                className="text-xl md:text-2xl font-bold h-auto py-1"
                data-testid="input-project-title"
              />
            ) : (
              <h1 className="text-xl md:text-2xl font-bold break-words" data-testid="text-project-title">{project.project?.name}</h1>
            )}
            {formData?.status && (
              <Badge 
                style={{ backgroundColor: statusConfig[formData.status]?.color || "#64748b", color: "white" }}
                data-testid="badge-project-status"
              >
                {statusConfig[formData.status]?.label || formData.status}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Documentation Toggle and Button in Header */}
          <div className="flex items-center gap-2 mr-2">
            {formData?.documentationEnabled && (
              <Link href={`/project/${project.projectId}`}>
                <Button variant="outline" size="sm" data-testid="button-view-docs-header">
                  <FileText className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">View Documentation</span>
                </Button>
              </Link>
            )}
            <Switch
              checked={formData?.documentationEnabled || false}
              onCheckedChange={(checked) => handleDocumentationToggle(checked)}
              data-testid="switch-documentation"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setLocation("/crm?tab=projects")}
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          {isEditing ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={cancelEditing}
                data-testid="button-cancel-edit"
              >
                <X className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Cancel</span>
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={updateCrmProjectMutation.isPending}
                data-testid="button-save-edit"
              >
                <Save className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">{updateCrmProjectMutation.isPending ? "Saving..." : "Save"}</span>
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="icon"
                onClick={() => cloneProjectMutation.mutate()}
                disabled={cloneProjectMutation.isPending}
                data-testid="button-clone-project"
                title="Clone project"
              >
                {cloneProjectMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={startEditing}
                data-testid="button-edit-project"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="destructive"
                size="icon"
                onClick={() => setShowDeleteConfirm(true)}
                data-testid="button-delete-project"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Project Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isEditing ? (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Status</label>
                  <Select 
                    value={formData?.status || "lead"} 
                    onValueChange={(v) => updateFormField("status", v as CrmProjectStatus)}
                  >
                    <SelectTrigger data-testid="select-project-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map(status => (
                        <SelectItem key={status} value={status}>
                          <div className="flex items-center gap-2">
                            <Badge 
                              className="text-xs"
                              style={{ backgroundColor: statusConfig[status]?.color || "#64748b", color: "white" }}
                            >
                              {statusConfig[status]?.label || status}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Tags</label>
                  <CrmTagSelector 
                    crmProjectId={projectId!} 
                    projectTags={projectTags}
                    onTagsChange={() => queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", projectId, "tags"] })}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Project Type</label>
                  <Select 
                    value={formData?.projectType || "one_time"} 
                    onValueChange={(v) => handleProjectTypeChange(v as CrmProjectType)}
                  >
                    <SelectTrigger data-testid="select-project-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {projectTypeOptions.map(type => (
                        <SelectItem key={type} value={type}>
                          <div className="flex items-center gap-2">
                            <Badge 
                              className="text-xs"
                              style={{ backgroundColor: projectTypeConfig[type]?.color || "#64748b", color: "white" }}
                            >
                              {projectTypeConfig[type]?.label || type}
                            </Badge>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Assigned To</label>
                  <Select 
                    value={formData?.assigneeId || "_none"} 
                    onValueChange={(v) => updateFormField("assigneeId", v === "_none" ? null : v)}
                  >
                    <SelectTrigger data-testid="select-assignee">
                      <SelectValue placeholder="Select assignee" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">Unassigned</SelectItem>
                      {users.map(user => (
                        <SelectItem key={user.id} value={user.id}>
                          <div className="flex items-center gap-2">
                            <Avatar className="w-5 h-5">
                              <AvatarImage src={user.profileImageUrl || undefined} />
                              <AvatarFallback className="text-xs">
                                {user.firstName?.[0]}{user.lastName?.[0]}
                              </AvatarFallback>
                            </Avatar>
                            {user.firstName} {user.lastName}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Client</label>
                  <Select 
                    value={formData?.clientId || "_none"} 
                    onValueChange={(v) => updateFormField("clientId", v === "_none" ? null : v)}
                  >
                    <SelectTrigger data-testid="select-client">
                      <SelectValue placeholder="Select client" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_none">No client</SelectItem>
                      {clients.map(client => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.name} {client.company ? `(${client.company})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Budgeted Hours</label>
                    <Input
                      type="number"
                      min="0"
                      value={formData?.budgetedHours ?? ""}
                      onChange={(e) => handleBudgetedHoursChange(e.target.value ? parseInt(e.target.value) : null)}
                      placeholder="0"
                      data-testid="input-budgeted-hours"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Actual Hours</label>
                    <Input
                      type="number"
                      min="0"
                      value={formData?.actualHours ?? ""}
                      onChange={(e) => updateFormField("actualHours", e.target.value ? parseInt(e.target.value) : null)}
                      placeholder="0"
                      data-testid="input-actual-hours"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Description</label>
                  <Textarea
                    value={formData?.description || ""}
                    onChange={(e) => updateFormField("description", e.target.value)}
                    placeholder="Enter project description..."
                    rows={3}
                    data-testid="textarea-project-description"
                  />
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium">Comments</label>
                  <Textarea
                    value={formData?.comments || ""}
                    onChange={(e) => updateFormField("comments", e.target.value)}
                    placeholder="Add notes about this project..."
                    className="min-h-[100px]"
                    data-testid="textarea-comments"
                  />
                </div>
              </>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Assigned To:</span>
                  {selectedAssignee ? (
                    <div className="flex items-center gap-2">
                      <Avatar className="w-6 h-6">
                        <AvatarImage src={selectedAssignee.profileImageUrl || undefined} />
                        <AvatarFallback className="text-xs">
                          {selectedAssignee.firstName?.[0]}{selectedAssignee.lastName?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{selectedAssignee.firstName} {selectedAssignee.lastName}</span>
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">Unassigned</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Client:</span>
                  {selectedClient ? (
                    <Link href={`/crm/client/${selectedClient.id}`}>
                      <span className="text-sm text-primary hover:underline">
                        {selectedClient.name} {selectedClient.company ? `(${selectedClient.company})` : ""}
                      </span>
                    </Link>
                  ) : (
                    <span className="text-sm text-muted-foreground">No client</span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Hours:</span>
                  <span className="text-sm">
                    {formData?.actualHours ?? 0} / {formData?.budgetedHours ?? 0} hours
                    {formData?.budgetedHours && formData.budgetedHours > 0 && (
                      <span className="text-muted-foreground ml-1">
                        ({Math.round(((formData?.actualHours || 0) / formData.budgetedHours) * 100)}%)
                      </span>
                    )}
                  </span>
                  {formData?.budgetedHours && formData?.actualHours && formData.actualHours > formData.budgetedHours && (
                    <Badge variant="destructive" className="text-xs">Over Budget</Badge>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Briefcase className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Project Type:</span>
                  <Badge 
                    className="text-xs" 
                    style={{ 
                      backgroundColor: formData?.projectType ? projectTypeConfig[formData.projectType]?.color || "#64748b" : "#64748b", 
                      color: "white" 
                    }}
                    data-testid="badge-project-type"
                  >
                    {formData?.projectType ? projectTypeConfig[formData.projectType]?.label || formData.projectType : "One-Time Project"}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Tag className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Tags:</span>
                  </div>
                  <CrmTagSelector 
                    crmProjectId={projectId!} 
                    projectTags={projectTags}
                    onTagsChange={() => queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", projectId, "tags"] })}
                  />
                </div>

                {formData?.description && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Description:</span>
                    </div>
                    <p className="text-sm text-muted-foreground pl-6 break-all" data-testid="text-project-description">{formData.description}</p>
                  </div>
                )}

                {formData?.comments && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Comments:</span>
                    </div>
                    <p className="text-sm text-muted-foreground pl-6 whitespace-pre-wrap break-all" data-testid="text-project-comments">{formData.comments}</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5" />
              Timeline
            </CardTitle>
            {formData?.dueDate && !formData?.actualFinishDate && (
              <div className="mt-2">
                {(() => {
                  const now = new Date();
                  const dueDate = new Date(formData.dueDate);
                  const hoursLate = differenceInHours(now, dueDate);
                  const daysLate = differenceInDays(now, dueDate);
                  
                  if (hoursLate > 0) {
                    return (
                      <Badge variant="destructive" className="text-xs">
                        <Clock className="w-3 h-3 mr-1" />
                        Late by {daysLate > 0 ? `${daysLate} day${daysLate > 1 ? 's' : ''}` : `${hoursLate} hour${hoursLate > 1 ? 's' : ''}`}
                      </Badge>
                    );
                  } else {
                    return (
                      <Badge variant="default" className="text-xs bg-green-600">
                        <CheckCircle className="w-3 h-3 mr-1" />
                        On time
                      </Badge>
                    );
                  }
                })()}
              </div>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {isEditing ? (
              <>
                <DatePickerField
                  label="Start Date"
                  value={formData?.startDate || undefined}
                  onChange={(date) => {
                    if (!formData) return;
                    const startDate = date || null;
                    const dueDate = date ? addDays(date, 7) : null;
                    setFormData({ ...formData, startDate, dueDate });
                    setHasChanges(true);
                  }}
                  testId="datepicker-start"
                />
                {isAdmin ? (
                  <DatePickerField
                    label="Due Date"
                    value={formData?.dueDate || undefined}
                    onChange={(date) => updateFormField("dueDate", date || null)}
                    testId="datepicker-due-date"
                  />
                ) : (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Due Date</label>
                    <div 
                      className="w-full flex items-center justify-start px-3 py-2 text-left font-normal border rounded-md bg-muted"
                      data-testid="display-due-date"
                    >
                      <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />
                      {formData?.dueDate ? (
                        <span>{format(formData.dueDate, "PPP")}</span>
                      ) : (
                        <span className="text-muted-foreground italic">Set a start date first</span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">Automatically set to 7 days after start date</p>
                  </div>
                )}
                
                {formData?.startDate && formData?.budgetedHours && formData.budgetedHours > 0 && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Estimated End Date</label>
                    <div 
                      className="w-full flex items-center justify-start px-3 py-2 text-left font-normal border rounded-md bg-muted"
                      data-testid="display-estimated-end-date"
                    >
                      <CalendarDays className="mr-2 h-4 w-4 text-muted-foreground" />
                      <span>{format(addDays(new Date(formData.startDate), Math.ceil(formData.budgetedHours / (currentUser?.hoursPerDay || 8))), "PPP")}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Based on {formData.budgetedHours} budgeted hours at {currentUser?.hoursPerDay || 8}h/day</p>
                  </div>
                )}
                
                <DatePickerField
                  label="Actual Finish Date"
                  value={formData?.actualFinishDate || undefined}
                  onChange={(date) => updateFormField("actualFinishDate", date || null)}
                  testId="datepicker-finish"
                />
              </>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Start Date:</span>
                  <span className="text-sm">
                    {formData?.startDate ? format(formData.startDate, "PPP") : <span className="text-muted-foreground">Not set</span>}
                  </span>
                </div>
                
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Due Date:</span>
                  <span className="text-sm">
                    {formData?.dueDate ? format(formData.dueDate, "PPP") : <span className="text-muted-foreground">Not set</span>}
                  </span>
                </div>
                
                {formData?.startDate && formData?.budgetedHours && formData.budgetedHours > 0 && (
                  <div className="flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Estimated End:</span>
                    <span className="text-sm">
                      {format(addDays(new Date(formData.startDate), Math.ceil(formData.budgetedHours / (currentUser?.hoursPerDay || 8))), "PPP")}
                    </span>
                  </div>
                )}
                
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Actual Finish:</span>
                  <span className="text-sm">
                    {formData?.actualFinishDate ? format(formData.actualFinishDate, "PPP") : <span className="text-muted-foreground">Not completed</span>}
                  </span>
                </div>
              </div>
            )}
            
            {formData?.dueDate && formData?.actualFinishDate && (
              <div className="pt-2">
                {new Date(formData.actualFinishDate) <= new Date(formData.dueDate) ? (
                  <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                    <CheckCircle className="w-4 h-4" />
                    <span className="text-sm">Completed on time</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-destructive">
                    <Clock className="w-4 h-4" />
                    <span className="text-sm">Completed after due date</span>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Project Notes Section - Chat Style */}
      <Card className="flex flex-col">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5" />
            Notes
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col flex-1 p-0">
          {/* Chat Messages Area */}
          <div className="flex-1 space-y-4 max-h-80 overflow-y-auto p-4 border-b">
            {notesLoading ? (
              <p className="text-sm text-muted-foreground text-center py-4">Loading notes...</p>
            ) : notes.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No messages yet. Start the conversation below.</p>
            ) : (
              notes.map((note) => {
                const isCurrentUser = note.createdBy?.id === currentUser?.id;
                return (
                  <div 
                    key={note.id} 
                    className={`flex gap-2 group ${isCurrentUser ? 'flex-row-reverse' : ''}`}
                    data-testid={`note-${note.id}`}
                  >
                    <Avatar className="w-8 h-8 flex-shrink-0 border border-border">
                      <AvatarImage src={note.createdBy?.profileImageUrl || undefined} />
                      <AvatarFallback className="text-xs bg-muted">
                        {note.createdBy?.firstName?.[0]}{note.createdBy?.lastName?.[0]}
                      </AvatarFallback>
                    </Avatar>
                    <div className={`flex-1 max-w-[80%] ${isCurrentUser ? 'items-end' : 'items-start'}`}>
                      {editingNoteId === note.id ? (
                        <div className="space-y-2">
                          <NoteInput
                            value={editNoteContent}
                            onChange={setEditNoteContent}
                            users={users}
                            mentionedUserIds={editNoteMentions}
                            onMentionAdd={(userId) => setEditNoteMentions(prev => [...prev, userId])}
                            testId="textarea-edit-note"
                            autoFocus
                          />
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditingNoteId(null);
                                setEditNoteContent("");
                                setEditNoteMentions([]);
                              }}
                            >
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleUpdateNote(note.id)}
                              disabled={!editNoteContent.trim() || updateNoteMutation.isPending}
                              data-testid="button-save-note"
                            >
                              {updateNoteMutation.isPending ? "Saving..." : "Save"}
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className={`flex flex-col ${isCurrentUser ? 'items-end' : 'items-start'}`}>
                          <span className="text-xs text-muted-foreground mb-1">
                            {note.createdBy?.firstName} {note.createdBy?.lastName}
                          </span>
                          <div 
                            className={`relative rounded-2xl px-4 py-2 ${
                              isCurrentUser 
                                ? 'bg-primary text-primary-foreground rounded-br-md' 
                                : 'bg-muted rounded-bl-md'
                            }`}
                          >
                            {note.audioUrl ? (
                              <NoteAudioPlayer
                                audioUrl={note.audioUrl}
                                audioRecordingId={note.audioRecordingId || undefined}
                                transcriptStatus={note.transcriptStatus || undefined}
                                audioTranscript={note.audioTranscript || undefined}
                                isCurrentUser={isCurrentUser}
                              />
                            ) : (
                              <>
                                {note.content && note.content !== "File attachment" && (
                                  <p className="text-sm whitespace-pre-wrap">
                                    {note.content.split(/(@[\w-]+(?:\s+[\w-]+)?)/g).map((part, i) => 
                                      part.startsWith('@') ? (
                                        <span key={i} className={`font-semibold ${isCurrentUser ? 'text-primary-foreground/90' : 'text-primary'}`}>{part}</span>
                                      ) : (
                                        <span key={i}>{part}</span>
                                      )
                                    )}
                                  </p>
                                )}
                                {note.attachments && (() => {
                                  try {
                                    const attachments: NoteAttachment[] = JSON.parse(note.attachments);
                                    if (attachments.length === 0) return null;
                                    
                                    const formatFileSize = (bytes: number) => {
                                      if (bytes < 1024) return bytes + " B";
                                      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
                                      return (bytes / (1024 * 1024)).toFixed(1) + " MB";
                                    };
                                    
                                    const getFileIcon = (filetype: string) => {
                                      if (filetype.startsWith("image/")) return <ImageIcon className="w-4 h-4" />;
                                      if (filetype.startsWith("video/")) return <Video className="w-4 h-4" />;
                                      if (filetype.startsWith("audio/")) return <Music className="w-4 h-4" />;
                                      if (filetype.includes("pdf") || filetype.includes("document") || filetype.includes("word")) {
                                        return <FileText className="w-4 h-4" />;
                                      }
                                      return <File className="w-4 h-4" />;
                                    };
                                    
                                    return (
                                      <div className={`flex flex-col gap-2 ${note.content && note.content !== "File attachment" ? 'mt-2 pt-2 border-t border-border/30' : ''}`}>
                                        {attachments.map((att, idx) => (
                                          <a
                                            key={idx}
                                            href={att.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={`flex items-center gap-2 p-2 rounded-lg text-sm transition-colors ${
                                              isCurrentUser 
                                                ? 'bg-primary-foreground/10 hover:bg-primary-foreground/20' 
                                                : 'bg-background/50 hover:bg-background/80'
                                            }`}
                                            data-testid={`attachment-link-${idx}`}
                                          >
                                            {att.filetype.startsWith("image/") ? (
                                              <img 
                                                src={att.url} 
                                                alt={att.filename} 
                                                className="w-16 h-16 object-cover rounded"
                                              />
                                            ) : (
                                              getFileIcon(att.filetype)
                                            )}
                                            <div className="flex-1 min-w-0">
                                              <div className="truncate font-medium">{att.filename}</div>
                                              <div className={`text-xs ${isCurrentUser ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                                                {formatFileSize(att.filesize)}
                                              </div>
                                            </div>
                                            <Download className="w-4 h-4 flex-shrink-0" />
                                          </a>
                                        ))}
                                      </div>
                                    );
                                  } catch {
                                    return null;
                                  }
                                })()}
                              </>
                            )}
                            <div className={`absolute top-1 ${isCurrentUser ? '-left-14' : '-right-14'} flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity`}>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={() => {
                                  setEditingNoteId(note.id);
                                  setEditNoteContent(note.content);
                                  setEditNoteMentions(note.mentionedUserIds || []);
                                }}
                                data-testid={`button-edit-note-${note.id}`}
                              >
                                <Pencil className="w-3 h-3" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                onClick={() => deleteNoteMutation.mutate(note.id)}
                                data-testid={`button-delete-note-${note.id}`}
                              >
                                <Trash2 className="w-3 h-3 text-destructive" />
                              </Button>
                            </div>
                          </div>
                          <span className="text-xs text-muted-foreground mt-1">
                            {note.createdAt ? format(new Date(note.createdAt), "MMM d 'at' h:mm a") : ""}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          
          {/* Chat Input Area */}
          <div className="p-4 bg-muted/30">
            {isRecordingNote ? (
              <AudioRecorder
                isUploading={isUploadingAudioNote}
                onCancel={() => setIsRecordingNote(false)}
                onRecordingComplete={async (audioBlob) => {
                  setIsUploadingAudioNote(true);
                  try {
                    const uploadUrlRes = await fetch("/api/objects/upload", {
                      method: "POST",
                      credentials: "include",
                    });
                    if (!uploadUrlRes.ok) throw new Error("Failed to get upload URL");
                    const { uploadURL } = await uploadUrlRes.json();

                    const uploadRes = await fetch(uploadURL, {
                      method: "PUT",
                      body: audioBlob,
                      headers: { "Content-Type": "audio/webm" },
                    });
                    if (!uploadRes.ok) throw new Error("Failed to upload audio");

                    const audioRes = await fetch("/api/audio/upload", {
                      method: "POST",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ audioUrl: uploadURL.split("?")[0] }),
                    });
                    if (!audioRes.ok) throw new Error("Failed to save audio");
                    const audioData = await audioRes.json();

                    // Create note with audio
                    createNoteMutation.mutate({
                      content: "🎤 Voice message",
                      audioUrl: audioData.audioUrl,
                      audioRecordingId: audioData.id,
                      transcriptStatus: "processing",
                    });

                    setIsRecordingNote(false);
                  } catch (error) {
                    console.error("Error uploading audio:", error);
                    toast({ title: "Failed to upload audio", variant: "destructive" });
                  } finally {
                    setIsUploadingAudioNote(false);
                  }
                }}
              />
            ) : (
              <div className="flex flex-col gap-2">
                {/* Uploading files preview - WhatsApp style */}
                {uploadingFiles.length > 0 && (
                  <div className="flex flex-wrap gap-2 p-2 bg-muted/50 rounded-lg">
                    {uploadingFiles.map((file) => (
                      <div 
                        key={file.id} 
                        className="relative w-16 h-16 rounded-lg overflow-hidden bg-muted border border-border"
                        data-testid={`uploading-file-${file.id}`}
                      >
                        {file.previewUrl ? (
                          <img src={file.previewUrl} alt={file.filename} className="w-full h-full object-cover opacity-60" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center opacity-60">
                            {file.filetype.startsWith("video/") ? <Video className="w-6 h-6" /> :
                             file.filetype.startsWith("audio/") ? <Music className="w-6 h-6" /> :
                             file.filetype.includes("pdf") ? <FileText className="w-6 h-6" /> :
                             <File className="w-6 h-6" />}
                          </div>
                        )}
                        {/* Circular progress overlay */}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <svg className="w-10 h-10 transform -rotate-90">
                            <circle
                              cx="20"
                              cy="20"
                              r="16"
                              fill="none"
                              stroke="rgba(255,255,255,0.3)"
                              strokeWidth="3"
                            />
                            <circle
                              cx="20"
                              cy="20"
                              r="16"
                              fill="none"
                              stroke="#22c55e"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeDasharray={`${2 * Math.PI * 16}`}
                              strokeDashoffset={`${2 * Math.PI * 16 * (1 - file.progress / 100)}`}
                              className="transition-all duration-200"
                            />
                          </svg>
                          <span className="absolute text-[10px] font-medium text-white">
                            {Math.round(file.progress)}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
                      attachments={newNoteAttachments}
                      onAttachmentsChange={setNewNoteAttachments}
                      showAttachButton={false}
                    />
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => document.getElementById('note-file-input')?.click()}
                    className="h-10 w-10 flex-shrink-0 rounded-full"
                    data-testid="button-attach-file"
                    disabled={uploadingFiles.length > 0}
                  >
                    <Paperclip className="w-5 h-5" />
                  </Button>
                  <input
                    id="note-file-input"
                    type="file"
                    multiple
                    className="hidden"
                    onChange={async (e) => {
                      const files = e.target.files;
                      if (!files || files.length === 0) return;
                      
                      for (const file of Array.from(files)) {
                        const fileId = `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
                        const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
                        
                        // Add to uploading files immediately
                        setUploadingFiles(prev => [...prev, {
                          id: fileId,
                          filename: file.name,
                          filetype: file.type || "application/octet-stream",
                          progress: 0,
                          previewUrl
                        }]);
                        
                        try {
                          const uploadUrlRes = await fetch("/api/objects/upload-public", {
                            method: "POST",
                            credentials: "include",
                          });
                          if (!uploadUrlRes.ok) throw new Error("Failed to get upload URL");
                          const { uploadURL } = await uploadUrlRes.json();
                          
                          // Use XMLHttpRequest for progress tracking
                          await new Promise<void>((resolve, reject) => {
                            const xhr = new XMLHttpRequest();
                            
                            xhr.upload.addEventListener("progress", (event) => {
                              if (event.lengthComputable) {
                                const progress = Math.round((event.loaded / event.total) * 100);
                                setUploadingFiles(prev => prev.map(f => 
                                  f.id === fileId ? { ...f, progress } : f
                                ));
                              }
                            });
                            
                            xhr.addEventListener("load", () => {
                              if (xhr.status >= 200 && xhr.status < 300) {
                                resolve();
                              } else {
                                reject(new Error("Upload failed"));
                              }
                            });
                            
                            xhr.addEventListener("error", () => reject(new Error("Upload failed")));
                            
                            xhr.open("PUT", uploadURL);
                            xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
                            xhr.send(file);
                          });
                          
                          const fileUrl = uploadURL.split("?")[0];
                          
                          // Remove from uploading, add to attachments
                          setUploadingFiles(prev => prev.filter(f => f.id !== fileId));
                          if (previewUrl) URL.revokeObjectURL(previewUrl);
                          
                          setNewNoteAttachments(prev => [...prev, {
                            url: fileUrl,
                            filename: file.name,
                            filesize: file.size,
                            filetype: file.type || "application/octet-stream",
                          }]);
                        } catch (error) {
                          console.error("Error uploading file:", error);
                          setUploadingFiles(prev => prev.filter(f => f.id !== fileId));
                          if (previewUrl) URL.revokeObjectURL(previewUrl);
                          toast({ title: "Failed to upload file", variant: "destructive" });
                        }
                      }
                      e.target.value = "";
                    }}
                    data-testid="input-note-file"
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setIsRecordingNote(true)}
                    className="h-10 w-10 flex-shrink-0 rounded-full"
                    data-testid="button-record-note"
                  >
                    <Mic className="w-5 h-5" />
                  </Button>
                  <Button
                    size="icon"
                    onClick={handleAddNote}
                    disabled={(!newNoteContent.trim() && newNoteAttachments.length === 0) || createNoteMutation.isPending || uploadingFiles.length > 0}
                    data-testid="button-add-note"
                    className="h-10 w-10 flex-shrink-0 rounded-full"
                  >
                    {createNoteMutation.isPending ? (
                      <div className="w-4 h-4 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Send className="w-5 h-5" />
                    )}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Stage History Section */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2">
            <History className="w-5 h-5" />
            Stage History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {stageHistoryLoading ? (
            <p className="text-sm text-muted-foreground text-center py-4">Loading history...</p>
          ) : stageHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No stage changes recorded yet.</p>
          ) : (
            <div className="space-y-3 max-h-60 overflow-y-auto">
              {stageHistory.map((record) => (
                <div 
                  key={record.id} 
                  className="flex items-start gap-3 p-3 bg-muted/50 rounded-md"
                  data-testid={`stage-history-${record.id}`}
                >
                  <Avatar className="w-8 h-8 flex-shrink-0 border border-border">
                    <AvatarImage src={record.changedBy?.profileImageUrl || undefined} />
                    <AvatarFallback className="text-xs bg-muted">
                      {record.changedBy?.firstName?.[0]}{record.changedBy?.lastName?.[0]}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">
                        {record.changedBy?.firstName} {record.changedBy?.lastName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {record.changedAt ? format(new Date(record.changedAt), "PPP 'at' p") : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {record.fromStatus && (
                        <>
                          <Badge 
                            className="text-xs"
                            style={{ backgroundColor: statusConfig[record.fromStatus]?.color || "#64748b", color: "white" }}
                          >
                            {statusConfig[record.fromStatus]?.label || record.fromStatus}
                          </Badge>
                          <span className="text-muted-foreground">→</span>
                        </>
                      )}
                      <Badge 
                        className="text-xs"
                        style={{ backgroundColor: statusConfig[record.toStatus]?.color || "#64748b", color: "white" }}
                      >
                        {statusConfig[record.toStatus]?.label || record.toStatus}
                      </Badge>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <EditClientDialog
        client={editingClient}
        onClose={() => setEditingClient(null)}
        onSubmit={(data) => {
          if (editingClient) {
            updateClientMutation.mutate({ id: editingClient.id, data });
          }
        }}
        isLoading={updateClientMutation.isPending}
      />

      <AddContactDialog
        open={showAddContactDialog}
        onClose={() => setShowAddContactDialog(false)}
        clientId={formData?.clientId || null}
        onSubmit={(clientId, data) => createContactMutation.mutate({ clientId, data })}
        isLoading={createContactMutation.isPending}
      />

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{project.project?.name}"? This action cannot be undone. All associated notes and documentation links will also be removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteProjectMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              {deleteProjectMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface DatePickerFieldProps {
  label: string;
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  testId: string;
}

function DatePickerField({ label, value, onChange, testId }: DatePickerFieldProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-start text-left font-normal"
            data-testid={testId}
          >
            <CalendarDays className="mr-2 h-4 w-4" />
            {value ? format(value, "PPP") : <span className="text-muted-foreground">Pick a date</span>}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            onSelect={(date) => {
              onChange(date);
              setOpen(false);
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

const clientFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  company: z.string().optional(),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  notes: z.string().optional(),
});

interface EditClientDialogProps {
  client: CrmClient | null;
  onClose: () => void;
  onSubmit: (data: Partial<CrmClient>) => void;
  isLoading: boolean;
}

function EditClientDialog({ client, onClose, onSubmit, isLoading }: EditClientDialogProps) {
  const form = useForm({
    resolver: zodResolver(clientFormSchema),
    defaultValues: { 
      name: client?.name || "", 
      company: client?.company || "", 
      email: client?.email || "",
      phone: client?.phone || "",
      notes: client?.notes || "" 
    },
  });

  useEffect(() => {
    if (client) {
      form.reset({
        name: client.name || "",
        company: client.company || "",
        email: client.email || "",
        phone: client.phone || "",
        notes: client.notes || "",
      });
    }
  }, [client, form]);

  const handleSubmit = (data: z.infer<typeof clientFormSchema>) => {
    onSubmit({
      name: data.name,
      company: data.company || null,
      email: data.email || null,
      phone: data.phone || null,
      notes: data.notes || null,
    });
  };

  if (!client) return null;

  return (
    <Dialog open={!!client} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Client</DialogTitle>
          <DialogDescription>Update client information</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Client name" data-testid="input-edit-client-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="company"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Company</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Company name (optional)" data-testid="input-edit-client-company" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input {...field} type="email" placeholder="client@example.com" data-testid="input-edit-client-email" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="+1 234 567 8900" data-testid="input-edit-client-phone" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="Additional notes (optional)" data-testid="textarea-edit-client-notes" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button type="button" variant="outline" onClick={onClose} className="w-full sm:w-auto">Cancel</Button>
              <Button type="submit" disabled={isLoading} className="w-full sm:w-auto" data-testid="button-update-client">
                {isLoading ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

const contactFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  phone: z.string().optional(),
  role: z.string().optional(),
  isPrimary: z.boolean().optional(),
});

interface AddContactDialogProps {
  open: boolean;
  onClose: () => void;
  clientId: string | null;
  onSubmit: (clientId: string, data: { name: string; email?: string | null; phone?: string | null; role?: string | null; isPrimary?: boolean }) => void;
  isLoading: boolean;
}

function AddContactDialog({ open, onClose, clientId, onSubmit, isLoading }: AddContactDialogProps) {
  const form = useForm({
    resolver: zodResolver(contactFormSchema),
    defaultValues: { name: "", email: "", phone: "", role: "", isPrimary: false },
  });

  const handleSubmit = (data: z.infer<typeof contactFormSchema>) => {
    if (!clientId) return;
    onSubmit(clientId, {
      name: data.name,
      email: data.email || null,
      phone: data.phone || null,
      role: data.role || null,
      isPrimary: data.isPrimary,
    });
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md">
        <DialogHeader>
          <DialogTitle>Add Contact</DialogTitle>
          <DialogDescription>Add a new contact for this client</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Contact name" data-testid="input-contact-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input {...field} type="email" placeholder="email@example.com" data-testid="input-contact-email" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="+1 234 567 8900" data-testid="input-contact-phone" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Role</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="e.g., Project Manager" data-testid="input-contact-role" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="flex-col sm:flex-row gap-2">
              <Button type="button" variant="outline" onClick={onClose} className="w-full sm:w-auto">Cancel</Button>
              <Button type="submit" disabled={isLoading || !clientId} className="w-full sm:w-auto" data-testid="button-submit-contact">
                {isLoading ? "Adding..." : "Add Contact"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
