import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, User, Building2, Mail, Phone, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

const contactStatusConfig: Record<string, { label: string }> = {
  lead: { label: "Lead" },
  prospect: { label: "Prospect" },
  client: { label: "Client" },
  client_recurrent: { label: "Client Récurrent" },
};

const contactStatusOptions = ["lead", "prospect", "client", "client_recurrent"];

const contactFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  company: z.string().optional(),
  phone: z.string().optional(),
  status: z.string().default("lead"),
  notes: z.string().optional(),
});

type ContactFormData = z.infer<typeof contactFormSchema>;

export default function ContactCreatePage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const form = useForm<ContactFormData>({
    resolver: zodResolver(contactFormSchema),
    defaultValues: {
      name: "",
      email: "",
      company: "",
      phone: "",
      status: "lead",
      notes: "",
    },
  });

  const createContactMutation = useMutation({
    mutationFn: async (data: ContactFormData) => {
      return apiRequest("POST", "/api/crm/clients", {
        name: data.name,
        email: data.email || null,
        company: data.company || null,
        phone: data.phone || null,
        status: data.status,
        notes: data.notes || null,
      });
    },
    onSuccess: (newContact) => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/clients"] });
      toast({ title: "Contact created successfully" });
      navigate(`/crm/client/${newContact.id}`);
    },
    onError: () => {
      toast({ title: "Failed to create contact", variant: "destructive" });
    },
  });

  const onSubmit = (data: ContactFormData) => {
    createContactMutation.mutate(data);
  };

  return (
    <div className="w-full p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">New Contact</h1>
          <p className="text-sm text-muted-foreground">Create a new contact in your CRM</p>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => navigate("/crm")}
          data-testid="button-back-to-crm"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Contact Information
          </CardTitle>
          <CardDescription>
            Fill in the details for your new contact
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="name" className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  Full Name *
                </Label>
                <Input
                  id="name"
                  {...form.register("name")}
                  placeholder="Contact name"
                  data-testid="input-contact-name"
                />
                {form.formState.errors.name && (
                  <p className="text-sm text-destructive">{form.formState.errors.name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  Email
                </Label>
                <Input
                  id="email"
                  type="email"
                  {...form.register("email")}
                  placeholder="email@example.com"
                  data-testid="input-contact-email"
                />
                {form.formState.errors.email && (
                  <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  Phone
                </Label>
                <Input
                  id="phone"
                  {...form.register("phone")}
                  placeholder="+1 234 567 8900"
                  data-testid="input-contact-phone"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="company" className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  Company
                </Label>
                <Input
                  id="company"
                  {...form.register("company")}
                  placeholder="Company name"
                  data-testid="input-contact-company"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="status" className="flex items-center gap-2">
                  <User className="h-4 w-4 text-muted-foreground" />
                  Status
                </Label>
                <Select
                  value={form.watch("status")}
                  onValueChange={(value) => form.setValue("status", value)}
                >
                  <SelectTrigger data-testid="select-contact-status">
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
                <Label htmlFor="notes" className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                  Notes
                </Label>
                <Textarea
                  id="notes"
                  {...form.register("notes")}
                  placeholder="Additional notes about this contact..."
                  rows={4}
                  data-testid="input-contact-notes"
                />
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/crm")}
                className="w-full sm:w-auto"
                data-testid="button-cancel-create"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createContactMutation.isPending}
                className="w-full sm:w-auto"
                data-testid="button-create-contact"
              >
                {createContactMutation.isPending ? "Creating..." : "Create Contact"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
