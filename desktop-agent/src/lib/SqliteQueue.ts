/**
 * SQLite-backed offline queue for activity events.
 *
 * Events are stored locally and synced in batches.
 * Survives app restarts and network outages.
 *
 * Phase 2 D4 — Skeleton with interface, no actual SQLite yet.
 */

export interface QueuedEvent {
  id: number;
  batchId: string | null;
  eventType: string;
  timestamp: string;
  data: string; // JSON string
  createdAt: string;
  syncedAt: string | null;
}

export class SqliteQueue {
  // [PLACEHOLDER]: Initialize better-sqlite3 database
  // private db: BetterSqlite3.Database;

  constructor() {
    // [PLACEHOLDER]: Create/open SQLite database in userData path
    // this.db = new Database(path.join(app.getPath('userData'), 'agent-queue.db'));
    // this.migrate();
    console.log("[SqliteQueue] Initialized (stub)");
  }

  /**
   * Create tables if they don't exist.
   */
  private migrate(): void {
    // [PLACEHOLDER]: Run CREATE TABLE IF NOT EXISTS
    // CREATE TABLE events (
    //   id INTEGER PRIMARY KEY AUTOINCREMENT,
    //   batch_id TEXT,
    //   event_type TEXT NOT NULL,
    //   timestamp TEXT NOT NULL,
    //   data TEXT DEFAULT '{}',
    //   created_at TEXT DEFAULT (datetime('now')),
    //   synced_at TEXT
    // );
  }

  /**
   * Enqueue a new activity event for later sync.
   */
  enqueue(eventType: string, timestamp: Date, data: Record<string, unknown> = {}): void {
    // [PLACEHOLDER]: INSERT INTO events
    console.log(`[SqliteQueue] Enqueue: ${eventType} at ${timestamp.toISOString()}`);
  }

  /**
   * Get the next batch of unsynced events (up to `limit`).
   * Assigns a batchId to the selected events atomically.
   */
  getNextBatch(limit: number = 50): { batchId: string; events: QueuedEvent[] } {
    // [PLACEHOLDER]: SELECT events WHERE synced_at IS NULL AND batch_id IS NULL LIMIT ?
    // UPDATE events SET batch_id = ? WHERE id IN (...)
    const batchId = crypto.randomUUID();
    return { batchId, events: [] };
  }

  /**
   * Mark a batch as synced (set synced_at on all events with this batchId).
   */
  markBatchSynced(batchId: string): void {
    // [PLACEHOLDER]: UPDATE events SET synced_at = datetime('now') WHERE batch_id = ?
    console.log(`[SqliteQueue] Batch ${batchId} marked as synced`);
  }

  /**
   * Release a failed batch (clear batchId so events can be retried).
   */
  releaseBatch(batchId: string): void {
    // [PLACEHOLDER]: UPDATE events SET batch_id = NULL WHERE batch_id = ?
    console.log(`[SqliteQueue] Batch ${batchId} released for retry`);
  }

  /**
   * Get count of unsynced events.
   */
  pendingCount(): number {
    // [PLACEHOLDER]: SELECT COUNT(*) FROM events WHERE synced_at IS NULL
    return 0;
  }

  /**
   * Cleanup old synced events (older than `days` days).
   */
  cleanup(days: number = 7): number {
    // [PLACEHOLDER]: DELETE FROM events WHERE synced_at IS NOT NULL AND synced_at < datetime('now', '-? days')
    return 0;
  }

  /**
   * Close the database connection.
   */
  close(): void {
    // [PLACEHOLDER]: this.db.close();
    console.log("[SqliteQueue] Closed");
  }
}
