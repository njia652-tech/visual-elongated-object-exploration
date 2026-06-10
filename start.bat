@echo off
echo Starting experiment servers...

start "Vite Dev Server" cmd /k "cd /d %~dp0 && npm run dev"
start "Flask Server" cmd /k "cd /d %~dp0 && python server.py"

timeout /t 3 /nobreak >nul
start "" "http://localhost:5180/view-selection.html"
