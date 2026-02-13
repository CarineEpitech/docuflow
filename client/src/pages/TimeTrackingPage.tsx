import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, Calendar, TrendingUp, Timer, Filter, X, ChevronDown, ChevronRight, LayoutList, Table2 } from "lucide-react";
import { format, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";
import type { TimeEntry, CrmProjectWithDetails, User } from "@shared/schema";

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function formatDetailedDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

type DateFilter = "today" | "week" | "month" | "all";

type ViewMode = "grouped" | "table";

export default function TimeTrackingPage() {
  const [dateFilter, setDateFilter] = useState<DateFilter>("week");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("grouped");

  const toggleProjectExpanded = (projectId: string) => {
    setExpandedProjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) {
        newSet.delete(projectId);
      } else {
        newSet.add(projectId);
      }
      return newSet;
    });
  };

  const { data: entriesData, isLoading: isLoadingEntries } = useQuery<{ data: TimeEntry[] }>({
    queryKey: ["/api/time-tracking/entries"],
  });

  const { data: statsData, isLoading: isLoadingStats } = useQuery<{
    totalDuration: number;
    totalIdleTime: number;
    entriesCount: number;
    averageDuration: number;
  }>({
    queryKey: ["/api/time-tracking/stats"],
  });

  const { data: projectsResponse } = useQuery<{ data: CrmProjectWithDetails[] }>({
    queryKey: ["/api/crm/projects", { pageSize: 500 }],
    queryFn: () => fetch("/api/crm/projects?pageSize=500").then(r => r.json()),
  });

  const { data: usersData } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const entries = entriesData?.data || [];
  const projects = projectsResponse?.data || [];
  const users = usersData || [];
  const stats = statsData;

  const filteredEntries = useMemo(() => {
    const now = new Date();
    
    return entries.filter((entry) => {
      const entryDate = new Date(entry.startTime);
      
      if (dateFilter === "today") {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        if (!isWithinInterval(entryDate, { start: today, end: tomorrow })) {
          return false;
        }
      } else if (dateFilter === "week") {
        const weekStart = startOfWeek(now, { weekStartsOn: 1 });
        const weekEnd = endOfWeek(now, { weekStartsOn: 1 });
        if (!isWithinInterval(entryDate, { start: weekStart, end: weekEnd })) {
          return false;
        }
      } else if (dateFilter === "month") {
        const monthStart = startOfMonth(now);
        const monthEnd = endOfMonth(now);
        if (!isWithinInterval(entryDate, { start: monthStart, end: monthEnd })) {
          return false;
        }
      }

      if (projectFilter !== "all" && entry.crmProjectId !== projectFilter) {
        return false;
      }

      if (userFilter !== "all" && entry.userId !== userFilter) {
        return false;
      }

      return true;
    });
  }, [entries, dateFilter, projectFilter, userFilter]);

  const filteredStats = useMemo(() => {
    const totalDuration = filteredEntries.reduce((sum, e) => sum + (e.duration || 0), 0);
    const totalIdleTime = filteredEntries.reduce((sum, e) => sum + (e.idleTime || 0), 0);
    const completedEntries = filteredEntries.filter((e) => e.status === "stopped");
    const avgDuration = completedEntries.length > 0 
      ? Math.round(totalDuration / completedEntries.length) 
      : 0;

    return {
      totalDuration,
      totalIdleTime,
      entriesCount: filteredEntries.length,
      averageDuration: avgDuration,
    };
  }, [filteredEntries]);

  const groupedByProject = useMemo(() => {
    const groups: Record<string, {
      projectId: string;
      projectName: string;
      totalDuration: number;
      totalIdleTime: number;
      entriesCount: number;
      entries: TimeEntry[];
      latestEntry: TimeEntry | null;
    }> = {};

    for (const entry of filteredEntries) {
      const projectId = entry.crmProjectId;
      if (!groups[projectId]) {
        groups[projectId] = {
          projectId,
          projectName: "",
          totalDuration: 0,
          totalIdleTime: 0,
          entriesCount: 0,
          entries: [],
          latestEntry: null,
        };
      }
      groups[projectId].totalDuration += entry.duration || 0;
      groups[projectId].totalIdleTime += entry.idleTime || 0;
      groups[projectId].entriesCount += 1;
      groups[projectId].entries.push(entry);
      
      if (!groups[projectId].latestEntry || new Date(entry.startTime) > new Date(groups[projectId].latestEntry.startTime)) {
        groups[projectId].latestEntry = entry;
      }
    }

    return Object.values(groups).map(group => ({
      ...group,
      projectName: projects.find(p => p.id === group.projectId)?.project?.name || "Unknown Project",
    })).sort((a, b) => {
      const aTime = a.latestEntry ? new Date(a.latestEntry.startTime).getTime() : 0;
      const bTime = b.latestEntry ? new Date(b.latestEntry.startTime).getTime() : 0;
      return bTime - aTime;
    });
  }, [filteredEntries, projects]);

  const getProjectName = (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    return project?.project?.name || "Unknown Project";
  };

  const getUserName = (userId: string) => {
    const user = users.find((u) => u.id === userId);
    return user ? `${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email : "Unknown User";
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "running":
        return <Badge variant="default" className="bg-green-600">Running</Badge>;
      case "paused":
        return <Badge variant="secondary">Paused</Badge>;
      case "idle":
        return <Badge variant="outline" className="border-amber-500 text-amber-600">Idle</Badge>;
      case "stopped":
        return <Badge variant="outline" className="border-green-500 text-green-600 bg-green-50 dark:bg-green-950">Completed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const clearFilters = () => {
    setDateFilter("week");
    setProjectFilter("all");
    setUserFilter("all");
  };

  const hasActiveFilters = dateFilter !== "week" || projectFilter !== "all" || userFilter !== "all";

  if (isLoadingEntries) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-20" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Time Tracking</h1>
          <p className="text-muted-foreground">Track and analyze your team's time across projects</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card data-testid="card-stat-total-time">
          <CardHeader className="flex flex-row items-center justify-between pb-2 gap-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Time</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDuration(filteredStats.totalDuration)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {filteredStats.entriesCount} entries
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-stat-avg-session">
          <CardHeader className="flex flex-row items-center justify-between pb-2 gap-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Avg. Session</CardTitle>
            <Timer className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDuration(filteredStats.averageDuration)}</div>
            <p className="text-xs text-muted-foreground mt-1">per completed entry</p>
          </CardContent>
        </Card>

        <Card data-testid="card-stat-idle-time">
          <CardHeader className="flex flex-row items-center justify-between pb-2 gap-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Idle Time</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatDuration(filteredStats.totalIdleTime)}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {filteredStats.totalDuration > 0 
                ? `${Math.round((filteredStats.totalIdleTime / (filteredStats.totalDuration + filteredStats.totalIdleTime)) * 100)}% of tracked time`
                : "0% of tracked time"}
            </p>
          </CardContent>
        </Card>

        <Card data-testid="card-stat-productivity">
          <CardHeader className="flex flex-row items-center justify-between pb-2 gap-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Productivity</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {filteredStats.totalDuration > 0 
                ? `${Math.round((filteredStats.totalDuration / (filteredStats.totalDuration + filteredStats.totalIdleTime)) * 100)}%`
                : "0%"}
            </div>
            <p className="text-xs text-muted-foreground mt-1">active vs total time</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              <Filter className="h-4 w-4" />
              Time Entries
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
                <SelectTrigger className="w-32" data-testid="select-date-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                </SelectContent>
              </Select>

              <Select value={projectFilter} onValueChange={setProjectFilter}>
                <SelectTrigger className="w-40" data-testid="select-project-filter">
                  <SelectValue placeholder="All Projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {projects.map((project) => (
                    <SelectItem key={project.id} value={project.id}>
                      {project.project?.name || "Unnamed"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger className="w-40" data-testid="select-user-filter">
                  <SelectValue placeholder="All Users" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {`${user.firstName || ""} ${user.lastName || ""}`.trim() || user.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
                  <X className="h-3 w-3" />
                  Clear
                </Button>
              )}

              <div className="flex items-center border rounded-md">
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-8 w-8 rounded-r-none ${viewMode === "grouped" ? "bg-muted" : ""}`}
                  onClick={() => setViewMode("grouped")}
                  data-testid="button-view-grouped"
                >
                  <LayoutList className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-8 w-8 rounded-l-none ${viewMode === "table" ? "bg-muted" : ""}`}
                  onClick={() => setViewMode("table")}
                  data-testid="button-view-table"
                >
                  <Table2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filteredEntries.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground p-6">
              <Clock className="h-12 w-12 mx-auto mb-4 opacity-20" />
              <p>No time entries found</p>
              <p className="text-sm mt-1">Start tracking time using the timer in the sidebar</p>
            </div>
          ) : viewMode === "grouped" ? (
            <div className="space-y-3 p-6">
              {groupedByProject.map((group) => {
                const isExpanded = expandedProjects.has(group.projectId);
                return (
                  <div key={group.projectId} className="rounded-lg border overflow-hidden">
                    <div
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-4 hover-elevate gap-3 cursor-pointer"
                      data-testid={`time-entry-group-${group.projectId}`}
                      onClick={() => toggleProjectExpanded(group.projectId)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                          <span className="font-medium truncate">{group.projectName}</span>
                          <Badge variant="secondary" className="text-xs">{group.entriesCount} {group.entriesCount === 1 ? "session" : "sessions"}</Badge>
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2 ml-6">
                          {group.latestEntry && (
                            <>
                              <span>Last tracked: {format(new Date(group.latestEntry.startTime), "MMM d, yyyy")}</span>
                              <span className="hidden sm:inline">{getUserName(group.latestEntry.userId)}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="font-mono font-medium text-lg">{formatDetailedDuration(group.totalDuration)}</div>
                          {group.totalIdleTime > 0 && (
                            <div className="text-xs text-muted-foreground">+{formatDuration(group.totalIdleTime)} idle</div>
                          )}
                        </div>
                      </div>
                    </div>
                    {isExpanded && (
                      <div className="border-t bg-muted/30 divide-y">
                        {group.entries.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()).map((entry) => (
                          <div
                            key={entry.id}
                            className="flex flex-col sm:flex-row sm:items-center justify-between p-3 px-4 gap-2"
                            data-testid={`time-entry-${entry.id}`}
                          >
                            <div className="flex-1 min-w-0 ml-6">
                              <div className="flex items-center gap-2 flex-wrap">
                                {getStatusBadge(entry.status)}
                                {entry.description && (
                                  <span className="text-sm text-muted-foreground truncate">{entry.description}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                                <span>{format(new Date(entry.startTime), "MMM d, yyyy")}</span>
                                <span>{format(new Date(entry.startTime), "h:mm a")}</span>
                                {entry.endTime && (
                                  <span>- {format(new Date(entry.endTime), "h:mm a")}</span>
                                )}
                                <span className="hidden sm:inline">{getUserName(entry.userId)}</span>
                              </div>
                            </div>
                            <div className="text-right ml-6 sm:ml-0">
                              <div className="font-mono text-sm">{formatDetailedDuration(entry.duration || 0)}</div>
                              {entry.idleTime && entry.idleTime > 0 && (
                                <div className="text-xs text-muted-foreground">+{formatDuration(entry.idleTime)} idle</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted">
                    <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Project</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Status</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Date</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Time</th>
                    <th className="text-left px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">User</th>
                    <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Duration</th>
                    <th className="text-right px-4 py-3 font-semibold text-xs uppercase tracking-wider text-muted-foreground">Idle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredEntries
                    .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime())
                    .map((entry) => (
                      <tr key={entry.id} className="hover:bg-muted/50" data-testid={`table-time-entry-${entry.id}`}>
                        <td className="px-4 py-3">
                          <span className="font-medium text-sm">{getProjectName(entry.crmProjectId)}</span>
                          {entry.description && (
                            <p className="text-xs text-muted-foreground truncate max-w-[200px]">{entry.description}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">{getStatusBadge(entry.status)}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                          {format(new Date(entry.startTime), "MMM d, yyyy")}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground whitespace-nowrap">
                          {format(new Date(entry.startTime), "h:mm a")}
                          {entry.endTime && ` - ${format(new Date(entry.endTime), "h:mm a")}`}
                        </td>
                        <td className="px-4 py-3 text-sm">{getUserName(entry.userId)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="font-mono text-sm font-medium">{formatDetailedDuration(entry.duration || 0)}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-muted-foreground">
                          {entry.idleTime && entry.idleTime > 0 ? formatDuration(entry.idleTime) : "—"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
