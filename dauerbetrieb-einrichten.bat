@echo off
REM CompHub rund um die Uhr laufen lassen - einfach doppelklicken.
REM
REM Holt sich selbst Administratorrechte (Windows fragt einmal nach), raeumt
REM haengengebliebene Vorgaenge weg und traegt den Waechter so ein, dass er ab
REM dem Hochfahren laeuft - ohne dass sich jemand anmelden muss.

setlocal
set "SKRIPT=%~dp0scripts\dauerbetrieb-einrichten.ps1"

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
    echo.
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath powershell -Verb RunAs -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-NoExit','-File','%SKRIPT%'"
)

endlocal
