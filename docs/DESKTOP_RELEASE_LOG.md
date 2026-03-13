# DocuFlow Desktop Agent — Release Log

> Updated after each build. Use this as the single source of truth for preparing GitHub Releases.

---

## Official Release Strategy

| | |
|---|---|
| **Official artifact** | `DocuFlowAgentSetup.exe` (NSIS per-user installer) |
| **Build output path** | `desktop-agent/release/DocuFlowAgentSetup.exe` |
| **Build command** | `cd desktop-agent && npm run dist:win` |
| **Deprecated** | Any `.msi`, Squirrel-based, or ZIP-only distribution |
| **ZIP portable** | Available but not the primary path — use only as fallback if installer is blocked |
| **GitHub tag format** | `desktop-agent-v{version}` |
| **GitHub asset name** | `DocuFlowAgentSetup.exe` (no version suffix in filename — version is in the tag/release title) |

### Cleanup steps for GitHub Releases
- v0.1.1 release: **archive or delete** — references pairing code flow (removed in S4)
- v0.1.2 release: **archive or delete** — references server URL field (removed in S4)
- v0.1.3: **current RC build** — first release with email/password auth, no pairing code

---

## v0.1.3 — Current Build

| | |
|---|---|
| **Version** | 0.1.3 |
| **Date** | 2026-03-12 |
| **Branch** | `claude/clarify-project-scope-0DMnK` |
| **Artifact** | `desktop-agent/release/DocuFlowAgentSetup.exe` (65 MB) |
| **Build command** | `cd desktop-agent && npm run dist:win` |
| **Installer type** | NSIS per-user, oneClick=false |
| **Status** | Built ✅ — pending RC sign-off |

### Recommended GitHub Release title
```
Desktop Agent v0.1.3 — Email/password auth, task support, resizable window
```

### Recommended tag
```
desktop-agent-v0.1.3
```

### What changed since v0.1.2
- **Auth**: Pairing code flow removed. Login is now email + password (same DocuFlow credentials).
- **Server URL**: Removed from UI. Hardcoded in build (`config.ts`), overridable via `DOCUFLOW_API_URL` env var.
- **Device name**: Auto-derived from OS hostname — no manual input.
- **Tasks**: Desktop agent task selector now shows tasks fetched from server. Task creation available on web (Time Tracker + CRM Project Page).
- **Window**: Resizable. Min width 420px. Maximize fills full screen.
- **Stability**: JWT refresh hardened. Device revoke immediately stops all workers and returns to login screen.
- **Security**: `requireActiveDevice()` no longer accepts `deviceId` from request body.

### Known issues
- `DEFAULT_API_URL` in `config.ts` still points to Replit dev preview — **must update to production URL before distributing**.
- No code signing → SmartScreen warning on first launch ("More info → Run anyway").
- No auto-update — users must manually download new versions.

### Upgrade notes
- Users upgrading from v0.1.1 or v0.1.2 must **uninstall the old version first** (use `scripts/uninstall-agent.ps1` or Windows Settings → Apps).
- After reinstall: sign in with DocuFlow email + password (no pairing code needed).

### Manual test checklist (post-install)
- [ ] App launches and shows login screen
- [ ] Sign in with valid DocuFlow email + password → connected state
- [ ] Select a project in the timer dropdown
- [ ] Select a task (or create one via "+ New task")
- [ ] Start timer → timer counts up
- [ ] Pause / Resume timer
- [ ] Stop timer
- [ ] App minimizes to tray on window close
- [ ] App restores from tray click
- [ ] App restores session after restart (no re-login required)
- [ ] Revoke device from web app → desktop returns to login screen
- [ ] Window is resizable and maximizes to full screen

### GitHub Release description (ready to paste)
```markdown
## DocuFlow Desktop Agent v0.1.3

Windows per-user installer — no admin rights required.

### What's new
- Sign in with your DocuFlow email and password — no pairing codes
- Task support: select tasks from the desktop timer
- Resizable window with proper fullscreen maximize
- Improved session stability: automatic JWT refresh, clean revoke handling

### Installation
1. Download `DocuFlowAgentSetup.exe`
2. If SmartScreen warns: click **More info → Run anyway** (app is not yet code-signed)
3. Follow the setup wizard
4. Sign in with your DocuFlow account credentials

### Upgrading from v0.1.1 / v0.1.2
Uninstall the old version first (Settings → Apps → DocuFlow Agent → Uninstall), then install v0.1.3.

### Requirements
- Windows 10 or 11 (64-bit)
- DocuFlow account

> **Note:** This release connects to the DocuFlow server. The server URL is baked into the installer — no manual configuration needed.
```

---

## v0.1.2 — Archived

| | |
|---|---|
| **Version** | 0.1.2 |
| **Status** | ⚠️ Deprecated — pairing code flow + server URL field (both removed in v0.1.3) |
| **Action** | Delete or archive GitHub Release — do not promote for download |

---

## v0.1.1 — Archived

| | |
|---|---|
| **Version** | 0.1.1 |
| **Status** | ⚠️ Deprecated — same as v0.1.2 |
| **Action** | Delete or archive GitHub Release |

---

## Release Template

For future releases, copy this block:

```markdown
## v{VERSION}

| | |
|---|---|
| **Version** | {VERSION} |
| **Date** | {DATE} |
| **Artifact** | `desktop-agent/release/DocuFlowAgentSetup.exe` |
| **Status** | Built ✅ / RC ✅ / Released ✅ |

### What changed since v{PREV}
-

### Known issues
-

### Manual test checklist
- [ ] Login
- [ ] Timer start/pause/resume/stop
- [ ] Task selection
- [ ] Session restore after restart
- [ ] Tray behavior
- [ ] Window resize / maximize

### GitHub Release description
(paste here)
```
