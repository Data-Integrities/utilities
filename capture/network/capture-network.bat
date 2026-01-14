@echo off
REM Baylor MyChart Network Capture Helper Script (Windows Command Prompt)
REM This script captures network traffic from MyBSWHealth website

REM Check if parameter is provided
if "%~1"=="" (
  echo Error: Please provide an endpoint parameter
  echo.
  echo Usage: capture-network.bat ^<endpoint^>
  echo.
  echo Examples:
  echo   capture-network.bat "GetDetails"
  echo   capture-network.bat "dashboard"
  echo   capture-network.bat "/DT/Clinical/Allergies"
  exit /b 1
)

REM Get the directory where this script is located
set SCRIPT_DIR=%~dp0

REM Capture current directory
set CURRENT_DIR=%CD%

REM Change to script directory
cd /d "%SCRIPT_DIR%"

REM Run the capture script with the provided parameter
echo Capturing network for endpoint: %~1
echo Working directory: %SCRIPT_DIR%
echo.
node capture-endpoint.js %1

REM Return to the original directory
cd /d "%CURRENT_DIR%"
echo.
echo Returned to: %CURRENT_DIR%
