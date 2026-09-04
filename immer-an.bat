@echo off
REM Diesen Rechner durchlaufen lassen - einfach doppelklicken.
REM
REM Stellt den Netzbetrieb so ein, dass der Rechner nicht schlafen geht und
REM beim Zuklappen des Deckels weiterlaeuft. Im Akkubetrieb bleibt alles wie
REM bisher. Windows fragt einmal nach Administratorrechten.

setlocal
set "SKRIPT=%~dp0scripts\immer-an.ps1"

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
