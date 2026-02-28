/**
 * Client-side structured logger for DocuFlow.
 *
 * Provides consistent logging for time tracking events, multi-tab
 * coordination, and screenshot capture. Ready for Sentry integration.
 *
 * Phase 1 Sprint B.4
 */

type LogLevel = "info" | "warn" | "error";

function log(level: LogLevel, event: string, data?: Record<string, unknown>): void {
  const payload = data ? ` ${JSON.stringify(data)}` : "";
  const message = `[${event}]${payload}`;

  switch (level) {
    case "info":
      console.log(message);
      break;
    case "warn":
      console.warn(message);
      break;
    case "error":
      console.error(message);
      // TODO [PLACEHOLDER]: Sentry.captureMessage(message, "error")
      break;
  }
}

export function logInfo(event: string, data?: Record<string, unknown>): void {
  log("info", event, data);
}

export function logWarn(event: string, data?: Record<string, unknown>): void {
  log("warn", event, data);
}

export function logError(event: string, err: unknown, data?: Record<string, unknown>): void {
  const errorMsg = err instanceof Error ? err.message : String(err);
  log("error", event, { ...data, error: errorMsg });
  // TODO [PLACEHOLDER]: Sentry.captureException(err, { extra: data })
}
