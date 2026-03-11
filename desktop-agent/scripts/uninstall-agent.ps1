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

Remove-Item "$env:LOCALAPPDATA\docuflow_desktop_agent" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "$env:APPDATA\DocuFlow Agent" -Recurse -Force -ErrorAction SilentlyContinue

$remaining = Get-ChildItem "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall" -ErrorAction SilentlyContinue |
  Where-Object { $_.GetValue("DisplayName") -like "*DocuFlow*" }

if ($remaining) {
  Write-Host "WARNING: registry entries still present"
} else {
  Write-Host "Registry clean."
}
Write-Host "Uninstall complete."
