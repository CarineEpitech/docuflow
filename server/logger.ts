/**
 * Structured logger for DocuFlow server.
 *
 * Provides consistent JSON-structured log output for time tracking events,
 * errors, and system events. Ready for integration with external services
 * (Sentry, Logtail, Datadog) via the log sink pattern.
 *
 * Phase 1 Sprint B.4
 */

type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  event: string;
  /** Structured context data */
  data?: Record<string, unknown>;
  /** Error details if applicable */
  error?: {
    message: string;
    stack?: string;
  };
}

function formatLog(entry: LogEntry): string {
  const time = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  // Human-readable prefix + JSON payload for machine parsing
  const prefix = `${time} [${entry.level.toUpperCase()}] ${entry.event}`;
  const payload = entry.data ? ` ${JSON.stringify(entry.data)}` : "";
  const errStr = entry.error ? ` ERR: ${entry.error.message}` : "";

  return `${prefix}${payload}${errStr}`;
}

/** Log an info-level event */
export function logInfo(event: string, data?: Record<string, unknown>): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level: "info",
    event,
    data,
  };
  console.log(formatLog(entry));
  // TODO [PLACEHOLDER]: Send to Sentry breadcrumb / Logtail / Datadog
}

/** Log a warning-level event */
export function logWarn(event: string, data?: Record<string, unknown>): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level: "warn",
    event,
    data,
  };
  console.warn(formatLog(entry));
}

/** Log an error-level event */
export function logError(event: string, err: unknown, data?: Record<string, unknown>): void {
  const error = err instanceof Error
    ? { message: err.message, stack: err.stack }
    : { message: String(err) };

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level: "error",
    event,
    data,
    error,
  };
  console.error(formatLog(entry));
  // TODO [PLACEHOLDER]: Sentry.captureException(err, { extra: data })
}

// ─── Time tracking specific loggers ───

export function logTimeEvent(
  action: "start" | "pause" | "resume" | "stop" | "heartbeat",
  entryId: string,
  userId: string,
  extra?: Record<string, unknown>
): void {
  logInfo(`time-tracking.${action}`, { entryId, userId, ...extra });
}

export function logStaleSession(entryId: string, userId: string, lastActivity: string | null): void {
  logWarn("time-tracking.stale-session", { entryId, userId, lastActivity });
}

export function logScreenshotEvent(
  action: "captured" | "upload-failed" | "metadata-saved",
  entryId: string,
  extra?: Record<string, unknown>
): void {
  logInfo(`screenshot.${action}`, { entryId, ...extra });
}
