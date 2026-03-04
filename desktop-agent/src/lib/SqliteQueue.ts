/**
 * Persistent JSON-file queue for activity event batches and screenshot uploads.
 *
 * Replaces the original better-sqlite3 implementation to eliminate native
 * module packaging issues in Electron Forge + webpack + asar builds.
 *
 * Data is stored as JSON in `agent-queue.json` inside the userData directory.
 * Writes use atomic rename (write → temp file, rename → target) to prevent
 * corruption on crash.
 *
 * Phase 4.2 (revised)
 */

import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";

export interface QueuedEvent {
  id: number;
  batchId: string | null;
  eventType: string;
  timestamp: string;
  data: string; // JSON string
  createdAt: string;
  syncedAt: string | null;
}

export interface PendingScreenshot {
  id: string;
  filePath: string;
  metaJson: string; // { timeEntryId, userId, capturedAt, crmProjectId }
  nextRetryAt: number; // epoch ms
  attemptCount: number;
  createdAt: number; // epoch ms
}

interface QueueData {
  nextEventId: number;
  events: QueuedEvent[];
  screenshots: PendingScreenshot[];
}

function emptyData(): QueueData {
  return { nextEventId: 1, events: [], screenshots: [] };
}

export class SqliteQueue {
  private data: QueueData;
  private filePath: string;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(userDataPath: string) {
    this.filePath = path.join(userDataPath, "agent-queue.json");
    this.data = this.loadFromDisk();
    console.log(`[Queue] Opened at ${this.filePath}`);
  }

  // ─── Disk I/O ───

  private loadFromDisk(): QueueData {
    try {
      if (!fs.existsSync(this.filePath)) return emptyData();
      const raw = fs.readFileSync(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as Partial<QueueData>;
      return {
        nextEventId: parsed.nextEventId ?? 1,
        events: parsed.events ?? [],
        screenshots: parsed.screenshots ?? [],
      };
    } catch (err) {
      console.warn("[Queue] Failed to load, starting fresh:", (err as Error).message);
      return emptyData();
    }
  }

  /** Atomic write: write to temp file then rename */
  private saveToDisk(): void {
    try {
      const tmp = this.filePath + ".tmp";
      fs.writeFileSync(tmp, JSON.stringify(this.data), "utf-8");
      fs.renameSync(tmp, this.filePath);
    } catch (err) {
      console.error("[Queue] Save failed:", (err as Error).message);
    }
  }

  /** Debounced save — coalesces rapid writes into a single disk flush */
  private scheduleSave(): void {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      this.saveToDisk();
    }, 100);
  }

  /** Force immediate save (used before close) */
  private flushSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.saveToDisk();
  }

  // ═══════════════════════════════════════
  // Activity Events
  // ═══════════════════════════════════════

  enqueue(eventType: string, timestamp: Date, data: Record<string, unknown> = {}): void {
    const event: QueuedEvent = {
      id: this.data.nextEventId++,
      batchId: null,
      eventType,
      timestamp: timestamp.toISOString(),
      data: JSON.stringify(data),
      createdAt: new Date().toISOString(),
      syncedAt: null,
    };
    this.data.events.push(event);
    this.scheduleSave();
    console.log(`[Queue] Enqueue: ${eventType} (pending: ${this.pendingCount()})`);
  }

  getNextBatch(limit = 50): { batchId: string; events: QueuedEvent[] } {
    const batchId = randomUUID();
    const pending = this.data.events.filter(
      (e) => e.syncedAt === null && e.batchId === null
    );
    const batch = pending.slice(0, limit);

    for (const event of batch) {
      event.batchId = batchId;
    }

    if (batch.length > 0) {
      this.scheduleSave();
    }

    return { batchId, events: batch };
  }

  markBatchSynced(batchId: string): void {
    const now = new Date().toISOString();
    for (const event of this.data.events) {
      if (event.batchId === batchId) {
        event.syncedAt = now;
      }
    }
    // Prune old synced rows (older than 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    this.data.events = this.data.events.filter(
      (e) => e.syncedAt === null || e.syncedAt > sevenDaysAgo
    );
    this.scheduleSave();
    console.log(`[Queue] Batch ${batchId.slice(0, 8)} synced`);
  }

  releaseBatch(batchId: string): void {
    for (const event of this.data.events) {
      if (event.batchId === batchId) {
        event.batchId = null;
      }
    }
    this.scheduleSave();
  }

  pendingCount(): number {
    return this.data.events.filter((e) => e.syncedAt === null).length;
  }

  // ═══════════════════════════════════════
  // Pending Screenshots
  // ═══════════════════════════════════════

  enqueueScreenshot(filePath: string, meta: Record<string, unknown>): string {
    const id = randomUUID();
    const entry: PendingScreenshot = {
      id,
      filePath,
      metaJson: JSON.stringify(meta),
      nextRetryAt: 0,
      attemptCount: 0,
      createdAt: Date.now(),
    };
    this.data.screenshots.push(entry);
    this.scheduleSave();
    console.log(`[Queue] Screenshot enqueued: ${id.slice(0, 8)}`);
    return id;
  }

  getNextPendingScreenshot(nowMs = Date.now()): PendingScreenshot | null {
    const ready = this.data.screenshots
      .filter((s) => s.nextRetryAt <= nowMs)
      .sort((a, b) => a.createdAt - b.createdAt);
    return ready[0] ?? null;
  }

  markScreenshotSent(id: string): void {
    this.data.screenshots = this.data.screenshots.filter((s) => s.id !== id);
    this.scheduleSave();
    console.log(`[Queue] Screenshot ${id.slice(0, 8)} sent`);
  }

  failScreenshot(id: string, backoffMs: number): void {
    const entry = this.data.screenshots.find((s) => s.id === id);
    if (entry) {
      entry.attemptCount += 1;
      entry.nextRetryAt = Date.now() + backoffMs;
      this.scheduleSave();
    }
  }

  pendingScreenshotCount(): number {
    return this.data.screenshots.length;
  }

  cleanup(): void {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    this.data.screenshots = this.data.screenshots.filter(
      (s) => s.createdAt >= sevenDaysAgo
    );
    this.scheduleSave();
  }

  close(): void {
    this.flushSave();
    console.log("[Queue] Closed");
  }
}
