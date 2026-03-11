#!/usr/bin/env node
/**
 * resolve-db-url.js
 *
 * Prints the effective DATABASE_URL to stdout, resolving from PG* variables
 * if DATABASE_URL is not set. Used as a pre-step for drizzle-kit and other
 * tools that require DATABASE_URL explicitly.
 *
 * Usage (in package.json scripts):
 *   "db:push": "node scripts/resolve-db-url.js | xargs -I{} cross-env DATABASE_URL={} drizzle-kit push"
 *
 * Or call directly:
 *   node scripts/resolve-db-url.js
 */

"use strict";

function resolveConnectionString() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const host = process.env.PGHOST;
  const port = process.env.PGPORT || "5432";
  const user = process.env.PGUSER;
  const password = process.env.PGPASSWORD;
  const database = process.env.PGDATABASE;

  const missing = ["PGHOST", "PGUSER", "PGPASSWORD", "PGDATABASE"].filter(
    (k) => !process.env[k]
  );

  if (missing.length > 0) {
    console.error(
      "[resolve-db-url] ERROR: Database not configured.\n" +
      "Set DATABASE_URL, or all of: PGHOST, PGPORT (default 5432), PGUSER, PGPASSWORD, PGDATABASE\n" +
      "Missing: " + missing.join(", ")
    );
    process.exit(1);
  }

  const encodedPass = encodeURIComponent(password);
  return `postgresql://${user}:${encodedPass}@${host}:${port}/${database}`;
}

process.stdout.write(resolveConnectionString());
