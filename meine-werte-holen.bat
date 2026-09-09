@echo off
rem ---------------------------------------------------------------------
rem  Die eigenen Werte aus den Fortnite-Replays holen und hochladen.
rem
rem  Warum das noetig ist: Epic veroeffentlicht zu einem Turniermatch nur
rem  Platz, Eliminierungen, Lebenszeit und Siege. Schaden, Trefferquote und
rem  Material stehen nirgends in Epics Schnittstelle - wohl aber in dem
rem  Replay, das Fortnite auf diesem Rechner zu jedem Match ablegt. Dort
rem  allerdings nur fuer den, der es aufgenommen hat: also fuer dich.
rem
rem  Es wird nichts zu einem fremden Dienst hochgeladen. Gelesen wird der
rem  Replay-Ordner, herausgeloest werden ein paar hundert Byte je Match,
rem  und die gehen in die eigene Ablage.
rem
rem  Die Replays selbst bleiben unangetastet liegen.
rem ---------------------------------------------------------------------

cd /d "%~dp0"

echo.
echo   ==========================================================
echo    CompHub - eigene Werte aus den Replays
echo   ==========================================================
echo.

node scripts\eigene-replays.mjs
if errorlevel 1 goto fehler

echo.
echo   Werte hochladen, damit sie auf der Seite ankommen ...
echo.
node scripts\umzug-supabase.mjs --nur eigene-matches
if errorlevel 1 goto fehler

echo.
echo   Fertig. Die Werte stehen jetzt auf thecomphub.com bei den Matches.
echo.
pause
exit /b 0

:fehler
echo.
echo   Etwas ist schiefgegangen - die Meldung steht darueber.
echo.
pause
exit /b 1
