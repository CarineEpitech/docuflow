# Desktop Auth Roadmap

_Last updated: 2026-03-09 — Sprint S4_

## Current State (Phase 4)

### What's in place

| Component | Status | Notes |
|---|---|---|
| Pairing code flow | ✅ Working | 6-char code, 10-min TTL, one-time use |
| JWT access token | ✅ Working | HMAC-SHA256, 1-hour TTL, in-memory |
| Token refresh via deviceToken | ✅ Working | POST `/api/agent/auth/refresh` with deviceId + raw token |
| Persistent session (JSON file) | ✅ Working | survives restarts — no re-pairing needed |
| Auto-reconnect at startup | ✅ Working | `session.restore.start/success/failed` logs |
| Revoke handling (runtime) | ✅ Working | 401/403 → `onRevoke` → workers stop + session cleared |
| Revoke detection at startup | ✅ Working | ensureAccessToken fires onRevoke if refresh returns 401/403 |
| Revoke UI in renderer | ✅ Working | "Device disconnected" banner replaces pairing subtitle |
| Devices management page | ✅ Working | list, status badge, revoke button |

### How auth works today

```
[User — Web]                    [Desktop Agent]           [Server]
    │                                │                        │
    │  POST /api/agent/pairing/start │                        │
    │──────────────────────────────► │                        │
    │  { pairingCode }               │                        │
    │◄──────────────────────────────  │                        │
    │                                │                        │
    │  User enters code in Desktop   │                        │
    │                                │  POST /pairing/complete│
    │                                │───────────────────────►│
    │                                │  { deviceId,           │
    │                                │    deviceToken,        │  ← persisted to disk
    │                                │    accessToken (1h) }  │  ← in-memory only
    │                                │◄──────────────────────  │
    │                                │                        │
    │         [on every API call]    │                        │
    │                                │  Bearer accessToken    │
    │                                │───────────────────────►│
    │                                │                        │
    │        [token expired]         │                        │
    │                                │  POST /auth/refresh    │
    │                                │  { deviceId, deviceToken }
    │                                │───────────────────────►│
    │                                │  { accessToken (new) } │
    │                                │◄──────────────────────  │
```

---

## What's Missing for Production Auth

### Gap 1 — deviceToken is a raw secret in the JSON file

**Risk:** Anyone with access to `%APPDATA%\DocuFlow Desktop Agent\agent-config.json`
can impersonate the device permanently.

**Mitigation options:**
- Encrypt the file with the OS keychain (Windows Credential Manager / DPAPI)
- Use `keytar` (libsecret / Keychain / DPAPI) — native Electron binding
- Minimum: DPAPI-encrypt the token value before writing to disk

**Priority:** Medium — acceptable for MVP on managed machines, must fix before
multi-tenant production.

---

### Gap 2 — Pairing code is the only enrollment path

**Problem:** Requires a web-authenticated user to generate a code, then manually
copy it to the desktop. Not scalable for fleet deployment.

**Future option A — Browser-based device approval (recommended)**
```
Desktop opens: https://app.docuflow.io/device-approve?deviceId=xxx&challenge=yyy
User logs in (SSO / password) in browser → approves device
Server: marks device as approved, Desktop polls /api/agent/auth/status
Desktop: receives deviceToken, stores it
```
- Pros: no code to copy, standard OAuth device-flow pattern
- Cons: requires browser on the machine, slightly more complex

**Future option B — Direct desktop login**
```
Desktop shows email/password form → POST /api/auth/desktop-login
Server: validates credentials, returns deviceToken + userId
```
- Pros: self-contained, no browser needed
- Cons: password in desktop process memory, harder to support SSO/MFA

**Recommendation:** Option A (browser-based device approval) — mirrors
Google/Microsoft device authorization flow, no passwords handled in Electron.

---

### Gap 3 — No deviceToken rotation

**Problem:** The `deviceToken` never rotates. If it leaks, the attacker has
permanent access until manually revoked.

**Fix:** Rotate the `deviceToken` on each successful `/auth/refresh`. The server
returns a new token; the desktop replaces the stored one. Each token is
single-use.

**Implementation:**
```typescript
// server/agentRoutes.ts
const newRawToken = randomBytes(48).toString("hex");
const newTokenHash = createHash("sha256").update(newRawToken).digest("hex");
await storage.rotateDeviceToken(device.id, newTokenHash);
// return newRawToken in response
```

---

### Gap 4 — No access token revocation list

**Problem:** Revoking a device sets `revokedAt` but existing short-lived JWTs
(up to 1 hour) remain valid until they naturally expire.

**Fix (short term):** Reduce JWT TTL to 5 minutes — refresh is fast and cheap.
**Fix (long term):** Redis-backed JWT blocklist keyed on `jti`, checked in
`isAgentAuthenticated` middleware.

---

## Deprecation Plan for Pairing Code

| Phase | Action |
|---|---|
| **Now (S4)** | Pairing code works; demoted to "fallback" in Devices page UI |
| **Phase 5** | Add browser-based device approval (Option A above) as primary flow |
| **Phase 6** | Pairing code becomes "advanced / manual" only — hidden behind a toggle |
| **Phase 7** | Pairing code removed from public UI; available via CLI only for fleet |

---

## Manual Test Checklist (S4)

### 1. Auto-reconnect after restart
- [ ] Start agent, pair successfully
- [ ] Quit the agent (`Tray → Quit`)
- [ ] Relaunch — verify it goes directly to the connected view (no pairing screen)
- [ ] Check logs for `session.restore.start` → `session.restore.success`

### 2. Token refresh (simulated)
- [ ] Pair the device
- [ ] Wait 1 hour OR temporarily reduce JWT TTL to 30 seconds in `agentRoutes.ts`
- [ ] Trigger any action (start timer / heartbeat)
- [ ] Verify `auth.refresh.success` in agent logs, action succeeds

### 3. Device revoked → desktop cleans up
- [ ] Start agent with running timer + screen capture ON
- [ ] In web UI: Devices → revoke the device
- [ ] Agent should: stop timer locally, stop screen capture, show "Device disconnected" banner
- [ ] Verify no more screenshots or heartbeats reach the server (check server logs)
- [ ] Verify no infinite retry loop

### 4. Devices page — active devices listed
- [ ] At least one device paired and online
- [ ] Page shows: name, OS, version, "Online" badge, last seen < 5 min
- [ ] Revoke button present; confirms before revoking

### 5. Pairing code still works as fallback
- [ ] After revoke, click "Get a pairing code" on Devices page
- [ ] Enter code in Desktop Agent → verify reconnects successfully
- [ ] Session persists through next restart

---

## TODO Before Phase 5

- [ ] `TODO [S4-SEC-1]`: Encrypt `deviceToken` with OS keychain (DPAPI on Windows)
- [ ] `TODO [S4-SEC-2]`: Rotate `deviceToken` on each successful refresh
- [ ] `TODO [S5-AUTH]`: Implement browser-based device approval flow (Option A)
- [ ] `TODO [S5-TTL]`: Reduce JWT TTL from 1h to 5m once rotation is in place
- [ ] `TODO [S6-DEPRECATE]`: Hide pairing code behind advanced toggle
