/**
 * Sync worker — drains the event queue and sends batches to the server.
 *
 * Offline-first: events accumulate locally and sync when connectivity returns.
 * Exponential backoff on failure (5s -> 10s -> 20s -> ... -> 5min max).
 * Batch sync every 30s (or immediately if batch is full).
 *
 * Phase 3 MVP
 */

import { ApiClient } from "../lib/ApiClient";
import { SqliteQueue } from "../lib/SqliteQueue";
import { AgentStore } from "../lib/AgentStore";

const SYNC_INTERVAL_MS = 30_000; // Sync every 30s
const MAX_BACKOFF_MS = 5 * 60_000; // 5 minutes
const BASE_BACKOFF_MS = 5_000;
const BATCH_SIZE = 50;

export class SyncWorker {
  private apiClient: ApiClient;
  private queue: SqliteQueue;
  private store: AgentStore;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private consecutiveFailures = 0;
  private totalSynced = 0;

  constructor(apiClient: ApiClient, queue: SqliteQueue, store: AgentStore) {
    this.apiClient = apiClient;
    this.queue = queue;
    this.store = store;
  }

  start(): void {
    // First sync after 5s to allow initial events to accumulate
    this.scheduleNext(5000);
    console.log("[SyncWorker] Started (30s interval)");
  }

  stop(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    console.log(`[SyncWorker] Stopped (total synced: ${this.totalSynced})`);
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

      const { batchId, events } = this.queue.getNextBatch(BATCH_SIZE);
      if (events.length === 0) {
        this.scheduleNext(SYNC_INTERVAL_MS);
        return;
      }

      const deviceId = this.store.getDeviceId();
      if (!deviceId) {
        this.queue.releaseBatch(batchId);
        this.scheduleNext(SYNC_INTERVAL_MS);
        return;
      }

      const result = await this.apiClient.sendEventsBatch({
        deviceId,
        batchId,
        clientType: "electron",
        clientVersion: this.store.getClientVersion(),
        events: events.map(e => ({
          type: e.eventType,
          timestamp: e.timestamp,
          data: JSON.parse(e.data || "{}"),
        })),
      });

      if (result.ok) {
        this.queue.markBatchSynced(batchId);
        this.consecutiveFailures = 0;
        this.totalSynced += result.accepted || events.length;
        console.log(`[SyncWorker] Batch synced: ${events.length} events (total: ${this.totalSynced})`);

        // If more pending, sync again quickly
        const remaining = this.queue.pendingCount();
        this.scheduleNext(remaining > 0 ? 1000 : SYNC_INTERVAL_MS);
      } else {
        // Server rejected but didn't error — release batch
        this.queue.releaseBatch(batchId);
        this.scheduleNext(SYNC_INTERVAL_MS);
      }
    } catch (error: any) {
      this.consecutiveFailures++;
      const backoff = Math.min(
        BASE_BACKOFF_MS * Math.pow(2, this.consecutiveFailures - 1),
        MAX_BACKOFF_MS
      );
      console.error(`[SyncWorker] Failed (attempt ${this.consecutiveFailures}), retry in ${backoff / 1000}s: ${error.message}`);

      // Release the batch so it can be retried
      this.scheduleNext(backoff);
    }
  }
}
