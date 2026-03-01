/**
 * Screenshot capture worker.
 *
 * Captures a full-screen PNG every CAPTURE_INTERVAL_MS (randomized ±30s)
 * when the timer is running. Saves to a temp directory and enqueues in
 * SqliteQueue for async upload by SyncWorker.
 *
 * Platform: Windows primary (Phase 4.3 MVP).
 *           macOS/Linux: same code path — desktopCapturer is cross-platform.
 *
 * Feature flag: disabled unless SCREENSHOTS_ENABLED=true or set via AgentStore.
 *
 * Phase 4.3
 */

import { desktopCapturer, nativeImage } from "electron";
import fs from "fs";
import path from "path";
import os from "os";
import { SqliteQueue } from "../lib/SqliteQueue";
import { AgentStore } from "../lib/AgentStore";

const CAPTURE_INTERVAL_BASE_MS = 3 * 60 * 1000; // 3 minutes base
const CAPTURE_JITTER_MS = 60 * 1000;            // ±1 minute jitter
const TEMP_DIR = path.join(os.tmpdir(), "docuflow-screenshots");
const MAX_PNG_SIZE_BYTES = 5 * 1024 * 1024;      // 5 MB hard limit

export class ScreenCaptureWorker {
  private queue: SqliteQueue;
  private store: AgentStore;
  private timeout: ReturnType<typeof setTimeout> | null = null;
  private enabled: boolean;
  private totalCaptured = 0;

  constructor(queue: SqliteQueue, store: AgentStore, enabled = false) {
    this.queue = queue;
    this.store = store;
    this.enabled = enabled;
  }

  start(): void {
    if (!this.enabled) {
      console.log("[ScreenCaptureWorker] Disabled (screenshotsEnabled=false)");
      return;
    }
    // Ensure temp dir exists
    fs.mkdirSync(TEMP_DIR, { recursive: true });
    this.scheduleNext();
    console.log(`[ScreenCaptureWorker] Started (interval ~${CAPTURE_INTERVAL_BASE_MS / 60000}min)`);
  }

  stop(): void {
    if (this.timeout) {
      clearTimeout(this.timeout);
      this.timeout = null;
    }
    console.log(`[ScreenCaptureWorker] Stopped (captured: ${this.totalCaptured})`);
  }

  private scheduleNext(): void {
    const jitter = Math.round((Math.random() - 0.5) * 2 * CAPTURE_JITTER_MS);
    const delay = CAPTURE_INTERVAL_BASE_MS + jitter;
    this.timeout = setTimeout(() => this.captureAndEnqueue(), delay);
  }

  private async captureAndEnqueue(): Promise<void> {
    try {
      // Only capture when timer is actively running
      if (this.store.getTimerStatus() !== "running") {
        console.log("[ScreenCaptureWorker] Skipping — timer not running");
        this.scheduleNext();
        return;
      }

      const entryId = this.store.getActiveEntryId();
      if (!entryId) {
        this.scheduleNext();
        return;
      }

      const capturedAt = new Date().toISOString();
      const png = await this.captureScreen();

      if (!png || png.length === 0) {
        console.warn("[ScreenCaptureWorker] Empty capture, skipping");
        this.scheduleNext();
        return;
      }

      if (png.length > MAX_PNG_SIZE_BYTES) {
        console.warn(
          `[ScreenCaptureWorker] Screenshot too large (${(png.length / 1024 / 1024).toFixed(1)}MB > 5MB), skipping`
        );
        this.scheduleNext();
        return;
      }

      // Save to temp file
      const filename = `screenshot-${Date.now()}.png`;
      const filePath = path.join(TEMP_DIR, filename);
      fs.writeFileSync(filePath, png);

      // Enqueue for upload
      this.queue.enqueueScreenshot(filePath, {
        timeEntryId: entryId,
        capturedAt,
        deviceId: this.store.getDeviceId(),
        clientVersion: this.store.getClientVersion(),
      });

      this.totalCaptured++;
      console.log(
        `[ScreenCaptureWorker] Captured ${filename} (${(png.length / 1024).toFixed(0)} KB, total: ${this.totalCaptured})`
      );
    } catch (error: any) {
      console.error("[ScreenCaptureWorker] Capture failed:", error.message);
    }

    this.scheduleNext();
  }

  /**
   * Capture the primary screen using Electron's desktopCapturer.
   * Returns a PNG Buffer, or null on failure.
   */
  private async captureScreen(): Promise<Buffer | null> {
    const sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 1920, height: 1080 },
    });

    if (!sources || sources.length === 0) {
      console.warn("[ScreenCaptureWorker] No screen sources available");
      return null;
    }

    // Use first source (primary display)
    const source = sources[0];
    const img: ReturnType<typeof nativeImage.createEmpty> = source.thumbnail;

    if (img.isEmpty()) {
      console.warn("[ScreenCaptureWorker] Thumbnail is empty — check screen capture permissions");
      return null;
    }

    return img.toPNG();
  }
}
