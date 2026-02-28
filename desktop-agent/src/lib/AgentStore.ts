/**
 * Persistent store for agent configuration and pairing state.
 * Uses electron-store (JSON file in userData).
 *
 * Phase 2 D4
 */

// [PLACEHOLDER]: Replace with actual electron-store import when dependencies are installed
// import Store from "electron-store";

interface StoreData {
  serverUrl: string | null;
  deviceId: string | null;
  deviceToken: string | null;
  deviceName: string | null;
}

const DEFAULTS: StoreData = {
  serverUrl: null,
  deviceId: null,
  deviceToken: null,
  deviceName: null,
};

export class AgentStore {
  private data: StoreData;

  constructor() {
    // [PLACEHOLDER]: Use electron-store for real persistence
    // this.store = new Store<StoreData>({ defaults: DEFAULTS });
    this.data = { ...DEFAULTS };
  }

  isPaired(): boolean {
    return !!(this.data.deviceId && this.data.deviceToken);
  }

  getServerUrl(): string | null {
    return this.data.serverUrl;
  }

  setServerUrl(url: string): void {
    this.data.serverUrl = url;
  }

  getDeviceId(): string | null {
    return this.data.deviceId;
  }

  getDeviceToken(): string | null {
    return this.data.deviceToken;
  }

  getDeviceName(): string | null {
    return this.data.deviceName;
  }

  setPairing(deviceId: string, deviceToken: string, deviceName: string): void {
    this.data.deviceId = deviceId;
    this.data.deviceToken = deviceToken;
    this.data.deviceName = deviceName;
  }

  clearPairing(): void {
    this.data.deviceId = null;
    this.data.deviceToken = null;
    this.data.deviceName = null;
  }
}
