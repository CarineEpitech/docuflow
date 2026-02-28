/**
 * Agent routes — Desktop Agent pairing, auth, and ingestion endpoints.
 *
 * Separated from main routes.ts for clean architectural boundary.
 * Phase 2 D2
 */

import type { Express, Request, Response, NextFunction } from "express";
import { randomBytes, createHash } from "crypto";
import { z } from "zod";
import { storage } from "./storage";
import { isAuthenticated, getUserId } from "./auth";
import { logInfo, logError } from "./logger";

// ─── Constants ───

const PAIRING_CODE_LENGTH = 6;
const PAIRING_CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const DEVICE_TOKEN_LENGTH = 48; // bytes -> 96 hex chars
const ACCESS_TOKEN_LENGTH = 32; // bytes -> 64 hex chars

// ─── Helpers ───

function generatePairingCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1 for readability
  let code = "";
  const bytes = randomBytes(PAIRING_CODE_LENGTH);
  for (let i = 0; i < PAIRING_CODE_LENGTH; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

function generateToken(lengthBytes: number): string {
  return randomBytes(lengthBytes).toString("hex");
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// Simple in-memory access token store (short-lived, 1h)
// In production, use JWT or Redis. This is a V1 placeholder.
const accessTokenStore = new Map<string, { deviceId: string; userId: string; expiresAt: number }>();

function createAccessToken(deviceId: string, userId: string): { accessToken: string; expiresAt: Date } {
  const accessToken = generateToken(ACCESS_TOKEN_LENGTH);
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_MS);
  accessTokenStore.set(accessToken, { deviceId, userId, expiresAt: expiresAt.getTime() });
  return { accessToken, expiresAt };
}

// ─── Agent auth middleware ───

interface AgentAuthRequest extends Request {
  agentDeviceId?: string;
  agentUserId?: string;
}

function isAgentAuthenticated(req: AgentAuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Missing or invalid Authorization header" });
    return;
  }

  const token = authHeader.slice(7);
  const entry = accessTokenStore.get(token);

  if (!entry) {
    res.status(401).json({ message: "Invalid access token" });
    return;
  }

  if (Date.now() > entry.expiresAt) {
    accessTokenStore.delete(token);
    res.status(401).json({ message: "Access token expired" });
    return;
  }

  req.agentDeviceId = entry.deviceId;
  req.agentUserId = entry.userId;
  next();
}

// Cleanup expired tokens periodically (every 5 min)
setInterval(() => {
  const now = Date.now();
  accessTokenStore.forEach((entry, token) => {
    if (now > entry.expiresAt) {
      accessTokenStore.delete(token);
    }
  });
}, 5 * 60 * 1000);

// ─── Validation schemas ───

const deviceMetaSchema = z.object({
  deviceName: z.string().min(1).max(255),
  os: z.string().max(100).optional(),
  clientVersion: z.string().max(50).optional(),
});

const pairingCompleteSchema = z.object({
  pairingCode: z.string().length(PAIRING_CODE_LENGTH),
  deviceMeta: deviceMetaSchema,
});

const refreshSchema = z.object({
  deviceId: z.string().uuid(),
  deviceToken: z.string().min(1),
});

const revokeSchema = z.object({
  deviceId: z.string().uuid(),
});

const heartbeatSchema = z.object({
  deviceId: z.string().uuid(),
  timeEntryId: z.string().uuid().nullable().optional(),
  timestamp: z.string(),
  activeApp: z.string().optional(),
  activeWindow: z.string().optional(),
  clientType: z.string(),
  clientVersion: z.string(),
});

const activityEventSchema = z.object({
  type: z.enum(["input_activity", "active_window", "idle_start", "idle_end"]),
  timestamp: z.string(),
  data: z.record(z.unknown()).optional().default({}),
});

const eventsBatchSchema = z.object({
  deviceId: z.string().uuid(),
  batchId: z.string().uuid(),
  clientType: z.string(),
  clientVersion: z.string(),
  events: z.array(activityEventSchema).min(1).max(100),
});

const presignSchema = z.object({
  deviceId: z.string().uuid(),
  timeEntryId: z.string().uuid(),
  capturedAt: z.string(),
  clientType: z.string(),
  clientVersion: z.string(),
});

const confirmSchema = z.object({
  screenshotId: z.string().uuid(),
  deviceId: z.string().uuid(),
});

// ─── Route registration ───

export function registerAgentRoutes(app: Express): void {

  // ═══════════════════════════════════════
  // PAIRING
  // ═══════════════════════════════════════

  /** Web: generate a pairing code */
  app.post("/api/agent/pairing/start", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const code = generatePairingCode();
      const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS);

      await storage.createAgentPairingCode({ userId, code, expiresAt });

      logInfo("agent.pairing.start", { userId, code });
      res.json({ pairingCode: code, expiresAt: expiresAt.toISOString() });
    } catch (error) {
      logError("agent.pairing.start.failed", error);
      res.status(500).json({ message: "Failed to generate pairing code" });
    }
  });

  /** Agent: complete pairing with code */
  app.post("/api/agent/pairing/complete", async (req, res) => {
    try {
      const body = pairingCompleteSchema.parse(req.body);

      const pairingRecord = await storage.getAgentPairingCode(body.pairingCode);
      if (!pairingRecord) {
        return res.status(400).json({ message: "Invalid pairing code" });
      }
      if (pairingRecord.usedAt) {
        return res.status(400).json({ message: "Pairing code already used" });
      }
      if (new Date() > new Date(pairingRecord.expiresAt)) {
        return res.status(400).json({ message: "Pairing code expired" });
      }

      // Generate tokens
      const deviceToken = generateToken(DEVICE_TOKEN_LENGTH);
      const deviceTokenHash = hashToken(deviceToken);

      // Create device
      const device = await storage.createDevice({
        userId: pairingRecord.userId,
        name: body.deviceMeta.deviceName,
        os: body.deviceMeta.os ?? null,
        clientVersion: body.deviceMeta.clientVersion ?? null,
        deviceTokenHash,
        lastSeenAt: new Date(),
      });

      // Mark pairing code as used
      await storage.markPairingCodeUsed(pairingRecord.id);

      // Create short-lived access token
      const { accessToken, expiresAt } = createAccessToken(device.id, pairingRecord.userId);

      logInfo("agent.pairing.complete", { deviceId: device.id, userId: pairingRecord.userId });
      res.json({
        deviceId: device.id,
        deviceToken,
        accessToken,
        expiresAt: expiresAt.toISOString(),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request", errors: error.errors });
      }
      logError("agent.pairing.complete.failed", error);
      res.status(500).json({ message: "Failed to complete pairing" });
    }
  });

  // ═══════════════════════════════════════
  // AUTH
  // ═══════════════════════════════════════

  /** Agent: refresh access token using device token */
  app.post("/api/agent/auth/refresh", async (req, res) => {
    try {
      const body = refreshSchema.parse(req.body);
      const tokenHash = hashToken(body.deviceToken);

      const device = await storage.getDeviceByTokenHash(body.deviceId, tokenHash);
      if (!device) {
        return res.status(401).json({ message: "Invalid device credentials" });
      }
      if (device.revokedAt) {
        return res.status(401).json({ message: "Device has been revoked" });
      }

      // Update lastSeenAt
      await storage.updateDeviceLastSeen(device.id);

      const { accessToken, expiresAt } = createAccessToken(device.id, device.userId);

      logInfo("agent.auth.refresh", { deviceId: device.id });
      res.json({ accessToken, expiresAt: expiresAt.toISOString() });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request", errors: error.errors });
      }
      logError("agent.auth.refresh.failed", error);
      res.status(500).json({ message: "Failed to refresh token" });
    }
  });

  /** Web: revoke a device */
  app.post("/api/agent/device/revoke", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const body = revokeSchema.parse(req.body);

      const device = await storage.getDevice(body.deviceId);
      if (!device || device.userId !== userId) {
        return res.status(404).json({ message: "Device not found" });
      }

      await storage.revokeDevice(body.deviceId);

      logInfo("agent.device.revoke", { deviceId: body.deviceId, userId });
      res.json({ ok: true });
    } catch (error) {
      logError("agent.device.revoke.failed", error);
      res.status(500).json({ message: "Failed to revoke device" });
    }
  });

  /** Web: list user's devices */
  app.get("/api/agent/devices", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req)!;
      const devicesList = await storage.getUserDevices(userId);
      res.json({ data: devicesList });
    } catch (error) {
      logError("agent.devices.list.failed", error);
      res.status(500).json({ message: "Failed to list devices" });
    }
  });

  // ═══════════════════════════════════════
  // INGESTION
  // ═══════════════════════════════════════

  /** Agent: heartbeat */
  app.post("/api/agent/heartbeat", isAgentAuthenticated as any, async (req: AgentAuthRequest, res) => {
    try {
      const body = heartbeatSchema.parse(req.body);

      // Update device lastSeenAt
      await storage.updateDeviceLastSeen(body.deviceId);

      // If there's an active time entry, update its lastActivityAt
      if (body.timeEntryId) {
        await storage.updateTimeEntry(body.timeEntryId, {
          lastActivityAt: new Date(body.timestamp),
        });
      }

      logInfo("agent.heartbeat", {
        deviceId: body.deviceId,
        timeEntryId: body.timeEntryId ?? null,
        clientType: body.clientType,
        clientVersion: body.clientVersion,
      });

      res.json({ ok: true, serverTime: new Date().toISOString() });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request", errors: error.errors });
      }
      logError("agent.heartbeat.failed", error);
      res.status(500).json({ message: "Failed to process heartbeat" });
    }
  });

  /** Agent: batch events (idempotent) */
  app.post("/api/agent/events/batch", isAgentAuthenticated as any, async (req: AgentAuthRequest, res) => {
    try {
      const body = eventsBatchSchema.parse(req.body);

      // Idempotency check
      const isDuplicate = await storage.isAgentBatchProcessed(body.batchId);
      if (isDuplicate) {
        return res.json({ ok: true, accepted: 0, duplicate: true });
      }

      // Get active time entry for this user (best-effort association)
      const activeEntry = await storage.getActiveTimeEntry(req.agentUserId!);
      const timeEntryId = activeEntry?.id ?? null;

      // Store events
      await storage.createAgentActivityEvents(
        body.events.map((event) => ({
          deviceId: body.deviceId,
          userId: req.agentUserId!,
          timeEntryId,
          batchId: body.batchId,
          eventType: event.type,
          timestamp: new Date(event.timestamp),
          data: event.data,
        }))
      );

      // Mark batch as processed
      await storage.markAgentBatchProcessed(body.batchId, body.deviceId, body.events.length);

      // Update device lastSeenAt
      await storage.updateDeviceLastSeen(body.deviceId);

      logInfo("agent.events.batch", {
        deviceId: body.deviceId,
        batchId: body.batchId,
        eventCount: body.events.length,
        clientType: body.clientType,
      });

      res.json({ ok: true, accepted: body.events.length });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request", errors: error.errors });
      }
      logError("agent.events.batch.failed", error);
      res.status(500).json({ message: "Failed to process events batch" });
    }
  });

  /** Agent: presign screenshot upload URL */
  app.post("/api/agent/screenshots/presign", isAgentAuthenticated as any, async (req: AgentAuthRequest, res) => {
    try {
      const body = presignSchema.parse(req.body);

      // Create a screenshot record with pending status
      const screenshot = await storage.createTimeEntryScreenshot({
        timeEntryId: body.timeEntryId,
        userId: req.agentUserId!,
        crmProjectId: "", // Will be filled from time entry
        storageKey: `pending-${Date.now()}`, // Placeholder until confirmed
        capturedAt: new Date(body.capturedAt),
      });

      // Get signed upload URL
      // [PLACEHOLDER]: Use ObjectStorageService for proper signed URL
      // For now, return a placeholder
      const uploadURL = `/api/time-tracking/screenshots/upload/${screenshot.id}`;

      logInfo("agent.screenshots.presign", {
        screenshotId: screenshot.id,
        deviceId: body.deviceId,
        clientType: body.clientType,
      });

      res.json({
        screenshotId: screenshot.id,
        uploadURL,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid request", errors: error.errors });
      }
      logError("agent.screenshots.presign.failed", error);
      res.status(500).json({ message: "Failed to presign screenshot" });
    }
  });

  /** Agent: confirm screenshot upload */
  app.post("/api/agent/screenshots/confirm", isAgentAuthenticated as any, async (req: AgentAuthRequest, res) => {
    try {
      const body = confirmSchema.parse(req.body);

      logInfo("agent.screenshots.confirm", {
        screenshotId: body.screenshotId,
        deviceId: body.deviceId,
      });

      res.json({ ok: true });
    } catch (error) {
      logError("agent.screenshots.confirm.failed", error);
      res.status(500).json({ message: "Failed to confirm screenshot" });
    }
  });
}
