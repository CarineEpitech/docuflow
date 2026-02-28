/**
 * DocuFlow Desktop Agent — Main process entry point.
 *
 * Phase 3 MVP — Pairing + Timer control + Workers.
 */

import { app, BrowserWindow, Tray, Menu, ipcMain } from "electron";
import path from "path";
import { AgentStore } from "../lib/AgentStore";
import { SqliteQueue } from "../lib/SqliteQueue";
import { ApiClient } from "../lib/ApiClient";
import { HeartbeatWorker } from "../workers/HeartbeatWorker";
import { ActivityWorker } from "../workers/ActivityWorker";
import { SyncWorker } from "../workers/SyncWorker";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

const store = new AgentStore();
const queue = new SqliteQueue();
const apiClient = new ApiClient(store);

let heartbeatWorker: HeartbeatWorker | null = null;
let activityWorker: ActivityWorker | null = null;
let syncWorker: SyncWorker | null = null;

// ─── Window ───

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 440,
    height: 620,
    resizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../renderer/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, "../renderer/index.html"));
  win.once("ready-to-show", () => win.show());

  win.on("close", (e) => {
    e.preventDefault();
    win.hide();
  });

  return win;
}

// ─── Tray ───

function createTray(): void {
  // [PLACEHOLDER]: Use proper icon asset
  tray = new Tray(path.join(__dirname, "../../assets/tray-icon.png"));

  const contextMenu = Menu.buildFromTemplate([
    { label: "Show Agent", click: () => mainWindow?.show() },
    { label: "Status: " + (store.isPaired() ? "Connected" : "Not paired"), enabled: false },
    { type: "separator" },
    { label: "Quit", click: () => { stopWorkers(); app.exit(0); } },
  ]);

  tray.setToolTip("DocuFlow Desktop Agent");
  tray.setContextMenu(contextMenu);
  tray.on("click", () => mainWindow?.show());
}

// ─── Workers ───

function startWorkers(): void {
  if (!store.isPaired()) return;

  heartbeatWorker = new HeartbeatWorker(apiClient, store);
  heartbeatWorker.start();

  activityWorker = new ActivityWorker(queue, store);
  activityWorker.start();

  syncWorker = new SyncWorker(apiClient, queue, store);
  syncWorker.start();

  console.log("[Main] Workers started");
}

function stopWorkers(): void {
  heartbeatWorker?.stop();
  activityWorker?.stop();
  syncWorker?.stop();
  heartbeatWorker = null;
  activityWorker = null;
  syncWorker = null;
  console.log("[Main] Workers stopped");
}

/** Notify renderer of state changes */
function pushStateToRenderer(): void {
  mainWindow?.webContents.send("agent:state-update", {
    isPaired: store.isPaired(),
    deviceName: store.getDeviceName(),
    serverUrl: store.getServerUrl(),
    timer: store.getTimerState(),
  });
}

// ─── IPC: Pairing ───

ipcMain.handle("agent:get-state", () => {
  return {
    isPaired: store.isPaired(),
    deviceName: store.getDeviceName(),
    serverUrl: store.getServerUrl(),
    timer: store.getTimerState(),
  };
});

ipcMain.handle("agent:pair", async (_event, { serverUrl, pairingCode, deviceName }) => {
  try {
    store.setServerUrl(serverUrl);
    store.setClientVersion(app.getVersion());
    const result = await apiClient.completePairing(pairingCode, {
      deviceName,
      os: process.platform,
      clientVersion: app.getVersion(),
    });

    store.setPairing(result.deviceId, result.deviceToken, deviceName);

    // Sync active entry from server
    try {
      const active = await apiClient.getActiveEntry();
      if (active && active.status !== "stopped") {
        store.setTimerRunning(active.id, active.duration || 0, null);
        if (active.status === "paused") store.setTimerPaused(active.duration || 0);
      }
    } catch { /* non-fatal */ }

    startWorkers();
    pushStateToRenderer();
    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("agent:unpair", () => {
  stopWorkers();
  store.clearPairing();
  pushStateToRenderer();
  return { ok: true };
});

// ─── IPC: Projects ───

ipcMain.handle("agent:get-projects", async () => {
  try {
    const projects = await apiClient.getProjects();
    return { ok: true, data: projects };
  } catch (error: any) {
    return { ok: false, error: error.message, data: [] };
  }
});

// ─── IPC: Timer ───

ipcMain.handle("agent:timer-start", async (_event, { crmProjectId, projectName, description }) => {
  try {
    const entry = await apiClient.startTimer(crmProjectId, description);
    store.setTimerRunning(entry.id, entry.duration || 0, projectName || null);
    pushStateToRenderer();
    return { ok: true, entry };
  } catch (error: any) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("agent:timer-pause", async () => {
  try {
    const entryId = store.getActiveEntryId();
    if (!entryId) return { ok: false, error: "No active timer" };

    const entry = await apiClient.pauseTimer(entryId);
    store.setTimerPaused(entry.duration || 0);
    pushStateToRenderer();
    return { ok: true, entry };
  } catch (error: any) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("agent:timer-resume", async () => {
  try {
    const entryId = store.getActiveEntryId();
    if (!entryId) return { ok: false, error: "No active timer" };

    const entry = await apiClient.resumeTimer(entryId);
    store.setTimerRunning(entry.id, entry.duration || 0, store.getActiveProjectName());
    pushStateToRenderer();
    return { ok: true, entry };
  } catch (error: any) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("agent:timer-stop", async () => {
  try {
    const entryId = store.getActiveEntryId();
    if (!entryId) return { ok: false, error: "No active timer" };

    const entry = await apiClient.stopTimer(entryId);
    store.clearTimer();
    pushStateToRenderer();
    return { ok: true, entry };
  } catch (error: any) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("agent:timer-state", () => {
  return store.getTimerState();
});

// ─── App lifecycle ───

app.whenReady().then(() => {
  store.setClientVersion(app.getVersion());
  createTray();
  mainWindow = createMainWindow();

  if (store.isPaired()) {
    // Sync active entry from server on startup
    apiClient.getActiveEntry().then((active) => {
      if (active && active.status !== "stopped") {
        store.setTimerRunning(active.id, active.duration || 0, null);
        if (active.status === "paused") store.setTimerPaused(active.duration || 0);
      }
      pushStateToRenderer();
    }).catch(() => { /* non-fatal */ });

    startWorkers();
  }
});

app.on("window-all-closed", (e: Event) => {
  e.preventDefault();
});

app.on("activate", () => {
  mainWindow?.show();
});

app.on("before-quit", () => {
  stopWorkers();
  queue.close();
});
