@echo off
REM Baylor MyChart Screen Capture Helper Script (Windows Command Prompt)
REM This script launches the screen capture server

REM Get the directory where this script is located
set SCRIPT_DIR=%~dp0

REM Capture current directory
set CURRENT_DIR=%CD%

REM Change to script directory
cd /d "%SCRIPT_DIR%"

REM Check for .env file and load it (basic implementation)
if exist .env (
  for /F "tokens=*" %%A in (.env) do set %%A
)

REM Validate credentials
if "%MYBSWHEALTH_USERNAME%"=="" (
  echo Error: Missing MYBSWHEALTH_USERNAME
  echo Please set environment variables or create .env file
  cd /d "%CURRENT_DIR%"
  exit /b 1
)

if "%MYBSWHEALTH_PASSWORD%"=="" (
  echo Error: Missing MYBSWHEALTH_PASSWORD
  echo Please set environment variables or create .env file
  cd /d "%CURRENT_DIR%"
  exit /b 1
)

REM Run the capture server
echo Starting Baylor Screen Capture Server
echo Working directory: %SCRIPT_DIR%
echo.
node capture_server.js

REM Return to the original directory
cd /d "%CURRENT_DIR%"
echo.
echo Returned to: %CURRENT_DIR%
