/**
 * Sync worker — drains the SQLite queue and sends batches to the server.
 *
 * Offline-first: events accumulate locally and sync when connectivity returns.
 * Uses exponential backoff on failure (5s → 10s → 20s → ... → 5min max).
 *
 * Phase 2 D4 — Skeleton.
 */

import { app } from "electron";
import { ApiClient } from "../lib/ApiClient";
import { SqliteQueue } from "../lib/SqliteQueue";
import { AgentStore } from "../lib/AgentStore";

const SYNC_INTERVAL_MS = 10_000; // Check for pending events every 10s
const MAX_BACKOFF_MS = 5 * 60_000; // 5 minutes
const BASE_BACKOFF_MS = 5_000;

export class SyncWorker {
  private apiClient: ApiClient;
  private queue: SqliteQueue;
  private store: AgentStore;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private consecutiveFailures = 0;

  constructor(apiClient: ApiClient, queue: SqliteQueue, store: AgentStore) {
    this.apiClient = apiClient;
    this.queue = queue;
    this.store = store;
  }

  start(): void {
    this.scheduleNext(0);
    console.log("[SyncWorker] Started");
  }

  stop(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    console.log("[SyncWorker] Stopped");
  }

  private scheduleNext(delayMs: number): void {
    this.timeout = setTimeout(() => this.syncOnce(), delayMs);
  }

  private async syncOnce(): Promise<void> {
    try {
      const pending = this.queue.pendingCount();
      if (pending === 0) {
        this.scheduleNext(SYNC_INTERVAL_MS);
        return;
      }

      const { batchId, events } = this.queue.getNextBatch(50);

      if (events.length === 0) {
        this.scheduleNext(SYNC_INTERVAL_MS);
        return;
      }

      const deviceId = this.store.getDeviceId();
      if (!deviceId) {
        this.scheduleNext(SYNC_INTERVAL_MS);
        return;
      }

      const result = await this.apiClient.sendEventsBatch({
        deviceId,
        batchId,
        clientType: "electron",
        clientVersion: app.getVersion(),
        events: events.map(e => ({
          type: e.eventType,
          timestamp: e.timestamp,
          data: JSON.parse(e.data || "{}"),
        })),
      });

      if (result.ok) {
        this.queue.markBatchSynced(batchId);
        this.consecutiveFailures = 0;
        console.log(`[SyncWorker] Batch ${batchId} synced (${result.accepted} events)`);
      }

      // Immediately try next batch if there are more
      this.scheduleNext(pending > events.length ? 100 : SYNC_INTERVAL_MS);
    } catch (error) {
      this.consecutiveFailures++;
      const backoff = Math.min(
        BASE_BACKOFF_MS * Math.pow(2, this.consecutiveFailures - 1),
        MAX_BACKOFF_MS
      );
      console.error(`[SyncWorker] Sync failed (attempt ${this.consecutiveFailures}), retrying in ${backoff / 1000}s:`, error);
      this.scheduleNext(backoff);
    }
  }
}
