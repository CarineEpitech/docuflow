/**
 * Runtime configuration for the Desktop Agent.
 *
 * API_BASE is the only required setting. It can be overridden at build time
 * or at runtime via the DOCUFLOW_API_URL environment variable — useful for
 * on-prem deployments or local development without touching source code.
 *
 * Default: the production DocuFlow instance.
 */

const DEFAULT_API_URL = "https://techma-doc--masdouk1.replit.app";

export const API_BASE: string = (
  process.env.DOCUFLOW_API_URL ?? DEFAULT_API_URL
).replace(/\/+$/, ""); // strip trailing slash

/** Human-readable hostname for display in the UI. */
export const API_HOST: string = (() => {
  try {
    return new URL(API_BASE).hostname;
  } catch {
    return API_BASE;
  }
})();
