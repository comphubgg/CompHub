@echo off
REM Warum stuerzt dieser Rechner ab? - einfach doppelklicken.
REM
REM Sammelt aus dem Ereignisprotokoll alles, was zu einem Absturz gehoert:
REM Bluescreen-Codes, Speicherabbilder, Hardwarefehler, Plattenfehler,
REM Temperatur, zuletzt installierte Treiber - und ob CompHub nach einem
REM Neustart von selbst wieder hochkommt.
REM
REM Es wird nichts geaendert. Am Ende liegt auf dem Desktop die Datei
REM "CompHub-Absturzbericht.txt"; die kann man verschicken.
REM
REM Administratorrechte sind noetig, weil ein Teil der Protokolle sonst
REM verschlossen bleibt - besonders die Hardwaremeldungen.

setlocal
set "SKRIPT=%~dp0scripts\absturz-bericht.ps1"

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
) else (
    echo.
    echo   Windows fragt gleich nach Administratorrechten.
    echo.
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath powershell -Verb RunAs -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-NoExit','-File','%SKRIPT%'"
)

endlocal
