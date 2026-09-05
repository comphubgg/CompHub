@echo off
REM Discord-Bot eintragen - einfach doppelklicken.
REM
REM Die .env.local steht bewusst nicht im Verzeichnis und kommt deshalb nie
REM mit einem Update mit. Wer den Bot-Token auf dem zweiten Rechner braucht,
REM musste ihn bisher von Hand in eine Datei schreiben, die er erst finden
REM muss - und im Ordner liegen mehrere Dateien mit aehnlichem Namen.
REM
REM Diese Datei sucht nichts: sie liegt im Projektordner und schreibt in die
REM .env.local daneben. Der Token wird vorher bei Discord geprueft.
REM
REM Ohne Administratorrechte - hier wird nur eine Textdatei beschrieben.

setlocal
set "SKRIPT=%~dp0scripts\zugang-eintragen.ps1"

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
