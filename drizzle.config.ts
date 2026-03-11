import { defineConfig } from "drizzle-kit";

// ─── DB connection resolution ───
// Priority: DATABASE_URL > PG* variables
// drizzle-kit runs as a CLI (not server), so we inline the same logic as
// server/dbConfig.ts — no cross-module import possible here.

function resolveDbUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const missing = ["PGHOST", "PGUSER", "PGPASSWORD", "PGDATABASE"].filter(
    (k) => !process.env[k]
  );
  if (missing.length > 0) {
    throw new Error(
      `Database not configured for drizzle-kit.\n` +
      `Set DATABASE_URL, or all PG* variables.\n` +
      `Missing: ${missing.join(", ")}`
    );
  }

  const host = process.env.PGHOST!;
  const port = process.env.PGPORT ?? "5432";
  const user = process.env.PGUSER!;
  const password = encodeURIComponent(process.env.PGPASSWORD!);
  const database = process.env.PGDATABASE!;
  return `postgresql://${user}:${password}@${host}:${port}/${database}`;
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  dbCredentials: {
    url: resolveDbUrl(),
  },
});
