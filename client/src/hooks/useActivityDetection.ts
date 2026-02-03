import { useEffect, useRef, useCallback } from "react";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface ActivityDetectionOptions {
  entryId: string | null;
  status: "running" | "paused" | "idle" | null;
  idleTimeoutSeconds?: number;
  heartbeatIntervalSeconds?: number;
  onIdleDetected?: () => void;
}

export function useActivityDetection({
  entryId,
  status,
  idleTimeoutSeconds = 60,
  heartbeatIntervalSeconds = 60,
  onIdleDetected,
}: ActivityDetectionOptions) {
  const lastActivityRef = useRef<number>(Date.now());
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const idleCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isIdleRef = useRef(false);

  const sendHeartbeat = useCallback(async () => {
    if (!entryId || status !== "running") return;

    try {
      await apiRequest("POST", `/api/time-tracking/${entryId}/activity`);
      queryClient.invalidateQueries({ queryKey: ["/api/time-tracking/active"] });
    } catch (error) {
      console.error("Failed to send activity heartbeat:", error);
    }
  }, [entryId, status]);

  const handleIdleDetected = useCallback(() => {
    if (!entryId || status !== "running" || isIdleRef.current) return;

    isIdleRef.current = true;
    if (onIdleDetected) {
      onIdleDetected();
    }
  }, [entryId, status, onIdleDetected]);

  const handleActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  const resetIdleState = useCallback(() => {
    isIdleRef.current = false;
    lastActivityRef.current = Date.now();
  }, []);

  useEffect(() => {
    if (!entryId || status !== "running") {
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

    const events = ["mousemove", "keydown", "mousedown", "touchstart", "scroll", "wheel"];
    events.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    heartbeatIntervalRef.current = setInterval(() => {
      sendHeartbeat();
    }, heartbeatIntervalSeconds * 1000);

    idleCheckIntervalRef.current = setInterval(() => {
      const idleTime = (Date.now() - lastActivityRef.current) / 1000;
      if (idleTime >= idleTimeoutSeconds && !isIdleRef.current) {
        handleIdleDetected();
      }
    }, 5000);

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
      if (idleCheckIntervalRef.current) {
        clearInterval(idleCheckIntervalRef.current);
      }
    };
  }, [entryId, status, idleTimeoutSeconds, heartbeatIntervalSeconds, handleActivity, sendHeartbeat, handleIdleDetected]);

  return {
    lastActivityTime: lastActivityRef.current,
    isIdle: isIdleRef.current,
    resetIdleState,
  };
}
