/**
 * dbConfig.ts — Single source of truth for the database connection string.
 *
 * Priority:
 *   1. DATABASE_URL  (explicit, takes precedence — keeps backward compat)
 *   2. PG* variables (PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE)
 *
 * Throws a clear error at startup if neither set is complete.
 * Never logs the password.
 */

type DbConfigSource = "DATABASE_URL" | "PG_VARS";

interface DbConfig {
  connectionString: string;
  source: DbConfigSource;
}

function buildFromPgVars(): DbConfig {
  const required = {
    PGHOST: process.env.PGHOST,
    PGPORT: process.env.PGPORT ?? "5432",
    PGUSER: process.env.PGUSER,
    PGPASSWORD: process.env.PGPASSWORD,
    PGDATABASE: process.env.PGDATABASE,
  };

  const missing = (["PGHOST", "PGUSER", "PGPASSWORD", "PGDATABASE"] as const).filter(
    (k) => !process.env[k]
  );

  if (missing.length > 0) {
    throw new Error(
      `Database not configured. Set DATABASE_URL or all PG* variables.\n` +
      `Missing PG* variables: ${missing.join(", ")}\n` +
      `Required: PGHOST, PGPORT (default 5432), PGUSER, PGPASSWORD, PGDATABASE`
    );
  }

  const { PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE } = required;
  const encodedPass = encodeURIComponent(PGPASSWORD!);
  const connectionString = `postgresql://${PGUSER}:${encodedPass}@${PGHOST}:${PGPORT}/${PGDATABASE}`;

  return { connectionString, source: "PG_VARS" };
}

function resolveDbConfig(): DbConfig {
  if (process.env.DATABASE_URL) {
    return { connectionString: process.env.DATABASE_URL, source: "DATABASE_URL" };
  }
  return buildFromPgVars();
}

// Resolve once at module load — fails fast if misconfigured
export const dbConfig: DbConfig = resolveDbConfig();

// Log source (never log the password)
const masked = dbConfig.connectionString.replace(/:([^@]+)@/, ":<hidden>@");
console.log(`[DB] Config source: ${dbConfig.source} — ${masked}`);

export const connectionString: string = dbConfig.connectionString;
