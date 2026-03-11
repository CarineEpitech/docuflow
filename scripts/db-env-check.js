#!/usr/bin/env node
/**
 * db-env-check.js — npm run db:env:check
 *
 * Displays which DB connection mode is active and which variables are
 * present or missing. Never prints passwords or full connection strings.
 */

"use strict";

const PG_VARS = ["PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE"];
const REQUIRED_PG = ["PGHOST", "PGUSER", "PGPASSWORD", "PGDATABASE"];

function maskValue(key, value) {
  if (!value) return "(not set)";
  if (key === "PGPASSWORD") return "***";
  return value;
}

console.log("\n=== DocuFlow — DB Environment Check ===\n");

const hasDbUrl = !!process.env.DATABASE_URL;

if (hasDbUrl) {
  console.log("✅  Mode: DATABASE_URL (priority)");
  const masked = process.env.DATABASE_URL.replace(/:([^@]+)@/, ":<hidden>@");
  console.log(`    Value: ${masked}`);
} else {
  console.log("⚠️   DATABASE_URL: not set — checking PG* fallback...\n");

  const results = PG_VARS.map((k) => ({
    key: k,
    value: process.env[k],
    required: REQUIRED_PG.includes(k),
    present: !!process.env[k],
  }));

  results.forEach(({ key, value, required, present }) => {
    const icon = present ? "✅" : (required ? "❌" : "⚠️ ");
    const label = required ? "" : " (optional, default: 5432)";
    console.log(`  ${icon}  ${key}: ${maskValue(key, value)}${label}`);
  });

  const missing = results.filter((r) => r.required && !r.present);

  console.log();
  if (missing.length === 0) {
    console.log("✅  Mode: PG* variables — all required vars present");
    const host = process.env.PGHOST;
    const port = process.env.PGPORT || "5432";
    const user = process.env.PGUSER;
    const database = process.env.PGDATABASE;
    console.log(`    Effective URL: postgresql://${user}:<hidden>@${host}:${port}/${database}`);
  } else {
    console.log(`❌  Mode: INCOMPLETE — missing required variables:`);
    missing.forEach((r) => console.log(`    - ${r.key}`));
    console.log("\n    Fix: set DATABASE_URL or all required PG* variables.");
    process.exit(1);
  }
}

console.log("\n=== Check complete ===\n");
