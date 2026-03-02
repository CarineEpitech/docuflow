/**
 * Persistent store for agent configuration, pairing state, and runtime state.
 *
 * Pairing data (serverUrl, deviceId, deviceToken, deviceName) is persisted
 * to a JSON file in app.getPath("userData"). Survives restarts.
 *
 * Timer runtime state stays in memory — rebuilt from server on startup.
 *
 * Phase 4.5 — replaced in-memory-only store and dropped electron-store dependency
 * (electron-store v8+ is ESM-only, incompatible with webpack commonjs externals).
 * Uses only Node.js builtins (fs, path) — zero packaging risk.
 */

import { app } from "electron";
import fs from "fs";
import path from "path";

interface PersistedData {
  serverUrl: string | null;
  deviceId: string | null;
  deviceToken: string | null;
  deviceName: string | null;
}

// Runtime state (not persisted — rebuilt from server on startup)
interface RuntimeState {
  activeEntryId: string | null;
  activeProjectName: string | null;
  timerStatus: "stopped" | "running" | "paused";
  timerDuration: number; // accumulated seconds from server
  timerLastActivityAt: number | null; // timestamp ms for local elapsed calc
  clientVersion: string;
}

const CONFIG_FILENAME = "agent-config.json";

export class AgentStore {
  private data: PersistedData;
  private runtime: RuntimeState;
  private configPath: string;

  constructor() {
    this.configPath = path.join(app.getPath("userData"), CONFIG_FILENAME);
    this.data = this.loadFromDisk();
    this.runtime = {
      activeEntryId: null,
      activeProjectName: null,
      timerStatus: "stopped",
      timerDuration: 0,
      timerLastActivityAt: null,
      clientVersion: "0.1.0",
    };
  }

  // ─── Disk persistence ───

  private loadFromDisk(): PersistedData {
    const empty: PersistedData = {
      serverUrl: null,
      deviceId: null,
      deviceToken: null,
      deviceName: null,
    };
    try {
      if (!fs.existsSync(this.configPath)) return empty;
      const raw = fs.readFileSync(this.configPath, "utf-8");
      const parsed = JSON.parse(raw);
      return { ...empty, ...parsed };
    } catch (err) {
      console.warn("[AgentStore] Failed to load config, using defaults:", (err as Error).message);
      return empty;
    }
  }

  private saveToDisk(): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.data, null, 2), "utf-8");
    } catch (err) {
      console.error("[AgentStore] Failed to save config:", (err as Error).message);
    }
  }

  // ─── Pairing ───

  isPaired(): boolean {
    return !!(this.data.deviceId && this.data.deviceToken);
  }

  getServerUrl(): string | null { return this.data.serverUrl; }
  setServerUrl(url: string): void {
    this.data.serverUrl = url;
    this.saveToDisk();
  }

  getDeviceId(): string | null { return this.data.deviceId; }
  getDeviceToken(): string | null { return this.data.deviceToken; }
  getDeviceName(): string | null { return this.data.deviceName; }
  getClientVersion(): string { return this.runtime.clientVersion; }

  setClientVersion(v: string): void { this.runtime.clientVersion = v; }

  setPairing(deviceId: string, deviceToken: string, deviceName: string): void {
    this.data.deviceId = deviceId;
    this.data.deviceToken = deviceToken;
    this.data.deviceName = deviceName;
    this.saveToDisk();
  }

  clearPairing(): void {
    this.data.deviceId = null;
    this.data.deviceToken = null;
    this.data.deviceName = null;
    this.saveToDisk();
    this.clearTimer();
  }

  // ─── Timer runtime state ───

  getActiveEntryId(): string | null { return this.runtime.activeEntryId; }
  getTimerStatus(): string { return this.runtime.timerStatus; }
  getActiveProjectName(): string | null { return this.runtime.activeProjectName; }

  setTimerRunning(entryId: string, duration: number, projectName: string | null): void {
    this.runtime.activeEntryId = entryId;
    this.runtime.timerStatus = "running";
    this.runtime.timerDuration = duration;
    this.runtime.timerLastActivityAt = Date.now();
    this.runtime.activeProjectName = projectName;
  }

  setTimerPaused(duration: number): void {
    this.runtime.timerStatus = "paused";
    this.runtime.timerDuration = duration;
    this.runtime.timerLastActivityAt = null;
  }

  clearTimer(): void {
    this.runtime.activeEntryId = null;
    this.runtime.timerStatus = "stopped";
    this.runtime.timerDuration = 0;
    this.runtime.timerLastActivityAt = null;
    this.runtime.activeProjectName = null;
  }

  /**
   * Get elapsed seconds (server duration + local delta if running).
   */
  getElapsedSeconds(): number {
    if (this.runtime.timerStatus === "running" && this.runtime.timerLastActivityAt) {
      const localDelta = Math.floor((Date.now() - this.runtime.timerLastActivityAt) / 1000);
      return this.runtime.timerDuration + localDelta;
    }
    return this.runtime.timerDuration;
  }

  /**
   * Get full state snapshot for IPC.
   */
  getTimerState(): {
    status: string;
    entryId: string | null;
    elapsed: number;
    projectName: string | null;
  } {
    return {
      status: this.runtime.timerStatus,
      entryId: this.runtime.activeEntryId,
      elapsed: this.getElapsedSeconds(),
      projectName: this.runtime.activeProjectName,
    };
  }
}
