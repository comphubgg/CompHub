@echo off
REM Twitch und Fortnite-API eintragen - einfach doppelklicken.
REM
REM Die .env.local steht bewusst nicht im Verzeichnis und kommt deshalb nie
REM mit einem Update mit. Neue Schluessel muessen auf jedem Rechner einzeln
REM hinein - und im Ordner liegen mehrere Dateien mit aehnlichem Namen.
REM
REM Diese Datei sucht nichts: sie liegt im Projektordner und schreibt in die
REM .env.local daneben. Jeder Wert wird vorher bei der Gegenstelle geprueft.
REM
REM Ohne Administratorrechte - hier wird nur eine Textdatei beschrieben.

setlocal
set "SKRIPT=%~dp0scripts\schluessel-eintragen.ps1"

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
