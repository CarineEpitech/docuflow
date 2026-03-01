import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { logError } from "./logger";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { storage } from "./storage";

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

(async () => {
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
