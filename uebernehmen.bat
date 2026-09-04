@echo off
REM Diesen Rechner die Domain uebernehmen lassen - einfach doppelklicken.
REM
REM thecomphub.com zeigt danach hierher. Der andere Rechner liefert dann nicht
REM mehr aus; das Skript fragt vorher nach.

setlocal
set "SKRIPT=%~dp0scripts\uebernehmen.ps1"

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
