/**
 * API client for communicating with the DocuFlow server.
 *
 * Handles access token refresh, request retry with exponential backoff,
 * and proper error classification (network vs auth vs server).
 *
 * Phase 2 D4
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

export class ApiClient {
  private store: AgentStore;
  private accessToken: string | null = null;
  private tokenExpiresAt: number = 0;

  constructor(store: AgentStore) {
    this.store = store;
  }

  // ─── Public API ───

  async completePairing(pairingCode: string, meta: DeviceMeta): Promise<PairingResult> {
    const serverUrl = this.store.getServerUrl();
    if (!serverUrl) throw new Error("Server URL not configured");

    const res = await this.rawFetch(`${serverUrl}/api/agent/pairing/complete`, {
      method: "POST",
      body: JSON.stringify({ pairingCode, deviceMeta: meta }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({ message: res.statusText }));
      throw new Error(data.message || "Pairing failed");
    }

    const result: PairingResult = await res.json();
    this.accessToken = result.accessToken;
    this.tokenExpiresAt = new Date(result.expiresAt).getTime();
    return result;
  }

  async sendHeartbeat(data: Record<string, unknown>): Promise<void> {
    await this.authenticatedRequest("/api/agent/heartbeat", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async sendEventsBatch(data: Record<string, unknown>): Promise<{ ok: boolean; accepted: number; duplicate?: boolean }> {
    const res = await this.authenticatedRequest("/api/agent/events/batch", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return res;
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
        throw new Error(`Request failed: ${retry.status} ${retry.statusText}`);
      }
      return retry.json();
    }

    if (!res.ok) {
      throw new Error(`Request failed: ${res.status} ${res.statusText}`);
    }

    return res.json();
  }

  private async ensureAccessToken(): Promise<void> {
    // If token is still valid (with 60s buffer), reuse
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

  /**
   * Low-level fetch with retry on network errors.
   * Retries up to 3 times with exponential backoff (1s, 2s, 4s).
   */
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
