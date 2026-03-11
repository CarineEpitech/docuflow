/**
 * Preload script — exposes safe IPC bridge to renderer.
 * S4: pairing code removed, replaced with email+password login.
 */

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("agentBridge", {
  // Auth
  getState: () => ipcRenderer.invoke("agent:get-state"),
  login: (data: { serverUrl: string; email: string; password: string }) =>
    ipcRenderer.invoke("agent:login", data),
  unpair: () => ipcRenderer.invoke("agent:unpair"),

  // Projects & Tasks
  getProjects: () => ipcRenderer.invoke("agent:get-projects"),
  getTasks: (data: { crmProjectId: string }) => ipcRenderer.invoke("agent:get-tasks", data),

  // Timer
  timerStart: (data: { crmProjectId: string; taskId?: string; projectName: string; description?: string }) =>
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
