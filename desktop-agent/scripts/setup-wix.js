#!/usr/bin/env node
/**
 * Downloads WiX Toolset 3 portable binaries into .wix-tools/
 * Required once before running `npm run build`.
 *
 * Usage: node scripts/setup-wix.js
 */
const https = require("https");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const WIX_VERSION = "3.14.1.8722";
const WIX_URL =
  "https://github.com/wixtoolset/wix3/releases/download/wix3141rtm/wix314-binaries.zip";
const DEST_DIR = path.resolve(__dirname, "../.wix-tools");
const ZIP_PATH = path.join(DEST_DIR, "wix-binaries.zip");
const REQUIRED_FILES = ["candle.exe", "light.exe", "darice.cub"];

// Already set up?
if (REQUIRED_FILES.every((f) => fs.existsSync(path.join(DEST_DIR, f)))) {
  console.log(`WiX ${WIX_VERSION} already set up in .wix-tools/ — nothing to do.`);
  process.exit(0);
}

fs.mkdirSync(DEST_DIR, { recursive: true });

console.log(`Downloading WiX ${WIX_VERSION} binaries...`);

function download(url, dest, cb) {
  const file = fs.createWriteStream(dest);
  https
    .get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        return download(res.headers.location, dest, cb);
      }
      if (res.statusCode !== 200) {
        file.close();
        return cb(new Error(`HTTP ${res.statusCode}`));
      }
      const total = parseInt(res.headers["content-length"] || "0", 10);
      let received = 0;
      res.on("data", (chunk) => {
        received += chunk.length;
        if (total) {
          process.stdout.write(`\r  ${Math.round((received / total) * 100)}%`);
        }
      });
      res.pipe(file);
      file.on("finish", () => { file.close(); cb(null); });
    })
    .on("error", (err) => { fs.unlink(dest, () => {}); cb(err); });
}

download(WIX_URL, ZIP_PATH, (err) => {
  if (err) {
    console.error("\nDownload failed:", err.message);
    process.exit(1);
  }
  console.log("\nExtracting...");
  try {
    // Use PowerShell to extract on Windows
    execSync(
      `powershell -Command "Expand-Archive -Path '${ZIP_PATH}' -DestinationPath '${DEST_DIR}' -Force"`,
      { stdio: "inherit" }
    );
    fs.unlinkSync(ZIP_PATH);
    console.log(`Done. WiX ${WIX_VERSION} ready in .wix-tools/`);
  } catch (e) {
    console.error("Extraction failed:", e.message);
    process.exit(1);
  }
});
