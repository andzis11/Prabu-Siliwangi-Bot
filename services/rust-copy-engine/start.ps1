# Start Rust Copy Engine Service
# High-performance copy trading execution layer

param(
    [string]$Mode = "debug"
)

$ErrorActionPreference = "Stop"

$ServiceDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ServiceDir

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  Prabu Rust Copy Engine Launcher" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if .env exists
if (-not (Test-Path ".env")) {
    Write-Host "WARNING: .env file not found. Copy from .env.example" -ForegroundColor Yellow
    Write-Host ""

    if (Test-Path ".env.example") {
        Copy-Item ".env.example" ".env"
        Write-Host "Created .env from .env.example" -ForegroundColor Green
        Write-Host "Please edit .env with your configuration" -ForegroundColor Yellow
        exit 1
    }
}

# Load environment variables
Get-Content ".env" | ForEach-Object {
    if ($_ -match "^([^=]+)=(.*)$") {
        [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2])
    }
}

# Check Rust installation
Write-Host "Checking Rust installation..." -ForegroundColor Gray
$rustcVersion = & rustc --version 2>$null
if (-not $rustcVersion) {
    Write-Host "ERROR: Rust is not installed" -ForegroundColor Red
    Write-Host "Install from: https://rustup.rs" -ForegroundColor Yellow
    exit 1
}
Write-Host "  $rustcVersion" -ForegroundColor Green

# Build or use existing binary
$BinaryPath = "target\debug\prabu-copy-engine.exe"
$ReleasePath = "target\release\prabu-copy-engine.exe"

if ($Mode -eq "release") {
    $BinaryPath = $ReleasePath
    if (-not (Test-Path $BinaryPath)) {
        Write-Host "Building release binary..." -ForegroundColor Yellow
        cargo build --release
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Build failed!" -ForegroundColor Red
            exit 1
        }
    }
} else {
    if (-not (Test-Path $BinaryPath)) {
        Write-Host "Building debug binary..." -ForegroundColor Yellow
        cargo build
        if ($LASTEXITCODE -ne 0) {
            Write-Host "Build failed!" -ForegroundColor Red
            exit 1
        }
    }
}

Write-Host "Starting Rust Copy Engine..." -ForegroundColor Cyan
Write-Host "  API Server: http://127.0.0.1:8787" -ForegroundColor Gray
Write-Host "  WebSocket:  ws://127.0.0.1:8787/ws" -ForegroundColor Gray
Write-Host "  Dashboard:  http://127.0.0.1:8787/dashboard" -ForegroundColor Gray
Write-Host ""

# Set environment for logging
$env:RUST_LOG = "info"

# Start the service
if ($Mode -eq "release") {
    & $BinaryPath
} else {
    & $BinaryPath
}
