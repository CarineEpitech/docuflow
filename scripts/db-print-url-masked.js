#!/usr/bin/env node
/**
 * db-print-url-masked.js — npm run db:print:url:masked
 *
 * Prints a masked version of the effective connection string for debugging.
 * Password is always hidden.
 */

"use strict";

function resolveConnectionString() {
  if (process.env.DATABASE_URL) {
    return { url: process.env.DATABASE_URL, source: "DATABASE_URL" };
  }

  const missing = ["PGHOST", "PGUSER", "PGPASSWORD", "PGDATABASE"].filter(
    (k) => !process.env[k]
  );
  if (missing.length > 0) {
    console.error("ERROR: Missing variables: " + missing.join(", "));
    process.exit(1);
  }

  const host = process.env.PGHOST;
  const port = process.env.PGPORT || "5432";
  const user = process.env.PGUSER;
  const password = encodeURIComponent(process.env.PGPASSWORD);
  const database = process.env.PGDATABASE;
  return {
    url: `postgresql://${user}:${password}@${host}:${port}/${database}`,
    source: "PG_VARS",
  };
}

const { url, source } = resolveConnectionString();
const masked = url.replace(/:([^@]+)@/, ":<hidden>@");
console.log(`Source : ${source}`);
console.log(`URL    : ${masked}`);
