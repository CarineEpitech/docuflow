/**
 * Sync worker — drains activity events and screenshot uploads to the server.
 *
 * Two drain loops running in the same cycle:
 *  1. Activity events  → POST /api/agent/events/batch
 *  2. Screenshots      → presign → PUT upload → confirm
 *
 * Exponential backoff: 5s → 10s → 20s → ... → 5 min max.
 * Offline-first: SQLite queue survives restarts (Phase 4.2).
 *
 * Phase 4.2
 */

import { ApiClient } from "../lib/ApiClient";
import { SqliteQueue } from "../lib/SqliteQueue";
import { AgentStore } from "../lib/AgentStore";
import fs from "fs";
import path from "path";

const SYNC_INTERVAL_MS = 30_000;
const MAX_BACKOFF_MS = 5 * 60_000;
const BASE_BACKOFF_MS = 5_000;
const BATCH_SIZE = 50;
const MAX_SCREENSHOT_ATTEMPTS = 5;

export class SyncWorker {
  private apiClient: ApiClient;
  private queue: SqliteQueue;
  private store: AgentStore;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private eventFailures = 0;
  private totalEventsSynced = 0;
  private totalScreenshotsSynced = 0;

  constructor(apiClient: ApiClient, queue: SqliteQueue, store: AgentStore) {
    this.apiClient = apiClient;
    this.queue = queue;
    this.store = store;
  }

  start(): void {
    this.scheduleNext(5_000);
    console.log("[SyncWorker] Started (30s interval, SQLite-backed)");
  }

  stop(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    console.log(
      `[SyncWorker] Stopped (events: ${this.totalEventsSynced}, screenshots: ${this.totalScreenshotsSynced})`
    );
  }

  private scheduleNext(delayMs: number): void {
    this.timeout = setTimeout(() => this.syncOnce(), delayMs);
  }

  private async syncOnce(): Promise<void> {
    await this.drainEvents();
    await this.drainScreenshots();
    this.scheduleNext(SYNC_INTERVAL_MS);
  }

  // ─── Activity events ───

  private async drainEvents(): Promise<void> {
    const pending = this.queue.pendingCount();
    if (pending === 0) return;

    const { batchId, events } = this.queue.getNextBatch(BATCH_SIZE);
    if (events.length === 0) return;

    const deviceId = this.store.getDeviceId();
    if (!deviceId) {
      this.queue.releaseBatch(batchId);
      return;
    }

    try {
      const result = await this.apiClient.sendEventsBatch({
        deviceId,
        batchId,
        clientType: "electron",
        clientVersion: this.store.getClientVersion(),
        events: events.map((e) => ({
          type: e.eventType,
          timestamp: e.timestamp,
          data: JSON.parse(e.data || "{}"),
        })),
      });

      if (result.ok) {
        this.queue.markBatchSynced(batchId);
        this.eventFailures = 0;
        this.totalEventsSynced += result.accepted || events.length;
        console.log(
          `[SyncWorker] Events: ${events.length} synced (total: ${this.totalEventsSynced})`
        );
      } else {
        this.queue.releaseBatch(batchId);
      }
    } catch (error: any) {
      this.queue.releaseBatch(batchId);
      this.eventFailures++;
      console.error(`[SyncWorker] Event sync failed: ${error.message}`);
    }
  }

  // ─── Screenshots ───

  private async drainScreenshots(): Promise<void> {
    const pending = this.queue.getNextPendingScreenshot();
    if (!pending) return;

    if (pending.attemptCount >= MAX_SCREENSHOT_ATTEMPTS) {
      console.warn(`[SyncWorker] Screenshot ${pending.id.slice(0, 8)} exceeded max attempts, dropping`);
      this.queue.markScreenshotSent(pending.id); // Remove from queue
      this.cleanupFile(pending.filePath);
      return;
    }

    try {
      const meta = JSON.parse(pending.metaJson) as {
        timeEntryId: string;
        capturedAt: string;
        deviceId?: string;
        clientVersion?: string;
      };

      const deviceId = meta.deviceId ?? this.store.getDeviceId();
      if (!deviceId) return;

      // Step 1: Presign
      const presignResult = await this.apiClient.presignScreenshot({
        deviceId,
        timeEntryId: meta.timeEntryId,
        capturedAt: meta.capturedAt,
        clientType: "electron",
        clientVersion: meta.clientVersion ?? this.store.getClientVersion(),
      });

      // Step 2: Upload binary (async to avoid blocking event loop)
      const imageBuffer = await fs.promises.readFile(pending.filePath);
      await this.apiClient.uploadScreenshot(presignResult.uploadURL, imageBuffer);

      // Step 3: Confirm
      await this.apiClient.confirmScreenshot({
        screenshotId: presignResult.screenshotId,
        deviceId,
      });

      this.queue.markScreenshotSent(pending.id);
      this.cleanupFile(pending.filePath);
      this.totalScreenshotsSynced++;
      console.log(
        `[SyncWorker] Screenshot ${pending.id.slice(0, 8)} uploaded (total: ${this.totalScreenshotsSynced})`
      );
    } catch (error: any) {
      const backoff = Math.min(
        BASE_BACKOFF_MS * Math.pow(2, pending.attemptCount),
        MAX_BACKOFF_MS
      );
      this.queue.failScreenshot(pending.id, backoff);
      console.error(`[SyncWorker] Screenshot upload failed (attempt ${pending.attemptCount + 1}): ${error.message}`);
    }
  }

  private cleanupFile(filePath: string): void {
    fs.promises.unlink(filePath).catch((err) => {
      console.warn(`[SyncWorker] Cleanup failed for ${path.basename(filePath)}: ${err.message}`);
    });
  }
}
