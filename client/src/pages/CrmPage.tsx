import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { 
  Search, 
  Plus, 
  ChevronLeft, 
  ChevronRight,
  Building2,
  User,
  Mail,
  Phone,
  CalendarDays,
  MessageSquare,
  ExternalLink,
  Pencil,
  Trash2,
  UserPlus,
  X
} from "lucide-react";
import { Link } from "wouter";
import type { 
  CrmProjectWithDetails, 
  Project, 
  CrmClient, 
  CrmContact, 
  SafeUser,
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
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedProject, setSelectedProject] = useState<CrmProjectWithDetails | null>(null);
  const [showAddClientDialog, setShowAddClientDialog] = useState(false);
  const [showAddContactDialog, setShowAddContactDialog] = useState(false);
  const [showLinkProjectDialog, setShowLinkProjectDialog] = useState(false);
  const [editingClient, setEditingClient] = useState<CrmClient | null>(null);
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

  const { data: clients = [] } = useQuery<CrmClient[]>({
    queryKey: ["/api/crm/clients"],
  });

  const { data: users = [] } = useQuery<SafeUser[]>({
    queryKey: ["/api/users"],
  });

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ["/api/projects"],
  });

  const updateCrmProjectMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CrmProjectWithDetails> }) => {
      return apiRequest("PATCH", `/api/crm/projects/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects"] });
      toast({ title: "Project updated" });
    },
    onError: () => {
      toast({ title: "Failed to update project", variant: "destructive" });
    },
  });

  const createCrmProjectMutation = useMutation({
    mutationFn: async (data: { projectId: string; clientId?: string | null }) => {
      return apiRequest("POST", "/api/crm/projects", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects"] });
      setShowLinkProjectDialog(false);
      toast({ title: "Project added to CRM" });
    },
    onError: () => {
      toast({ title: "Failed to add project", variant: "destructive" });
    },
  });

  const createClientMutation = useMutation({
    mutationFn: async (data: { name: string; company?: string | null; notes?: string | null }) => {
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

  const updateClientMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CrmClient> }) => {
      return apiRequest("PATCH", `/api/crm/clients/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/clients"] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects"] });
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
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects"] });
      setShowAddContactDialog(false);
      toast({ title: "Contact added" });
    },
    onError: () => {
      toast({ title: "Failed to add contact", variant: "destructive" });
    },
  });

  const totalPages = crmProjectsData ? Math.ceil(crmProjectsData.total / pageSize) : 0;

  const existingProjectIds = crmProjectsData?.data.map(cp => cp.projectId) || [];
  const availableProjects = projects.filter(p => !existingProjectIds.includes(p.id));

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold" data-testid="text-crm-title">Project Management</h1>
          <p className="text-muted-foreground">Track clients, timelines, and project status</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => setShowAddClientDialog(true)}
            data-testid="button-add-client"
          >
            <Building2 className="w-4 h-4 mr-2" />
            Add Client
          </Button>
          <Button 
            onClick={() => setShowLinkProjectDialog(true)}
            disabled={availableProjects.length === 0}
            data-testid="button-add-project"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Project
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search projects or clients..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-10"
            data-testid="input-search"
          />
        </div>
        <Select 
          value={statusFilter} 
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
        >
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
                  <th className="text-left p-4 font-medium">Timeline</th>
                  <th className="text-left p-4 font-medium">Comments</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      <div className="animate-pulse">Loading...</div>
                    </td>
                  </tr>
                ) : crmProjectsData?.data.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      No projects found. Add your first project to get started.
                    </td>
                  </tr>
                ) : (
                  crmProjectsData?.data.map((crmProject) => (
                    <tr 
                      key={crmProject.id} 
                      className="border-b hover-elevate cursor-pointer"
                      onClick={() => setSelectedProject(crmProject)}
                      data-testid={`row-crm-project-${crmProject.id}`}
                    >
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{crmProject.project?.name || "Unknown"}</span>
                          <Link 
                            href={`/project/${crmProject.projectId}`} 
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                          </Link>
                        </div>
                      </td>
                      <td className="p-4">
                        {crmProject.client ? (
                          <div className="flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-muted-foreground" />
                            <span>{crmProject.client.name}</span>
                            {crmProject.client.company && (
                              <span className="text-muted-foreground text-sm">({crmProject.client.company})</span>
                            )}
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
                        <div className="text-sm space-y-1">
                          {crmProject.startDate && (
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground">Start:</span>
                              <span>{format(new Date(crmProject.startDate), "MMM d, yyyy")}</span>
                            </div>
                          )}
                          {crmProject.dueDate && (
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground">Due:</span>
                              <span className={new Date(crmProject.dueDate) < new Date() && crmProject.status !== "finished" ? "text-destructive" : ""}>
                                {format(new Date(crmProject.dueDate), "MMM d, yyyy")}
                              </span>
                            </div>
                          )}
                          {crmProject.actualFinishDate && (
                            <div className="flex items-center gap-1">
                              <span className="text-muted-foreground">Finished:</span>
                              <span className="text-green-600 dark:text-green-400">{format(new Date(crmProject.actualFinishDate), "MMM d, yyyy")}</span>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        <div className="max-w-[200px] truncate text-sm text-muted-foreground">
                          {crmProject.comments || "—"}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between p-4 border-t">
              <div className="text-sm text-muted-foreground">
                Showing {((page - 1) * pageSize) + 1} to {Math.min(page * pageSize, crmProjectsData?.total || 0)} of {crmProjectsData?.total || 0}
              </div>
              <div className="flex items-center gap-2">
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

      <ProjectDetailSheet 
        project={selectedProject}
        onClose={() => setSelectedProject(null)}
        clients={clients}
        users={users}
        onUpdate={(data) => {
          if (selectedProject) {
            updateCrmProjectMutation.mutate({ id: selectedProject.id, data });
          }
        }}
        onAddContact={(clientId) => {
          setShowAddContactDialog(true);
        }}
        onEditClient={(client) => setEditingClient(client)}
      />

      <AddClientDialog 
        open={showAddClientDialog}
        onClose={() => setShowAddClientDialog(false)}
        onSubmit={(data) => createClientMutation.mutate(data)}
        isLoading={createClientMutation.isPending}
      />

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
        clientId={selectedProject?.clientId || null}
        onSubmit={(clientId, data) => createContactMutation.mutate({ clientId, data })}
        isLoading={createContactMutation.isPending}
      />

      <LinkProjectDialog
        open={showLinkProjectDialog}
        onClose={() => setShowLinkProjectDialog(false)}
        projects={availableProjects}
        clients={clients}
        onSubmit={(data) => createCrmProjectMutation.mutate(data)}
        isLoading={createCrmProjectMutation.isPending}
      />
    </div>
  );
}

interface ProjectDetailSheetProps {
  project: CrmProjectWithDetails | null;
  onClose: () => void;
  clients: CrmClient[];
  users: SafeUser[];
  onUpdate: (data: Partial<CrmProjectWithDetails>) => void;
  onAddContact: (clientId: string) => void;
  onEditClient: (client: CrmClient) => void;
}

function ProjectDetailSheet({ project, onClose, clients, users, onUpdate, onAddContact, onEditClient }: ProjectDetailSheetProps) {
  if (!project) return null;

  return (
    <Sheet open={!!project} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {project.project?.name}
            <Link href={`/project/${project.projectId}`}>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <ExternalLink className="w-4 h-4" />
              </Button>
            </Link>
          </SheetTitle>
          <SheetDescription>
            Manage project details and timeline
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium">Status</label>
            <Select 
              value={project.status} 
              onValueChange={(v) => onUpdate({ status: v as CrmProjectStatus })}
            >
              <SelectTrigger data-testid="select-project-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map(status => (
                  <SelectItem key={status} value={status}>
                    {crmStatusConfig[status as CrmProjectStatus].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Client</label>
            <Select 
              value={project.clientId || "_none"} 
              onValueChange={(v) => onUpdate({ clientId: v === "_none" ? null : v })}
            >
              <SelectTrigger data-testid="select-project-client">
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

          {project.client && (
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="w-4 h-4" />
                    {project.client.name}
                  </CardTitle>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => onEditClient(project.client!)}
                    data-testid="button-edit-client"
                  >
                    <Pencil className="w-3 h-3" />
                  </Button>
                </div>
                {project.client.company && (
                  <CardDescription>{project.client.company}</CardDescription>
                )}
              </CardHeader>
              <CardContent className="space-y-3">
                {project.client.contacts && project.client.contacts.length > 0 ? (
                  <div className="space-y-2">
                    {project.client.contacts.map((contact: CrmContact) => (
                      <div key={contact.id} className="flex items-start gap-3 p-2 rounded-lg bg-muted/50">
                        <Avatar className="w-8 h-8">
                          <AvatarFallback className="text-xs">
                            {contact.name.split(" ").map(n => n[0]).join("").toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{contact.name}</span>
                            {contact.isPrimary && (
                              <Badge variant="secondary" className="text-xs">Primary</Badge>
                            )}
                          </div>
                          {contact.role && (
                            <p className="text-xs text-muted-foreground">{contact.role}</p>
                          )}
                          <div className="flex flex-wrap gap-3 mt-1">
                            {contact.email && (
                              <a href={`mailto:${contact.email}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                                <Mail className="w-3 h-3" />
                                {contact.email}
                              </a>
                            )}
                            {contact.phone && (
                              <a href={`tel:${contact.phone}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                                <Phone className="w-3 h-3" />
                                {contact.phone}
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No contacts added</p>
                )}
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full"
                  onClick={() => project.clientId && onAddContact(project.clientId)}
                  data-testid="button-add-contact"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Add Contact
                </Button>
              </CardContent>
            </Card>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Assigned To</label>
            <Select 
              value={project.assigneeId || "_none"} 
              onValueChange={(v) => onUpdate({ assigneeId: v === "_none" ? null : v })}
            >
              <SelectTrigger data-testid="select-project-assignee">
                <SelectValue placeholder="Select assignee" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_none">Unassigned</SelectItem>
                {users.map(user => (
                  <SelectItem key={user.id} value={user.id}>
                    {user.firstName} {user.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <DatePickerField
              label="Start Date"
              value={project.startDate ? new Date(project.startDate) : undefined}
              onChange={(date) => {
                const updates: Record<string, string | null> = {
                  startDate: date?.toISOString() || null,
                };
                if (date && !project.dueDate) {
                  const dueDate = new Date(date);
                  dueDate.setDate(dueDate.getDate() + 7);
                  updates.dueDate = dueDate.toISOString();
                }
                onUpdate(updates as any);
              }}
              testId="date-start"
            />
            <DatePickerField
              label="Due Date"
              value={project.dueDate ? new Date(project.dueDate) : undefined}
              onChange={(date) => onUpdate({ dueDate: date?.toISOString() || null } as any)}
              testId="date-due"
            />
          </div>

          <DatePickerField
            label="Actual Finish Date"
            value={project.actualFinishDate ? new Date(project.actualFinishDate) : undefined}
            onChange={(date) => onUpdate({ actualFinishDate: date?.toISOString() || null } as any)}
            testId="date-finish"
          />

          <div className="space-y-2">
            <label className="text-sm font-medium flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Comments
            </label>
            <Textarea
              value={project.comments || ""}
              onChange={(e) => onUpdate({ comments: e.target.value })}
              placeholder="Add notes about this project..."
              rows={4}
              data-testid="textarea-comments"
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface DatePickerFieldProps {
  label: string;
  value?: Date;
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
            data-testid={`button-${testId}`}
          >
            <CalendarDays className="mr-2 h-4 w-4" />
            {value ? format(value, "MMM d, yyyy") : "Pick a date"}
            {value && (
              <X 
                className="ml-auto h-4 w-4 text-muted-foreground hover:text-foreground" 
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(undefined);
                }}
              />
            )}
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
  notes: z.string().optional(),
});

interface AddClientDialogProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; company?: string | null; notes?: string | null }) => void;
  isLoading: boolean;
}

function AddClientDialog({ open, onClose, onSubmit, isLoading }: AddClientDialogProps) {
  const form = useForm({
    resolver: zodResolver(clientFormSchema),
    defaultValues: { name: "", company: "", notes: "" },
  });

  const handleSubmit = (data: z.infer<typeof clientFormSchema>) => {
    onSubmit({
      name: data.name,
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
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
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

interface EditClientDialogProps {
  client: CrmClient | null;
  onClose: () => void;
  onSubmit: (data: Partial<CrmClient>) => void;
  isLoading: boolean;
}

function EditClientDialog({ client, onClose, onSubmit, isLoading }: EditClientDialogProps) {
  const form = useForm({
    resolver: zodResolver(clientFormSchema),
    defaultValues: { name: client?.name || "", company: client?.company || "", notes: client?.notes || "" },
  });

  const handleSubmit = (data: z.infer<typeof clientFormSchema>) => {
    onSubmit({
      name: data.name,
      company: data.company || null,
      notes: data.notes || null,
    });
  };

  if (!client) return null;

  return (
    <Dialog open={!!client} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
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
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={isLoading} data-testid="button-update-client">
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
      <DialogContent>
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
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="submit" disabled={isLoading || !clientId} data-testid="button-submit-contact">
                {isLoading ? "Adding..." : "Add Contact"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

interface LinkProjectDialogProps {
  open: boolean;
  onClose: () => void;
  projects: Project[];
  clients: CrmClient[];
  onSubmit: (data: { projectId: string; clientId?: string | null }) => void;
  isLoading: boolean;
}

function LinkProjectDialog({ open, onClose, projects, clients, onSubmit, isLoading }: LinkProjectDialogProps) {
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [selectedClient, setSelectedClient] = useState<string>("_none");

  const handleSubmit = () => {
    if (!selectedProject) return;
    onSubmit({
      projectId: selectedProject,
      clientId: selectedClient === "_none" ? null : selectedClient,
    });
    setSelectedProject("");
    setSelectedClient("_none");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Project to CRM</DialogTitle>
          <DialogDescription>Link an existing project to track in your CRM</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Project</label>
            <Select value={selectedProject} onValueChange={setSelectedProject}>
              <SelectTrigger data-testid="select-link-project">
                <SelectValue placeholder="Select a project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map(project => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Client (Optional)</label>
            <Select value={selectedClient} onValueChange={setSelectedClient}>
              <SelectTrigger data-testid="select-link-client">
                <SelectValue placeholder="Select a client" />
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
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isLoading || !selectedProject} data-testid="button-link-project">
            {isLoading ? "Adding..." : "Add to CRM"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
