import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { MultiTabCoordinator, type TabRole, type TimeTrackingSyncPayload } from "@/lib/MultiTabCoordinator";
import { ScreenCaptureWebService } from "@/lib/ScreenCaptureWebService";
import type { TimeEntry, CrmProjectWithDetails } from "@shared/schema";

interface TimeTrackerState {
  activeEntry: TimeEntry | null;
  isLoadingActive: boolean;
  displayDuration: number;
  isRunning: boolean;
  isPaused: boolean;
  hasActiveEntry: boolean;
  projects: CrmProjectWithDetails[];
  selectedProjectId: string;
  description: string;
  showIdleDialog: boolean;
  idleCountdown: number;
  isCapturing: boolean;
  captureError: string | null;
  startMutationPending: boolean;
  pauseMutationPending: boolean;
  resumeMutationPending: boolean;
  stopMutationPending: boolean;
  /** Whether this tab is the multi-tab leader (runs idle/heartbeat/screenshots) */
  isTabLeader: boolean;
}

interface TimeTrackerActions {
  setSelectedProjectId: (id: string) => void;
  setDescription: (desc: string) => void;
  handleStart: (projectId?: string) => void;
  handlePause: () => void;
  handleResume: () => void;
  handleStop: () => void;
  handleStillWorking: () => void;
  handleNotWorking: () => void;
  handleToggleCapture: () => void;
  setShowIdleDialog: (show: boolean) => void;
}

type TimeTrackerContextType = TimeTrackerState & TimeTrackerActions;

const TimeTrackerContext = createContext<TimeTrackerContextType | null>(null);

export function useTimeTracker() {
  const ctx = useContext(TimeTrackerContext);
  if (!ctx) {
    throw new Error("useTimeTracker must be used within a TimeTrackerProvider");
  }
  return ctx;
}

const IDLE_TIMEOUT_SECONDS = 180;
const HEARTBEAT_INTERVAL_SECONDS = 60;
const IDLE_COUNTDOWN_SECONDS = 30;
// If the time between two ticks exceeds this, assume sleep/wake occurred
const SLEEP_WAKE_THRESHOLD_MS = 30_000;

export function TimeTrackerProvider({ children }: { children: ReactNode }) {
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [description, setDescription] = useState("");
  const [displayDuration, setDisplayDuration] = useState(0);
  const [showIdleDialog, setShowIdleDialog] = useState(false);
  const [idleCountdown, setIdleCountdown] = useState(IDLE_COUNTDOWN_SECONDS);
  const [isTabLeader, setIsTabLeader] = useState(false);

  const lastActivityRef = useRef<number>(Date.now());
  const heartbeatIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idleCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const idleCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isIdleRef = useRef(false);
  const lastTickRef = useRef<number>(Date.now());
  const isDocumentVisibleRef = useRef(!document.hidden);

  // Screen capture service (extracted — see ScreenCaptureWebService.ts)
  const [isCapturing, setIsCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const screenCaptureRef = useRef<ScreenCaptureWebService | null>(null);
  const activeEntryRef = useRef<TimeEntry | null>(null);

  // ─── Multi-tab coordinator ───
  const coordinatorRef = useRef<MultiTabCoordinator | null>(null);

  const { data: activeEntry, isLoading: isLoadingActive } = useQuery<TimeEntry | null>({
    queryKey: ["/api/time-tracking/active"],
    refetchInterval: 10000,
  });

  const { data: projectsResponse } = useQuery<{ data: CrmProjectWithDetails[] }>({
    queryKey: ["/api/crm/projects", { pageSize: 500 }],
    queryFn: () => fetch("/api/crm/projects?pageSize=500").then(r => r.json()),
  });

  const projects = projectsResponse?.data || [];

  const invalidateAll = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["/api/time-tracking/active"] });
    queryClient.invalidateQueries({ queryKey: ["/api/time-tracking/entries"] });
    queryClient.invalidateQueries({ queryKey: ["/api/time-tracking/stats"] });
  }, []);

  const startMutation = useMutation({
    mutationFn: async (data: { crmProjectId: string; description?: string }) => {
      return apiRequest("POST", "/api/time-tracking/start", data);
    },
    onSuccess: () => {
      invalidateAll();
      setDescription("");
    },
  });

  const pauseMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/time-tracking/${id}/pause`);
    },
    onSuccess: () => invalidateAll(),
  });

  const resumeMutation = useMutation({
    mutationFn: async (data: { id: string; discardIdleTime?: boolean }) => {
      return apiRequest("POST", `/api/time-tracking/${data.id}/resume`, { discardIdleTime: data.discardIdleTime });
    },
    onSuccess: () => invalidateAll(),
  });

  const stopMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest("POST", `/api/time-tracking/${id}/stop`);
    },
    onSuccess: () => {
      invalidateAll();
      setSelectedProjectId("");
      screenCaptureRef.current?.stop();
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

  // Keep activeEntryRef in sync
  useEffect(() => {
    activeEntryRef.current = activeEntry ?? null;
  }, [activeEntry]);

  // ─── Screen capture service init ───
  useEffect(() => {
    const service = new ScreenCaptureWebService({
      onStateChange: (state) => setIsCapturing(state.isCapturing),
      onError: (msg) => setCaptureError(msg),
      onErrorClear: () => setCaptureError(null),
    });
    screenCaptureRef.current = service;
    return () => {
      service.destroy();
      screenCaptureRef.current = null;
    };
  }, []);

  // ─── Multi-tab coordinator init ───
  useEffect(() => {
    const coordinator = new MultiTabCoordinator({
      onRoleChange: (role: TabRole) => {
        setIsTabLeader(role === "leader");
        if (role === "leader") {
          // Becoming leader: refetch to get fresh state
          invalidateAll();
        }
      },
      onStateSync: (payload: TimeTrackingSyncPayload) => {
        // Follower receives state from leader — update display duration
        setDisplayDuration(payload.displayDuration);
      },
      onActivityPing: () => {
        // Another tab had user activity — update local lastActivity
        lastActivityRef.current = Date.now();
      },
    });

    coordinatorRef.current = coordinator;
    setIsTabLeader(coordinator.isLeader);

    // Release leadership on tab close/unload
    const handleBeforeUnload = () => {
      coordinator.releaseLeadership();
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      coordinator.destroy();
      coordinatorRef.current = null;
    };
  }, [invalidateAll]);

  // ─── Duration display ───
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
          const dur = calculateDuration();
          setDisplayDuration(dur);

          // Leader broadcasts duration to followers
          if (coordinatorRef.current?.isLeader) {
            coordinatorRef.current.broadcastState({
              isRunning: true,
              isPaused: false,
              activeEntryId: activeEntry.id,
              crmProjectId: activeEntry.crmProjectId,
              isCapturing: screenCaptureRef.current?.capturing ?? false,
              displayDuration: dur,
            });
          }
        }, 1000);
        return () => clearInterval(interval);
      }
    } else {
      setDisplayDuration(0);
    }
  }, [activeEntry]);

  // ─── Activity detection & idle handling (LEADER ONLY) ───
  const handleActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    // Broadcast activity to other tabs so their lastActivity stays fresh
    coordinatorRef.current?.broadcastActivity();
  }, []);

  const resetIdleState = useCallback(() => {
    isIdleRef.current = false;
    lastActivityRef.current = Date.now();
  }, []);

  const isRunning = activeEntry?.status === "running";

  useEffect(() => {
    // Only the leader runs idle detection and heartbeat
    if (!isTabLeader) return;

    if (!activeEntry?.id || activeEntry.status !== "running") {
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      if (idleCheckIntervalRef.current) {
        clearInterval(idleCheckIntervalRef.current);
        idleCheckIntervalRef.current = null;
      }
      return;
    }

    isIdleRef.current = false;
    lastActivityRef.current = Date.now();
    lastTickRef.current = Date.now();

    const events = ["mousemove", "keydown", "mousedown", "touchstart", "scroll", "wheel"];
    events.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    heartbeatIntervalRef.current = setInterval(() => {
      if (activeEntry?.id && activeEntry.status === "running") {
        activityMutation.mutate(activeEntry.id);
      }
    }, HEARTBEAT_INTERVAL_SECONDS * 1000);

    idleCheckIntervalRef.current = setInterval(() => {
      const now = Date.now();
      const tickDelta = now - lastTickRef.current;
      lastTickRef.current = now;

      // Sleep/wake detection: if tick delta is too large, the system was asleep.
      // Don't auto-stop — just resync with the server.
      if (tickDelta > SLEEP_WAKE_THRESHOLD_MS) {
        console.log(`[IdleDetect] Sleep/wake detected (delta: ${Math.round(tickDelta / 1000)}s). Resyncing.`);
        lastActivityRef.current = now; // Reset activity to avoid false idle
        invalidateAll(); // Resync with server
        return;
      }

      // Don't trigger idle auto-stop when tab is hidden (visibility handler will resync)
      if (!isDocumentVisibleRef.current) return;

      const idleTime = (now - lastActivityRef.current) / 1000;
      if (idleTime >= IDLE_TIMEOUT_SECONDS && !isIdleRef.current) {
        isIdleRef.current = true;
        setShowIdleDialog(true);
        setIdleCountdown(IDLE_COUNTDOWN_SECONDS);
      }
    }, 5000);

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }
      if (idleCheckIntervalRef.current) {
        clearInterval(idleCheckIntervalRef.current);
        idleCheckIntervalRef.current = null;
      }
    };
  }, [activeEntry?.id, activeEntry?.status, handleActivity, isTabLeader, invalidateAll]);

  // ─── Idle countdown → auto-STOP (LEADER ONLY) ───
  const stopMutationRef = useRef(stopMutation);
  stopMutationRef.current = stopMutation;

  useEffect(() => {
    if (showIdleDialog && isTabLeader) {
      setIdleCountdown(IDLE_COUNTDOWN_SECONDS);

      if (idleCountdownRef.current) {
        clearInterval(idleCountdownRef.current);
      }

      idleCountdownRef.current = setInterval(() => {
        setIdleCountdown((prev) => {
          if (prev <= 1) {
            if (idleCountdownRef.current) {
              clearInterval(idleCountdownRef.current);
              idleCountdownRef.current = null;
            }
            const entry = activeEntryRef.current;
            if (entry) {
              stopMutationRef.current.mutate(entry.id);
            }
            setShowIdleDialog(false);
            return IDLE_COUNTDOWN_SECONDS;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (idleCountdownRef.current) {
          clearInterval(idleCountdownRef.current);
          idleCountdownRef.current = null;
        }
      };
    }
  }, [showIdleDialog, isTabLeader]);

  // ─── Visibility change handling ───
  useEffect(() => {
    const handleVisibilityChange = () => {
      const isVisible = !document.hidden;
      isDocumentVisibleRef.current = isVisible;

      if (isVisible) {
        // Tab became visible — resync with server
        console.log("[Visibility] Tab visible — resyncing");
        lastActivityRef.current = Date.now();
        lastTickRef.current = Date.now();
        invalidateAll();

        // If idle dialog was showing but we were hidden, don't auto-stop
        // (the user might have been working in another app)
      } else {
        // Tab hidden — suppress aggressive idle detection (handled in idle check)
        console.log("[Visibility] Tab hidden — suppressing idle auto-stop");
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [invalidateAll]);

  const handleStillWorking = useCallback(() => {
    setShowIdleDialog(false);
    if (idleCountdownRef.current) {
      clearInterval(idleCountdownRef.current);
      idleCountdownRef.current = null;
    }
    resetIdleState();
    if (activeEntry) {
      activityMutation.mutate(activeEntry.id);
    }
  }, [resetIdleState, activeEntry]);

  const handleNotWorking = useCallback(() => {
    setShowIdleDialog(false);
    if (idleCountdownRef.current) {
      clearInterval(idleCountdownRef.current);
      idleCountdownRef.current = null;
    }
    if (activeEntry) {
      stopMutation.mutate(activeEntry.id);
    }
  }, [activeEntry]);

  // ─── Screen Capture via service (LEADER ONLY for scheduling) ───
  // Pause/resume capture scheduling based on running state
  useEffect(() => {
    const service = screenCaptureRef.current;
    if (!service) return;

    if (!isRunning) {
      service.pauseScheduling();
    } else if (isRunning && service.capturing) {
      service.resumeScheduling(activeEntry?.id ?? null, activeEntry?.crmProjectId ?? null);
    }
  }, [isRunning, activeEntry?.id, activeEntry?.crmProjectId]);

  // ─── Actions ───
  const handleStart = useCallback((projectId?: string) => {
    const pid = projectId || selectedProjectId;
    if (!pid) return;
    startMutation.mutate({ crmProjectId: pid, description: description || undefined });
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

  const handleToggleCapture = useCallback(() => {
    const service = screenCaptureRef.current;
    if (!service) return;

    if (isCapturing) {
      service.stop();
    } else {
      service.start();
    }
  }, [isCapturing]);

  const isPaused = activeEntry?.status === "paused";
  const hasActiveEntry = !!activeEntry;

  const value: TimeTrackerContextType = {
    activeEntry: activeEntry ?? null,
    isLoadingActive,
    displayDuration,
    isRunning: !!isRunning,
    isPaused: !!isPaused,
    hasActiveEntry,
    projects,
    selectedProjectId,
    description,
    showIdleDialog,
    idleCountdown,
    isCapturing,
    captureError,
    isTabLeader,
    startMutationPending: startMutation.isPending,
    pauseMutationPending: pauseMutation.isPending,
    resumeMutationPending: resumeMutation.isPending,
    stopMutationPending: stopMutation.isPending,
    setSelectedProjectId,
    setDescription,
    handleStart,
    handlePause,
    handleResume,
    handleStop,
    handleStillWorking,
    handleNotWorking,
    handleToggleCapture,
    setShowIdleDialog,
  };

  return (
    <TimeTrackerContext.Provider value={value}>
      {children}
    </TimeTrackerContext.Provider>
  );
}
