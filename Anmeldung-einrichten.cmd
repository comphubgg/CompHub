@echo off
rem Die Anmeldung auf das eigene Supabase-Projekt legen - siehe scriptsnmeldung-einrichten.mjs
cd /d "%~dp0"
node scriptsnmeldung-einrichten.mjs %*
pause
