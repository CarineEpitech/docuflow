import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format, addDays } from "date-fns";
import { 
  ArrowLeft,
  FolderKanban,
  Save,
  CalendarDays,
  Clock
} from "lucide-react";
import type { CrmClient, CrmProjectStatus } from "@shared/schema";

const crmStatusConfig: Record<CrmProjectStatus, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  lead: { label: "Lead", variant: "secondary" },
  discovering_call_completed: { label: "Discovery Call Completed", variant: "outline" },
  proposal_sent: { label: "Proposal Sent", variant: "outline" },
  won: { label: "Won", variant: "default" },
  won_not_started: { label: "Won - Not Started", variant: "default" },
  won_in_progress: { label: "Won - In Progress", variant: "default" },
  won_in_review: { label: "Won - In Review", variant: "outline" },
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

export default function ProjectCreatePage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, navigate] = useLocation();

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    clientId: "",
    status: "lead" as CrmProjectStatus,
    startDate: null as Date | null,
    budgetedHours: "",
    actualHours: "",
  });

  const { data: clients = [] } = useQuery<CrmClient[]>({
    queryKey: ["/api/crm/clients"],
  });

  // Calculate estimated end date based on start date, budgeted hours, and hours per day
  const hoursPerDay = user?.hoursPerDay || 8;
  const estimatedEndDate = formData.startDate && formData.budgetedHours 
    ? addDays(formData.startDate, Math.ceil(parseInt(formData.budgetedHours) / hoursPerDay))
    : null;

  const createProjectMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string | null; clientId?: string | null; status?: string | null; startDate?: string | null; budgetedHours?: number | null; actualHours?: number | null }) => {
      return apiRequest("POST", "/api/crm/projects", data);
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/projects"] });
      toast({
        title: "Project Created",
        description: "The project has been created successfully.",
      });
      navigate(`/crm/project/${response.crmProject.id}`);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create project",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      toast({
        title: "Validation Error",
        description: "Project name is required",
        variant: "destructive",
      });
      return;
    }
    if (!formData.description.trim()) {
      toast({
        title: "Validation Error",
        description: "Project description is required",
        variant: "destructive",
      });
      return;
    }
    if (!formData.startDate) {
      toast({
        title: "Validation Error",
        description: "Start date is required",
        variant: "destructive",
      });
      return;
    }
    createProjectMutation.mutate({
      name: formData.name,
      description: formData.description || null,
      clientId: formData.clientId || null,
      status: formData.status || "lead",
      startDate: formData.startDate?.toISOString() || null,
      budgetedHours: formData.budgetedHours ? parseInt(formData.budgetedHours) : null,
      actualHours: formData.actualHours ? parseInt(formData.actualHours) : null,
    });
  };

  return (
    <div className="w-full p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">New Project</h1>
          <p className="text-sm text-muted-foreground">Add a new project to track in your CRM</p>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => navigate("/crm")}
          data-testid="button-back-crm"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderKanban className="h-5 w-5" />
            Project Information
          </CardTitle>
          <CardDescription>Fill in the details for your new project</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">Project Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Enter project name"
                data-testid="input-project-name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description <span className="text-destructive">*</span></Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Enter project description"
                rows={4}
                data-testid="textarea-project-description"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="client">Contact (Optional)</Label>
              <Select 
                value={formData.clientId} 
                onValueChange={(v) => setFormData({ ...formData, clientId: v })}
              >
                <SelectTrigger data-testid="select-project-contact">
                  <SelectValue placeholder="Select a contact" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">No contact</SelectItem>
                  {clients.map(client => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name} {client.company ? `(${client.company})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select 
                value={formData.status} 
                onValueChange={(v) => setFormData({ ...formData, status: v as CrmProjectStatus })}
              >
                <SelectTrigger data-testid="select-project-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map(status => (
                    <SelectItem key={status} value={status}>
                      {crmStatusConfig[status].label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Start Date <span className="text-destructive">*</span></Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full justify-start text-left font-normal"
                    data-testid="datepicker-start-date"
                  >
                    <CalendarDays className="mr-2 h-4 w-4" />
                    {formData.startDate ? format(formData.startDate, "PPP") : <span className="text-muted-foreground">Select start date</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={formData.startDate || undefined}
                    onSelect={(date) => setFormData({ ...formData, startDate: date || null })}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="budgetedHours">Budgeted Hours</Label>
                <Input
                  id="budgetedHours"
                  type="number"
                  min="0"
                  value={formData.budgetedHours}
                  onChange={(e) => setFormData({ ...formData, budgetedHours: e.target.value })}
                  placeholder="0"
                  data-testid="input-budgeted-hours"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="actualHours">Actual Hours</Label>
                <Input
                  id="actualHours"
                  type="number"
                  min="0"
                  value={formData.actualHours}
                  onChange={(e) => setFormData({ ...formData, actualHours: e.target.value })}
                  placeholder="0"
                  data-testid="input-actual-hours"
                />
              </div>
            </div>

            {estimatedEndDate && (
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <div className="text-sm">
                  <span className="text-muted-foreground">Estimated End Date: </span>
                  <span className="font-medium" data-testid="text-estimated-end-date">{format(estimatedEndDate, "PPP")}</span>
                  <span className="text-xs text-muted-foreground ml-2">({hoursPerDay}h/day)</span>
                </div>
              </div>
            )}

            <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4">
              <Link href="/crm" className="w-full sm:w-auto">
                <Button type="button" variant="outline" className="w-full" data-testid="button-cancel-project">
                  Cancel
                </Button>
              </Link>
              <Button 
                type="submit" 
                disabled={createProjectMutation.isPending}
                className="w-full sm:w-auto"
                data-testid="button-submit-project"
              >
                <Save className="h-4 w-4 mr-2" />
                {createProjectMutation.isPending ? "Creating..." : "Create Project"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
