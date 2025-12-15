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
  Pencil
} from "lucide-react";
import { Link } from "wouter";
import type { 
  CrmProjectWithDetails, 
  CrmClient, 
  CrmProjectStatus
} from "@shared/schema";

const crmStatusConfig: Record<CrmProjectStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  lead: { label: "Lead", variant: "secondary" },
  in_discussion: { label: "In Discussion", variant: "outline" },
  closed: { label: "Closed", variant: "destructive" },
  in_development: { label: "In Development", variant: "default" },
  documented: { label: "Documented", variant: "outline" },
  finished: { label: "Finished", variant: "default" },
};

const statusOptions: CrmProjectStatus[] = ["lead", "in_discussion", "closed", "in_development", "documented", "finished"];

interface CrmProjectsResponse {
  data: CrmProjectWithDetails[];
  total: number;
  page: number;
  pageSize: number;
}

export default function CrmPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<string>("projects");
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [clientSearch, setClientSearch] = useState("");
  const [showAddClientDialog, setShowAddClientDialog] = useState(false);
  const [showLinkProjectDialog, setShowLinkProjectDialog] = useState(false);
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

  const filteredClients = clients.filter(client => 
    clientSearch === "" || 
    client.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
    client.company?.toLowerCase().includes(clientSearch.toLowerCase()) ||
    client.email?.toLowerCase().includes(clientSearch.toLowerCase())
  );

  const createCrmProjectMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string | null; clientId?: string | null }) => {
      return apiRequest("POST", "/api/crm/projects", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects"] });
      setShowLinkProjectDialog(false);
      toast({ title: "Project created" });
    },
    onError: () => {
      toast({ title: "Failed to create project", variant: "destructive" });
    },
  });

  const createClientMutation = useMutation({
    mutationFn: async (data: { name: string; email?: string | null; company?: string | null; notes?: string | null }) => {
      return apiRequest("POST", "/api/crm/clients", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/clients"] });
      setShowAddClientDialog(false);
      toast({ title: "Client created" });
    },
    onError: () => {
      toast({ title: "Failed to create client", variant: "destructive" });
    },
  });


  const totalPages = crmProjectsData ? Math.ceil(crmProjectsData.total / pageSize) : 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-page-title">Project Management</h1>
          <p className="text-muted-foreground">Manage your projects and client relationships</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <TabsList>
            <TabsTrigger value="projects" className="gap-2" data-testid="tab-projects">
              <FolderKanban className="w-4 h-4" />
              Projects
            </TabsTrigger>
            <TabsTrigger value="clients" className="gap-2" data-testid="tab-clients">
              <Users className="w-4 h-4" />
              Contacts
              {clients.length > 0 && (
                <Badge variant="secondary" className="ml-1">{clients.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>
          <div className="flex gap-2">
            {activeTab === "clients" ? (
              <Button onClick={() => setShowAddClientDialog(true)} data-testid="button-add-client">
                <Plus className="w-4 h-4 mr-2" />
                New Client
              </Button>
            ) : (
              <Button onClick={() => setShowLinkProjectDialog(true)} data-testid="button-link-project">
                <Plus className="w-4 h-4 mr-2" />
                New Project
              </Button>
            )}
          </div>
        </div>

        <TabsContent value="projects" className="space-y-4 mt-0">
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                <div className="relative flex-1">
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
              </div>
            </CardContent>
          </Card>

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
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-muted-foreground">
                          Loading projects...
                        </td>
                      </tr>
                    ) : !crmProjectsData?.data.length ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-muted-foreground">
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
        </TabsContent>

        <TabsContent value="clients" className="space-y-4 mt-0">
          <Card>
            <CardContent className="pt-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search clients by name, company, or email..."
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  className="pl-9"
                  data-testid="input-client-search"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left py-2 px-4 font-medium text-sm">Name</th>
                      <th className="text-left py-2 px-4 font-medium text-sm">Company</th>
                      <th className="text-left py-2 px-4 font-medium text-sm">Email</th>
                      <th className="text-left py-2 px-4 font-medium text-sm">Created</th>
                      <th className="text-right py-2 px-4 font-medium text-sm w-20">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientsLoading ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-muted-foreground">
                          Loading clients...
                        </td>
                      </tr>
                    ) : filteredClients.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-muted-foreground">
                          {clients.length === 0 
                            ? "No clients yet. Add your first client to get started."
                            : "No clients match your search."}
                        </td>
                      </tr>
                    ) : (
                      filteredClients.map((client) => (
                        <tr 
                          key={client.id} 
                          className="border-b hover-elevate cursor-pointer"
                          onClick={() => setLocation(`/crm/client/${client.id}`)}
                          data-testid={`row-client-${client.id}`}
                        >
                          <td className="py-2 px-4">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center">
                                <User className="w-3 h-3 text-primary" />
                              </div>
                              <span className="font-medium text-sm" data-testid={`text-client-name-${client.id}`}>
                                {client.name}
                              </span>
                            </div>
                          </td>
                          <td className="py-2 px-4">
                            {client.company ? (
                              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                <Building2 className="w-3.5 h-3.5" />
                                <span>{client.company}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </td>
                          <td className="py-2 px-4">
                            {client.email ? (
                              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                                <Mail className="w-3.5 h-3.5" />
                                <span>{client.email}</span>
                              </div>
                            ) : (
                              <span className="text-muted-foreground text-sm">—</span>
                            )}
                          </td>
                          <td className="py-2 px-4 text-muted-foreground text-sm">
                            {client.createdAt ? format(new Date(client.createdAt), "MMM d, yyyy") : "—"}
                          </td>
                          <td className="py-2 px-4 text-right">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={(e) => {
                                e.stopPropagation();
                                setLocation(`/crm/client/${client.id}`);
                              }}
                              data-testid={`button-view-client-${client.id}`}
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
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
    </div>
  );
}

const clientFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  company: z.string().optional(),
  notes: z.string().optional(),
});

interface AddClientDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; email?: string | null; company?: string | null; notes?: string | null }) => void;
  isLoading: boolean;
}

function AddClientDialog({ open, onClose, onSubmit, isLoading }: AddClientDialogProps) {
  const form = useForm({
    resolver: zodResolver(clientFormSchema),
    defaultValues: { name: "", email: "", company: "", notes: "" },
  });

  const handleSubmit = (data: z.infer<typeof clientFormSchema>) => {
    onSubmit({
      name: data.name,
      email: data.email || null,
      company: data.company || null,
      notes: data.notes || null,
    });
    form.reset();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add New Client</DialogTitle>
          <DialogDescription>Create a new client to associate with projects</DialogDescription>
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
                    <Input {...field} placeholder="Client name" data-testid="input-client-name" />
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
                    <Input {...field} type="email" placeholder="client@example.com" data-testid="input-client-email" />
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
                {isLoading ? "Creating..." : "Create Client"}
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
});

interface CreateProjectDialogProps {
  open: boolean;
  onClose: () => void;
  clients: CrmClient[];
  onSubmit: (data: { name: string; description?: string | null; clientId?: string | null }) => void;
  isLoading: boolean;
}

function CreateProjectDialog({ open, onClose, clients, onSubmit, isLoading }: CreateProjectDialogProps) {
  const form = useForm({
    resolver: zodResolver(projectFormSchema),
    defaultValues: { name: "", description: "", clientId: "" },
  });

  const handleSubmit = (data: z.infer<typeof projectFormSchema>) => {
    onSubmit({
      name: data.name,
      description: data.description || null,
      clientId: data.clientId || null,
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
                  <FormLabel>Client (Optional)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-project-client">
                        <SelectValue placeholder="Select a client" />
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
