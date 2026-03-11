/**
 * Runtime configuration for the Desktop Agent.
 *
 * API_BASE is the only required setting. It can be overridden at build time
 * or at runtime via the DOCUFLOW_API_URL environment variable — useful for
 * on-prem deployments or local development without touching source code.
 *
 * Default: the production DocuFlow instance.
 */

const DEFAULT_API_URL = "https://685f78d0-eb71-48b3-ad3d-cfc7079d359b-00-1ew2ty1yeevg0.spock.replit.dev";

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
