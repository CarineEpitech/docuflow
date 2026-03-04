#!/usr/bin/env node
/**
 * Build the MSI installer.
 * Adds local .wix-tools binaries to PATH so WiX works without a system install.
 */
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const wixTools = path.resolve(__dirname, "../.wix-tools");

if (!fs.existsSync(path.join(wixTools, "candle.exe"))) {
  console.log("WiX binaries not found — running setup-wix.js first...");
  const { execSync } = require("child_process");
  try {
    execSync("node scripts/setup-wix.js", { stdio: "inherit" });
  } catch {
    process.exit(1);
  }
}

const env = {
  ...process.env,
  PATH: `${wixTools}${path.delimiter}${process.env.PATH}`,
};

const args = ["electron-forge", "make", "--targets", "@electron-forge/maker-wix"];
const child = spawn("npx", args, { env, stdio: "inherit", shell: true });

child.on("exit", (code) => {
  if (code !== 0) return process.exit(code ?? 1);

  // Rename output to a stable filename without spaces
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf8"));
  const msiDir = path.resolve(__dirname, "../out/make/wix/x64");
  const src = path.join(msiDir, `DocuFlow Agent.msi`);
  const dest = path.join(msiDir, `DocuFlowAgentSetup-${pkg.version}.msi`);

  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`\nMSI ready: out/make/wix/x64/DocuFlowAgentSetup-${pkg.version}.msi`);
  }

  process.exit(0);
});
