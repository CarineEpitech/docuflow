# DocuFlow Desktop Agent — Download & Distribution Guide

## Building the Windows Installer

### Prerequisites

- Windows 10/11 (Squirrel.Windows only builds on Windows)
- Node.js 18+
- npm 9+

### Steps

```bash
cd desktop-agent
npm install
npm run build
```

`npm run build` runs `electron-forge make`, which packages the app and creates
a Squirrel.Windows installer.

---

## Output Artifacts

After a successful build on Windows:

| File | Path | Purpose |
|------|------|---------|
| **Setup.exe** | `out/make/squirrel.windows/x64/DocuFlowAgentSetup.exe` | Installer for end users |
| **Nupkg** | `out/make/squirrel.windows/x64/DocuFlowAgent-0.1.0-full.nupkg` | Squirrel update package |
| **RELEASES** | `out/make/squirrel.windows/x64/RELEASES` | Squirrel release manifest |
| **Portable** | `out/DocuFlow Agent-win32-x64/docuflow-agent.exe` | Unpackaged app directory |

> For distribution, only `DocuFlowAgentSetup.exe` is needed.

---

## Publishing to GitHub Releases

1. Create a new release on GitHub:
   `https://github.com/<org>/docuflow/releases/new`

2. Tag: `desktop-agent-v0.1.0`

3. Title: `Desktop Agent v0.1.0`

4. Upload `DocuFlowAgentSetup.exe` as a release asset.

5. Copy the direct download URL for the `.exe` asset:
   ```
   https://github.com/<org>/docuflow/releases/download/desktop-agent-v0.1.0/DocuFlowAgentSetup.exe
   ```

### Using `gh` CLI (alternative)

```bash
gh release create desktop-agent-v0.1.0 \
  desktop-agent/out/make/squirrel.windows/x64/DocuFlowAgentSetup.exe \
  --title "Desktop Agent v0.1.0" \
  --notes "Initial MVP release — Windows installer."
```

---

## Updating the Download URL in the Web App

After publishing, update the placeholder URL:

**File:** `client/src/pages/DevicesPage.tsx`

Find:
```typescript
const DOWNLOAD_URL_WINDOWS = "PLACEHOLDER_GITHUB_RELEASE_URL";
```

Replace with the actual GitHub Releases asset URL:
```typescript
const DOWNLOAD_URL_WINDOWS = "https://github.com/<org>/docuflow/releases/download/desktop-agent-v0.1.0/DocuFlowAgentSetup.exe";
```

---

## MVP Limitations

- **No code signing**: Windows SmartScreen may warn on first launch.
  Users click "More info" then "Run anyway."
- **No auto-update**: Users must manually download new versions.
- **Windows only**: macOS .dmg and Linux .deb makers are configured
  but not included in the download flow yet.

---

## User Flow

1. User visits the **Devices** page in the web app
2. Clicks **"Download Windows Agent"** button
3. Downloads and runs `DocuFlowAgentSetup.exe`
4. App installs to `%LOCALAPPDATA%\DocuFlowAgent\` and launches
5. User clicks **"Connect Device"** on the web page to get a pairing code
6. Enters the pairing code in the Desktop Agent
7. Device appears in the web app's device list

---

## Version Bumping

When releasing a new version:

1. Update `version` in `desktop-agent/package.json`
2. Update `AGENT_VERSION` in `client/src/pages/DevicesPage.tsx`
3. Rebuild: `cd desktop-agent && npm run build`
4. Publish new GitHub Release with updated tag
5. Update `DOWNLOAD_URL_WINDOWS` with the new release URL
