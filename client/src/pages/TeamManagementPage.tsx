import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Users,
  Plus,
  Settings,
  Trash2,
  Link2,
  Copy,
  UserMinus,
  MoreVertical,
  Loader2,
  Crown,
  Shield,
  User,
  CheckCircle,
} from "lucide-react";
import { format } from "date-fns";
import type { TeamWithDetails, TeamMemberWithUser, TeamInvite } from "@shared/schema";

function getRoleIcon(role: string) {
  switch (role) {
    case "owner":
      return Crown;
    case "admin":
      return Shield;
    default:
      return User;
  }
}

function getRoleBadge(role: string) {
  switch (role) {
    case "owner":
      return <Badge variant="default" data-testid="badge-role-owner">Owner</Badge>;
    case "admin":
      return <Badge variant="secondary" data-testid="badge-role-admin">Admin</Badge>;
    default:
      return <Badge variant="outline" data-testid="badge-role-member">Member</Badge>;
  }
}

export default function TeamManagementPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [showCreateTeamDialog, setShowCreateTeamDialog] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDescription, setNewTeamDescription] = useState("");
  
  const [selectedTeam, setSelectedTeam] = useState<TeamWithDetails | null>(null);
  const [showTeamDetails, setShowTeamDetails] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [generatedInviteLink, setGeneratedInviteLink] = useState("");
  
  const [deleteTeamConfirm, setDeleteTeamConfirm] = useState<string | null>(null);
  const [removeMemberConfirm, setRemoveMemberConfirm] = useState<{ teamId: string; userId: string; name: string } | null>(null);

  const { data: teams = [], isLoading } = useQuery<TeamWithDetails[]>({
    queryKey: ["/api/teams"],
  });

  const createTeamMutation = useMutation({
    mutationFn: async (data: { name: string; description?: string }) => {
      return apiRequest("POST", "/api/teams", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      setShowCreateTeamDialog(false);
      setNewTeamName("");
      setNewTeamDescription("");
      toast({
        title: "Team created",
        description: "Your new team has been created successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create team",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteTeamMutation = useMutation({
    mutationFn: async (teamId: string) => {
      await apiRequest("DELETE", `/api/teams/${teamId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      setDeleteTeamConfirm(null);
      if (selectedTeam?.id === deleteTeamConfirm) {
        setSelectedTeam(null);
        setShowTeamDetails(false);
      }
      toast({
        title: "Team deleted",
        description: "The team has been deleted successfully.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to delete team",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async ({ teamId, userId }: { teamId: string; userId: string }) => {
      await apiRequest("DELETE", `/api/teams/${teamId}/members/${userId}`);
    },
    onSuccess: () => {
      if (selectedTeam) {
        queryClient.invalidateQueries({ queryKey: ["/api/teams", selectedTeam.id] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      setRemoveMemberConfirm(null);
      toast({
        title: "Member removed",
        description: "The member has been removed from the team.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to remove member",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const createInviteMutation = useMutation({
    mutationFn: async (teamId: string) => {
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours
      return apiRequest("POST", `/api/teams/${teamId}/invites`, { expiresAt });
    },
    onSuccess: (data: TeamInvite) => {
      const inviteUrl = `${window.location.origin}/join/${data.code}`;
      setGeneratedInviteLink(inviteUrl);
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to create invite",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCreateTeam = () => {
    if (!newTeamName.trim()) {
      toast({
        title: "Team name required",
        description: "Please enter a name for your team.",
        variant: "destructive",
      });
      return;
    }
    createTeamMutation.mutate({
      name: newTeamName.trim(),
      description: newTeamDescription.trim() || undefined,
    });
  };

  const handleViewTeam = async (team: TeamWithDetails) => {
    // Fetch full team details with members
    try {
      const fullTeam = await apiRequest("GET", `/api/teams/${team.id}`);
      setSelectedTeam(fullTeam);
      setShowTeamDetails(true);
    } catch (error: any) {
      toast({
        title: "Failed to load team",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleGenerateInvite = () => {
    if (selectedTeam) {
      setGeneratedInviteLink("");
      setShowInviteDialog(true);
      createInviteMutation.mutate(selectedTeam.id);
    }
  };

  const handleCopyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(generatedInviteLink);
      toast({
        title: "Link copied",
        description: "Invite link has been copied to clipboard.",
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "Failed to copy link. Please copy it manually.",
        variant: "destructive",
      });
    }
  };

  const isTeamOwner = (team: TeamWithDetails) => team.ownerId === user?.id;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full" data-testid="loading-teams">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container max-w-6xl mx-auto py-8 px-4" data-testid="page-team-management">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold" data-testid="heading-team-management">Team Management</h1>
          <p className="text-muted-foreground mt-1">
            Create and manage your teams, invite members with shareable links
          </p>
        </div>
        <Button onClick={() => setShowCreateTeamDialog(true)} data-testid="button-create-team">
          <Plus className="w-4 h-4 mr-2" />
          Create Team
        </Button>
      </div>

      {teams.length === 0 ? (
        <Card data-testid="card-no-teams">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Users className="w-16 h-16 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">No Teams Yet</h2>
            <p className="text-muted-foreground text-center mb-4">
              Create your first team to start collaborating with others.
            </p>
            <Button onClick={() => setShowCreateTeamDialog(true)} data-testid="button-create-first-team">
              <Plus className="w-4 h-4 mr-2" />
              Create Your First Team
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {teams.map((team) => (
            <Card
              key={team.id}
              className="cursor-pointer hover-elevate"
              onClick={() => handleViewTeam(team)}
              data-testid={`card-team-${team.id}`}
            >
              <CardHeader className="flex flex-row items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <CardTitle className="truncate" data-testid={`text-team-name-${team.id}`}>
                    {team.name}
                  </CardTitle>
                  {team.description && (
                    <CardDescription className="line-clamp-2 mt-1">
                      {team.description}
                    </CardDescription>
                  )}
                </div>
                {isTeamOwner(team) && (
                  <Badge variant="default" className="shrink-0">
                    <Crown className="w-3 h-3 mr-1" />
                    Owner
                  </Badge>
                )}
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Users className="w-4 h-4" />
                    <span data-testid={`text-member-count-${team.id}`}>
                      {team.memberCount || 0} member{(team.memberCount || 0) !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <span>
                    {team.createdAt && `Created ${format(new Date(team.createdAt), "MMM d, yyyy")}`}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create Team Dialog */}
      <Dialog open={showCreateTeamDialog} onOpenChange={setShowCreateTeamDialog}>
        <DialogContent data-testid="dialog-create-team">
          <DialogHeader>
            <DialogTitle>Create New Team</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="team-name">Team Name</Label>
              <Input
                id="team-name"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="e.g., Engineering Team"
                data-testid="input-team-name"
              />
            </div>
            <div>
              <Label htmlFor="team-description">Description (optional)</Label>
              <Textarea
                id="team-description"
                value={newTeamDescription}
                onChange={(e) => setNewTeamDescription(e.target.value)}
                placeholder="Describe what this team is for..."
                rows={3}
                data-testid="input-team-description"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowCreateTeamDialog(false)}
              data-testid="button-cancel-create-team"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateTeam}
              disabled={createTeamMutation.isPending}
              data-testid="button-confirm-create-team"
            >
              {createTeamMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Create Team
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Team Details Dialog */}
      <Dialog open={showTeamDetails} onOpenChange={setShowTeamDetails}>
        <DialogContent className="max-w-2xl" data-testid="dialog-team-details">
          {selectedTeam && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <DialogTitle className="text-xl">{selectedTeam.name}</DialogTitle>
                  {isTeamOwner(selectedTeam) && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleGenerateInvite}
                        data-testid="button-invite-member"
                      >
                        <Link2 className="w-4 h-4 mr-2" />
                        Invite
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setDeleteTeamConfirm(selectedTeam.id)}
                        data-testid="button-delete-team"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
                {selectedTeam.description && (
                  <p className="text-muted-foreground mt-1">{selectedTeam.description}</p>
                )}
              </DialogHeader>

              <div className="mt-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Team Members ({selectedTeam.members?.length || 0})
                </h3>
                <div className="space-y-2">
                  {selectedTeam.members?.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                      data-testid={`member-row-${member.userId}`}
                    >
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={member.user?.profileImageUrl || undefined} />
                          <AvatarFallback>
                            {member.user?.firstName?.[0] || member.user?.email?.[0] || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <p className="font-medium">
                            {member.user?.firstName
                              ? `${member.user.firstName} ${member.user.lastName || ""}`
                              : member.user?.email || "Unknown User"}
                          </p>
                          {member.user?.email && member.user?.firstName && (
                            <p className="text-sm text-muted-foreground">{member.user.email}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getRoleBadge(member.role)}
                        {isTeamOwner(selectedTeam) && member.role !== "owner" && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" data-testid={`button-member-actions-${member.userId}`}>
                                <MoreVertical className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() =>
                                  setRemoveMemberConfirm({
                                    teamId: selectedTeam.id,
                                    userId: member.userId,
                                    name: member.user?.firstName
                                      ? `${member.user.firstName} ${member.user.lastName || ""}`
                                      : member.user?.email || "this member",
                                  })
                                }
                                className="text-destructive"
                                data-testid={`button-remove-member-${member.userId}`}
                              >
                                <UserMinus className="w-4 h-4 mr-2" />
                                Remove from team
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Invite Link Dialog */}
      <Dialog open={showInviteDialog} onOpenChange={setShowInviteDialog}>
        <DialogContent data-testid="dialog-invite-link">
          <DialogHeader>
            <DialogTitle>Invite Team Members</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Share this link with people you want to invite. The link expires in 24 hours.
            </p>
            {createInviteMutation.isPending ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-6 h-6 animate-spin" />
              </div>
            ) : generatedInviteLink ? (
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={generatedInviteLink}
                  className="font-mono text-sm"
                  data-testid="input-invite-link"
                />
                <Button onClick={handleCopyInviteLink} data-testid="button-copy-invite-link">
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInviteDialog(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Team Confirmation */}
      <AlertDialog open={!!deleteTeamConfirm} onOpenChange={(open) => !open && setDeleteTeamConfirm(null)}>
        <AlertDialogContent data-testid="dialog-confirm-delete-team">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Team</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this team? This action cannot be undone and all team
              members will lose access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-team">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTeamConfirm && deleteTeamMutation.mutate(deleteTeamConfirm)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-delete-team"
            >
              {deleteTeamMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Delete Team
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove Member Confirmation */}
      <AlertDialog open={!!removeMemberConfirm} onOpenChange={(open) => !open && setRemoveMemberConfirm(null)}>
        <AlertDialogContent data-testid="dialog-confirm-remove-member">
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {removeMemberConfirm?.name} from the team?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-remove-member">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                removeMemberConfirm &&
                removeMemberMutation.mutate({
                  teamId: removeMemberConfirm.teamId,
                  userId: removeMemberConfirm.userId,
                })
              }
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-confirm-remove-member"
            >
              {removeMemberMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Remove Member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
