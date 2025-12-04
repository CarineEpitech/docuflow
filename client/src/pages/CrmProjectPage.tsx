import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
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
  CheckCircle
} from "lucide-react";
import { Link } from "wouter";
import type { 
  CrmProjectWithDetails, 
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

export default function CrmProjectPage() {
  const { toast } = useToast();
  const [, params] = useRoute("/crm/project/:id");
  const [, setLocation] = useLocation();
  const projectId = params?.id;

  const [formData, setFormData] = useState<{
    status: CrmProjectStatus;
    clientId: string | null;
    assigneeId: string | null;
    startDate: Date | null;
    dueDate: Date | null;
    actualFinishDate: Date | null;
    comments: string;
    documentationEnabled: boolean;
  } | null>(null);

  const [hasChanges, setHasChanges] = useState(false);
  const [showAddContactDialog, setShowAddContactDialog] = useState(false);
  const [editingClient, setEditingClient] = useState<CrmClient | null>(null);

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

  useEffect(() => {
    if (project && !formData) {
      setFormData({
        status: project.status as CrmProjectStatus,
        clientId: project.clientId,
        assigneeId: project.assigneeId,
        startDate: project.startDate ? new Date(project.startDate) : null,
        dueDate: project.dueDate ? new Date(project.dueDate) : null,
        actualFinishDate: project.actualFinishDate ? new Date(project.actualFinishDate) : null,
        comments: project.comments || "",
        documentationEnabled: project.documentationEnabled === 1,
      });
    }
  }, [project, formData]);

  const updateFormField = <K extends keyof NonNullable<typeof formData>>(
    field: K, 
    value: NonNullable<typeof formData>[K]
  ) => {
    if (!formData) return;
    setFormData({ ...formData, [field]: value });
    setHasChanges(true);
  };

  const updateCrmProjectMutation = useMutation({
    mutationFn: async (data: Partial<CrmProjectWithDetails>) => {
      return apiRequest("PATCH", `/api/crm/projects/${projectId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects"] });
      setHasChanges(false);
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

  const handleSave = () => {
    if (!formData) return;
    
    const updateData: Record<string, unknown> = {
      status: formData.status,
      clientId: formData.clientId,
      assigneeId: formData.assigneeId,
      startDate: formData.startDate?.toISOString() || null,
      dueDate: formData.dueDate?.toISOString() || null,
      actualFinishDate: formData.actualFinishDate?.toISOString() || null,
      comments: formData.comments || null,
    };
    
    updateCrmProjectMutation.mutate(updateData as Partial<CrmProjectWithDetails>);
  };

  const handleDocumentationToggle = (enabled: boolean) => {
    updateFormField("documentationEnabled", enabled);
    toggleDocumentationMutation.mutate({ enabled });
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-muted rounded w-1/3"></div>
          <div className="h-64 bg-muted rounded"></div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
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
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/crm")} data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-project-title">{project.project?.name}</h1>
            <p className="text-muted-foreground">Project Details</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {formData?.documentationEnabled && (
            <Link href={`/project/${project.projectId}`}>
              <Button variant="outline" data-testid="button-view-docs">
                <FileText className="w-4 h-4 mr-2" />
                View Documentation
              </Button>
            </Link>
          )}
          {hasChanges && (
            <Button 
              onClick={handleSave} 
              disabled={updateCrmProjectMutation.isPending}
              data-testid="button-save-changes"
            >
              <Save className="w-4 h-4 mr-2" />
              {updateCrmProjectMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Documentation
          </CardTitle>
          <CardDescription>Enable to add this project to the Documentation section</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">
                {formData?.documentationEnabled ? "Documentation is enabled" : "Documentation is disabled"}
              </p>
              <p className="text-xs text-muted-foreground">
                {formData?.documentationEnabled 
                  ? "This project appears in the Documentation sidebar" 
                  : "Enable to start documenting this project"}
              </p>
            </div>
            <Switch
              checked={formData?.documentationEnabled || false}
              onCheckedChange={handleDocumentationToggle}
              data-testid="switch-documentation"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Project Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
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
                        <Badge variant={crmStatusConfig[status].variant} className="text-xs">
                          {crmStatusConfig[status].label}
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
              <label className="text-sm font-medium">Comments</label>
              <Textarea
                value={formData?.comments || ""}
                onChange={(e) => updateFormField("comments", e.target.value)}
                placeholder="Add notes about this project..."
                className="min-h-[100px]"
                data-testid="textarea-comments"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5" />
              Timeline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <DatePickerField
              label="Start Date"
              value={formData?.startDate || undefined}
              onChange={(date) => updateFormField("startDate", date || null)}
              testId="datepicker-start"
            />
            <DatePickerField
              label="Due Date"
              value={formData?.dueDate || undefined}
              onChange={(date) => updateFormField("dueDate", date || null)}
              testId="datepicker-due"
            />
            <DatePickerField
              label="Actual Finish Date"
              value={formData?.actualFinishDate || undefined}
              onChange={(date) => updateFormField("actualFinishDate", date || null)}
              testId="datepicker-finish"
            />
            
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

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5" />
                Client Information
              </CardTitle>
              <CardDescription>Associated client and contacts</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
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

          {selectedClient && (
            <>
              <Separator />
              <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-muted-foreground" />
                    <span className="font-medium">{selectedClient.name}</span>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setEditingClient(selectedClient)}
                    data-testid="button-edit-client"
                  >
                    <Pencil className="w-3 h-3 mr-1" />
                    Edit
                  </Button>
                </div>
                
                {selectedClient.company && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Briefcase className="w-3 h-3" />
                    <span>{selectedClient.company}</span>
                  </div>
                )}
                
                {selectedClient.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="w-3 h-3 text-muted-foreground" />
                    <a href={`mailto:${selectedClient.email}`} className="text-primary hover:underline">
                      {selectedClient.email}
                    </a>
                  </div>
                )}
                
                {selectedClient.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="w-3 h-3 text-muted-foreground" />
                    <a href={`tel:${selectedClient.phone}`} className="hover:underline">
                      {selectedClient.phone}
                    </a>
                  </div>
                )}
                
                {selectedClient.notes && (
                  <div className="text-sm text-muted-foreground mt-2 pt-2 border-t">
                    <p className="font-medium text-xs mb-1">Notes:</p>
                    <p>{selectedClient.notes}</p>
                  </div>
                )}
              </div>

              {project.client?.contacts && project.client.contacts.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">Contacts</h4>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => setShowAddContactDialog(true)}
                      data-testid="button-add-contact"
                    >
                      <UserPlus className="w-3 h-3 mr-1" />
                      Add Contact
                    </Button>
                  </div>
                  <div className="grid gap-2">
                    {project.client.contacts.map((contact) => (
                      <div key={contact.id} className="flex items-center justify-between bg-muted/30 rounded p-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="w-8 h-8">
                            <AvatarFallback className="text-xs">
                              {contact.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium text-sm">{contact.name}</p>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground">
                              {contact.role && <span>{contact.role}</span>}
                              {contact.email && (
                                <a href={`mailto:${contact.email}`} className="hover:underline flex items-center gap-1">
                                  <Mail className="w-3 h-3" />
                                  {contact.email}
                                </a>
                              )}
                              {contact.phone && (
                                <span className="flex items-center gap-1">
                                  <Phone className="w-3 h-3" />
                                  {contact.phone}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        {contact.isPrimary && (
                          <Badge variant="outline" className="text-xs">Primary</Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(!project.client?.contacts || project.client.contacts.length === 0) && (
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => setShowAddContactDialog(true)}
                  data-testid="button-add-first-contact"
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  Add First Contact
                </Button>
              )}
            </>
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
