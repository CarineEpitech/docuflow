/**
 * DocuFlow Desktop Agent — Main process entry point.
 *
 * Phase 2 D4 — Skeleton.
 * Creates the system tray icon and pairing window.
 * Workers (heartbeat, screenshot, activity) are started after successful pairing.
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

// Workers (started after pairing)
let heartbeatWorker: HeartbeatWorker | null = null;
let activityWorker: ActivityWorker | null = null;
let syncWorker: SyncWorker | null = null;

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 420,
    height: 520,
    resizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "../renderer/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // [PLACEHOLDER]: Load from Vite dev server or packaged HTML
  win.loadFile(path.join(__dirname, "../renderer/index.html"));

  win.once("ready-to-show", () => win.show());

  win.on("close", (e) => {
    // Minimize to tray instead of quitting
    e.preventDefault();
    win.hide();
  });

  return win;
}

function createTray(): void {
  // [PLACEHOLDER]: Use proper icon asset
  tray = new Tray(path.join(__dirname, "../../assets/tray-icon.png"));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show Agent",
      click: () => mainWindow?.show(),
    },
    {
      label: "Status: " + (store.isPaired() ? "Connected" : "Not paired"),
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        stopWorkers();
        app.exit(0);
      },
    },
  ]);

  tray.setToolTip("DocuFlow Desktop Agent");
  tray.setContextMenu(contextMenu);
  tray.on("click", () => mainWindow?.show());
}

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
  console.log("[Main] Workers stopped");
}

// ─── IPC Handlers ───

ipcMain.handle("agent:get-state", () => {
  return {
    isPaired: store.isPaired(),
    deviceName: store.getDeviceName(),
    serverUrl: store.getServerUrl(),
  };
});

ipcMain.handle("agent:pair", async (_event, { serverUrl, pairingCode, deviceName }) => {
  try {
    store.setServerUrl(serverUrl);
    const result = await apiClient.completePairing(pairingCode, {
      deviceName,
      os: process.platform,
      clientVersion: app.getVersion(),
    });

    store.setPairing(result.deviceId, result.deviceToken, deviceName);
    startWorkers();
    return { ok: true };
  } catch (error: any) {
    return { ok: false, error: error.message };
  }
});

ipcMain.handle("agent:unpair", () => {
  stopWorkers();
  store.clearPairing();
  return { ok: true };
});

// ─── App lifecycle ───

app.whenReady().then(() => {
  createTray();
  mainWindow = createMainWindow();

  if (store.isPaired()) {
    startWorkers();
  }
});

app.on("window-all-closed", (e: Event) => {
  // Prevent app from quitting when all windows closed — keep tray
  e.preventDefault();
});

app.on("activate", () => {
  mainWindow?.show();
});

app.on("before-quit", () => {
  stopWorkers();
  queue.close();
});
