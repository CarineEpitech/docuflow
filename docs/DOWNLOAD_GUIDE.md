# DocuFlow Desktop Agent — Download & Distribution Guide

> Current version: **v0.1.3**
> Official artifact: **`DocuFlowAgentSetup.exe`** (NSIS per-user installer)

---

## Building the Windows Installer

### Prerequisites
- Windows 10/11 (64-bit)
- Node.js 18+
- npm 9+
- Avast / Defender real-time protection **temporarily disabled** during the build (the NSIS writer gets locked otherwise)

### Steps

```bash
cd desktop-agent
npm install
npm run dist:win
```

Output: `desktop-agent/release/DocuFlowAgentSetup.exe` (~65 MB)

---

## Official Artifact

| Artifact | Path | Status |
|----------|------|--------|
| **NSIS installer** | `release/DocuFlowAgentSetup.exe` | ✅ Official — distribute this |
| ZIP portable | `out/DocuFlow Agent-win32-x64/` | Fallback only — not promoted |
| `.msi` / Squirrel | — | ❌ Deprecated — do not use |

---

## User Installation Instructions

### NSIS Installer (recommended)
1. Download `DocuFlowAgentSetup.exe`
2. If SmartScreen warns: click **More info → Run anyway** (app is not code-signed yet)
3. Follow the setup wizard — no admin rights needed (installs per-user)
4. Start Menu → **DocuFlow Desktop Agent**
5. Visible in Settings → Apps as **DocuFlow Desktop Agent**

### ZIP Portable (fallback)
Use only if the installer is blocked by antivirus or IT policy:
1. Extract the ZIP anywhere
2. Right-click the folder → Properties → check **Unblock** → OK
3. Run `docuflow-agent.exe`

---

## First Launch

1. Open DocuFlow Desktop Agent
2. Enter your DocuFlow **email** and **password** (same credentials as the web app)
3. Click **Sign in**
4. The device appears in the web app: **Devices** page

No pairing codes. No server URL to enter. The server URL is baked into the installer.

---

## Updating the Download URL in the Web App

After publishing a GitHub Release, update this constant:

**File:** `client/src/pages/DevicesPage.tsx`

```typescript
const DOWNLOAD_URL_WINDOWS = "https://github.com/CarineEpitech/docuflow/releases/download/desktop-agent-v0.1.3/DocuFlowAgentSetup.exe";
```

---

## Publishing to GitHub Releases

```bash
gh release create desktop-agent-v0.1.3 \
  "desktop-agent/release/DocuFlowAgentSetup.exe" \
  --title "Desktop Agent v0.1.3 — Email/password auth, task support" \
  --notes "See docs/DESKTOP_RELEASE_LOG.md for full release notes."
```

Then delete or archive the old v0.1.1 and v0.1.2 releases.

---

## Version Bumping

1. Update `version` in `desktop-agent/package.json`
2. Update `DEFAULT_API_URL` in `desktop-agent/src/lib/config.ts` if server URL changed
3. Rebuild: `cd desktop-agent && npm run dist:win`
4. Publish GitHub Release (see above)
5. Update `DOWNLOAD_URL_WINDOWS` in `client/src/pages/DevicesPage.tsx`
6. Add entry to `docs/DESKTOP_RELEASE_LOG.md`

---

## Uninstalling

Run the uninstall script:
```powershell
powershell -ExecutionPolicy Bypass -File "desktop-agent/scripts/uninstall-agent.ps1"
```

Or: Settings → Apps → DocuFlow Agent → Uninstall.

---

## Troubleshooting

### "Windows cannot access the specified device"
File is blocked after download:
1. Right-click → Properties → check **Unblock** → OK

### Antivirus blocking the installer write during build
Avast / Defender lock the output `.exe` while scanning:
- Temporarily disable File Shield (Avast: right-click tray → Avast shields control → Disable for 10 minutes)
- Run `npm run dist:win` again

### App not starting after install
Delete leftover AppData and reinstall:
```
C:\Users\<you>\AppData\Local\DocuFlow Desktop Agent\
C:\Users\<you>\AppData\Roaming\DocuFlow Desktop Agent\
```

---

## Known Limitations (MVP)

- **No code signing**: SmartScreen warns on first launch
- **No auto-update**: Users must download new versions manually
- **Windows only**: macOS/Linux not yet supported
