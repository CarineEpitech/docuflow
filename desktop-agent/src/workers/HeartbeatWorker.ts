/**
 * Heartbeat worker — sends periodic heartbeats to the server.
 *
 * Interval: 60 seconds while running.
 * Includes device info and current active time entry (if any).
 *
 * Phase 2 D4 — Skeleton.
 */

import { app } from "electron";
import { ApiClient } from "../lib/ApiClient";
import { AgentStore } from "../lib/AgentStore";

const HEARTBEAT_INTERVAL_MS = 60_000;

export class HeartbeatWorker {
  private apiClient: ApiClient;
  private store: AgentStore;
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(apiClient: ApiClient, store: AgentStore) {
    this.apiClient = apiClient;
    this.store = store;
  }

  start(): void {
    if (this.interval) return;

    this.sendHeartbeat(); // Initial heartbeat
    this.interval = setInterval(() => this.sendHeartbeat(), HEARTBEAT_INTERVAL_MS);
    console.log("[HeartbeatWorker] Started");
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    console.log("[HeartbeatWorker] Stopped");
  }

  private async sendHeartbeat(): Promise<void> {
    try {
      const deviceId = this.store.getDeviceId();
      if (!deviceId) return;

      await this.apiClient.sendHeartbeat({
        deviceId,
        timeEntryId: null, // [PLACEHOLDER]: Get from active tracking state
        timestamp: new Date().toISOString(),
        activeApp: null, // [PLACEHOLDER]: Get from OS activity detection
        activeWindow: null,
        clientType: "electron",
        clientVersion: app.getVersion(),
      });
    } catch (error) {
      console.error("[HeartbeatWorker] Failed:", error);
      // Non-fatal — will retry next interval
    }
  }
}
