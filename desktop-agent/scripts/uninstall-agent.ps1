# Step 1: kill running process FIRST so agent-config.json is not file-locked
Write-Host "Stopping DocuFlow Agent process..."
Get-Process -Name "docuflow-agent" -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 800

# Step 2: remove registry entries
$regPaths = @(
  "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall",
  "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall",
  "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall"
)
foreach ($path in $regPaths) {
  Get-ChildItem $path -ErrorAction SilentlyContinue | Where-Object {
    $_.GetValue("DisplayName") -like "*DocuFlow*"
  } | Remove-Item -Recurse -Force
}

# Step 3: remove all possible data/install directories
# Actual userData (Electron uses package.json "name" field): %APPDATA%\docuflow-desktop-agent
# Legacy paths kept for cleanup of older installs
Remove-Item "$env:APPDATA\docuflow-desktop-agent"        -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$env:LOCALAPPDATA\docuflow-desktop-agent"   -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$env:LOCALAPPDATA\docuflow_desktop_agent"   -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$env:APPDATA\DocuFlow Agent"                -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$env:APPDATA\DocuFlow Desktop Agent"        -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$env:LOCALAPPDATA\DocuFlow Agent"           -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$env:LOCALAPPDATA\DocuFlow Desktop Agent"   -Recurse -Force -ErrorAction SilentlyContinue

$remaining = Get-ChildItem "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall" -ErrorAction SilentlyContinue |
  Where-Object { $_.GetValue("DisplayName") -like "*DocuFlow*" }

if ($remaining) {
  Write-Host "WARNING: registry entries still present"
} else {
  Write-Host "Registry clean."
}
Write-Host "Uninstall complete."
