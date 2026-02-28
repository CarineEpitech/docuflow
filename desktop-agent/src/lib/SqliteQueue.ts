/**
 * Offline event queue for activity events.
 *
 * MVP: In-memory array (survives for session lifetime).
 * Production: Replace with better-sqlite3 for disk persistence across restarts.
 *
 * Phase 3 MVP
 */

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

export class SqliteQueue {
  private events: QueuedEvent[] = [];
  private nextId = 1;

  constructor() {
    console.log("[SqliteQueue] Initialized (in-memory MVP)");
  }

  /**
   * Enqueue a new activity event for later sync.
   */
  enqueue(eventType: string, timestamp: Date, data: Record<string, unknown> = {}): void {
    this.events.push({
      id: this.nextId++,
      batchId: null,
      eventType,
      timestamp: timestamp.toISOString(),
      data: JSON.stringify(data),
      createdAt: new Date().toISOString(),
      syncedAt: null,
    });
    console.log(`[SqliteQueue] Enqueue: ${eventType} (pending: ${this.pendingCount()})`);
  }

  /**
   * Get the next batch of unsynced events (up to `limit`).
   * Assigns a batchId to the selected events atomically.
   */
  getNextBatch(limit: number = 50): { batchId: string; events: QueuedEvent[] } {
    const batchId = randomUUID();
    const pending = this.events.filter(e => !e.syncedAt && !e.batchId);
    const batch = pending.slice(0, limit);

    for (const event of batch) {
      event.batchId = batchId;
    }

    return { batchId, events: batch };
  }

  /**
   * Mark a batch as synced.
   */
  markBatchSynced(batchId: string): void {
    const now = new Date().toISOString();
    for (const event of this.events) {
      if (event.batchId === batchId) {
        event.syncedAt = now;
      }
    }
    console.log(`[SqliteQueue] Batch ${batchId.slice(0, 8)} synced`);

    // Auto-cleanup synced events older than 5 minutes (in-memory only)
    this.cleanup();
  }

  /**
   * Release a failed batch for retry.
   */
  releaseBatch(batchId: string): void {
    for (const event of this.events) {
      if (event.batchId === batchId) {
        event.batchId = null;
      }
    }
    console.log(`[SqliteQueue] Batch ${batchId.slice(0, 8)} released for retry`);
  }

  /**
   * Get count of unsynced events.
   */
  pendingCount(): number {
    return this.events.filter(e => !e.syncedAt).length;
  }

  /**
   * Cleanup synced events to prevent unbounded memory growth.
   */
  cleanup(): number {
    const before = this.events.length;
    this.events = this.events.filter(e => !e.syncedAt);
    return before - this.events.length;
  }

  close(): void {
    console.log(`[SqliteQueue] Closed (${this.events.length} events in memory)`);
  }
}
