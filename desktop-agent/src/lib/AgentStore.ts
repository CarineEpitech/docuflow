/**
 * Persistent store for agent configuration, pairing state, and runtime state.
 *
 * Phase 3 MVP — in-memory (persists for session lifetime).
 * [PLACEHOLDER]: Replace with electron-store for real disk persistence.
 */

interface StoreData {
  serverUrl: string | null;
  deviceId: string | null;
  deviceToken: string | null;
  deviceName: string | null;
  clientVersion: string;
}

// Runtime state (not persisted)
interface RuntimeState {
  activeEntryId: string | null;
  activeProjectName: string | null;
  timerStatus: "stopped" | "running" | "paused";
  timerDuration: number; // accumulated seconds from server
  timerLastActivityAt: number | null; // timestamp ms for local elapsed calc
}

export class AgentStore {
  private data: StoreData;
  private runtime: RuntimeState;

  constructor() {
    this.data = {
      serverUrl: null,
      deviceId: null,
      deviceToken: null,
      deviceName: null,
      clientVersion: "0.1.0",
    };
    this.runtime = {
      activeEntryId: null,
      activeProjectName: null,
      timerStatus: "stopped",
      timerDuration: 0,
      timerLastActivityAt: null,
    };
  }

  // ─── Pairing ───

  isPaired(): boolean {
    return !!(this.data.deviceId && this.data.deviceToken);
  }

  getServerUrl(): string | null { return this.data.serverUrl; }
  setServerUrl(url: string): void { this.data.serverUrl = url; }

  getDeviceId(): string | null { return this.data.deviceId; }
  getDeviceToken(): string | null { return this.data.deviceToken; }
  getDeviceName(): string | null { return this.data.deviceName; }
  getClientVersion(): string { return this.data.clientVersion; }

  setClientVersion(v: string): void { this.data.clientVersion = v; }

  setPairing(deviceId: string, deviceToken: string, deviceName: string): void {
    this.data.deviceId = deviceId;
    this.data.deviceToken = deviceToken;
    this.data.deviceName = deviceName;
  }

  clearPairing(): void {
    this.data.deviceId = null;
    this.data.deviceToken = null;
    this.data.deviceName = null;
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
