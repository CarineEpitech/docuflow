/**
 * Electron Forge configuration.
 */

import type { ForgeConfig } from "@electron-forge/shared-types";
import { WebpackPlugin } from "@electron-forge/plugin-webpack";
import path from "path";

const config: ForgeConfig = {
  packagerConfig: {
    name: "DocuFlow Agent",
    executableName: "docuflow-agent",
    asar: true,
    appBundleId: "com.docuflow.agent",
    // Copy assets alongside app.asar so they're accessible at process.resourcesPath/assets/
    extraResource: ["./assets"],
  },
  makers: [
    // MSI installer for Windows — no Squirrel/Update.exe, no .NET crash
    {
      name: "@electron-forge/maker-wix",
      platforms: ["win32"],
      config: {
        // Stable GUID — never change this or Windows will treat it as a new product
        upgradeCode: "7B2F4A3E-1C8D-4F6E-9A5B-2D3E7F1C4A8B",
        manufacturer: "DocuFlow",
        name: "DocuFlow Desktop Agent",
        shortName: "DocuFlow Agent",
        appUserModelId: "com.docuflow.agent",
        // Per-machine install: installs to Program Files, requires admin once
        perMachine: true,
        // Create shortcut in Start Menu
        shortcutFolderName: "DocuFlow",
        // UTF-8 codepage to support special characters in description
        codepage: "65001",
        // Override description to avoid em-dash encoding issues
        description: "DocuFlow Desktop Agent - time tracking, activity monitoring, and screenshot capture",
        // Portable WiX binaries (no system install needed)
        wixInstallation: path.resolve(process.cwd(), ".wix-tools"),
      },
    },
    // ZIP fallback — portable, no install needed, useful if MSI is blocked
    { name: "@electron-forge/maker-zip", platforms: ["win32", "darwin"] },
    { name: "@electron-forge/maker-deb", config: {} },
    { name: "@electron-forge/maker-dmg", config: {} },
  ],
  plugins: [
    new WebpackPlugin({
      mainConfig: "./webpack.main.config.js",
      renderer: {
        config: "./webpack.renderer.config.js",
        entryPoints: [
          {
            html: "./src/renderer/index.html",
            js: "./src/renderer/index.ts",
            name: "main_window",
            preload: {
              js: "./src/renderer/preload.ts",
            },
          },
        ],
      },
    }),
  ],
};

export default config;
