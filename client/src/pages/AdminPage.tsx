import { useEffect, useState, useMemo } from "react";
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
import { Shield, Users, Mail, ArrowLeft, Plus, Trash2, Key, Pencil, Check, X, Copy, CheckCircle, Eye, EyeOff, Calendar, User as UserIcon, ChevronLeft, ChevronRight } from "lucide-react";
import type { SafeUser } from "@shared/schema";

interface AdminUserDetails {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
  role: string | null;
  lastGeneratedPassword: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export default function AdminPage() {
  const { toast } = useToast();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const [isCreatePage] = useRoute("/admin/create");
  const [isUserDetailPage, userDetailParams] = useRoute("/admin/user/:id");

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

  if (isUserDetailPage && userDetailParams?.id) {
    return <UserDetailPage userId={userDetailParams.id} />;
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
  const [currentPage, setCurrentPage] = useState(1);
  const USERS_PER_PAGE = 7;

  const { data: users, isLoading: usersLoading } = useQuery<SafeUser[]>({
    queryKey: ["/api/admin/users"],
    enabled: !!user && user.role === "admin",
  });

  const sortedUsers = useMemo(() => {
    if (!users) return [];
    return [...users].sort((a, b) => {
      // Current logged-in admin first
      if (a.id === user?.id) return -1;
      if (b.id === user?.id) return 1;
      // Then other admins
      if (a.role === "admin" && b.role !== "admin") return -1;
      if (a.role !== "admin" && b.role === "admin") return 1;
      // Then alphabetically by name
      const nameA = `${a.firstName || ""} ${a.lastName || ""}`.toLowerCase();
      const nameB = `${b.firstName || ""} ${b.lastName || ""}`.toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [users, user?.id]);

  const totalPages = Math.ceil((sortedUsers?.length || 0) / USERS_PER_PAGE);
  const paginatedUsers = useMemo(() => {
    const startIndex = (currentPage - 1) * USERS_PER_PAGE;
    return sortedUsers.slice(startIndex, startIndex + USERS_PER_PAGE);
  }, [sortedUsers, currentPage]);

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
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold" data-testid="text-admin-title">Administration</h1>
            <p className="text-sm text-muted-foreground">Manage users and system settings</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="icon" onClick={() => setLocation("/admin/create")} data-testid="button-create-user">
            <Plus className="w-4 h-4" />
          </Button>
          <Button size="icon" variant="outline" onClick={() => setLocation("/")} data-testid="button-back-admin">
            <ArrowLeft className="w-4 h-4" />
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
          {!paginatedUsers || paginatedUsers.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No users found.</p>
          ) : (
            <div className="space-y-1.5">
              {paginatedUsers.map((u) => (
                <div
                  key={u.id}
                  className="flex flex-col gap-3 p-3 border rounded-lg sm:flex-row sm:items-center sm:justify-between"
                  data-testid={`row-user-${u.id}`}
                >
                  {editingUser === u.id ? (
                    <div className="flex-1 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4 sm:mr-4">
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
                    <div className="flex items-center gap-2">
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={u.profileImageUrl || undefined} />
                        <AvatarFallback className="text-xs">
                          {u.firstName?.[0]}{u.lastName?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="font-medium text-sm">
                          {u.firstName} {u.lastName}
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Mail className="w-3 h-3" />
                          {u.email}
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-center gap-2 flex-wrap">
                    {u.isMainAdmin === 1 ? (
                      <Badge variant="default">
                        SuperAdmin
                      </Badge>
                    ) : (
                      <Badge variant={u.role === "admin" ? "default" : "secondary"}>
                        {u.role || "user"}
                      </Badge>
                    )}

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
                        {u.id === user?.id || (u.isMainAdmin === 1 && user?.isMainAdmin !== 1) ? (
                          <Select value={u.role || "admin"} disabled>
                            <SelectTrigger className="w-24 opacity-60" data-testid={`select-role-${u.id}`}>
                              <SelectValue placeholder="Role" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="admin">Admin</SelectItem>
                              <SelectItem value="user">User</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
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
                        
                        {u.isMainAdmin === 1 && user?.isMainAdmin !== 1 ? (
                          <Button 
                            size="icon" 
                            variant="ghost"
                            disabled
                            className="opacity-40"
                            data-testid={`button-view-${u.id}`}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        ) : (
                          <Link href={`/admin/user/${u.id}`}>
                            <Button 
                              size="icon" 
                              variant="ghost"
                              data-testid={`button-view-${u.id}`}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          </Link>
                        )}
                        
                        {u.isMainAdmin === 1 && user?.isMainAdmin !== 1 ? (
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            disabled
                            className="opacity-40"
                            data-testid={`button-edit-${u.id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        ) : (
                          <Button 
                            size="icon" 
                            variant="ghost" 
                            onClick={() => startEditing(u)}
                            data-testid={`button-edit-${u.id}`}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                        )}

                        {u.isMainAdmin === 1 && user?.isMainAdmin !== 1 ? (
                          <Button 
                            size="icon" 
                            variant="ghost"
                            disabled
                            className="opacity-40"
                            data-testid={`button-reset-password-${u.id}`}
                          >
                            <Key className="w-4 h-4" />
                          </Button>
                        ) : (
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
                        )}

                        {u.id !== user?.id && !(u.isMainAdmin === 1 && user?.isMainAdmin !== 1) ? (
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
                        ) : (
                          <div className="w-9 h-9" />
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {totalPages > 1 && (
            <div className="flex flex-col gap-3 pt-4 border-t mt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground text-center sm:text-left">
                Showing {((currentPage - 1) * USERS_PER_PAGE) + 1} - {Math.min(currentPage * USERS_PER_PAGE, sortedUsers.length)} of {sortedUsers.length} users
              </p>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  data-testid="button-prev-page"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  Previous
                </Button>
                <span className="text-sm px-2">
                  Page {currentPage} of {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  data-testid="button-next-page"
                >
                  Next
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
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
    <div className="p-4 sm:p-6 space-y-6 max-w-2xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Plus className="w-8 h-8 text-primary shrink-0" />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-create-user-title">Create New User</h1>
            <p className="text-sm text-muted-foreground">Add a new user to the system</p>
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
            
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
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
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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

function UserDetailPage({ userId }: { userId: string }) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data: userDetails, isLoading } = useQuery<AdminUserDetails>({
    queryKey: ["/api/admin/users", userId],
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/admin/users/${userId}/reset-password`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users", userId] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Password reset successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to reset password",
        description: error.message || "An error occurred",
        variant: "destructive",
      });
    },
  });

  const copyPassword = () => {
    if (userDetails?.lastGeneratedPassword) {
      navigator.clipboard.writeText(userDetails.lastGeneratedPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-2xl mx-auto">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!userDetails) {
    return (
      <div className="p-6 space-y-6 max-w-2xl mx-auto">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">User Not Found</h1>
          <Button variant="ghost" onClick={() => setLocation("/admin")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Users
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-2xl mx-auto">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <UserIcon className="w-8 h-8 text-primary shrink-0" />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold" data-testid="text-user-detail-title">User Details</h1>
            <p className="text-sm text-muted-foreground">View and manage user information</p>
          </div>
        </div>
        <Button variant="ghost" onClick={() => setLocation("/admin")} data-testid="button-back-to-users">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Users
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <Avatar className="w-16 h-16 shrink-0">
              <AvatarImage src={userDetails.profileImageUrl || undefined} />
              <AvatarFallback className="text-lg">
                {userDetails.firstName?.[0]}{userDetails.lastName?.[0]}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-xl" data-testid="text-user-name">
                {userDetails.firstName} {userDetails.lastName}
              </CardTitle>
              <CardDescription className="flex items-center gap-1 break-all">
                <Mail className="w-4 h-4 shrink-0" />
                {userDetails.email}
              </CardDescription>
            </div>
            <Badge variant={userDetails.role === "admin" ? "default" : "secondary"} className="self-start sm:self-auto">
              {userDetails.role || "user"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-muted-foreground text-sm">First Name</Label>
              <p className="font-medium" data-testid="text-user-firstname">{userDetails.firstName || "-"}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground text-sm">Last Name</Label>
              <p className="font-medium" data-testid="text-user-lastname">{userDetails.lastName || "-"}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground text-sm">Email</Label>
              <p className="font-medium" data-testid="text-user-email">{userDetails.email}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-muted-foreground text-sm">Role</Label>
              <p className="font-medium" data-testid="text-user-role">{userDetails.role || "user"}</p>
            </div>
            {userDetails.createdAt && (
              <div className="space-y-1">
                <Label className="text-muted-foreground text-sm">Created</Label>
                <p className="font-medium flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {new Date(userDetails.createdAt).toLocaleDateString()}
                </p>
              </div>
            )}
            {userDetails.updatedAt && (
              <div className="space-y-1">
                <Label className="text-muted-foreground text-sm">Last Updated</Label>
                <p className="font-medium flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {new Date(userDetails.updatedAt).toLocaleDateString()}
                </p>
              </div>
            )}
          </div>

          <div className="border-t pt-4">
            <Label className="text-muted-foreground text-sm">Last Generated Password</Label>
            {userDetails.lastGeneratedPassword ? (
              <div className="flex items-center gap-2 mt-2">
                <div className="bg-muted px-3 py-2 rounded-md font-mono flex-1" data-testid="text-generated-password">
                  {showPassword ? userDetails.lastGeneratedPassword : "••••••••••••••••"}
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setShowPassword(!showPassword)}
                  data-testid="button-toggle-password"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={copyPassword}
                  data-testid="button-copy-password"
                >
                  {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground mt-2" data-testid="text-no-password">
                No generated password available. The user may have set their own password.
              </p>
            )}
          </div>

          <div className="border-t pt-4 flex gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={resetPasswordMutation.isPending} data-testid="button-reset-user-password">
                  <Key className="w-4 h-4 mr-2" />
                  Reset Password
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset Password</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will generate a new random password for {userDetails.firstName} {userDetails.lastName} and send it to their email ({userDetails.email}).
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => resetPasswordMutation.mutate()}>
                    Reset Password
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
