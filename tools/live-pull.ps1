# Holt alle 10 Sekunden die neuesten Aenderungen des Vorschau-Zweigs - die Seite im Browser aktualisiert sich dann selbst (Vite).
$ErrorActionPreference = 'SilentlyContinue'
Set-Location (Split-Path -Parent $PSScriptRoot)
Write-Host "CompHub Hub: hole Aenderungen alle 10 Sekunden. Dieses Fenster offen lassen." -ForegroundColor Cyan
while ($true) {
  git fetch -q origin hub-vorschau
  $lokal = git rev-parse HEAD
  $neu = git rev-parse origin/hub-vorschau
  if ($lokal -ne $neu) {
    $alt = git rev-parse HEAD:package.json
    git reset -q --hard origin/hub-vorschau
    Write-Host ((Get-Date -Format 'HH:mm:ss') + '  Neu: ' + (git log -1 --format=%s)) -ForegroundColor Green
    if ((git rev-parse HEAD:package.json) -ne $alt) { Write-Host 'Neue Pakete - installiere ...' -ForegroundColor Yellow; npm install --no-audit --no-fund | Out-Null }
  }
  Start-Sleep -Seconds 10
}
