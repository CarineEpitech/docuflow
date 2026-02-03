import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Clock, TrendingUp, Users, AlertTriangle } from "lucide-react";
import { Link } from "wouter";
import type { TimeEntry, User } from "@shared/schema";

interface TimeTrackingSummaryProps {
  projectId: string;
  budgetedHours: number | null;
  budgetedMinutes: number | null;
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

export function TimeTrackingSummary({ projectId, budgetedHours, budgetedMinutes }: TimeTrackingSummaryProps) {
  const { data: entriesResponse, isLoading } = useQuery<{ data: TimeEntry[] }>({
    queryKey: ["/api/time-tracking/entries", `crmProjectId=${projectId}`],
  });

  const { data: usersData } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const entries = entriesResponse?.data || [];
  const users = usersData || [];

  const totalTrackedSeconds = entries.reduce((sum, e) => sum + (e.duration || 0), 0);
  const totalIdleSeconds = entries.reduce((sum, e) => sum + (e.idleTime || 0), 0);
  
  const budgetedTotalMinutes = ((budgetedHours || 0) * 60) + (budgetedMinutes || 0);
  const budgetedTotalSeconds = budgetedTotalMinutes * 60;
  
  const progressPercentage = budgetedTotalSeconds > 0 
    ? Math.min(100, Math.round((totalTrackedSeconds / budgetedTotalSeconds) * 100))
    : 0;

  const isOverBudget = totalTrackedSeconds > budgetedTotalSeconds && budgetedTotalSeconds > 0;
  const remainingSeconds = Math.max(0, budgetedTotalSeconds - totalTrackedSeconds);

  const userBreakdown = entries.reduce((acc, entry) => {
    if (!acc[entry.userId]) {
      acc[entry.userId] = { duration: 0, entries: 0 };
    }
    acc[entry.userId].duration += entry.duration || 0;
    acc[entry.userId].entries += 1;
    return acc;
  }, {} as Record<string, { duration: number; entries: number }>);

  const getUserName = (userId: string) => {
    const user = users.find((u) => u.id === userId);
    return user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email : "Unknown";
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Time Tracking
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-3/4"></div>
            <div className="h-2 bg-muted rounded"></div>
            <div className="h-4 bg-muted rounded w-1/2"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="card-time-tracking-summary">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Time Tracking
          </CardTitle>
          <Link href="/time-tracking" className="text-xs text-primary hover:underline" data-testid="link-view-all-time">
            View All
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Tracked Time</span>
            <span className="font-mono font-medium">{formatDuration(totalTrackedSeconds)}</span>
          </div>
          
          {budgetedTotalSeconds > 0 && (
            <>
              <Progress 
                value={progressPercentage} 
                className={`h-2 ${isOverBudget ? "[&>div]:bg-destructive" : ""}`}
              />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{progressPercentage}% of budget used</span>
                <span>
                  {isOverBudget ? (
                    <span className="text-destructive flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      Over by {formatDuration(totalTrackedSeconds - budgetedTotalSeconds)}
                    </span>
                  ) : (
                    <span>{formatDuration(remainingSeconds)} remaining</span>
                  )}
                </span>
              </div>
            </>
          )}
          
          {budgetedTotalSeconds === 0 && (
            <p className="text-xs text-muted-foreground">No budget set for this project</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <TrendingUp className="h-3 w-3" />
              Entries
            </div>
            <div className="font-medium">{entries.length}</div>
          </div>
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Clock className="h-3 w-3" />
              Idle Time
            </div>
            <div className="font-medium">{formatDuration(totalIdleSeconds)}</div>
          </div>
        </div>

        {Object.keys(userBreakdown).length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-3 w-3" />
              <span>Team Breakdown</span>
            </div>
            <div className="space-y-1">
              {Object.entries(userBreakdown)
                .sort((a, b) => b[1].duration - a[1].duration)
                .slice(0, 5)
                .map(([userId, data]) => (
                  <div key={userId} className="flex items-center justify-between text-sm">
                    <span className="truncate">{getUserName(userId)}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs">{formatDuration(data.duration)}</span>
                      <Badge variant="outline" className="text-xs">
                        {data.entries}
                      </Badge>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {entries.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-2">
            No time tracked yet. Use the timer in the sidebar to start tracking.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
