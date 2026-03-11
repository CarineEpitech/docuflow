# DocuFlow Desktop Agent v0.1.1

## What's new

### Windows installer migrated from Squirrel to MSI (WiX)

The previous installer (`DocuFlowAgentSetup.exe`) used Squirrel.Windows, which caused two blocking issues on many machines:

- **`Update.exe` crash** — .NET error `0xe0434352` on launch
- **`ffmpeg.dll` not found** — corrupted install left by Squirrel

This release replaces it with a proper **MSI installer** built with WiX Toolset.
No more `Update.exe`. No more `.NET` dependency. No more antivirus false positives on the update binary.

---

## Download

| File | Platform |
|------|----------|
| `DocuFlowAgentSetup-0.1.1.msi` | Windows 10/11 x64 |

---

## Install instructions

1. Download `DocuFlowAgentSetup-0.1.1.msi`
2. If SmartScreen blocks it: click **More info** → **Run anyway**
3. Follow the installer — **no admin rights needed**
4. Start Menu → **DocuFlow** → **DocuFlow Agent**

> **If you had a previous version installed:**
> Uninstall it first via Settings → Apps, then delete `C:\Users\<you>\AppData\Local\DocuFlow Agent\` if it remains.

---

## What the MSI does

- Installs to `AppData\Local\` (per-user, no UAC prompt)
- Creates a Start Menu shortcut under **DocuFlow**
- Registers in **Settings → Apps → Installed apps** as *DocuFlow Desktop Agent*
- No auto-updater process — no background `Update.exe`

---

## Known limitations

- **No code signing** — SmartScreen will warn on first launch. Click *More info → Run anyway*.
- **No auto-update** — download the new MSI manually for future releases.

---

## For developers — build from source

```bash
git clone https://github.com/CarineEpitech/docuflow
cd docuflow/desktop-agent
npm install
npm run build        # downloads WiX binaries automatically, then builds the MSI
```

Output: `desktop-agent/out/make/wix/x64/DocuFlowAgentSetup-0.1.1.msi`
