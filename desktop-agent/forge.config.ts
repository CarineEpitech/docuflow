/**
 * Electron Forge configuration.
 *
 * Phase 2 D4 — skeleton only.
 * [PLACEHOLDER]: Configure signing, notarization, and auto-update for production.
 */

import type { ForgeConfig } from "@electron-forge/shared-types";
import { WebpackPlugin } from "@electron-forge/plugin-webpack";

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
    // ZIP for Windows + macOS — no installer, no antivirus issues, no code signing needed
    { name: "@electron-forge/maker-zip", platforms: ["win32", "darwin"] },
    { name: "@electron-forge/maker-deb", config: {} },
    { name: "@electron-forge/maker-dmg", config: {} },
    // Squirrel disabled until code signing is set up (Avast blocks unsigned Update.exe)
    // {
    //   name: "@electron-forge/maker-squirrel",
    //   config: {
    //     name: "DocuFlowAgent",
    //     setupExe: "DocuFlowAgentSetup.exe",
    //     authors: "DocuFlow",
    //     description: "DocuFlow Desktop Agent — time tracking and activity monitoring",
    //   },
    // },
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
