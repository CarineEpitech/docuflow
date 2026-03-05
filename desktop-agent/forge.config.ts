/**
 * Electron Forge configuration.
 *
 * Forge is used for dev (electron-forge start) and packaging (electron-forge package).
 * Distribution is handled by electron-builder (see scripts/dist-win.js).
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
    // ZIP portable — fallback, no install needed
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
