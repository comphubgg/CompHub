@echo off
REM Spielerfotos ins Werkzeug uebernehmen - einfach doppelklicken.
REM
REM Der Nutzer sammelt die Fotos unter dem Profinamen ("XAVI.jpg"). Das
REM Werkzeug fuehrt Spieler ueber die Epic-Konto-Id, und der Turniername ist
REM ein anderer - deshalb ordnet das Skript zu: erst ueber ein gepflegtes
REM Profil, dann ueber die Klarnamen der Szene-Quelle, dann ueber die
REM Turniernamen im eigenen Archiv. Wer nirgends passt, wird nicht kopiert
REM und am Ende benannt. Lieber ein Foto zu wenig als das falsche Gesicht.
REM
REM Auf dem Entwicklungsrechner liegt der Vorrat unter Desktop\players.
REM Auf dem Laptop gibt es diesen Ordner nicht - dort stehen die Bilder
REM schon im Werkzeug (sie kommen mit aktualisieren.bat), und es muss nur
REM die Zuordnung neu geschrieben werden. Beides erledigt diese Datei.
REM
REM Die Zuordnungsdatei data\spielerbilder.json steht nicht im Verzeichnis
REM und geht deshalb nie mit einem Update mit - genau darum dieser Lauf.

setlocal
cd /d "%~dp0"

set "VORRAT=%USERPROFILE%\Desktop\players"
if not exist "%VORRAT%" set "VORRAT=%~dp0public\spielerbilder"

echo.
echo   Fotos aus: %VORRAT%
echo.

node scripts\spielerbilder-uebernehmen.mjs "%VORRAT%"

echo.
echo   Fertig. Neue Fotos erscheinen im Werkzeug unter Statistik.
echo.
pause

endlocal
