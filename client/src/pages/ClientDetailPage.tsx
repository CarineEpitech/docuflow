import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Building2, Mail, Phone, FileText, FolderOpen, Trash2, ChevronLeft, ChevronRight, Link2, Plus, Pencil, X, Save, Globe, Users, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { useState, useEffect, useMemo } from "react";
import { phoneFormatConfig, phoneFormatOptions, formatPhoneNumber, formatPhoneAsYouType, type PhoneFormat } from "@/lib/phoneFormat";
import type { CrmModuleField } from "@shared/schema";

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

// Fallback configurations (used if API hasn't loaded yet)
const fallbackContactStatusConfig: Record<string, { label: string; color: string }> = {
  lead: { label: "Lead", color: "#64748b" },
  prospect: { label: "Prospect", color: "#8b5cf6" },
  client: { label: "Client", color: "#22c55e" },
  client_recurrent: { label: "Client Récurrent", color: "#14b8a6" },
};

const fallbackProjectStatusConfig: Record<string, { label: string; color: string }> = {
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
  won_cancelled: { label: "Won - Cancelled", color: "#f43f5e" },
};

const fallbackSourceConfig: Record<string, { label: string; color: string }> = {
  fiverr: { label: "Fiverr", color: "#1dbf73" },
  zoho: { label: "Zoho", color: "#e42527" },
  direct: { label: "Direct", color: "#3b82f6" },
};

interface CrmClient {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  phoneFormat: string | null;
  status: string | null;
  source: string | null;
  fiverrUsername: string | null;
  notes: string | null;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
}

interface CrmProjectWithDetails {
  id: string;
  projectId: string;
  clientId: string | null;
  status: string;
  assigneeId: string | null;
  documentationEnabled: number;
  createdAt: string;
  updatedAt: string;
  project: {
    id: string;
    name: string;
    description: string | null;
    ownerId: string;
  };
}

const PROJECTS_PER_PAGE = 10;

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showLinkProjectDialog, setShowLinkProjectDialog] = useState(false);
  const [showAddContactDialog, setShowAddContactDialog] = useState(false);
  const [selectedProjectToLink, setSelectedProjectToLink] = useState<string>("");
  const [projectsPage, setProjectsPage] = useState(1);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    company: "",
    phone: "",
    phoneFormat: "us",
    status: "lead",
    source: "",
    fiverrUsername: "",
    notes: "",
  });
  const [newContactForm, setNewContactForm] = useState({
    name: "",
    email: "",
    phone: "",
    phoneFormat: "us",
    status: "lead",
    source: "",
    notes: "",
  });

  const { data: client, isLoading: clientLoading } = useQuery<CrmClient>({
    queryKey: ["/api/crm/clients", id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/clients/${id}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch client");
      return res.json();
    },
    enabled: !!id,
  });

  const { data: allProjects = [] } = useQuery<CrmProjectWithDetails[]>({
    queryKey: ["/api/crm/projects/all"],
    queryFn: async () => {
      const res = await fetch("/api/crm/projects?pageSize=1000", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch projects");
      const data = await res.json();
      return data.data || [];
    },
  });

  const { data: allClients = [] } = useQuery<CrmClient[]>({
    queryKey: ["/api/crm/clients"],
    queryFn: async () => {
      const res = await fetch("/api/crm/clients?pageSize=1000", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch clients");
      const data = await res.json();
      return data.data || [];
    },
  });

  // Fetch module fields for dynamic options
  const { data: contactFields = [] } = useQuery<CrmModuleField[]>({
    queryKey: ["/api/modules/contacts/fields"],
  });

  const { data: projectFields = [] } = useQuery<CrmModuleField[]>({
    queryKey: ["/api/modules/projects/fields"],
  });

  // Parse contact status options from database
  const { contactStatusOptions, contactStatusConfig } = useMemo(() => {
    const statusField = contactFields.find(f => f.slug === "status");
    if (statusField && statusField.options && statusField.options.length > 0) {
      const parsed = parseFieldOptions(statusField.options);
      const config: Record<string, { label: string; color: string }> = {};
      const options: string[] = [];
      parsed.forEach(opt => {
        config[opt.value] = { label: opt.label, color: opt.color };
        options.push(opt.value);
      });
      return { contactStatusOptions: options, contactStatusConfig: config };
    }
    return { 
      contactStatusOptions: Object.keys(fallbackContactStatusConfig), 
      contactStatusConfig: fallbackContactStatusConfig 
    };
  }, [contactFields]);

  // Parse project status options from database
  const projectStatusConfig = useMemo(() => {
    const statusField = projectFields.find(f => f.slug === "status");
    if (statusField && statusField.options && statusField.options.length > 0) {
      const parsed = parseFieldOptions(statusField.options);
      const config: Record<string, { label: string; color: string }> = {};
      parsed.forEach(opt => {
        config[opt.value] = { label: opt.label, color: opt.color };
      });
      return config;
    }
    return fallbackProjectStatusConfig;
  }, [projectFields]);

  // Parse source options from database
  const { sourceOptions, sourceConfig } = useMemo(() => {
    const sourceField = contactFields.find(f => f.slug === "source");
    if (sourceField && sourceField.options && sourceField.options.length > 0) {
      const parsed = parseFieldOptions(sourceField.options);
      const config: Record<string, { label: string; color: string }> = {};
      const options: string[] = [];
      parsed.forEach(opt => {
        config[opt.value] = { label: opt.label, color: opt.color };
        options.push(opt.value);
      });
      return { sourceOptions: options, sourceConfig: config };
    }
    return { 
      sourceOptions: Object.keys(fallbackSourceConfig), 
      sourceConfig: fallbackSourceConfig 
    };
  }, [contactFields]);

  // Calculate prev/next client IDs for navigation
  const { prevClientId, nextClientId } = useMemo(() => {
    if (!id || allClients.length === 0) {
      return { prevClientId: null, nextClientId: null };
    }
    const currentIndex = allClients.findIndex(c => String(c.id) === String(id));
    if (currentIndex === -1) {
      return { prevClientId: null, nextClientId: null };
    }
    return {
      prevClientId: currentIndex > 0 ? allClients[currentIndex - 1].id : null,
      nextClientId: currentIndex < allClients.length - 1 ? allClients[currentIndex + 1].id : null,
    };
  }, [id, allClients]);

  const relatedContacts = allClients.filter(c => 
    c.id !== id && 
    client?.company && 
    c.company && 
    c.company.toLowerCase().trim() === client.company.toLowerCase().trim()
  );

  const clientProjects = allProjects.filter(p => String(p.clientId) === String(id));
  const availableProjects = allProjects.filter(p => !p.clientId || p.clientId === null);
  const totalProjects = clientProjects.length;
  const totalPages = Math.max(1, Math.ceil(totalProjects / PROJECTS_PER_PAGE));
  
  useEffect(() => {
    if (projectsPage > totalPages && totalPages > 0) {
      setProjectsPage(totalPages);
    }
  }, [projectsPage, totalPages]);
  
  const validPage = Math.min(projectsPage, totalPages);
  const paginatedProjects = clientProjects.slice(
    (validPage - 1) * PROJECTS_PER_PAGE,
    validPage * PROJECTS_PER_PAGE
  );

  const deleteClientMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/crm/clients/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Contact deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/clients"] });
      navigate("/crm");
    },
    onError: () => {
      toast({ title: "Failed to delete contact", variant: "destructive" });
    },
  });

  const unlinkProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      await apiRequest("PATCH", `/api/crm/projects/${projectId}`, { clientId: null });
    },
    onSuccess: () => {
      toast({ title: "Project unlinked successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects"] });
    },
    onError: () => {
      toast({ title: "Failed to unlink project", variant: "destructive" });
    },
  });

  const linkProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      await apiRequest("PATCH", `/api/crm/projects/${projectId}`, { clientId: id });
    },
    onSuccess: () => {
      toast({ title: "Project linked successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects/all"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects"] });
      setShowLinkProjectDialog(false);
      setSelectedProjectToLink("");
    },
    onError: () => {
      toast({ title: "Failed to link project", variant: "destructive" });
    },
  });

  const updateClientMutation = useMutation({
    mutationFn: async (data: { name: string; email?: string | null; company?: string | null; phone?: string | null; phoneFormat?: string | null; status?: string; source?: string | null; fiverrUsername?: string | null; notes?: string | null }) => {
      await apiRequest("PATCH", `/api/crm/clients/${id}`, data);
    },
    onSuccess: () => {
      toast({ title: "Contact updated successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/clients", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/clients"] });
      setIsEditing(false);
    },
    onError: () => {
      toast({ title: "Failed to update contact", variant: "destructive" });
    },
  });

  const createContactMutation = useMutation({
    mutationFn: async (data: { name: string; company: string; email?: string | null; phone?: string | null; phoneFormat?: string | null; status?: string; source?: string | null; notes?: string | null }) => {
      await apiRequest("POST", "/api/crm/clients", data);
    },
    onSuccess: () => {
      toast({ title: "Contact created successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/clients"] });
      setShowAddContactDialog(false);
      setNewContactForm({
        name: "",
        email: "",
        phone: "",
        phoneFormat: "us",
        status: "lead",
        source: "",
        notes: "",
      });
    },
    onError: () => {
      toast({ title: "Failed to create contact", variant: "destructive" });
    },
  });

  const handleCreateContact = () => {
    if (!newContactForm.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    createContactMutation.mutate({
      name: newContactForm.name,
      company: client?.company || "",
      email: newContactForm.email || null,
      phone: newContactForm.phone || null,
      phoneFormat: newContactForm.phoneFormat || "us",
      status: newContactForm.status,
      source: newContactForm.source && newContactForm.source !== "_none" ? newContactForm.source : null,
      notes: newContactForm.notes || null,
    });
  };

  const startEditing = () => {
    if (client) {
      setEditForm({
        name: client.name || "",
        email: client.email || "",
        company: client.company || "",
        phone: client.phone || "",
        phoneFormat: client.phoneFormat || "us",
        status: client.status || "lead",
        source: client.source || "",
        fiverrUsername: client.fiverrUsername || "",
        notes: client.notes || "",
      });
      setIsEditing(true);
    }
  };

  const cancelEditing = () => {
    setIsEditing(false);
    if (client) {
      setEditForm({
        name: client.name || "",
        email: client.email || "",
        company: client.company || "",
        phone: client.phone || "",
        phoneFormat: client.phoneFormat || "us",
        status: client.status || "lead",
        source: client.source || "",
        fiverrUsername: client.fiverrUsername || "",
        notes: client.notes || "",
      });
    }
  };

  const handleSave = () => {
    if (!editForm.name.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    updateClientMutation.mutate({
      name: editForm.name,
      email: editForm.email || null,
      company: editForm.company || null,
      phone: editForm.phone || null,
      phoneFormat: editForm.phoneFormat || "us",
      status: editForm.status,
      source: editForm.source && editForm.source !== "_none" ? editForm.source : null,
      fiverrUsername: editForm.source === "fiverr" ? (editForm.fiverrUsername || null) : null,
      notes: editForm.notes || null,
    });
  };

  if (clientLoading) {
    return (
      <div className="p-4 md:p-6 space-y-4 md:space-y-6 w-full">
        <div className="flex items-center gap-4">
          <Skeleton className="h-9 w-9" />
          <Skeleton className="h-7 md:h-8 w-32 md:w-48" />
        </div>
        <Card>
          <CardContent className="p-4 md:p-6 space-y-4">
            <Skeleton className="h-5 md:h-6 w-24 md:w-32" />
            <Skeleton className="h-4 w-full md:w-64" />
            <Skeleton className="h-4 w-3/4 md:w-48" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-4 md:p-6 w-full">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Contact not found</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/crm")}>
            Back to CRM
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 w-full">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex-1 min-w-0">
          {isEditing ? (
            <Input
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              placeholder="Contact name"
              className="text-xl md:text-2xl font-bold h-auto py-1"
              data-testid="input-edit-name"
            />
          ) : (
            <div className="flex flex-wrap items-center gap-2 md:gap-3">
              <h1 className="text-xl md:text-2xl font-bold truncate" data-testid="text-contact-name">{client.name}</h1>
              {client.status && (
                <Badge 
                  style={{ backgroundColor: contactStatusConfig[client.status]?.color || "#64748b", color: "white" }}
                  data-testid="badge-contact-status"
                >
                  {contactStatusConfig[client.status]?.label || client.status}
                </Badge>
              )}
            </div>
          )}
          {!isEditing && client.company && (
            <p className="text-muted-foreground text-sm md:text-base truncate" data-testid="text-client-company">{client.company}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate("/crm?tab=contacts")}
            data-testid="button-back-to-crm"
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
                disabled={!editForm.name.trim() || updateClientMutation.isPending}
                data-testid="button-save-edit"
              >
                <Save className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">{updateClientMutation.isPending ? "Saving..." : "Save"}</span>
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                size="icon"
                onClick={startEditing}
                data-testid="button-edit-client"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="destructive"
                size="icon"
                onClick={() => setShowDeleteConfirm(true)}
                data-testid="button-delete-client"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
              <div className="flex items-center border-l pl-2 ml-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={!prevClientId}
                  onClick={() => prevClientId && navigate(`/crm/client/${prevClientId}`)}
                  data-testid="button-prev-client"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  disabled={!nextClientId}
                  onClick={() => nextClientId && navigate(`/crm/client/${nextClientId}`)}
                  data-testid="button-next-client"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      <Card>
        <CardHeader className="p-4 md:p-6">
          <CardTitle className="text-base md:text-lg">Contact Information</CardTitle>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0 md:pt-0 space-y-4">
          {isEditing ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              <div className="space-y-2">
                <Label htmlFor="edit-company" className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  Company
                </Label>
                <Input
                  id="edit-company"
                  value={editForm.company}
                  onChange={(e) => setEditForm({ ...editForm, company: e.target.value })}
                  placeholder="Company name"
                  data-testid="input-edit-company"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  Email
                </Label>
                <Input
                  id="edit-email"
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  placeholder="email@example.com"
                  data-testid="input-edit-email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-phone" className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  Phone
                </Label>
                <div className="flex gap-2">
                  <Select
                    value={editForm.phoneFormat || "us"}
                    onValueChange={(value) => {
                      setEditForm(prev => ({
                        ...prev,
                        phoneFormat: value,
                        phone: prev.phone ? formatPhoneAsYouType(prev.phone, value as PhoneFormat) : prev.phone,
                      }));
                    }}
                  >
                    <SelectTrigger className="w-[140px]" data-testid="select-edit-phone-format">
                      <SelectValue placeholder="Format" />
                    </SelectTrigger>
                    <SelectContent>
                      {phoneFormatOptions.map((format) => (
                        <SelectItem key={format} value={format}>
                          {phoneFormatConfig[format].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    id="edit-phone"
                    value={editForm.phone}
                    onChange={(e) => {
                      const formatted = formatPhoneAsYouType(e.target.value, editForm.phoneFormat as PhoneFormat);
                      setEditForm({ ...editForm, phone: formatted });
                    }}
                    placeholder={phoneFormatConfig[editForm.phoneFormat as PhoneFormat]?.example || "(123) 456-7890"}
                    className="flex-1"
                    data-testid="input-edit-phone"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-status">Status</Label>
                <Select
                  value={editForm.status}
                  onValueChange={(value) => setEditForm({ ...editForm, status: value })}
                >
                  <SelectTrigger data-testid="select-edit-status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {contactStatusOptions.map((status) => (
                      <SelectItem key={status} value={status}>
                        <div className="flex items-center gap-2">
                          <Badge 
                            className="text-xs"
                            style={{ backgroundColor: contactStatusConfig[status]?.color || "#64748b", color: "white" }}
                          >
                            {contactStatusConfig[status]?.label || status}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-source" className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  Source
                </Label>
                <Select
                  value={editForm.source || ""}
                  onValueChange={(value) => setEditForm({ ...editForm, source: value })}
                >
                  <SelectTrigger data-testid="select-edit-source">
                    <SelectValue placeholder="Select source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">No source</SelectItem>
                    {sourceOptions.map((source) => (
                      <SelectItem key={source} value={source}>
                        <div className="flex items-center gap-2">
                          <Badge 
                            className="text-xs"
                            style={{ backgroundColor: sourceConfig[source]?.color || "#64748b", color: "white" }}
                          >
                            {sourceConfig[source]?.label || source}
                          </Badge>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {editForm.source === "fiverr" && (
                <div className="space-y-2">
                  <Label htmlFor="edit-fiverr-username" className="flex items-center gap-2">
                    <Hash className="h-4 w-4 text-muted-foreground" />
                    Fiverr Username
                  </Label>
                  <Input
                    id="edit-fiverr-username"
                    value={editForm.fiverrUsername}
                    onChange={(e) => setEditForm({ ...editForm, fiverrUsername: e.target.value })}
                    placeholder="username (without @)"
                    data-testid="input-edit-fiverr-username"
                  />
                </div>
              )}

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="edit-notes" className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Notes
                </Label>
                <Textarea
                  id="edit-notes"
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  placeholder="Additional notes about this contact..."
                  rows={4}
                  data-testid="input-edit-notes"
                />
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                <div className="flex items-start gap-3">
                  <Building2 className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">Company</p>
                    <p className={`font-medium truncate ${!client.company ? 'text-muted-foreground italic' : ''}`} data-testid="text-detail-company">
                      {client.company || "Not provided"}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Mail className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">Email</p>
                    {client.email ? (
                      <a 
                        href={`mailto:${client.email}`} 
                        className="font-medium text-primary hover:underline break-all"
                        data-testid="link-client-email"
                      >
                        {client.email}
                      </a>
                    ) : (
                      <p className="font-medium text-muted-foreground italic" data-testid="text-client-email">Not provided</p>
                    )}
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Phone className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">Phone</p>
                    {client.phone ? (
                      <a 
                        href={`tel:${client.phone.replace(/\D/g, '')}`} 
                        className="font-medium text-primary hover:underline"
                        data-testid="link-client-phone"
                      >
                        {formatPhoneNumber(client.phone, (client.phoneFormat || "us") as PhoneFormat)}
                      </a>
                    ) : (
                      <p className="font-medium text-muted-foreground italic" data-testid="text-client-phone">Not provided</p>
                    )}
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Globe className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">Source</p>
                    <p className={`font-medium ${!client.source ? 'text-muted-foreground italic' : ''}`} data-testid="text-client-source">
                      {client.source ? (sourceConfig[client.source]?.label || client.source) : "Not provided"}
                    </p>
                  </div>
                </div>

                {client.source === "fiverr" && (
                  <div className="flex items-start gap-3">
                    <Hash className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm text-muted-foreground">Fiverr Username</p>
                      {client.fiverrUsername ? (
                        <a 
                          href={`https://www.fiverr.com/${client.fiverrUsername}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-primary hover:underline"
                          data-testid="link-fiverr-username"
                        >
                          @{client.fiverrUsername}
                        </a>
                      ) : (
                        <p className="font-medium text-muted-foreground italic" data-testid="text-fiverr-username">Not provided</p>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-start gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm text-muted-foreground">Created</p>
                    <p className="font-medium" data-testid="text-created-date">
                      {client.createdAt ? format(new Date(client.createdAt), "MMM d, yyyy") : "Unknown"}
                    </p>
                  </div>
                </div>
              </div>

              <Separator />
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-muted-foreground mb-1">Notes</p>
                  <p className={`whitespace-pre-wrap ${!client.notes ? 'text-muted-foreground italic' : ''}`} data-testid="text-client-notes">
                    {client.notes || "No notes added"}
                  </p>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 md:p-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base md:text-lg flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            <span>Linked Projects</span>
            {totalProjects > 0 && (
              <Badge variant="secondary">{totalProjects}</Badge>
            )}
          </CardTitle>
          <div className="flex flex-col gap-2 w-full sm:flex-row sm:w-auto">
            <Button
              size="sm"
              variant="outline"
              onClick={() => navigate(`/crm/project/new?clientId=${id}`)}
              className="w-full sm:w-auto"
              data-testid="button-add-project"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Project
            </Button>
            <Button
              size="sm"
              onClick={() => setShowLinkProjectDialog(true)}
              disabled={availableProjects.length === 0}
              className="w-full sm:w-auto"
              data-testid="button-link-project"
            >
              <Link2 className="h-4 w-4 mr-2" />
              Link Project
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
          {clientProjects.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No projects linked to this contact</p>
            </div>
          ) : (
            <div className="space-y-3">
              {paginatedProjects.map((crmProject) => (
                <div
                  key={crmProject.id}
                  className="flex flex-col gap-2 p-3 rounded-lg border bg-muted/30 sm:flex-row sm:items-center sm:justify-between"
                  data-testid={`card-project-${crmProject.id}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <FolderOpen className="h-5 w-5 text-muted-foreground flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{crmProject.project.name}</p>
                      {crmProject.project.description && (
                        <p className="text-sm text-muted-foreground line-clamp-1">{crmProject.project.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 justify-between sm:justify-end flex-shrink-0">
                    <Badge 
                      style={{ backgroundColor: projectStatusConfig[crmProject.status]?.color || "#64748b", color: "white" }}
                    >
                      {projectStatusConfig[crmProject.status]?.label || crmProject.status}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => unlinkProjectMutation.mutate(crmProject.id)}
                      disabled={unlinkProjectMutation.isPending}
                      data-testid={`button-unlink-project-${crmProject.id}`}
                    >
                      <Link2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
              
              {totalPages > 1 && (
                <div className="flex flex-col gap-3 pt-4 border-t sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground text-center sm:text-left">
                    Showing {(validPage - 1) * PROJECTS_PER_PAGE + 1} to {Math.min(validPage * PROJECTS_PER_PAGE, totalProjects)} of {totalProjects}
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setProjectsPage(p => Math.max(1, p - 1))}
                      disabled={validPage === 1}
                      data-testid="button-prev-page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground min-w-[80px] text-center">
                      {validPage} / {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => setProjectsPage(p => Math.min(totalPages, p + 1))}
                      disabled={validPage === totalPages}
                      data-testid="button-next-page"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-4 md:p-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base md:text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            <span>{client.company ? `Other Contacts at ${client.company}` : "Related Contacts"}</span>
            {relatedContacts.length > 0 && (
              <Badge variant="secondary">{relatedContacts.length}</Badge>
            )}
          </CardTitle>
          <Button
            size="sm"
            onClick={() => setShowAddContactDialog(true)}
            className="w-full sm:w-auto"
            data-testid="button-add-contact"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Contact
          </Button>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-0 md:pt-0">
          {relatedContacts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>{client.company ? "No other contacts at this company" : "Add contacts to this page"}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {relatedContacts.map((contact) => (
                <div
                  key={contact.id}
                  className="flex flex-col gap-2 p-3 rounded-lg border bg-muted/30 sm:flex-row sm:items-center sm:justify-between cursor-pointer hover-elevate"
                  onClick={() => navigate(`/crm/contacts/${contact.id}`)}
                  data-testid={`card-related-contact-${contact.id}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-medium text-primary">
                        {contact.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium truncate">{contact.name}</p>
                      {contact.email && (
                        <p className="text-sm text-muted-foreground truncate">{contact.email}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 justify-between sm:justify-end flex-shrink-0">
                    <Badge 
                      style={{ backgroundColor: contactStatusConfig[contact.status || "lead"]?.color || "#64748b", color: "white" }}
                    >
                      {contactStatusConfig[contact.status || "lead"]?.label || contact.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contact</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{client.name}"? This action cannot be undone.
              Any projects linked to this contact will be unlinked.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:gap-0">
            <AlertDialogCancel className="w-full sm:w-auto" data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteClientMutation.mutate()}
              className="w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={showLinkProjectDialog} onOpenChange={setShowLinkProjectDialog}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Link Project to Contact</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Select
              value={selectedProjectToLink}
              onValueChange={setSelectedProjectToLink}
            >
              <SelectTrigger data-testid="select-project-to-link">
                <SelectValue placeholder="Select a project to link" />
              </SelectTrigger>
              <SelectContent>
                {availableProjects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {availableProjects.length === 0 && (
              <p className="text-sm text-muted-foreground mt-2">
                No available projects to link. All projects are already linked to contacts.
              </p>
            )}
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:gap-0">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => {
                setShowLinkProjectDialog(false);
                setSelectedProjectToLink("");
              }}
              data-testid="button-cancel-link"
            >
              Cancel
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={() => linkProjectMutation.mutate(selectedProjectToLink)}
              disabled={!selectedProjectToLink || linkProjectMutation.isPending}
              data-testid="button-confirm-link"
            >
              Link Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showAddContactDialog} onOpenChange={setShowAddContactDialog}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Contact{client.company && ` at ${client.company}`}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-contact-name">Name *</Label>
              <Input
                id="new-contact-name"
                value={newContactForm.name}
                onChange={(e) => setNewContactForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Contact name"
                data-testid="input-new-contact-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-contact-email">Email</Label>
              <Input
                id="new-contact-email"
                type="email"
                value={newContactForm.email}
                onChange={(e) => setNewContactForm(f => ({ ...f, email: e.target.value }))}
                placeholder="email@example.com"
                data-testid="input-new-contact-email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-contact-phone">Phone</Label>
              <div className="flex gap-2">
                <Select
                  value={newContactForm.phoneFormat}
                  onValueChange={(value) => setNewContactForm(f => ({ ...f, phoneFormat: value }))}
                >
                  <SelectTrigger className="w-[140px]" data-testid="select-new-contact-phone-format">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {phoneFormatOptions.map((format) => (
                      <SelectItem key={format} value={format}>
                        {phoneFormatConfig[format]?.label || format}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  id="new-contact-phone"
                  type="tel"
                  value={newContactForm.phone}
                  onChange={(e) => setNewContactForm(f => ({ 
                    ...f, 
                    phone: formatPhoneAsYouType(e.target.value, f.phoneFormat as PhoneFormat)
                  }))}
                  placeholder={phoneFormatConfig[newContactForm.phoneFormat as PhoneFormat]?.example || "Phone number"}
                  className="flex-1"
                  data-testid="input-new-contact-phone"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="new-contact-notes">Notes</Label>
              <Textarea
                id="new-contact-notes"
                value={newContactForm.notes}
                onChange={(e) => setNewContactForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Add notes about this contact..."
                rows={3}
                data-testid="textarea-new-contact-notes"
              />
            </div>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:gap-0">
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={() => {
                setShowAddContactDialog(false);
                setNewContactForm({
                  name: "",
                  email: "",
                  phone: "",
                  phoneFormat: "us",
                  status: "lead",
                  source: "",
                  notes: "",
                });
              }}
              data-testid="button-cancel-add-contact"
            >
              Cancel
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={handleCreateContact}
              disabled={!newContactForm.name.trim() || createContactMutation.isPending}
              data-testid="button-confirm-add-contact"
            >
              {createContactMutation.isPending ? "Creating..." : "Add Contact"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
