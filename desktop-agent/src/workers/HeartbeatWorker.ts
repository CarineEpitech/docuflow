/**
 * Heartbeat worker — sends periodic heartbeats to the server.
 *
 * Interval: 60 seconds.
 * Includes deviceId, active time entry, and client info.
 *
 * Phase 3 MVP
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

    // Initial heartbeat after short delay
    setTimeout(() => this.sendHeartbeat(), 2000);
    this.interval = setInterval(() => this.sendHeartbeat(), HEARTBEAT_INTERVAL_MS);
    console.log("[HeartbeatWorker] Started (60s interval)");
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

      const result = await this.apiClient.sendHeartbeat({
        deviceId,
        timeEntryId: this.store.getActiveEntryId(),
        timestamp: new Date().toISOString(),
        clientType: "electron",
        clientVersion: this.store.getClientVersion(),
      });

      console.log(`[HeartbeatWorker] OK (server: ${result.serverTime})`);
    } catch (error: any) {
      console.error("[HeartbeatWorker] Failed:", error.message);
    }
  }
}
