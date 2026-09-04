@echo off
cd /d C:\Users\jumik\Desktop\streamer-dashboard

start "" cmd /k "npm run dev"

timeout /t 5 /nobreak >nul

start chrome --start-fullscreen http://localhost:3000