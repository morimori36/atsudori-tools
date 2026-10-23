@echo off
setlocal
cd /d "%~dp0"
if exist ".cache\bin\npm.cmd" set "PATH=%CD%\.cache\bin;%PATH%"
where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js 24.5 or later and npm are required.
  pause
  exit /b 1
)
if not exist node_modules (
  call npm ci
  if errorlevel 1 exit /b 1
)
call npm run dev
