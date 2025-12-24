import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { useLocation, useSearch } from "wouter";
import { DragDropContext, Droppable, Draggable, DropResult } from "@hello-pangea/dnd";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
  Trash2,
  StickyNote
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
  won_cancelled: { label: "Won-Cancelled", variant: "destructive" },
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
  "won_cancelled"
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
  const searchString = useSearch();
  const [activeTab, setActiveTab] = useState<string>("clients");
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [contactStatusFilter, setContactStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [, navigate] = useLocation();
  const [projectViewMode, setProjectViewMode] = useState<"table" | "kanban">("kanban");
  const [contactViewMode, setContactViewMode] = useState<"cards" | "table">("cards");
  const [deleteContactId, setDeleteContactId] = useState<string | null>(null);
  const [deleteProjectId, setDeleteProjectId] = useState<string | null>(null);
  const pageSize = 10;

  // Handle URL tab parameter
  useEffect(() => {
    if (!searchString) return;
    const params = new URLSearchParams(searchString);
    const tab = params.get("tab");
    if (tab === "projects" || tab === "contacts" || tab === "clients") {
      setActiveTab(tab === "contacts" ? "clients" : tab);
    }
  }, [searchString]);

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
      return { projectId };
    },
    onMutate: async ({ projectId, status }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/crm/projects/all-kanban"] });
      
      const previousData = queryClient.getQueryData<CrmProjectsResponse>(["/api/crm/projects/all-kanban"]);
      
      if (previousData) {
        queryClient.setQueryData<CrmProjectsResponse>(["/api/crm/projects/all-kanban"], {
          ...previousData,
          data: previousData.data.map(project => 
            project.id === projectId 
              ? { ...project, status: status as CrmProjectStatus }
              : project
          ),
        });
      }
      
      return { previousData, projectId };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(["/api/crm/projects/all-kanban"], context.previousData);
      }
      toast({ title: "Failed to update project status", variant: "destructive" });
    },
    onSettled: (_data, _error, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects/all-kanban"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects", variables.projectId] });
    },
  });

  const filteredClients = clients.filter(client => {
    const matchesSearch = clientSearch === "" || 
      client.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
      client.company?.toLowerCase().includes(clientSearch.toLowerCase()) ||
      client.email?.toLowerCase().includes(clientSearch.toLowerCase());
    const matchesStatus = contactStatusFilter === "all" || client.status === contactStatusFilter;
    return matchesSearch && matchesStatus;
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

  const handleDragEnd = (result: DropResult) => {
    const { destination, source, draggableId } = result;
    
    if (!destination) return;
    if (destination.droppableId === source.droppableId) return;
    
    const newStatus = destination.droppableId as CrmProjectStatus;
    
    updateProjectStatusMutation.mutate({ projectId: draggableId, status: newStatus });
  };

  const totalPages = crmProjectsData ? Math.ceil(crmProjectsData.total / pageSize) : 0;

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 w-full">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Project Management</h1>
          <p className="text-sm text-muted-foreground">Manage your projects and contact relationships</p>
        </div>
        <div className="flex gap-2">
          {activeTab === "clients" && (
            <Button onClick={() => navigate("/crm/client/new")} size="icon" data-testid="button-add-contact">
              <Plus className="w-4 h-4" />
            </Button>
          )}
          {activeTab === "projects" && (
            <Link href="/crm/project/new">
              <Button size="icon" data-testid="button-new-project">
                <Plus className="w-4 h-4" />
              </Button>
            </Link>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <TabsList className="bg-muted/80 p-1 h-auto">
            <TabsTrigger value="clients" className="gap-2 px-4 py-2 data-[state=active]:border data-[state=active]:border-border" data-testid="tab-clients">
              <Users className="w-4 h-4" />
              Contacts
              {clients.length > 0 && (
                <Badge variant="secondary" className="ml-1">{clients.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="projects" className="gap-2 px-4 py-2 data-[state=active]:border data-[state=active]:border-border" data-testid="tab-projects">
              <FolderKanban className="w-4 h-4" />
              Projects
              {(allProjectsData?.total ?? crmProjectsData?.total) !== undefined && (
                <Badge variant="secondary" className="ml-1">{allProjectsData?.total ?? crmProjectsData?.total}</Badge>
              )}
            </TabsTrigger>
          </TabsList>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center w-full sm:w-auto">
            {activeTab === "clients" && (
              <>
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
                {contactViewMode === "table" && (
                  <Select value={contactStatusFilter} onValueChange={(v) => setContactStatusFilter(v)}>
                    <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-contact-status-filter">
                      <SelectValue placeholder="Filter by status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      {contactStatusOptions.map(status => (
                        <SelectItem key={status} value={status}>
                          {contactStatusConfig[status].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <div className="flex border rounded-md">
                  <Button
                    variant={contactViewMode === "cards" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setContactViewMode("cards")}
                    className="rounded-r-none"
                    data-testid="button-contact-cards-view"
                  >
                    <LayoutGrid className="w-4 h-4" />
                  </Button>
                  <Button
                    variant={contactViewMode === "table" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setContactViewMode("table")}
                    className="rounded-l-none"
                    data-testid="button-contact-table-view"
                  >
                    <List className="w-4 h-4" />
                  </Button>
                </div>
              </>
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
                    <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-status-filter">
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
            <DragDropContext onDragEnd={handleDragEnd}>
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
                        <div className="bg-muted rounded-lg p-3">
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
                          <Droppable droppableId={status}>
                            {(provided, snapshot) => (
                              <div
                                ref={provided.innerRef}
                                {...provided.droppableProps}
                                className={`space-y-2 min-h-[100px] rounded-md transition-colors ${snapshot.isDraggingOver ? "bg-muted/80" : ""}`}
                              >
                                {projectsInColumn.map((project, index) => (
                                  <Draggable key={project.id} draggableId={project.id} index={index}>
                                    {(provided, snapshot) => (
                                      <div
                                        ref={provided.innerRef}
                                        {...provided.draggableProps}
                                        {...provided.dragHandleProps}
                                      >
                                        <Card
                                          className={`hover-elevate cursor-grab ${snapshot.isDragging ? "shadow-lg rotate-2" : ""}`}
                                          onClick={() => !snapshot.isDragging && setLocation(`/crm/project/${project.id}`)}
                                          data-testid={`kanban-card-${project.id}`}
                                        >
                                          <CardContent className="p-3">
                                            <div className="flex items-start gap-2">
                                              <GripVertical className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
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
                                      </div>
                                    )}
                                  </Draggable>
                                ))}
                                {provided.placeholder}
                                {projectsInColumn.length === 0 && !snapshot.isDraggingOver && (
                                  <div className="text-center py-4 text-xs text-muted-foreground">
                                    No projects
                                  </div>
                                )}
                              </div>
                            )}
                          </Droppable>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </DragDropContext>
          ) : (
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <div className="overflow-x-auto scrollbar-hidden">
                  <table className="w-full min-w-[900px]">
                    <thead>
                      <tr className="bg-muted whitespace-nowrap">
                        <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Project</th>
                        <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Client</th>
                        <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Status</th>
                        <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Assigned</th>
                        <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Start</th>
                        <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Due</th>
                        <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Finished</th>
                        <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Days</th>
                        <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Last Note</th>
                        <th className="text-right px-4 py-3 w-10"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {isLoading ? (
                        <tr>
                          <td colSpan={10} className="p-8 text-center text-muted-foreground">
                            Loading projects...
                          </td>
                        </tr>
                      ) : !crmProjectsData?.data.length ? (
                        <tr>
                          <td colSpan={10} className="p-8 text-center text-muted-foreground">
                            No projects found. Add your first project to get started.
                          </td>
                        </tr>
                      ) : (
                        crmProjectsData?.data.map((crmProject) => (
                          <tr 
                            key={crmProject.id} 
                            className="hover:bg-muted/50 cursor-pointer whitespace-nowrap transition-colors"
                            onClick={() => setLocation(`/crm/project/${crmProject.id}`)}
                            data-testid={`row-crm-project-${crmProject.id}`}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                                  <FolderKanban className="w-4 h-4 text-primary" />
                                </div>
                                <div>
                                  <span className="font-medium text-sm">{crmProject.project?.name || "Unknown"}</span>
                                  {crmProject.documentationEnabled === 1 && (
                                    <Link 
                                      href={`/project/${crmProject.projectId}`} 
                                      onClick={(e) => e.stopPropagation()}
                                      className="ml-1.5"
                                    >
                                      <ExternalLink className="w-3 h-3 text-muted-foreground hover:text-foreground inline" />
                                    </Link>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              {crmProject.client ? (
                                <div className="flex items-center gap-2">
                                  <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                                    <User className="w-3 h-3 text-muted-foreground" />
                                  </div>
                                  <span className="text-sm">{crmProject.client.name}</span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-sm">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <Badge variant={crmStatusConfig[crmProject.status as CrmProjectStatus].variant} className="text-xs">
                                {crmStatusConfig[crmProject.status as CrmProjectStatus].label}
                              </Badge>
                            </td>
                            <td className="px-4 py-3">
                              {crmProject.assignee ? (
                                <div className="flex items-center gap-2">
                                  <Avatar className="w-6 h-6">
                                    <AvatarImage src={crmProject.assignee.profileImageUrl || undefined} />
                                    <AvatarFallback className="text-[10px]">
                                      {crmProject.assignee.firstName?.[0]}{crmProject.assignee.lastName?.[0]}
                                    </AvatarFallback>
                                  </Avatar>
                                  <span className="text-sm">{crmProject.assignee.firstName}</span>
                                </div>
                              ) : (
                                <span className="text-muted-foreground text-sm">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {crmProject.startDate ? (
                                <span className="text-sm text-muted-foreground">
                                  {format(new Date(crmProject.startDate), "MMM d, yyyy")}
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-sm">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {crmProject.dueDate ? (
                                <span className={new Date(crmProject.dueDate) < new Date() && crmProject.status !== "finished" ? "text-destructive text-sm font-medium" : "text-sm"}>
                                  {format(new Date(crmProject.dueDate), "MMM d, yyyy")}
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-sm">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
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
                            <td className="px-4 py-3">
                              {crmProject.dueDate && crmProject.actualFinishDate ? (() => {
                                const dueDate = new Date(crmProject.dueDate);
                                const actualDate = new Date(crmProject.actualFinishDate);
                                const diffTime = dueDate.getTime() - actualDate.getTime();
                                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                                if (diffDays > 0) {
                                  return (
                                    <Badge variant="default" className="text-xs">
                                      {diffDays}d early
                                    </Badge>
                                  );
                                } else if (diffDays < 0) {
                                  return (
                                    <Badge variant="destructive" className="text-xs">
                                      {Math.abs(diffDays)}d late
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
                            <td className="px-4 py-3 max-w-[200px]">
                              {crmProject.latestNote ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="flex items-center gap-1.5 cursor-default">
                                      <StickyNote className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                                      <span className="text-sm text-muted-foreground truncate">
                                        {crmProject.latestNote.content.substring(0, 40)}{crmProject.latestNote.content.length > 40 ? "..." : ""}
                                      </span>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="left" className="max-w-[300px]">
                                    <p className="text-sm whitespace-pre-wrap">{crmProject.latestNote.content}</p>
                                    <p className="text-xs text-muted-foreground mt-1">
                                      — {crmProject.latestNote.createdBy?.firstName} {crmProject.latestNote.createdBy?.lastName}{crmProject.latestNote.createdAt ? `, ${format(new Date(crmProject.latestNote.createdAt), "MMM d")}` : ""}
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              ) : (
                                <span className="text-muted-foreground text-sm">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="w-7 h-7"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteProjectId(crmProject.id);
                                }}
                                data-testid={`button-delete-project-${crmProject.id}`}
                              >
                                <Trash2 className="w-3.5 h-3.5 text-destructive" />
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
          {contactViewMode === "cards" ? (
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
                    <CardContent className="px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <User className="w-3 h-3 text-primary" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium truncate" data-testid={`text-client-name-${client.id}`}>
                                {client.name}
                              </p>
                              {client.status && (
                                <Badge 
                                  variant={contactStatusConfig[client.status]?.variant || "secondary"}
                                  className="text-xs py-0"
                                  data-testid={`badge-client-status-${client.id}`}
                                >
                                  {contactStatusConfig[client.status]?.label || client.status}
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              {client.company && (
                                <span className="flex items-center gap-1 truncate">
                                  <Building2 className="w-3 h-3 shrink-0" />
                                  {client.company}
                                </span>
                              )}
                              {client.email && (
                                <span className="flex items-center gap-1 truncate">
                                  <Mail className="w-3 h-3 shrink-0" />
                                  {client.email}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <span className="text-xs text-muted-foreground hidden sm:block">
                            {client.createdAt ? format(new Date(client.createdAt), "MMM d, yyyy") : ""}
                          </span>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="w-7 h-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              setDeleteContactId(client.id);
                            }}
                            data-testid={`button-delete-contact-${client.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="w-7 h-7"
                            onClick={(e) => {
                              e.stopPropagation();
                              setLocation(`/crm/client/${client.id}`);
                            }}
                            data-testid={`button-view-contact-${client.id}`}
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto scrollbar-hidden">
                  <table className="w-full min-w-[700px]">
                    <thead>
                      <tr className="border-b bg-muted/50 whitespace-nowrap">
                        <th className="text-left px-3 py-2 font-medium text-sm">Name</th>
                        <th className="text-left px-3 py-2 font-medium text-sm">Company</th>
                        <th className="text-left px-3 py-2 font-medium text-sm">Email</th>
                        <th className="text-left px-3 py-2 font-medium text-sm">Status</th>
                        <th className="text-left px-3 py-2 font-medium text-sm">Created</th>
                        <th className="text-right px-3 py-2 font-medium w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {clientsLoading ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-muted-foreground">
                            Loading contacts...
                          </td>
                        </tr>
                      ) : filteredClients.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="p-8 text-center text-muted-foreground">
                            {clients.length === 0 
                              ? "No contacts yet. Add your first contact to get started."
                              : "No contacts match your search."}
                          </td>
                        </tr>
                      ) : (
                        filteredClients.map((client) => (
                          <tr 
                            key={client.id} 
                            className="border-b hover-elevate cursor-pointer whitespace-nowrap"
                            onClick={() => setLocation(`/crm/client/${client.id}`)}
                            data-testid={`row-client-table-${client.id}`}
                          >
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1.5">
                                <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                                  <User className="w-2.5 h-2.5 text-primary" />
                                </div>
                                <span className="font-medium text-sm">{client.name}</span>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-muted-foreground text-sm">{client.company || "-"}</td>
                            <td className="px-3 py-2 text-muted-foreground text-sm">{client.email || "-"}</td>
                            <td className="px-3 py-2">
                              {client.status ? (
                                <Badge 
                                  variant={contactStatusConfig[client.status]?.variant || "secondary"}
                                  className="text-xs"
                                  data-testid={`badge-client-table-status-${client.id}`}
                                >
                                  {contactStatusConfig[client.status]?.label || client.status}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground text-sm">-</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-muted-foreground text-sm">
                              {client.createdAt ? format(new Date(client.createdAt), "MMM d, yyyy") : "-"}
                            </td>
                            <td className="px-3 py-2 text-right">
                              <div className="flex items-center justify-end gap-0.5">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="w-7 h-7"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setDeleteContactId(client.id);
                                  }}
                                  data-testid={`button-delete-contact-table-${client.id}`}
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-destructive" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="w-7 h-7"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setLocation(`/crm/client/${client.id}`);
                                  }}
                                  data-testid={`button-view-contact-table-${client.id}`}
                                >
                                  <ChevronRight className="w-3.5 h-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Delete Contact Confirmation */}
      <AlertDialog open={!!deleteContactId} onOpenChange={(open) => !open && setDeleteContactId(null)}>
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Contact</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this contact? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:gap-0">
            <AlertDialogCancel className="w-full sm:w-auto">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteContactId && deleteContactMutation.mutate(deleteContactId)}
              className="w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Project Confirmation */}
      <AlertDialog open={!!deleteProjectId} onOpenChange={(open) => !open && setDeleteProjectId(null)}>
        <AlertDialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Project</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this project? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:gap-0">
            <AlertDialogCancel className="w-full sm:w-auto">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteProjectId && deleteProjectMutation.mutate(deleteProjectId)}
              className="w-full sm:w-auto bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
