import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useRoute, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Shield, Users, Mail, ArrowLeft, Plus, Trash2, Key, Pencil, Check, X, Copy, CheckCircle } from "lucide-react";
import type { SafeUser } from "@shared/schema";

export default function AdminPage() {
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [isCreatePage] = useRoute("/admin/create");

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      toast({
        title: "Session Expired",
        description: "Please sign in again.",
        variant: "destructive",
      });
      setLocation("/auth");
    }
  }, [isAuthenticated, authLoading, toast, setLocation]);

  useEffect(() => {
    if (!authLoading && user && user.role !== "admin") {
      toast({
        title: "Access Denied",
        description: "You don't have permission to access this page.",
        variant: "destructive",
      });
      setLocation("/");
    }
  }, [user, authLoading, toast, setLocation]);

  if (authLoading) {
    return (
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!user || user.role !== "admin") {
    return null;
  }

  if (isCreatePage) {
    return <CreateUserPage />;
  }

  return <UserListPage />;
}

function UserListPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ firstName: string; lastName: string; email: string }>({ firstName: "", lastName: "", email: "" });
  const [copiedPassword, setCopiedPassword] = useState<string | null>(null);

  const { data: users, isLoading: usersLoading } = useQuery<SafeUser[]>({
    queryKey: ["/api/admin/users"],
    enabled: !!user && user.role === "admin",
  });

  const updateRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return await apiRequest("PATCH", `/api/admin/users/${userId}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User role updated successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update role",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, data }: { userId: string; data: { firstName?: string; lastName?: string; email?: string } }) => {
      return await apiRequest("PATCH", `/api/admin/users/${userId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setEditingUser(null);
      toast({ title: "User updated successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update user",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest("DELETE", `/api/admin/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "User deleted successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to delete user",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest("POST", `/api/admin/users/${userId}/reset-password`);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      if (data.newPassword) {
        toast({ 
          title: "Password reset successfully",
          description: `New password: ${data.newPassword}${data.emailSent ? " (Email sent)" : " (Email failed to send)"}`
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Failed to reset password",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const startEditing = (u: SafeUser) => {
    setEditingUser(u.id);
    setEditForm({
      firstName: u.firstName || "",
      lastName: u.lastName || "",
      email: u.email,
    });
  };

  const cancelEditing = () => {
    setEditingUser(null);
    setEditForm({ firstName: "", lastName: "", email: "" });
  };

  const saveEditing = () => {
    if (editingUser) {
      updateUserMutation.mutate({ userId: editingUser, data: editForm });
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPassword(id);
    setTimeout(() => setCopiedPassword(null), 2000);
  };

  if (usersLoading) {
    return (
      <div className="p-6 space-y-6 max-w-4xl mx-auto">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-admin-title">Administration</h1>
            <p className="text-muted-foreground">Manage users and system settings</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setLocation("/admin/create")} data-testid="button-create-user">
            <Plus className="w-4 h-4 mr-2" />
            Create User
          </Button>
          <Button variant="ghost" onClick={() => setLocation("/")} data-testid="button-back-admin">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Home
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            User Management
          </CardTitle>
          <CardDescription>
            View and manage all users. Create new users, update their info, or reset their passwords.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!users || users.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No users found.</p>
          ) : (
            <div className="space-y-4">
              {users.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                  data-testid={`row-user-${u.id}`}
                >
                  {editingUser === u.id ? (
                    <div className="flex-1 grid grid-cols-3 gap-4 mr-4">
                      <Input
                        value={editForm.firstName}
                        onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                        placeholder="First name"
                        data-testid={`input-firstname-${u.id}`}
                      />
                      <Input
                        value={editForm.lastName}
                        onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                        placeholder="Last name"
                        data-testid={`input-lastname-${u.id}`}
                      />
                      <Input
                        value={editForm.email}
                        onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                        placeholder="Email"
                        type="email"
                        data-testid={`input-email-${u.id}`}
                      />
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <Avatar className="w-10 h-10">
                        <AvatarImage src={u.profileImageUrl || undefined} />
                        <AvatarFallback>
                          {u.firstName?.[0]}{u.lastName?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium">
                          {u.firstName} {u.lastName}
                        </div>
                        <div className="text-sm text-muted-foreground flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {u.email}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-2">
                    <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                      {u.role || "user"}
                    </Badge>

                    {editingUser === u.id ? (
                      <>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          onClick={saveEditing}
                          disabled={updateUserMutation.isPending}
                          data-testid={`button-save-${u.id}`}
                        >
                          <Check className="w-4 h-4 text-green-600" />
                        </Button>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          onClick={cancelEditing}
                          data-testid={`button-cancel-${u.id}`}
                        >
                          <X className="w-4 h-4 text-red-600" />
                        </Button>
                      </>
                    ) : (
                      <>
                        {u.id !== user?.id && (
                          <Select
                            value={u.role || "user"}
                            onValueChange={(role) => updateRoleMutation.mutate({ userId: u.id, role })}
                            disabled={updateRoleMutation.isPending}
                          >
                            <SelectTrigger className="w-24" data-testid={`select-role-${u.id}`}>
                              <SelectValue placeholder="Role" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="user">User</SelectItem>
                              <SelectItem value="admin">Admin</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                        
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          onClick={() => startEditing(u)}
                          data-testid={`button-edit-${u.id}`}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>

                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button 
                              size="icon" 
                              variant="ghost"
                              disabled={resetPasswordMutation.isPending}
                              data-testid={`button-reset-password-${u.id}`}
                            >
                              <Key className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Reset Password</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will generate a new random password for {u.firstName} {u.lastName} and send it to their email ({u.email}).
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => resetPasswordMutation.mutate(u.id)}>
                                Reset Password
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>

                        {u.id !== user?.id && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button 
                                size="icon" 
                                variant="ghost"
                                disabled={deleteUserMutation.isPending}
                                data-testid={`button-delete-${u.id}`}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete User</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete {u.firstName} {u.lastName}? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction 
                                  onClick={() => deleteUserMutation.mutate(u.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CreateUserPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [formData, setFormData] = useState({
    email: "",
    firstName: "",
    lastName: "",
    role: "user" as "user" | "admin",
  });
  const [createdUser, setCreatedUser] = useState<{ email: string; password: string; emailSent: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  const createUserMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return await apiRequest("POST", "/api/admin/users", data);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setCreatedUser({
        email: formData.email,
        password: data.generatedPassword,
        emailSent: data.emailSent,
      });
      toast({ 
        title: "User created successfully",
        description: data.emailSent ? "Credentials sent via email" : "Email could not be sent - please share credentials manually"
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to create user",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createUserMutation.mutate(formData);
  };

  const copyCredentials = () => {
    if (createdUser) {
      navigator.clipboard.writeText(`Email: ${createdUser.email}\nPassword: ${createdUser.password}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Plus className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-create-user-title">Create New User</h1>
            <p className="text-muted-foreground">Add a new user to the system</p>
          </div>
        </div>
        <Button variant="ghost" onClick={() => setLocation("/admin")} data-testid="button-back-to-admin">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Users
        </Button>
      </div>

      {createdUser ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle className="w-5 h-5" />
              User Created Successfully
            </CardTitle>
            <CardDescription>
              {createdUser.emailSent 
                ? "The user has been sent their credentials via email."
                : "Email could not be sent. Please share the credentials below manually."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted p-4 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-muted-foreground">Email</Label>
                  <p className="font-mono" data-testid="text-created-email">{createdUser.email}</p>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-muted-foreground">Password</Label>
                  <p className="font-mono" data-testid="text-created-password">{createdUser.password}</p>
                </div>
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button onClick={copyCredentials} variant="outline" data-testid="button-copy-credentials">
                {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
                {copied ? "Copied!" : "Copy Credentials"}
              </Button>
              <Button onClick={() => {
                setCreatedUser(null);
                setFormData({ email: "", firstName: "", lastName: "", role: "user" });
              }} data-testid="button-create-another">
                Create Another User
              </Button>
              <Button variant="ghost" onClick={() => setLocation("/admin")} data-testid="button-done">
                Done
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>User Details</CardTitle>
            <CardDescription>
              Enter the user's information. A random password will be generated and sent to their email.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    placeholder="John"
                    required
                    data-testid="input-create-firstname"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    placeholder="Doe"
                    required
                    data-testid="input-create-lastname"
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  placeholder="john.doe@example.com"
                  required
                  data-testid="input-create-email"
                />
                <p className="text-sm text-muted-foreground">
                  The login credentials will be sent to this email address.
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="role">Role</Label>
                <Select
                  value={formData.role}
                  onValueChange={(value: "user" | "admin") => setFormData({ ...formData, role: value })}
                >
                  <SelectTrigger data-testid="select-create-role">
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex gap-2 pt-4">
                <Button type="submit" disabled={createUserMutation.isPending} data-testid="button-submit-create">
                  {createUserMutation.isPending ? "Creating..." : "Create User"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setLocation("/admin")}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
