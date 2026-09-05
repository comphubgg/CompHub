@echo off
REM CompHub auf diesem Rechner anhalten - einfach doppelklicken.
REM
REM Fuer den PC, sobald der Laptop die Seite traegt. Schaltet den Waechter ab
REM und beendet Webserver und Tunnel. Geloescht wird nichts - zurueckholen
REM laesst sich alles mit "dauerbetrieb-einrichten.bat".

setlocal
set "SKRIPT=%~dp0scripts\hier-stoppen.ps1"

if not exist "%SKRIPT%" (
    echo.
    echo   Nicht gefunden: %SKRIPT%
    echo.
    pause
    exit /b 1
)

net session >nul 2>&1
if %errorlevel%==0 (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%SKRIPT%"
    echo.
    pause
) else (
    echo.
    echo   Windows fragt gleich nach Administratorrechten.
    echo   Ohne sie laesst sich der Waechter nicht abschalten.
    echo.
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath powershell -Verb RunAs -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-NoExit','-File','%SKRIPT%'"
)

endlocal
