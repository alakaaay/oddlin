@echo off
rem Windows: double-click to start the Oddlin quiz server and open it in the browser.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Download it from https://nodejs.org and run this file again.
  pause
  exit /b 1
)

node server.js --open
pause
