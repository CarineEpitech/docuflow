/**
 * dist-win.js — Build Windows NSIS installer via electron-builder.
 *
 * Workflow:
 *   1. electron-forge package  (webpack bundle + Electron app → out/<AppName>-win32-x64/)
 *   2. electron-builder --prepackaged <that folder> --win nsis
 *      (wraps the already-packaged app into an NSIS .exe installer)
 *
 * Output: dist/DocuFlowAgentSetup-<version>.exe
 */

const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const pkg = require(path.join(ROOT, "package.json"));

// ── Step 1: forge package ───────────────────────────────────────────────────

console.log("\n[dist-win] Step 1: electron-forge package...\n");
execSync("npx electron-forge package --platform win32 --arch x64", {
  cwd: ROOT,
  stdio: "inherit",
});

// ── Locate packaged output ──────────────────────────────────────────────────

const outDir = path.join(ROOT, "out");
const appFolderName = fs
  .readdirSync(outDir)
  .find((name) => name.endsWith("-win32-x64") && !name.startsWith("."));

if (!appFolderName) {
  console.error("[dist-win] ERROR: Could not find packaged output in out/");
  process.exit(1);
}

const prepackaged = path.join(outDir, appFolderName);
console.log(`\n[dist-win] Packaged app: ${prepackaged}`);

// ── Step 2: electron-builder --prepackaged ──────────────────────────────────

console.log("\n[dist-win] Step 2: electron-builder NSIS...\n");
execSync(
  `npx electron-builder --win nsis --prepackaged "${prepackaged}"`,
  { cwd: ROOT, stdio: "inherit" }
);

// ── Report output ───────────────────────────────────────────────────────────

const distDir = path.join(ROOT, "dist");
const artifacts = fs.readdirSync(distDir).filter((f) => f.endsWith(".exe"));

console.log("\n[dist-win] ✅ Done! Artifacts:");
artifacts.forEach((f) => console.log(`  dist/${f}`));
