# DocuFlow Desktop Agent — Download & Distribution Guide

## Building the Windows Installer

### Prerequisites

- Windows 10/11
- Node.js 18+
- npm 9+

### Steps

```bash
cd desktop-agent
npm install
npm run build
```

`npm run build` runs `electron-forge make`, which produces:
- A **WiX MSI installer** (primary)
- A **ZIP portable** (fallback)

---

## Output Artifacts

After a successful build on Windows:

| File | Path | Purpose |
|------|------|---------|
| **MSI installer** | `out/make/wix/x64/DocuFlow Agent-0.1.0-x64.msi` | Installer for end users — recommended |
| **ZIP portable** | `out/make/zip/win32/x64/DocuFlow Agent-win32-x64-0.1.0.zip` | Portable fallback, no install needed |

> For distribution, share `DocuFlow Agent-0.1.0-x64.msi`.

---

## User Install Instructions

### MSI (recommended)

1. Download `DocuFlow Agent-0.1.0-x64.msi`
2. If SmartScreen blocks it: click **More info** → **Run anyway**
3. Follow the install wizard — no admin rights needed (installs per-user)
4. Start Menu → **DocuFlow** → **DocuFlow Agent**
5. App also visible in **Settings → Apps → Installed apps** as **DocuFlow Desktop Agent**

### ZIP (portable fallback)

Use this if the MSI is blocked by antivirus or IT policy.

1. Extract the ZIP anywhere (e.g. `C:\Users\you\DocuFlowAgent\`)
2. Right-click the folder → **Properties** → check **Unblock** if present → OK
3. Run `docuflow-agent.exe`

---

## First Launch / Pairing

1. Open the desktop agent
2. Enter your server URL (e.g. `https://app.docuflow.io`)
3. In the web app: go to **Devices** → **Connect Device** to get a pairing code
4. Enter the pairing code in the agent → **Pair**
5. The device appears in the web app's device list

---

## Updating the Download URL in the Web App

After publishing a release, update the placeholder in:

**File:** `client/src/pages/DevicesPage.tsx`

```typescript
// Change this:
const DOWNLOAD_URL_WINDOWS = "PLACEHOLDER_GITHUB_RELEASE_URL";

// To the actual asset URL:
const DOWNLOAD_URL_WINDOWS = "https://github.com/<org>/docuflow/releases/download/desktop-agent-v0.1.0/DocuFlow%20Agent-0.1.0-x64.msi";
```

---

## Troubleshooting

### "Windows cannot access the specified device"
The file is blocked because it was downloaded from the internet.
1. Right-click the MSI → **Properties**
2. At the bottom, check **Unblock** → **OK**
3. Run again

### Antivirus blocking the installer
Unsigned Electron apps are sometimes flagged by Avast/Defender.
- Temporarily disable real-time protection for 10 minutes
- Run the installer
- Re-enable protection

### ffmpeg.dll not found
This means a previous corrupted installation left broken files.
1. **Settings → Apps** → uninstall **DocuFlow Desktop Agent**
2. Delete `C:\Users\<you>\AppData\Local\DocuFlow Agent\` if it still exists
3. Reinstall from the MSI

### App not starting after install
Delete leftover AppData folders, then reinstall:
```
C:\Users\<you>\AppData\Local\DocuFlow Agent\
C:\Users\<you>\AppData\Roaming\DocuFlow Agent\
```

---

## Publishing to GitHub Releases

```bash
gh release create desktop-agent-v0.1.0 \
  "desktop-agent/out/make/wix/x64/DocuFlow Agent-0.1.0-x64.msi" \
  --title "Desktop Agent v0.1.0" \
  --notes "Windows MSI installer — installs per-user, no Squirrel."
```

---

## Version Bumping

1. Update `version` in `desktop-agent/package.json`
2. Rebuild: `cd desktop-agent && npm run build`
3. Publish new GitHub Release
4. Update `DOWNLOAD_URL_WINDOWS` in `client/src/pages/DevicesPage.tsx`

---

## MVP Limitations

- **No code signing**: SmartScreen warns on first launch — users click "More info" → "Run anyway"
- **No auto-update**: Users must manually download new versions
- **Windows only**: macOS `.dmg` and Linux `.deb` makers are configured but not in the download flow yet
