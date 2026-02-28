/**
 * Activity detection worker — monitors user input and active windows.
 *
 * Captures:
 * - Input activity (keyboard/mouse) via OS-level hooks
 * - Active window changes
 * - Idle start/end transitions
 *
 * Events are queued locally in SQLite for async sync.
 *
 * Phase 2 D4 — Skeleton. OS-level hooks require native modules (future).
 */

import { powerMonitor } from "electron";
import { SqliteQueue } from "../lib/SqliteQueue";
import { AgentStore } from "../lib/AgentStore";

const ACTIVITY_CHECK_INTERVAL_MS = 5_000;
const IDLE_THRESHOLD_SECONDS = 180;

export class ActivityWorker {
  private queue: SqliteQueue;
  private store: AgentStore;
  private interval: ReturnType<typeof setInterval> | null = null;
  private wasIdle = false;

  constructor(queue: SqliteQueue, store: AgentStore) {
    this.queue = queue;
    this.store = store;
  }

  start(): void {
    if (this.interval) return;

    this.interval = setInterval(() => this.checkActivity(), ACTIVITY_CHECK_INTERVAL_MS);

    // Listen for system suspend/resume
    powerMonitor.on("suspend", () => {
      console.log("[ActivityWorker] System suspended");
      this.queue.enqueue("idle_start", new Date(), { reason: "system_suspend" });
    });

    powerMonitor.on("resume", () => {
      console.log("[ActivityWorker] System resumed");
      this.queue.enqueue("idle_end", new Date(), { reason: "system_resume" });
    });

    console.log("[ActivityWorker] Started");
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    console.log("[ActivityWorker] Stopped");
  }

  private checkActivity(): void {
    // Use Electron's built-in idle time detection
    const idleSeconds = powerMonitor.getSystemIdleTime();

    if (idleSeconds >= IDLE_THRESHOLD_SECONDS && !this.wasIdle) {
      this.wasIdle = true;
      this.queue.enqueue("idle_start", new Date(), { idleSeconds });
    } else if (idleSeconds < IDLE_THRESHOLD_SECONDS && this.wasIdle) {
      this.wasIdle = false;
      this.queue.enqueue("idle_end", new Date(), { idleSeconds });
    }

    // [PLACEHOLDER]: OS-level active window detection
    // Would use native module (e.g., @aspect-build/active-win or custom node addon)
    // to get: { app: "Chrome", title: "GitHub - docuflow/..." }
    // Then: this.queue.enqueue("active_window", new Date(), { app, title });

    // [PLACEHOLDER]: Input activity detection
    // Would use IOHook or native module for global keyboard/mouse events
    // Aggregate into "input_activity" events every N seconds
  }
}
