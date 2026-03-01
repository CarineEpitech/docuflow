/**
 * API client for communicating with the DocuFlow server.
 *
 * Handles access token refresh, request retry with exponential backoff,
 * and proper error classification (network vs auth vs server).
 *
 * Phase 3 MVP
 */

import { AgentStore } from "./AgentStore";

interface PairingResult {
  deviceId: string;
  deviceToken: string;
  accessToken: string;
  expiresAt: string;
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

export class ApiClient {
  private store: AgentStore;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(store: AgentStore) {
    this.store = store;
  }

  // ─── Pairing ───

  async completePairing(pairingCode: string, meta: DeviceMeta): Promise<PairingResult> {
    const serverUrl = this.store.getServerUrl();
    if (!serverUrl) throw new Error("Server URL not configured");

    const res = await this.rawFetch(`${serverUrl}/api/agent/pairing/complete`, {
      method: "POST",
      body: JSON.stringify({ pairingCode, deviceMeta: meta }),
    });

    if (!res.ok) {
      const ct = res.headers.get("content-type") ?? "";
      if (!ct.includes("application/json")) {
        throw new Error(`Server returned HTTP ${res.status} (${res.statusText}). Check the Server URL.`);
      }
      const data = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(data.message || "Pairing failed");
    }

    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) {
      throw new Error("Server returned HTML instead of JSON — is the Server URL correct and the server running?");
    }
    const result: PairingResult = await res.json();
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

  async startTimer(crmProjectId: string, description?: string): Promise<TimeEntry> {
    return this.authenticatedRequest("/api/agent/timer/start", {
      method: "POST",
      body: JSON.stringify({
        crmProjectId,
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
    const serverUrl = this.store.getServerUrl() ?? "";
    // If the URL is relative (server-side upload endpoint), make it absolute
    const fullURL = uploadURL.startsWith("http")
      ? uploadURL
      : `${serverUrl}${uploadURL}`;

    // Server-side upload endpoint requires Bearer token
    const isServerUpload = !uploadURL.startsWith("http") || uploadURL.startsWith(serverUrl);
    const headers: Record<string, string> = { "Content-Type": "image/png" };
    if (isServerUpload) {
      await this.ensureAccessToken();
      headers["Authorization"] = `Bearer ${this.accessToken}`;
    }

    const res = await fetch(fullURL, {
      method: "PUT",
      headers,
      body: imageBuffer,
    });
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

  async sendHeartbeat(data: Record<string, unknown>): Promise<{ ok: boolean; serverTime: string }> {
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

    const serverUrl = this.store.getServerUrl();
    if (!serverUrl) throw new Error("Server URL not configured");

    const res = await this.rawFetch(`${serverUrl}${path}`, {
      ...init,
      headers: {
        ...((init.headers as Record<string, string>) ?? {}),
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.accessToken}`,
      },
    });

    if (res.status === 401) {
      // Token expired — refresh and retry once
      this.accessToken = null;
      await this.ensureAccessToken();

      const retry = await this.rawFetch(`${serverUrl}${path}`, {
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

    if (!res.ok) {
      const data = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(data.message || `Request failed: ${res.status}`);
    }

    return res.json().catch(() => null);
  }

  private async ensureAccessToken(): Promise<void> {
    if (this.accessToken && Date.now() < this.tokenExpiresAt - 60_000) {
      return;
    }

    const serverUrl = this.store.getServerUrl();
    const deviceId = this.store.getDeviceId();
    const deviceToken = this.store.getDeviceToken();

    if (!serverUrl || !deviceId || !deviceToken) {
      throw new Error("Not paired — cannot refresh access token");
    }

    const res = await this.rawFetch(`${serverUrl}/api/agent/auth/refresh`, {
      method: "POST",
      body: JSON.stringify({ deviceId, deviceToken }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ message: "Token refresh failed" }));
      throw new Error(data.message || "Token refresh failed");
    }

    const { accessToken, expiresAt } = await res.json();
    this.accessToken = accessToken;
    this.tokenExpiresAt = new Date(expiresAt).getTime();
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
