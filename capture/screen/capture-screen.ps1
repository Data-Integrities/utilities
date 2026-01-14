# Baylor MyChart Screen Capture Helper Script (PowerShell)
# This script launches the screen capture server

# Get the directory where this script is located
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Capture current directory
$CurrentDir = Get-Location

# Change to script directory
Set-Location $ScriptDir

# Check for .env file and load it
if (Test-Path .env) {
    Get-Content .env | ForEach-Object {
        if ($_ -match '^([^#][^=]+)=(.*)$') {
            [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
        }
    }
}

# Validate credentials
if (-not $env:MYBSWHEALTH_USERNAME -or -not $env:MYBSWHEALTH_PASSWORD) {
    Write-Host "❌ Error: Missing credentials!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please set environment variables:" -ForegroundColor Yellow
    Write-Host '  $env:MYBSWHEALTH_USERNAME="your-email@example.com"'
    Write-Host '  $env:MYBSWHEALTH_PASSWORD="your-password"'
    Write-Host ""
    Write-Host "Or create a .env file (see .env.example)"
    Set-Location $CurrentDir
    exit 1
}

# Run the capture server
Write-Host "🎯 Starting Baylor Screen Capture Server" -ForegroundColor Cyan
Write-Host "📁 Working directory: $ScriptDir" -ForegroundColor Gray
Write-Host ""

node capture_server.js

# Return to the original directory
Set-Location $CurrentDir
Write-Host ""
Write-Host "✅ Returned to: $CurrentDir" -ForegroundColor Green
