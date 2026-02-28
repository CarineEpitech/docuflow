/**
 * Preload script — exposes safe IPC bridge to renderer.
 * Phase 2 D4
 */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("agentBridge", {
  getState: () => ipcRenderer.invoke("agent:get-state"),
  pair: (data: { serverUrl: string; pairingCode: string; deviceName: string }) =>
    ipcRenderer.invoke("agent:pair", data),
  unpair: () => ipcRenderer.invoke("agent:unpair"),
});
