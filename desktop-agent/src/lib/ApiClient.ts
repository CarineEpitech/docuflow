/**
 * API client for communicating with the DocuFlow server.
 *
 * All requests target API_BASE (config.ts). No server URL is stored locally
 * or passed by the user — the API endpoint is baked in at build time and
 * can be overridden via DOCUFLOW_API_URL at runtime.
 *
 * Handles access token refresh, request retry with exponential backoff,
 * and proper error classification (network vs auth vs server).
 */

import { AgentStore } from "./AgentStore";
import { API_BASE } from "./config";

interface LoginResult {
  deviceId: string;
  deviceToken: string;
  accessToken: string;
  expiresAt: string;
  user: { id: string; email: string; firstName: string | null; lastName: string | null };
}

interface DeviceMeta {
  deviceName: string;
  os?: string;
  clientVersion?: string;
}

export interface TimeEntry {
  id: string;
  userId: string;
  crmProjectId: string;
  description: string | null;
  startTime: string;
  endTime: string | null;
  status: "running" | "paused" | "stopped";
  duration: number;
  idleTime: number;
  lastActivityAt: string | null;
}

export interface CrmProjectSummary {
  id: string;
  name: string;
  status: string;
}

export interface TaskSummary {
  id: string;
  name: string;
  status: string;
}

export class ApiClient {
  private store: AgentStore;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;
  /** Called when the server signals the device is revoked or permanently invalid. */
  private onRevoke: (() => void) | null;

  constructor(store: AgentStore, onRevoke?: () => void) {
    this.store = store;
    this.onRevoke = onRevoke ?? null;
  }

  // ─── Authentication ───

  async loginWithPassword(email: string, password: string, meta: DeviceMeta): Promise<LoginResult> {
    const res = await this.rawFetch(`${API_BASE}/api/agent/auth/login`, {
      method: "POST",
      body: JSON.stringify({ email, password, deviceMeta: meta }),
    });

    if (!res.ok) {
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("application/json")) {
        throw new Error(`Cannot reach DocuFlow (HTTP ${res.status}). Check your network connection.`);
      }
      const data = await res.json().catch(() => ({ message: res.statusText }));
      if (res.status === 401) throw new Error("Invalid email or password");
      throw new Error(data.message || "Sign in failed");
    }

    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) {
      throw new Error("Could not connect to DocuFlow — the server may be starting up. Please try again in a few seconds.");
    }
    const result: LoginResult = await res.json();
    this.accessToken = result.accessToken;
    this.tokenExpiresAt = new Date(result.expiresAt).getTime();
    return result;
  }

  // ─── Timer control ───

  async getActiveEntry(): Promise<TimeEntry | null> {
    return this.authenticatedRequest("/api/agent/timer/active", { method: "GET" });
  }

  async getProjects(): Promise<CrmProjectSummary[]> {
    const res = await this.authenticatedRequest("/api/agent/projects", { method: "GET" });
    return res?.data ?? [];
  }

  async getTasks(crmProjectId: string): Promise<TaskSummary[]> {
    const res = await this.authenticatedRequest(
      `/api/agent/tasks?crmProjectId=${encodeURIComponent(crmProjectId)}`,
      { method: "GET" }
    );
    return res?.data ?? [];
  }

  async startTimer(crmProjectId: string, taskId?: string, description?: string): Promise<TimeEntry> {
    return this.authenticatedRequest("/api/agent/timer/start", {
      method: "POST",
      body: JSON.stringify({
        crmProjectId,
        taskId: taskId || null,
        description: description || null,
        deviceId: this.store.getDeviceId(),
        clientType: "desktop",
        clientVersion: this.store.getClientVersion(),
      }),
    });
  }

  async pauseTimer(entryId: string): Promise<TimeEntry> {
    return this.authenticatedRequest(`/api/agent/timer/${entryId}/pause`, {
      method: "POST",
      body: JSON.stringify({
        deviceId: this.store.getDeviceId(),
        clientType: "desktop",
        clientVersion: this.store.getClientVersion(),
      }),
    });
  }

  async resumeTimer(entryId: string): Promise<TimeEntry> {
    return this.authenticatedRequest(`/api/agent/timer/${entryId}/resume`, {
      method: "POST",
      body: JSON.stringify({
        deviceId: this.store.getDeviceId(),
        clientType: "desktop",
        clientVersion: this.store.getClientVersion(),
      }),
    });
  }

  async stopTimer(entryId: string): Promise<TimeEntry> {
    return this.authenticatedRequest(`/api/agent/timer/${entryId}/stop`, {
      method: "POST",
      body: JSON.stringify({
        deviceId: this.store.getDeviceId(),
        clientType: "desktop",
        clientVersion: this.store.getClientVersion(),
      }),
    });
  }

  // ─── Screenshots ───

  async presignScreenshot(data: {
    deviceId: string;
    timeEntryId: string;
    capturedAt: string;
    clientType: string;
    clientVersion: string;
  }): Promise<{ screenshotId: string; uploadURL: string; expiresAt: string }> {
    return this.authenticatedRequest("/api/agent/screenshots/presign", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  /** Upload raw image binary to the upload endpoint (PUT, with auth for server-side uploads). */
  async uploadScreenshot(uploadURL: string, imageBuffer: Buffer): Promise<void> {
    // If the URL is relative (server-side upload endpoint), make it absolute
    const fullURL = uploadURL.startsWith("http") ? uploadURL : `${API_BASE}${uploadURL}`;

    // Server-side upload endpoint requires Bearer token
    const isServerUpload = !uploadURL.startsWith("http") || uploadURL.startsWith(API_BASE);
    const headers: Record<string, string> = { "Content-Type": "image/png" };
    if (isServerUpload) {
      await this.ensureAccessToken();
      headers["Authorization"] = `Bearer ${this.accessToken}`;
    }

    const res = await fetch(fullURL, { method: "PUT", headers, body: imageBuffer });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(`Screenshot upload failed: ${res.status} — ${body.message ?? res.statusText}`);
    }
  }

  async confirmScreenshot(data: {
    screenshotId: string;
    deviceId: string;
  }): Promise<{ ok: boolean }> {
    return this.authenticatedRequest("/api/agent/screenshots/confirm", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // ─── Heartbeat & Events ───

  async sendHeartbeat(data: Record<string, unknown>): Promise<{
    ok: boolean;
    serverTime: string;
    timerSync?: { entryId: string; status: string; duration: number } | null;
  }> {
    return this.authenticatedRequest("/api/agent/heartbeat", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async sendEventsBatch(data: Record<string, unknown>): Promise<{ ok: boolean; accepted: number; duplicate?: boolean }> {
    return this.authenticatedRequest("/api/agent/events/batch", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // ─── Internal ───

  private async authenticatedRequest(path: string, init: RequestInit): Promise<any> {
    await this.ensureAccessToken();

    const res = await this.rawFetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        ...((init.headers as Record<string, string>) ?? {}),
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (res.status === 401) {
      // Token expired — refresh and retry once.
      this.accessToken = null;
      await this.ensureAccessToken();

      const retry = await this.rawFetch(`${API_BASE}${path}`, {
        ...init,
        headers: {
          ...((init.headers as Record<string, string>) ?? {}),
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.accessToken}`,
        },
      });

      if (!retry.ok) {
        const data = await retry.json().catch(() => ({ message: retry.statusText }));
        throw new Error(data.message || `Request failed: ${retry.status}`);
      }
      return retry.json().catch(() => null);
    }

    if (res.status === 403) {
      const data = await res.json().catch(() => ({ message: res.statusText }));
      const msg = data.message || `Request failed: ${res.status}`;
      console.log(`[ApiClient] Device revoked (403): ${msg}`);
      this.onRevoke?.();
      throw new Error(msg);
    }

    if (!res.ok) {
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("application/json")) {
        throw new Error(`Server error (HTTP ${res.status}). Please try again.`);
      }
      const data = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(data.message || `Request failed: ${res.status}`);
    }

    return res.json().catch(() => null);
  }

  private async ensureAccessToken(): Promise<void> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return;
    }

    const deviceId = this.store.getDeviceId();
    const deviceToken = this.store.getDeviceToken();

    if (!deviceId || !deviceToken) {
      throw new Error("Not signed in — cannot refresh access token");
    }

    const res = await this.rawFetch(`${API_BASE}/api/agent/auth/refresh`, {
      method: "POST",
      body: JSON.stringify({ deviceId, deviceToken }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ message: "Token refresh failed" }));
      const msg = data.message || "Token refresh failed";
      console.log(`[ApiClient] auth.refresh.failed: ${msg} (status ${res.status})`);
      if (res.status === 401 || res.status === 403) {
        this.onRevoke?.();
      }
      throw new Error(msg);
    }

    const { accessToken, expiresAt } = await res.json();
    this.accessToken = accessToken;
    this.tokenExpiresAt = new Date(expiresAt).getTime();
    console.log("[ApiClient] auth.refresh.success");
  }

  private async rawFetch(url: string, init: RequestInit, retries = 3): Promise<Response> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fetch(url, {
          ...init,
          headers: {
            "Content-Type": "application/json",
            ...((init.headers as Record<string, string>) ?? {}),
          },
        });
      } catch (error) {
        if (attempt === retries) throw error;
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw new Error("Unreachable");
  }
}
