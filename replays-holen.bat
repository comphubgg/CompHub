@echo off
REM Replays jetzt holen und rechnen - einfach doppelklicken.
REM
REM Normalerweise laeuft das von selbst: stuendlich fuer alles, was in den
REM letzten 48 Stunden zu Ende ging, alle fuenf Minuten fuer einen laufenden
REM Cup, und einmal taeglich ueber die vollen 31 Tage. Dafuer muss der Server
REM aber laufen - er stoesst die Laeufe an.
REM
REM Diese Datei ist fuer den Fall "ich will die Spielerwerte jetzt": sie holt
REM alles Offene der letzten 31 Tage und rechnet danach die Aggregate. Bei
REM einem grossen Cup dauert das einige Minuten; das Fenster bleibt offen,
REM bis es fertig ist.
REM
REM Der Server muss dabei laufen - der Lauf fragt ihn, welche Spieltage es
REM gibt. Er sucht ihn selbst auf den ueblichen Ports.

setlocal
cd /d "%~dp0"

echo.
echo   Replays holen - das kann einige Minuten dauern.
echo.

node scripts\replays-holen.mjs
if errorlevel 1 (
    echo.
    echo   Der Lauf ist fehlgeschlagen - siehe Meldung oben.
    echo.
    pause
    exit /b 1
)

echo.
echo   Jetzt werden die Werte je Spieler gerechnet ...
echo.

node scripts\replays-aggregieren.mjs

echo.
echo   Fertig. Die Spieler-Stats stehen im Werkzeug unter dem Reiter
echo   "Player Stats" des jeweiligen Spieltags.
echo.
pause

endlocal
