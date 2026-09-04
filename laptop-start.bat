@echo off
REM CompHub auf diesem Rechner einrichten - einfach doppelklicken.
REM
REM Holt sich selbst Administratorrechte (Windows fragt einmal nach) und
REM startet dann das eigentliche Skript. Von Hand ist nichts einzutippen.

setlocal
set "SKRIPT=%~dp0scripts\laptop-einrichten.ps1"

if not exist "%SKRIPT%" (
    echo.
    echo   Nicht gefunden: %SKRIPT%
    echo   Diese Datei muss im Hauptordner von CompHub liegen.
    echo.
    pause
    exit /b 1
)

REM Laeuft das Fenster schon mit Administratorrechten?
net session >nul 2>&1
if %errorlevel%==0 (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%SKRIPT%"
    echo.
    pause
) else (
    echo.
    echo   Windows fragt gleich nach Administratorrechten.
    echo   Sie werden gebraucht, damit CompHub auch ohne Anmeldung startet.
    echo.
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath powershell -Verb RunAs -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-NoExit','-File','%SKRIPT%'"
)

endlocal
