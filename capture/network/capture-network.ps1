# Baylor MyChart Network Capture Helper Script (PowerShell)
# This script captures network traffic from MyBSWHealth website

param(
    [Parameter(Mandatory=$true, Position=0)]
    [string]$Endpoint
)

# Get the directory where this script is located
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Capture current directory
$CurrentDir = Get-Location

# Change to script directory
Set-Location $ScriptDir

# Run the capture script with the provided parameter
Write-Host "🎯 Capturing network for endpoint: $Endpoint" -ForegroundColor Cyan
Write-Host "📁 Working directory: $ScriptDir" -ForegroundColor Gray
Write-Host ""

node capture-endpoint.js $Endpoint

# Return to the original directory
Set-Location $CurrentDir
Write-Host ""
Write-Host "✅ Returned to: $CurrentDir" -ForegroundColor Green
