import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Users, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

interface InviteInfo {
  teamName: string;
}

export default function JoinTeamPage() {
  const [, params] = useRoute("/join/:code");
  const [, setLocation] = useLocation();
  const { user, isLoading: authLoading } = useAuth();
  const { toast } = useToast();
  
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  const code = params?.code;

  // Fetch invite info
  useEffect(() => {
    if (!code) return;
    
    const fetchInviteInfo = async () => {
      try {
        const response = await fetch(`/api/invite/${code}`);
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.message || "Invalid invitation");
        }
        const data = await response.json();
        setInviteInfo(data);
        setError(null);
      } catch (err: any) {
        setError(err.message || "Failed to load invitation");
      } finally {
        setLoadingInfo(false);
      }
    };
    
    fetchInviteInfo();
  }, [code]);

  const joinMutation = useMutation({
    mutationFn: async () => {
      return apiRequest("POST", `/api/invite/${code}/join`);
    },
    onSuccess: () => {
      setJoined(true);
      queryClient.invalidateQueries({ queryKey: ["/api/teams"] });
      toast({
        title: "Joined team!",
        description: `You are now a member of ${inviteInfo?.teamName}.`,
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to join team",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const handleJoin = () => {
    if (!user) {
      // Redirect to login, then come back here
      setLocation(`/auth?redirect=/join/${code}`);
      return;
    }
    joinMutation.mutate();
  };

  const handleGoToTeams = () => {
    setLocation("/teams");
  };

  if (!code) {
    return (
      <div className="flex items-center justify-center min-h-screen" data-testid="page-join-team-invalid">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="flex flex-col items-center py-8">
            <XCircle className="w-16 h-16 text-destructive mb-4" />
            <h2 className="text-xl font-semibold mb-2">Invalid Invite Link</h2>
            <p className="text-muted-foreground text-center">
              This invite link appears to be invalid.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loadingInfo || authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen" data-testid="page-join-team-loading">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="flex flex-col items-center py-8">
            <Loader2 className="w-12 h-12 animate-spin text-muted-foreground mb-4" />
            <p className="text-muted-foreground">Loading invitation...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen" data-testid="page-join-team-error">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="flex flex-col items-center py-8">
            <AlertTriangle className="w-16 h-16 text-warning mb-4" />
            <h2 className="text-xl font-semibold mb-2">Invitation Unavailable</h2>
            <p className="text-muted-foreground text-center">{error}</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => setLocation("/")}
              data-testid="button-go-home"
            >
              Go Home
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (joined) {
    return (
      <div className="flex items-center justify-center min-h-screen" data-testid="page-join-team-success">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="flex flex-col items-center py-8">
            <CheckCircle className="w-16 h-16 text-green-500 mb-4" />
            <h2 className="text-xl font-semibold mb-2">Welcome to the Team!</h2>
            <p className="text-muted-foreground text-center mb-4">
              You are now a member of <strong>{inviteInfo?.teamName}</strong>.
            </p>
            <Button onClick={handleGoToTeams} data-testid="button-view-teams">
              View My Teams
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center min-h-screen" data-testid="page-join-team">
      <Card className="max-w-md w-full mx-4">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Users className="w-8 h-8 text-primary" />
          </div>
          <CardTitle className="text-2xl" data-testid="text-team-name">
            Join {inviteInfo?.teamName}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          
          {!user && (
            <p className="text-sm text-muted-foreground text-center">
              You'll need to sign in or create an account to join this team.
            </p>
          )}
          
          <div className="flex flex-col gap-2">
            <Button
              onClick={handleJoin}
              disabled={joinMutation.isPending}
              className="w-full"
              data-testid="button-join-team"
            >
              {joinMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {user ? "Join Team" : "Sign in to Join"}
            </Button>
            <Button
              variant="outline"
              onClick={() => setLocation("/")}
              className="w-full"
              data-testid="button-cancel-join"
            >
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
