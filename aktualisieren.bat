@echo off
REM CompHub auf den neuesten Stand bringen - einfach doppelklicken.
REM
REM Sichert erst die Daten dieses Rechners (data, .env.local, tunnel-zugang),
REM holt dann den neuen Stand aus dem Verzeichnis und legt die Daten wieder
REM zurueck. So kann beim Aktualisieren nichts von dir verlorengehen.

setlocal
set "SKRIPT=%~dp0scripts\aktualisieren.ps1"

if not exist "%SKRIPT%" (
    echo.
    echo   Nicht gefunden: %SKRIPT%
    echo.
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%SKRIPT%"
echo.
pause
endlocal
