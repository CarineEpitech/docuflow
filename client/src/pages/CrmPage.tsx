import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  Search, 
  Plus, 
  ChevronLeft, 
  ChevronRight,
  User,
  ExternalLink,
  CheckCircle,
  CalendarDays,
  Building2,
  Mail,
  FolderKanban,
  Users,
  MoreHorizontal,
  Pencil,
  LayoutGrid,
  List,
  GripVertical,
  Trash2
} from "lucide-react";
import { Link } from "wouter";
import type { 
  CrmProjectWithDetails, 
  CrmClient, 
  CrmProjectStatus
} from "@shared/schema";

const crmStatusConfig: Record<CrmProjectStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  lead: { label: "Lead", variant: "secondary" },
  discovering_call_completed: { label: "Discovering Call Completed", variant: "outline" },
  proposal_sent: { label: "Proposal Sent", variant: "outline" },
  won: { label: "Won", variant: "default" },
  won_not_started: { label: "Won - Not Started", variant: "default" },
  won_in_progress: { label: "Won - In Progress", variant: "default" },
  won_in_review: { label: "Won - In Review", variant: "default" },
  won_completed: { label: "Won - Completed", variant: "default" },
  lost: { label: "Lost", variant: "destructive" },
  cancelled: { label: "Cancelled", variant: "destructive" },
};

const statusOptions: CrmProjectStatus[] = [
  "lead",
  "discovering_call_completed",
  "proposal_sent",
  "won",
  "won_not_started",
  "won_in_progress",
  "won_in_review",
  "won_completed",
  "lost",
  "cancelled"
];

// Contact status configuration
const contactStatusConfig: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  lead: { label: "Lead", variant: "secondary" },
  prospect: { label: "Prospect", variant: "outline" },
  client: { label: "Client", variant: "default" },
  client_recurrent: { label: "Client Récurrent", variant: "default" },
};

const contactStatusOptions = ["lead", "prospect", "client", "client_recurrent"];

interface CrmProjectsResponse {
  data: CrmProjectWithDetails[];
  total: number;
  page: number;
  pageSize: number;
}

export default function CrmPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<string>("clients");
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [showAddClientDialog, setShowAddClientDialog] = useState(false);
  const [showLinkProjectDialog, setShowLinkProjectDialog] = useState(false);
  const [projectViewMode, setProjectViewMode] = useState<"table" | "kanban">("kanban");
  const [deleteContactId, setDeleteContactId] = useState<string | null>(null);
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const pageSize = 10;

  const { data: crmProjectsData, isLoading } = useQuery<CrmProjectsResponse>({
    queryKey: ["/api/crm/projects", page, pageSize, statusFilter !== "all" ? statusFilter : undefined, search || undefined],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("pageSize", pageSize.toString());
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search) params.set("search", search);
      const res = await fetch(`/api/crm/projects?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: clients = [], isLoading: clientsLoading } = useQuery<CrmClient[]>({
    queryKey: ["/api/crm/clients"],
  });

  // Fetch all projects for Kanban view
  const { data: allProjectsData } = useQuery<CrmProjectsResponse>({
    queryKey: ["/api/crm/projects/all-kanban"],
    queryFn: async () => {
      const res = await fetch(`/api/crm/projects?pageSize=1000`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const updateProjectStatusMutation = useMutation({
    mutationFn: async ({ projectId, status }: { projectId: string; status: string }) => {
      await apiRequest("PATCH", `/api/crm/projects/${projectId}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects/all-kanban"] });
    },
  });

  const filteredClients = clients.filter(client => 
    clientSearch === "" || 
    client.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
    client.company?.toLowerCase().includes(clientSearch.toLowerCase()) ||
    client.email?.toLowerCase().includes(clientSearch.toLowerCase())
  );

  const createCrmProjectMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string | null; clientId?: string | null; status?: string | null }) => {
      return apiRequest("POST", "/api/crm/projects", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects/all-kanban"] });
      setShowLinkProjectDialog(false);
      toast({ title: "Project created" });
    },
    onError: () => {
      toast({ title: "Failed to create project", variant: "destructive" });
    },
  });

  const createClientMutation = useMutation({
    mutationFn: async (data: { name: string; email?: string | null; company?: string | null; status?: string; notes?: string | null }) => {
      return apiRequest("POST", "/api/crm/clients", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/clients"] });
      setShowAddClientDialog(false);
      toast({ title: "Contact created" });
    },
    onError: () => {
      toast({ title: "Failed to create contact", variant: "destructive" });
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (contactId: string) => {
      await apiRequest("DELETE", `/api/crm/clients/${contactId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/clients"] });
      setDeleteContactId(null);
      toast({ title: "Contact deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete contact", variant: "destructive" });
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: async (projectId: string) => {
      await apiRequest("DELETE", `/api/crm/projects/${projectId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects/all"] });
      setDeleteProjectId(null);
      toast({ title: "Project deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete project", variant: "destructive" });
    },
  });


  const totalPages = crmProjectsData ? Math.ceil(crmProjectsData.total / pageSize) : 0;

  return (
    <div className="p-6 space-y-6 w-full">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Project Management</h1>
          <p className="text-muted-foreground">Manage your projects and contact relationships</p>
        </div>
        <div className="flex gap-2">
          {activeTab === "clients" && (
            <Button onClick={() => setShowAddClientDialog(true)} data-testid="button-add-contact">
              <Plus className="w-4 h-4 mr-2" />
              New Contact
            </Button>
          )}
          {activeTab === "projects" && (
            <Button onClick={() => setShowLinkProjectDialog(true)} data-testid="button-link-project">
              <Plus className="w-4 h-4 mr-2" />
              New Project
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <TabsList>
            <TabsTrigger value="clients" className="gap-2" data-testid="tab-clients">
              <Users className="w-4 h-4" />
              Contacts
              {clients.length > 0 && (
                <Badge variant="secondary" className="ml-1">{clients.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="projects" className="gap-2" data-testid="tab-projects">
              <FolderKanban className="w-4 h-4" />
              Projects
              {(allProjectsData?.total ?? crmProjectsData?.total) !== undefined && (
                <Badge variant="secondary" className="ml-1">{allProjectsData?.total ?? crmProjectsData?.total}</Badge>
              )}
            </TabsTrigger>
          </TabsList>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center w-full sm:w-auto">
            {activeTab === "clients" && (
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search contacts..."
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  className="pl-9"
                  data-testid="input-client-search"
                />
              </div>
            )}
            {activeTab === "projects" && (
              <>
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Search projects..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                    className="pl-9"
                    data-testid="input-search"
                  />
                </div>
                {projectViewMode === "table" && (
                  <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                    <SelectTrigger className="w-[180px]" data-testid="select-status-filter">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      {statusOptions.map(status => (
                        <SelectItem key={status} value={status}>
                          {crmStatusConfig[status].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <div className="flex border rounded-md">
                  <Button
                    variant={projectViewMode === "kanban" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setProjectViewMode("kanban")}
                    className="rounded-r-none"
                    data-testid="button-kanban-view"
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={projectViewMode === "table" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setProjectViewMode("table")}
                    className="rounded-l-none"
                    data-testid="button-table-view"
                  >
                    <List className="w-4 h-4" />
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>

        <TabsContent value="projects" className="space-y-4 mt-0">
          {projectViewMode === "kanban" ? (
            <div className="overflow-x-auto pb-4 scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              <div className="flex gap-4 min-w-max">
                {statusOptions.map((status) => {
                  const projectsInColumn = (allProjectsData?.data || []).filter(
                    p => p.status === status && 
                    (search === "" || p.project?.name.toLowerCase().includes(search.toLowerCase()))
                  );
                  return (
                    <div
                      key={status}
                      className="w-72 flex-shrink-0"
                      data-testid={`kanban-column-${status}`}
                    >
                      <div className="bg-muted/50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Badge variant={crmStatusConfig[status].variant}>
                              {crmStatusConfig[status].label}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {projectsInColumn.length}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-2 min-h-[100px]">
                          {projectsInColumn.map((project) => (
                            <Card
                              key={project.id}
                              className="hover-elevate cursor-pointer"
                              onClick={() => setLocation(`/crm/project/${project.id}`)}
                              data-testid={`kanban-card-${project.id}`}
                            >
                              <CardContent className="p-3">
                                <div className="flex items-start gap-2">
                                  <GripVertical className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0 opacity-50" />
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium text-sm truncate">
                                      {project.project?.name || "Unknown"}
                                    </p>
                                    {project.client && (
                                      <p className="text-xs text-muted-foreground truncate mt-1">
                                        {project.client.name}
                                      </p>
                                    )}
                                    {project.dueDate && (
                                      <p className={`text-xs mt-2 ${new Date(project.dueDate) < new Date() && project.status !== "finished" ? "text-destructive" : "text-muted-foreground"}`}>
                                        Due: {format(new Date(project.dueDate), "MMM d")}
                                      </p>
                                    )}
                                    {project.assignee && (
                                      <div className="flex items-center gap-1.5 mt-2">
                                        <Avatar className="w-5 h-5">
                                          <AvatarImage src={project.assignee.profileImageUrl || undefined} />
                                          <AvatarFallback className="text-[10px]">
                                            {project.assignee.firstName?.[0]}{project.assignee.lastName?.[0]}
                                          </AvatarFallback>
                                        </Avatar>
                                        <span className="text-xs text-muted-foreground truncate">
                                          {project.assignee.firstName}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                          {projectsInColumn.length === 0 && (
                            <div className="text-center py-4 text-xs text-muted-foreground">
                              No projects
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-4 font-medium">Project</th>
                        <th className="text-left p-4 font-medium">Client</th>
                        <th className="text-left p-4 font-medium">Status</th>
                        <th className="text-left p-4 font-medium">Assigned</th>
                        <th className="text-left p-4 font-medium">Start Date</th>
                        <th className="text-left p-4 font-medium">Due Date</th>
                        <th className="text-left p-4 font-medium">Finished</th>
                        <th className="text-left p-4 font-medium">Days Diff</th>
                        <th className="text-right p-4 font-medium w-16"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {isLoading ? (
                        <tr>
                          <td colSpan={9} className="p-8 text-center text-muted-foreground">
                            Loading projects...
                          </td>
                        </tr>
                      ) : !crmProjectsData?.data.length ? (
                        <tr>
                          <td colSpan={9} className="p-8 text-center text-muted-foreground">
                            No projects found. Add your first project to get started.
                          </td>
                        </tr>
                      ) : (
                        crmProjectsData?.data.map((crmProject) => (
                          <tr 
                            key={crmProject.id} 
                            className="border-b hover-elevate cursor-pointer"
                            onClick={() => setLocation(`/crm/project/${crmProject.id}`)}
                            data-testid={`row-crm-project-${crmProject.id}`}
                          >
                            <td className="p-4">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{crmProject.project?.name || "Unknown"}</span>
                                {crmProject.documentationEnabled === 1 && (
                                  <Link 
                                    href={`/project/${crmProject.projectId}`} 
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <ExternalLink className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                                  </Link>
                                )}
                              </div>
                            </td>
                            <td className="p-4">
                              {crmProject.client ? (
                                <div className="flex items-center gap-2">
                                  <User className="w-4 h-4 text-muted-foreground" />
                                  <span>{crmProject.client.name}</span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">No client</span>
                              )}
                            </td>
                            <td className="p-4">
                              <Badge variant={crmStatusConfig[crmProject.status as CrmProjectStatus].variant}>
                                {crmStatusConfig[crmProject.status as CrmProjectStatus].label}
                              </Badge>
                            </td>
                            <td className="p-4">
                              {crmProject.assignee ? (
                                <div className="flex items-center gap-2">
                                  <Avatar className="w-6 h-6">
                                    <AvatarImage src={crmProject.assignee.profileImageUrl || undefined} />
                                    <AvatarFallback className="text-xs">
                                      {crmProject.assignee.firstName?.[0]}{crmProject.assignee.lastName?.[0]}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="text-sm">{crmProject.assignee.firstName} {crmProject.assignee.lastName}</span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground">Unassigned</span>
                              )}
                            </td>
                            <td className="p-4">
                              {crmProject.startDate ? (
                                <div className="flex items-center gap-1.5 text-sm">
                                  <CalendarDays className="w-3.5 h-3.5 text-muted-foreground" />
                                  <span>{format(new Date(crmProject.startDate), "MMM d, yyyy")}</span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-sm">—</span>
                              )}
                            </td>
                            <td className="p-4">
                              {crmProject.dueDate ? (
                                <span className={new Date(crmProject.dueDate) < new Date() && crmProject.status !== "finished" ? "text-destructive text-sm" : "text-sm"}>
                                  {format(new Date(crmProject.dueDate), "MMM d, yyyy")}
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-sm">—</span>
                              )}
                            </td>
                            <td className="p-4">
                              {crmProject.actualFinishDate ? (
                                <div className="flex items-center gap-1.5">
                                  <CheckCircle className="w-4 h-4 text-green-600 dark:text-green-400" />
                                  <span className="text-sm text-green-600 dark:text-green-400">
                                    {format(new Date(crmProject.actualFinishDate), "MMM d, yyyy")}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-sm">—</span>
                              )}
                            </td>
                            <td className="p-4">
                              {crmProject.dueDate && crmProject.actualFinishDate ? (() => {
                                const dueDate = new Date(crmProject.dueDate);
                                const actualDate = new Date(crmProject.actualFinishDate);
                                const diffTime = dueDate.getTime() - actualDate.getTime();
                                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                                if (diffDays > 0) {
                                  return (
                                    <Badge variant="default" className="text-xs">
                                      {diffDays} days early
                                    </Badge>
                                  );
                                } else if (diffDays < 0) {
                                  return (
                                    <Badge variant="destructive" className="text-xs">
                                      {Math.abs(diffDays)} days late
                                    </Badge>
                                  );
                                } else {
                                  return (
                                    <Badge variant="secondary" className="text-xs">
                                      On time
                                    </Badge>
                                  );
                                }
                              })() : (
                                <span className="text-muted-foreground text-sm">—</span>
                              )}
                            </td>
                            <td className="p-4 text-right">
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteProjectId(crmProject.id);
                                }}
                                data-testid={`button-delete-project-${crmProject.id}`}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {totalPages > 1 && (
                  <div className="p-4 border-t">
                    <div className="flex items-center justify-center gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        data-testid="button-prev-page"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </Button>
                      <span className="text-sm">
                        Page {page} of {totalPages}
                      </span>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        data-testid="button-next-page"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="clients" className="space-y-4 mt-0">
          <div className="space-y-2">
            {clientsLoading ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  Loading contacts...
                </CardContent>
              </Card>
            ) : filteredClients.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <User className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>{clients.length === 0 
                    ? "No contacts yet. Add your first contact to get started."
                    : "No contacts match your search."}</p>
                </CardContent>
              </Card>
            ) : (
              filteredClients.map((client) => (
                <Card
                  key={client.id}
                  className="hover-elevate cursor-pointer transition-colors"
                  onClick={() => setLocation(`/crm/client/${client.id}`)}
                  data-testid={`row-client-${client.id}`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <User className="w-5 h-5 text-primary" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate" data-testid={`text-client-name-${client.id}`}>
                            {client.name}
                          </p>
                          <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            {client.company && (
                              <span className="flex items-center gap-1 truncate">
                                <Building2 className="w-3.5 h-3.5 shrink-0" />
                                {client.company}
                              </span>
                            )}
                            {client.email && (
                              <span className="flex items-center gap-1 truncate">
                                <Mail className="w-3.5 h-3.5 shrink-0" />
                                {client.email}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-muted-foreground hidden sm:block">
                          {client.createdAt ? format(new Date(client.createdAt), "MMM d, yyyy") : ""}
                        </span>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteContactId(client.id);
                          }}
                          data-testid={`button-delete-contact-${client.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation();
                            setLocation(`/crm/client/${client.id}`);
                          }}
                          data-testid={`button-view-contact-${client.id}`}
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      <AddClientDialog 
        open={showAddClientDialog}
        onClose={() => setShowAddClientDialog(false)}
        onSubmit={(data) => createClientMutation.mutate(data)}
        isLoading={createClientMutation.isPending}
      />

      <CreateProjectDialog
        open={showLinkProjectDialog}
        onClose={() => setShowLinkProjectDialog(false)}
        clients={clients}
        onSubmit={(data) => createCrmProjectMutation.mutate(data)}
        isLoading={createCrmProjectMutation.isPending}
      />

      {/* Delete Contact Confirmation */}
      <AlertDialog open={!!deleteContactId} onOpenChange={(open) => !open && setDeleteContactId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contact</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this contact? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteContactId && deleteContactMutation.mutate(deleteContactId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Project Confirmation */}
      <AlertDialog open={!!deleteProjectId} onOpenChange={(open) => !open && setDeleteProjectId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this project? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteProjectId && deleteProjectMutation.mutate(deleteProjectId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const clientFormSchema = z.object({
  name: z.string().min(1, "Full name is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  company: z.string().optional(),
  status: z.string().default("lead"),
  notes: z.string().optional(),
});

interface AddClientDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; email?: string | null; company?: string | null; status?: string; notes?: string | null }) => void;
  isLoading: boolean;
}

function AddClientDialog({ open, onClose, onSubmit, isLoading }: AddClientDialogProps) {
  const form = useForm({
    resolver: zodResolver(clientFormSchema),
    defaultValues: { name: "", email: "", company: "", status: "lead", notes: "" },
  });

  const handleSubmit = (data: z.infer<typeof clientFormSchema>) => {
    onSubmit({
      name: data.name,
      email: data.email || null,
      company: data.company || null,
      status: data.status,
      notes: data.notes || null,
    });
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Contact</DialogTitle>
          <DialogDescription>Create a new contact to associate with projects</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Full name" data-testid="input-client-name" />
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
                    <Input {...field} type="email" placeholder="contact@example.com" data-testid="input-client-email" />
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
                    <Input {...field} placeholder="Company name (optional)" data-testid="input-client-company" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-client-status">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {contactStatusOptions.map((status) => (
                        <SelectItem key={status} value={status}>
                          {contactStatusConfig[status]?.label || status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                    <Textarea {...field} placeholder="Additional notes (optional)" data-testid="textarea-client-notes" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel-client">Cancel</Button>
              <Button type="submit" disabled={isLoading} data-testid="button-submit-client">
                {isLoading ? "Creating..." : "Create Contact"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

const projectFormSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  description: z.string().optional(),
  clientId: z.string().optional(),
  status: z.string().optional(),
});

interface CreateProjectDialogProps {
  open: boolean;
  onClose: () => void;
  clients: CrmClient[];
  onSubmit: (data: { name: string; description?: string | null; clientId?: string | null; status?: string | null }) => void;
  isLoading: boolean;
}

function CreateProjectDialog({ open, onClose, clients, onSubmit, isLoading }: CreateProjectDialogProps) {
  const form = useForm({
    resolver: zodResolver(projectFormSchema),
    defaultValues: { name: "", description: "", clientId: "", status: "lead" },
  });

  const handleSubmit = (data: z.infer<typeof projectFormSchema>) => {
    onSubmit({
      name: data.name,
      description: data.description || null,
      clientId: data.clientId || null,
      status: data.status || "lead",
    });
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
          <DialogDescription>Add a new project to track in your CRM</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Project Name</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="Enter project name" data-testid="input-project-name" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea {...field} placeholder="Project description (optional)" data-testid="textarea-project-description" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="clientId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contact (Optional)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-project-contact">
                        <SelectValue placeholder="Select a contact" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {clients.map(client => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-project-status">
                        <SelectValue placeholder="Select status" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {statusOptions.map(status => (
                        <SelectItem key={status} value={status}>
                          {crmStatusConfig[status].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} data-testid="button-cancel-project">Cancel</Button>
              <Button type="submit" disabled={isLoading} data-testid="button-submit-project">
                {isLoading ? "Creating..." : "Create Project"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
