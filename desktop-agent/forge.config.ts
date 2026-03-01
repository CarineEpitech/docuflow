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
  },
  makers: [
    {
      name: "@electron-forge/maker-squirrel",
      config: {
        name: "DocuFlowAgent",
        setupExe: "DocuFlowAgentSetup.exe",
        authors: "DocuFlow",
        description: "DocuFlow Desktop Agent — time tracking and activity monitoring",
      },
    },
    { name: "@electron-forge/maker-zip", platforms: ["darwin"] },
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
    { name: "@electron-forge/plugin-auto-unpack-natives", config: {} },
  ],
};

export default config;
