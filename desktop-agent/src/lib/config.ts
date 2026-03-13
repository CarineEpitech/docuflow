/**
 * Runtime configuration for the Desktop Agent.
 *
 * API_BASE resolution order (first wins):
 *   1. DOCUFLOW_API_URL environment variable
 *   2. %USERPROFILE%\.docuflow-url  (plain text file, one URL per line — no rebuild needed)
 *   3. DEFAULT_API_URL baked in at build time
 *
 * The file override lets support/users change the server URL without rebuilding the installer.
 * File location on Windows: C:\Users\<you>\.docuflow-url
 * Content: just the URL, e.g. https://my-new-server.replit.app
 */

import fs from "fs";
import path from "path";
import os from "os";

const DEFAULT_API_URL = "https://techma-doc--masdouk1.replit.app";

function resolveApiBase(): string {
  // 1. Environment variable
  if (process.env.DOCUFLOW_API_URL) {
    return process.env.DOCUFLOW_API_URL.replace(/\/+$/, "");
  }

  // 2. Override file: ~/.docuflow-url
  try {
    const overridePath = path.join(os.homedir(), ".docuflow-url");
    if (fs.existsSync(overridePath)) {
      const url = fs.readFileSync(overridePath, "utf-8").trim().split("\n")[0].trim();
      if (url.startsWith("http")) {
        return url.replace(/\/+$/, "");
      }
    }
  } catch { /* ignore */ }

  // 3. Build-time default
  return DEFAULT_API_URL.replace(/\/+$/, "");
}

export const API_BASE: string = resolveApiBase();

/** Human-readable hostname for display in the UI. */
export const API_HOST: string = (() => {
  try {
    return new URL(API_BASE).hostname;
  } catch {
    return API_BASE;
  }
})();
