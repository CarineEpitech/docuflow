import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useActivityDetection } from "@/hooks/useActivityDetection";
import { useScreenCapture } from "@/hooks/useScreenCapture";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
import { Input } from "@/components/ui/input";
import { Play, Pause, Square, Clock, ChevronDown, ChevronUp, AlertCircle, Check, ChevronsUpDown, Timer, Monitor, MonitorOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TimeEntry, CrmProjectWithDetails } from "@shared/schema";

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

interface TimeTrackerProps {
  testId?: string;
  iconOnly?: boolean;
}

export function TimeTracker({ testId = "button-time-tracker-toggle", iconOnly = false }: TimeTrackerProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [projectSelectorOpen, setProjectSelectorOpen] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [description, setDescription] = useState("");
  const [displayDuration, setDisplayDuration] = useState(0);
  const [showIdleDialog, setShowIdleDialog] = useState(false);
  const [idleCountdown, setIdleCountdown] = useState(30);
  const idleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  const { data: activeEntry, isLoading: isLoadingActive } = useQuery<TimeEntry | null>({
    queryKey: ["/api/time-tracking/active"],
    refetchInterval: 10000,
  });
  
  const { data: projectsResponse } = useQuery<{ data: CrmProjectWithDetails[] }>({
    queryKey: ["/api/crm/projects", { pageSize: 500 }],
    queryFn: () => fetch("/api/crm/projects?pageSize=500").then(r => r.json()),
  });
  
  const projects = projectsResponse?.data || [];
  
  const startMutation = useMutation({
    mutationFn: async (data: { crmProjectId: string; description?: string }) => {
      return apiRequest("POST", "/api/time-tracking/start", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-tracking/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-tracking/entries"] });
      setDescription("");
    },
  });
  
  const pauseMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/time-tracking/${id}/pause`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-tracking/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-tracking/entries"] });
    },
  });
  
  const resumeMutation = useMutation({
    mutationFn: async (data: { id: string; discardIdleTime?: boolean }) => {
      return apiRequest("POST", `/api/time-tracking/${data.id}/resume`, { discardIdleTime: data.discardIdleTime });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-tracking/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-tracking/entries"] });
    },
  });
  
  const stopMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/time-tracking/${id}/stop`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-tracking/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-tracking/entries"] });
      queryClient.invalidateQueries({ queryKey: ["/api/time-tracking/stats"] });
      setSelectedProjectId("");
    },
  });
  
  const activityMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/time-tracking/${id}/activity`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/time-tracking/active"] });
    },
  });
  
  useEffect(() => {
    if (activeEntry) {
      setSelectedProjectId(activeEntry.crmProjectId);
      
      const calculateDuration = () => {
        let duration = activeEntry.duration || 0;
        if (activeEntry.status === "running" && activeEntry.lastActivityAt) {
          const elapsed = Math.floor((Date.now() - new Date(activeEntry.lastActivityAt).getTime()) / 1000);
          duration += elapsed;
        }
        return duration;
      };
      
      setDisplayDuration(calculateDuration());
      
      if (activeEntry.status === "running") {
        const interval = setInterval(() => {
          setDisplayDuration(calculateDuration());
        }, 1000);
        return () => clearInterval(interval);
      }
    } else {
      setDisplayDuration(0);
    }
  }, [activeEntry]);
  
  const handleIdleDetected = useCallback(() => {
    setShowIdleDialog(true);
    setIdleCountdown(30);
  }, []);

  const { resetIdleState } = useActivityDetection({
    entryId: activeEntry?.id || null,
    status: activeEntry?.status as "running" | "paused" | "idle" | null,
    idleTimeoutSeconds: 60,
    heartbeatIntervalSeconds: 60,
    onIdleDetected: handleIdleDetected,
  });

  useEffect(() => {
    if (showIdleDialog) {
      setIdleCountdown(30);
      const countdownInterval = setInterval(() => {
        setIdleCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(countdownInterval);
            if (activeEntry) {
              pauseMutation.mutate(activeEntry.id);
            }
            setShowIdleDialog(false);
            return 30;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(countdownInterval);
    }
  }, [showIdleDialog, activeEntry, pauseMutation]);

  const handleStillWorking = useCallback(() => {
    setShowIdleDialog(false);
    resetIdleState();
    if (activeEntry) {
      activityMutation.mutate(activeEntry.id);
    }
  }, [resetIdleState, activeEntry, activityMutation]);

  const handleNotWorking = useCallback(() => {
    setShowIdleDialog(false);
    if (activeEntry) {
      pauseMutation.mutate(activeEntry.id);
    }
  }, [activeEntry, pauseMutation]);
  
  const handleStart = useCallback(() => {
    if (!selectedProjectId) return;
    startMutation.mutate({ crmProjectId: selectedProjectId, description: description || undefined });
  }, [selectedProjectId, description, startMutation]);
  
  const handlePause = useCallback(() => {
    if (activeEntry) {
      pauseMutation.mutate(activeEntry.id);
    }
  }, [activeEntry, pauseMutation]);
  
  const handleResume = useCallback(() => {
    if (activeEntry) {
      resumeMutation.mutate({ id: activeEntry.id, discardIdleTime: false });
    }
  }, [activeEntry, resumeMutation]);
  
  const handleStop = useCallback(() => {
    if (activeEntry) {
      stopMutation.mutate(activeEntry.id);
    }
  }, [activeEntry, stopMutation]);
  
  const isRunning = activeEntry?.status === "running";
  const isPaused = activeEntry?.status === "paused";
  const hasActiveEntry = !!activeEntry;

  const { isCapturing, captureError, startCapture, stopCapture } = useScreenCapture({
    timeEntryId: activeEntry?.id || null,
    crmProjectId: activeEntry?.crmProjectId || null,
    isRunning: isRunning,
  });

  const handleToggleCapture = useCallback(() => {
    if (isCapturing) {
      stopCapture();
    } else {
      startCapture();
    }
  }, [isCapturing, startCapture, stopCapture]);
  
  const activeProject = projects.find(p => p.id === activeEntry?.crmProjectId);
  
  if (isLoadingActive) {
    return null;
  }
  
  return (
    <>
    <Popover open={isExpanded} onOpenChange={setIsExpanded}>
      <PopoverTrigger asChild>
        <Button 
          variant={hasActiveEntry ? (isRunning ? "default" : "secondary") : "ghost"}
          size={iconOnly ? "icon" : "sm"}
          className={`${iconOnly ? "h-8 w-8" : "gap-2"} ${isRunning ? "animate-pulse" : ""}`}
          data-testid={testId}
        >
          <Clock className="h-4 w-4" />
          {!iconOnly && (
            <>
              {hasActiveEntry ? (
                <span className="font-mono text-sm">{formatDuration(displayDuration)}</span>
              ) : (
                <span>Track Time</span>
              )}
              {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-4" align="end">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Time Tracker</h4>
            {hasActiveEntry && (
              <span className={`text-2xl font-mono ${isRunning ? "text-primary" : "text-muted-foreground"}`}>
                {formatDuration(displayDuration)}
              </span>
            )}
          </div>
          
          {!hasActiveEntry ? (
            <>
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Select Project</label>
                <Popover open={projectSelectorOpen} onOpenChange={setProjectSelectorOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={projectSelectorOpen}
                      className="w-full justify-between"
                      data-testid="select-time-project"
                    >
                      {selectedProjectId
                        ? projects.find((p) => p.id === selectedProjectId)?.project?.name || "Unnamed Project"
                        : "Choose a project..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search projects..." />
                      <CommandList>
                        <CommandEmpty>No project found.</CommandEmpty>
                        <CommandGroup>
                          {projects.map((project) => (
                            <CommandItem
                              key={project.id}
                              value={project.project?.name || "Unnamed Project"}
                              onSelect={() => {
                                setSelectedProjectId(project.id);
                                setProjectSelectorOpen(false);
                              }}
                            >
                              <Check
                                className={cn(
                                  "mr-2 h-4 w-4",
                                  selectedProjectId === project.id ? "opacity-100" : "opacity-0"
                                )}
                              />
                              {project.project?.name || "Unnamed Project"}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm text-muted-foreground">Description (optional)</label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What are you working on?"
                  data-testid="input-time-description"
                />
              </div>
              
              <Button
                onClick={handleStart}
                disabled={!selectedProjectId || startMutation.isPending}
                className="w-full gap-2"
                data-testid="button-start-tracking"
              >
                <Play className="h-4 w-4" />
                Start Tracking
              </Button>
            </>
          ) : (
            <>
              {(activeEntry.status === "paused" || activeEntry.status === "idle") && (
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-500 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-2 text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>
                    {activeEntry.status === "idle" 
                      ? "Timer paused due to inactivity" 
                      : "Timer is paused"}
                  </span>
                </div>
              )}
              
              <div className="bg-muted rounded-lg p-3">
                <div className="text-sm text-muted-foreground">Working on</div>
                <div className="font-medium truncate">
                  {activeProject?.project?.name || "Unknown Project"}
                </div>
                {activeEntry.description && (
                  <div className="text-sm text-muted-foreground truncate mt-1">
                    {activeEntry.description}
                  </div>
                )}
              </div>
              
              <div className="flex items-center gap-2 p-2 rounded-lg border border-border">
                <Button
                  size="sm"
                  variant={isCapturing ? "default" : "outline"}
                  className="gap-1.5 flex-1"
                  onClick={handleToggleCapture}
                  disabled={!isRunning}
                  data-testid="button-toggle-screen-capture"
                >
                  {isCapturing ? (
                    <>
                      <Monitor className="h-3.5 w-3.5" />
                      <span className="text-xs">Screen Sharing On</span>
                    </>
                  ) : (
                    <>
                      <MonitorOff className="h-3.5 w-3.5" />
                      <span className="text-xs">Share Screen</span>
                    </>
                  )}
                </Button>
              </div>

              {captureError && (
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-xs">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  <span>{captureError}</span>
                </div>
              )}

              <div className="flex gap-2">
                {isRunning ? (
                  <Button
                    onClick={handlePause}
                    variant="secondary"
                    className="flex-1 gap-2"
                    disabled={pauseMutation.isPending}
                    data-testid="button-pause-tracking"
                  >
                    <Pause className="h-4 w-4" />
                    Pause
                  </Button>
                ) : (
                  <Button
                    onClick={handleResume}
                    className="flex-1 gap-2"
                    disabled={resumeMutation.isPending}
                    data-testid="button-resume-tracking"
                  >
                    <Play className="h-4 w-4" />
                    Resume
                  </Button>
                )}
                <Button
                  onClick={handleStop}
                  variant="destructive"
                  className="flex-1 gap-2"
                  disabled={stopMutation.isPending}
                  data-testid="button-stop-tracking"
                >
                  <Square className="h-4 w-4" />
                  Stop
                </Button>
              </div>
              
              {isPaused && (
                <div className="text-sm text-center text-muted-foreground">
                  Timer is paused
                </div>
              )}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>

    <AlertDialog open={showIdleDialog} onOpenChange={setShowIdleDialog}>
      <AlertDialogContent data-testid="dialog-idle-check">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Timer className="h-5 w-5 text-amber-500" />
            Are you still working?
          </AlertDialogTitle>
          <AlertDialogDescription>
            We haven't detected any activity for the last minute. The timer will pause automatically in {idleCountdown} seconds if there's no response.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={handleNotWorking}
            data-testid="button-idle-no"
          >
            No, pause timer
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleStillWorking}
            data-testid="button-idle-yes"
          >
            Yes, still working
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
