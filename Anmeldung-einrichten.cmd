@echo off
rem Die Anmeldung auf das eigene Supabase-Projekt legen - siehe scripts/anmeldung-einrichten.mjs
cd /d "%~dp0"
node scripts/anmeldung-einrichten.mjs %*
pause
