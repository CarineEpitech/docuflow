/**
 * Preload script — exposes safe IPC bridge to renderer.
 * Phase 3 MVP
 */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("agentBridge", {
  // Pairing
  getState: () => ipcRenderer.invoke("agent:get-state"),
  pair: (data: { serverUrl: string; pairingCode: string; deviceName: string }) =>
    ipcRenderer.invoke("agent:pair", data),
  unpair: () => ipcRenderer.invoke("agent:unpair"),

  // Projects
  getProjects: () => ipcRenderer.invoke("agent:get-projects"),

  // Timer
  timerStart: (data: { crmProjectId: string; projectName: string; description?: string }) =>
    ipcRenderer.invoke("agent:timer-start", data),
  timerPause: () => ipcRenderer.invoke("agent:timer-pause"),
  timerResume: () => ipcRenderer.invoke("agent:timer-resume"),
  timerStop: () => ipcRenderer.invoke("agent:timer-stop"),
  timerState: () => ipcRenderer.invoke("agent:timer-state"),

  // State push from main process
  onStateUpdate: (callback: (state: any) => void) => {
    ipcRenderer.on("agent:state-update", (_event, state) => callback(state));
  },
});
