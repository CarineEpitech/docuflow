import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { ArrowLeft, Building2, Mail, Phone, FileText, Calendar, FolderOpen, Trash2, ChevronLeft, ChevronRight, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
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
import { format } from "date-fns";
import { useState, useEffect } from "react";

interface CrmClient {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
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
  const [projectsPage, setProjectsPage] = useState(1);

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
  const totalProjects = clientProjects.length;
  const totalPages = Math.max(1, Math.ceil(totalProjects / PROJECTS_PER_PAGE));
  
  // Clamp page to valid range when data changes
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
      toast({ title: "Client deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/clients"] });
      navigate("/crm");
    },
    onError: () => {
      toast({ title: "Failed to delete client", variant: "destructive" });
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

  if (clientLoading) {
    return (
      <div className="container max-w-4xl py-8 space-y-6">
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
      <div className="container max-w-4xl py-8">
        <div className="text-center py-12">
          <p className="text-muted-foreground">Client not found</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/crm")}>
            Back to CRM
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container max-w-4xl py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/crm")}
            data-testid="button-back-to-crm"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-client-name">{client.name}</h1>
            {client.company && (
              <p className="text-muted-foreground" data-testid="text-client-company">{client.company}</p>
            )}
          </div>
        </div>
        <Button
          variant="destructive"
          onClick={() => setShowDeleteConfirm(true)}
          data-testid="button-delete-client"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete Client
        </Button>
      </div>

      {/* Client Details Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Client Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {client.company && (
              <div className="flex items-start gap-3">
                <Building2 className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Company</p>
                  <p className="font-medium" data-testid="text-detail-company">{client.company}</p>
                </div>
              </div>
            )}

            {client.email && (
              <div className="flex items-start gap-3">
                <Mail className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Email</p>
                  <a
                    href={`mailto:${client.email}`}
                    className="font-medium text-primary hover:underline"
                    data-testid="link-client-email"
                  >
                    {client.email}
                  </a>
                </div>
              </div>
            )}

            {client.phone && (
              <div className="flex items-start gap-3">
                <Phone className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground">Phone</p>
                  <a
                    href={`tel:${client.phone}`}
                    className="font-medium text-primary hover:underline"
                    data-testid="link-client-phone"
                  >
                    {client.phone}
                  </a>
                </div>
              </div>
            )}

            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-muted-foreground mt-0.5" />
              <div>
                <p className="text-sm text-muted-foreground">Created</p>
                <p className="font-medium" data-testid="text-client-created">
                  {format(new Date(client.createdAt), "MMMM d, yyyy")}
                </p>
              </div>
            </div>
          </div>

          {client.notes && (
            <>
              <Separator />
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Notes</p>
                  <p className="whitespace-pre-wrap" data-testid="text-client-notes">{client.notes}</p>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Projects Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            Linked Projects
            {totalProjects > 0 && (
              <Badge variant="secondary" className="ml-2">{totalProjects}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {clientProjects.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No projects linked to this client</p>
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
              
              {/* Pagination */}
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
            <AlertDialogTitle>Delete Client</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{client.name}"? This action cannot be undone.
              Any projects linked to this client will be unlinked.
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

    </div>
  );
}
