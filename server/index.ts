import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { logError } from "./logger";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { storage } from "./storage";
import { detectMigrationFlags, setTasksEnabled } from "./migrationFlags";
import { pool } from "./db";

const app = express();
app.set("trust proxy", 1);
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

// ─── Security headers ───
app.use(
  helmet({
    contentSecurityPolicy: false, // Vite dev server and inline scripts need this off
    crossOriginEmbedderPolicy: false, // Allow embedding external resources (GCS images, etc.)
  })
);

// ─── Rate limiting ───
// Global: 120 requests per minute per IP (generous for SPA polling + API calls)
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many requests, please try again later" },
  // TODO [PLACEHOLDER]: Tune these values after observing real traffic patterns.
  // Consider per-user rate limiting (keyed on session userId) for Desktop Agent.
});
app.use("/api/", globalLimiter);

// Stricter limit on auth endpoints to prevent brute force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Too many login attempts, please try again later" },
});
app.use("/api/login", authLimiter);
app.use("/api/register", authLimiter);

// Screenshot upload endpoints: tighter limit (10 uploads/min per IP)
const agentScreenshotLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { message: "Screenshot upload rate limit exceeded" },
});
app.use("/api/agent/screenshots/", agentScreenshotLimiter);

// ─── Health check (before auth, unauthenticated) ───
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use(
  express.json({
    verify: (req, _res, buf) => {
      try {
        req.rawBody = buf;
      } catch (e) {
        // Ignore rawBody errors
      }
    },
    limit: "10mb",
  }),
);

app.use(express.urlencoded({ extended: false, limit: "10mb" }));


export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

/**
 * Ensure Migration 002 (tasks) is applied (idempotent).
 * Safe to run every boot — uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
 */
async function ensureTasksMigration(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tasks (
      id             VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
      crm_project_id VARCHAR NOT NULL REFERENCES crm_projects(id) ON DELETE CASCADE,
      name           VARCHAR(255) NOT NULL,
      description    TEXT,
      status         VARCHAR(20) NOT NULL DEFAULT 'open',
      created_at     TIMESTAMP DEFAULT NOW(),
      updated_at     TIMESTAMP DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_crm_project ON tasks(crm_project_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status      ON tasks(status);
    ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS task_id VARCHAR REFERENCES tasks(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_time_entries_task_id ON time_entries(task_id);
  `);
}

/**
 * Ensure the Desktop Agent tables exist (idempotent — safe to run every boot).
 * This covers databases provisioned before the agent schema was added.
 */
async function ensureAgentTables(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "devices" (
      "id"                varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      "user_id"           varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "name"              varchar(255) NOT NULL,
      "os"                varchar(100),
      "client_version"    varchar(50),
      "device_token_hash" varchar(64) NOT NULL,
      "last_seen_at"      timestamp,
      "revoked_at"        timestamp,
      "created_at"        timestamp DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "idx_devices_user"       ON "devices"("user_id");
    CREATE INDEX IF NOT EXISTS "idx_devices_token_hash" ON "devices"("device_token_hash");

    CREATE TABLE IF NOT EXISTS "agent_pairing_codes" (
      "id"         varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      "user_id"    varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "code"       varchar(10) NOT NULL UNIQUE,
      "expires_at" timestamp NOT NULL,
      "used_at"    timestamp,
      "created_at" timestamp DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "idx_pairing_code" ON "agent_pairing_codes"("code");

    CREATE TABLE IF NOT EXISTS "agent_processed_batches" (
      "batch_id"     varchar PRIMARY KEY,
      "device_id"    varchar NOT NULL REFERENCES "devices"("id") ON DELETE CASCADE,
      "event_count"  integer NOT NULL DEFAULT 0,
      "processed_at" timestamp DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "idx_processed_batches_device" ON "agent_processed_batches"("device_id");
    CREATE INDEX IF NOT EXISTS "idx_processed_batches_time"   ON "agent_processed_batches"("processed_at");

    CREATE TABLE IF NOT EXISTS "agent_activity_events" (
      "id"            varchar PRIMARY KEY DEFAULT gen_random_uuid(),
      "device_id"     varchar NOT NULL REFERENCES "devices"("id") ON DELETE CASCADE,
      "user_id"       varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
      "time_entry_id" varchar REFERENCES "time_entries"("id") ON DELETE SET NULL,
      "batch_id"      varchar NOT NULL,
      "event_type"    varchar(50) NOT NULL,
      "timestamp"     timestamp NOT NULL,
      "data"          jsonb,
      "created_at"    timestamp DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS "idx_agent_events_device"    ON "agent_activity_events"("device_id");
    CREATE INDEX IF NOT EXISTS "idx_agent_events_user_time" ON "agent_activity_events"("user_id", "timestamp");
    CREATE INDEX IF NOT EXISTS "idx_agent_events_batch"     ON "agent_activity_events"("batch_id");
  `);
}

(async () => {
  // Ensure tasks migration (002) is applied (idempotent).
  // On success we set the flag directly — detectMigrationFlags() is NOT called
  // afterward because it uses the Drizzle `db` connection which may target a
  // different DB (prod PG* vars vs dev DATABASE_URL) and would silently reset
  // tasksEnabled back to false, hiding the tasks feature.
  let tasksMigrationOk = false;
  try {
    await ensureTasksMigration();
    setTasksEnabled(true);
    tasksMigrationOk = true;
    log("Tasks migration OK");
  } catch (error) {
    console.error("Failed to ensure tasks migration:", error);
  }

  // Only run detectMigrationFlags as a fallback when ensureTasksMigration failed,
  // so it can still enable tasks if the table was applied manually (e.g., via psql).
  if (!tasksMigrationOk) {
    await detectMigrationFlags();
  }

  // Ensure Desktop Agent tables exist (idempotent)
  try {
    await ensureAgentTables();
    log("Agent tables OK");
  } catch (error) {
    console.error("Failed to ensure agent tables:", error);
  }

  await registerRoutes(httpServer, app);

  // Run migration to link any orphan projects to CRM on startup
  try {
    const { linkedCount } = await storage.linkOrphanProjectsToCrm();
    if (linkedCount > 0) {
      log(`Migrated ${linkedCount} orphan projects to CRM`);
    }
  } catch (error) {
    console.error("Failed to migrate orphan projects:", error);
  }

  // Seed default CRM modules and fields if not present
  try {
    await storage.seedDefaultCrmModules();
  } catch (error) {
    console.error("Failed to seed default CRM modules:", error);
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    logError("unhandled-server-error", err, {
      status,
      path: _req.path,
      method: _req.method,
    });
    if (!res.headersSent) {
      res.status(status).json({ message });
    }
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);
    },
  );
})();
