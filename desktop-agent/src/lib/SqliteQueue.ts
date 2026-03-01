/**
 * Persistent SQLite queue for activity event batches and screenshot uploads.
 *
 * Uses better-sqlite3 (synchronous API, safe for Electron main process).
 * Survives agent restarts — data is durably stored on disk.
 *
 * Tables:
 *  - pending_events:      raw activity events (enqueued by workers, batched for sync)
 *  - pending_screenshots: screenshot files queued for upload
 *
 * Phase 4.2
 */

import Database from "better-sqlite3";
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

export class SqliteQueue {
  private db: Database.Database;

  constructor(userDataPath: string) {
    const dbPath = path.join(userDataPath, "agent-queue.db");
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
    console.log(`[SqliteQueue] Opened at ${dbPath}`);
  }

  // ─── Schema ───

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS pending_events (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        batch_id    TEXT,
        event_type  TEXT NOT NULL,
        timestamp   TEXT NOT NULL,
        data        TEXT DEFAULT '{}',
        created_at  TEXT DEFAULT (datetime('now')),
        synced_at   TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_events_batch   ON pending_events(batch_id);
      CREATE INDEX IF NOT EXISTS idx_events_pending ON pending_events(synced_at);

      CREATE TABLE IF NOT EXISTS pending_screenshots (
        id             TEXT PRIMARY KEY,
        file_path      TEXT NOT NULL,
        meta_json      TEXT NOT NULL DEFAULT '{}',
        next_retry_at  INTEGER NOT NULL DEFAULT 0,
        attempt_count  INTEGER NOT NULL DEFAULT 0,
        created_at     INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_screenshots_retry ON pending_screenshots(next_retry_at);
    `);
  }

  // ═══════════════════════════════════════
  // Activity Events
  // ═══════════════════════════════════════

  enqueue(eventType: string, timestamp: Date, data: Record<string, unknown> = {}): void {
    this.db
      .prepare(
        "INSERT INTO pending_events (event_type, timestamp, data) VALUES (?, ?, ?)"
      )
      .run(eventType, timestamp.toISOString(), JSON.stringify(data));
    console.log(`[SqliteQueue] Enqueue: ${eventType} (pending: ${this.pendingCount()})`);
  }

  getNextBatch(limit = 50): { batchId: string; events: QueuedEvent[] } {
    const batchId = randomUUID();
    const rows = this.db
      .prepare(
        `SELECT id, batch_id as batchId, event_type as eventType,
                timestamp, data, created_at as createdAt, synced_at as syncedAt
         FROM pending_events WHERE synced_at IS NULL AND batch_id IS NULL LIMIT ?`
      )
      .all(limit) as QueuedEvent[];

    if (rows.length > 0) {
      const ids = rows.map((r) => r.id);
      const placeholders = ids.map(() => "?").join(",");
      this.db
        .prepare(
          `UPDATE pending_events SET batch_id = ? WHERE id IN (${placeholders})`
        )
        .run(batchId, ...ids);
    }

    return { batchId, events: rows };
  }

  markBatchSynced(batchId: string): void {
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE pending_events SET synced_at = ? WHERE batch_id = ?")
      .run(now, batchId);
    // Prune old synced rows
    this.db
      .prepare(
        "DELETE FROM pending_events WHERE synced_at IS NOT NULL AND synced_at < datetime('now', '-7 days')"
      )
      .run();
    console.log(`[SqliteQueue] Batch ${batchId.slice(0, 8)} synced`);
  }

  releaseBatch(batchId: string): void {
    this.db
      .prepare("UPDATE pending_events SET batch_id = NULL WHERE batch_id = ?")
      .run(batchId);
  }

  pendingCount(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as n FROM pending_events WHERE synced_at IS NULL")
      .get() as { n: number };
    return row.n;
  }

  // ═══════════════════════════════════════
  // Pending Screenshots
  // ═══════════════════════════════════════

  enqueueScreenshot(filePath: string, meta: Record<string, unknown>): string {
    const id = randomUUID();
    this.db
      .prepare(
        "INSERT INTO pending_screenshots (id, file_path, meta_json, created_at) VALUES (?, ?, ?, ?)"
      )
      .run(id, filePath, JSON.stringify(meta), Date.now());
    console.log(`[SqliteQueue] Screenshot enqueued: ${id.slice(0, 8)}`);
    return id;
  }

  getNextPendingScreenshot(nowMs = Date.now()): PendingScreenshot | null {
    const row = this.db
      .prepare(
        `SELECT id, file_path, meta_json, next_retry_at, attempt_count, created_at
         FROM pending_screenshots
         WHERE next_retry_at <= ?
         ORDER BY created_at ASC
         LIMIT 1`
      )
      .get(nowMs) as
      | {
          id: string;
          file_path: string;
          meta_json: string;
          next_retry_at: number;
          attempt_count: number;
          created_at: number;
        }
      | undefined;

    if (!row) return null;
    return {
      id: row.id,
      filePath: row.file_path,
      metaJson: row.meta_json,
      nextRetryAt: row.next_retry_at,
      attemptCount: row.attempt_count,
      createdAt: row.created_at,
    };
  }

  markScreenshotSent(id: string): void {
    this.db.prepare("DELETE FROM pending_screenshots WHERE id = ?").run(id);
    console.log(`[SqliteQueue] Screenshot ${id.slice(0, 8)} sent`);
  }

  failScreenshot(id: string, backoffMs: number): void {
    this.db
      .prepare(
        "UPDATE pending_screenshots SET attempt_count = attempt_count + 1, next_retry_at = ? WHERE id = ?"
      )
      .run(Date.now() + backoffMs, id);
  }

  pendingScreenshotCount(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as n FROM pending_screenshots")
      .get() as { n: number };
    return row.n;
  }

  cleanup(): void {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    this.db
      .prepare("DELETE FROM pending_screenshots WHERE created_at < ?")
      .run(sevenDaysAgo);
  }

  close(): void {
    this.db.close();
    console.log("[SqliteQueue] Closed");
  }
}
