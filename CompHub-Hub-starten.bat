@echo off
chcp 65001 >nul
title CompHub Hub - Vorschau
echo === CompHub Hub (lokale Vorschau) ===
where git >nul 2>nul || (echo Git fehlt - wird installiert ... & winget install -e --id Git.Git --accept-source-agreements --accept-package-agreements & echo. & echo Bitte dieses Fenster schliessen und die Datei noch einmal starten. & pause & exit /b)
where node >nul 2>nul || (echo Node.js fehlt - wird installiert ... & winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements & echo. & echo Bitte dieses Fenster schliessen und die Datei noch einmal starten. & pause & exit /b)
set ZIEL=%USERPROFILE%\CompHubHub
if not exist "%ZIEL%\.git" git clone --branch hub-vorschau --single-branch https://github.com/comphubgg/CompHub.git "%ZIEL%"
cd /d "%ZIEL%"
git fetch -q origin hub-vorschau & git reset -q --hard origin/hub-vorschau
call npm install --no-audit --no-fund
start "CompHub Hub - Aktualisierung" powershell -NoProfile -ExecutionPolicy Bypass -File "%ZIEL%\tools\live-pull.ps1"
start "" http://localhost:5173
call npm run dev
