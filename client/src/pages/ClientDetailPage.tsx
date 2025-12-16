import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Building2, Mail, Phone, FileText, FolderOpen, Trash2, ChevronLeft, ChevronRight, Link2, Plus, Pencil, X, Save } from "lucide-react";
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
import { useState, useEffect } from "react";

const contactStatusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  lead: { label: "Lead", variant: "secondary" },
  prospect: { label: "Prospect", variant: "outline" },
  client: { label: "Client", variant: "default" },
  client_recurrent: { label: "Client Récurrent", variant: "default" },
};

const contactStatusOptions = ["lead", "prospect", "client", "client_recurrent"];

interface CrmClient {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
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
  const [selectedProjectToLink, setSelectedProjectToLink] = useState<string>("");
  const [projectsPage, setProjectsPage] = useState(1);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    company: "",
    phone: "",
    status: "lead",
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
    mutationFn: async (data: { name: string; email?: string | null; company?: string | null; phone?: string | null; status?: string; notes?: string | null }) => {
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

  const startEditing = () => {
    if (client) {
      setEditForm({
        name: client.name || "",
        email: client.email || "",
        company: client.company || "",
        phone: client.phone || "",
        status: client.status || "lead",
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
        status: client.status || "lead",
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
      status: editForm.status,
      notes: editForm.notes || null,
    });
  };

  if (clientLoading) {
    return (
      <div className="p-6 space-y-6 w-full">
        <div className="flex items-center gap-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-48" />
        </div>
        <Card>
          <CardContent className="p-6 space-y-4">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-4 w-48" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-6 w-full">
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
    <div className="p-6 space-y-6 w-full max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => navigate("/crm")}
            data-testid="button-back-to-crm"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            {isEditing ? (
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="Contact name"
                className="text-2xl font-bold h-auto py-1"
                data-testid="input-edit-name"
              />
            ) : (
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold" data-testid="text-contact-name">{client.name}</h1>
                {client.status && (
                  <Badge 
                    variant={contactStatusConfig[client.status]?.variant || "secondary"}
                    data-testid="badge-contact-status"
                  >
                    {contactStatusConfig[client.status]?.label || client.status}
                  </Badge>
                )}
              </div>
            )}
            {!isEditing && client.company && (
              <p className="text-muted-foreground" data-testid="text-client-company">{client.company}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <Button
                variant="outline"
                onClick={cancelEditing}
                data-testid="button-cancel-edit"
              >
                <X className="h-4 w-4 mr-2" />
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={!editForm.name.trim() || updateClientMutation.isPending}
                data-testid="button-save-edit"
              >
                <Save className="h-4 w-4 mr-2" />
                {updateClientMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={startEditing}
                data-testid="button-edit-client"
              >
                <Pencil className="h-4 w-4 mr-2" />
                Edit
              </Button>
              <Button
                variant="destructive"
                onClick={() => setShowDeleteConfirm(true)}
                data-testid="button-delete-client"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Delete
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Contact Details Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Contact Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isEditing ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                <Input
                  id="edit-phone"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  placeholder="+1 234 567 8900"
                  data-testid="input-edit-phone"
                />
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
                        {contactStatusConfig[status]?.label || status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex items-start gap-3">
                  <Building2 className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Company</p>
                    <p className={`font-medium ${!client.company ? 'text-muted-foreground italic' : ''}`} data-testid="text-detail-company">
                      {client.company || "Not provided"}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Email</p>
                    {client.email ? (
                      <a 
                        href={`mailto:${client.email}`} 
                        className="font-medium text-primary hover:underline"
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
                  <Phone className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
                    <p className="text-sm text-muted-foreground">Phone</p>
                    {client.phone ? (
                      <a 
                        href={`tel:${client.phone}`} 
                        className="font-medium text-primary hover:underline"
                        data-testid="link-client-phone"
                      >
                        {client.phone}
                      </a>
                    ) : (
                      <p className="font-medium text-muted-foreground italic" data-testid="text-client-phone">Not provided</p>
                    )}
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                  <div>
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

      {/* Projects Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Linked Projects
            {totalProjects > 0 && (
              <Badge variant="secondary" className="ml-2">{totalProjects}</Badge>
            )}
          </CardTitle>
          <Button
            size="sm"
            onClick={() => setShowLinkProjectDialog(true)}
            disabled={availableProjects.length === 0}
            data-testid="button-link-project"
          >
            <Plus className="h-4 w-4 mr-2" />
            Link Project
          </Button>
        </CardHeader>
        <CardContent>
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
                  className="flex items-center justify-between p-3 rounded-lg border bg-muted/30"
                  data-testid={`card-project-${crmProject.id}`}
                >
                  <div className="flex items-center gap-3">
                    <FolderOpen className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium">{crmProject.project.name}</p>
                      {crmProject.project.description && (
                        <p className="text-sm text-muted-foreground line-clamp-1">{crmProject.project.description}</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{crmProject.status}</Badge>
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
                <div className="flex items-center justify-between pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Showing {(validPage - 1) * PROJECTS_PER_PAGE + 1} to {Math.min(validPage * PROJECTS_PER_PAGE, totalProjects)} of {totalProjects} projects
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setProjectsPage(p => Math.max(1, p - 1))}
                      disabled={validPage === 1}
                      data-testid="button-prev-page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {validPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contact</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{client.name}"? This action cannot be undone.
              Any projects linked to this contact will be unlinked.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteClientMutation.mutate()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Link Project Dialog */}
      <Dialog open={showLinkProjectDialog} onOpenChange={setShowLinkProjectDialog}>
        <DialogContent>
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
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowLinkProjectDialog(false);
                setSelectedProjectToLink("");
              }}
              data-testid="button-cancel-link"
            >
              Cancel
            </Button>
            <Button
              onClick={() => linkProjectMutation.mutate(selectedProjectToLink)}
              disabled={!selectedProjectToLink || linkProjectMutation.isPending}
              data-testid="button-confirm-link"
            >
              Link Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
