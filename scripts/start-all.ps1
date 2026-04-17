# Prabu-Siliwangi Start All Script
# This script starts both the Rust Copy Engine and the Kabayan Telegram Bot.

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $RootDir

Write-Host "===============================================" -ForegroundColor Cyan
Write-Host "  Prabu-Siliwangi - Full Stack Launcher" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check for .env file
if (-not (Test-Path ".env")) {
    Write-Host "⚠️  File .env tidak ditemukan!" -ForegroundColor Yellow
    if (Test-Path "env.template") {
        Copy-Item "env.template" ".env"
        Write-Host "   Created .env from template" -ForegroundColor Yellow
        Write-Host "   Please edit .env and fill in your API keys" -ForegroundColor Cyan
        exit 1
    }
}

Write-Host "✅ Configuration loaded" -ForegroundColor Green
Write-Host ""

# Check Rust installation
Write-Host "Checking Rust..." -ForegroundColor Gray
$rustcVersion = & rustc --version 2>$null
if ($rustcVersion) {
    Write-Host "   $rustcVersion" -ForegroundColor Green
} else {
    Write-Host "   ⚠️  Rust not found. Install from https://rustup.rs" -ForegroundColor Yellow
    Write-Host "   Skipping Rust Copy Engine..." -ForegroundColor Yellow
}

Write-Host ""

# 2. Start Rust Copy Engine in the background
$rustProcess = $null
if ($rustcVersion) {
    Write-Host "🦀 Starting Rust Copy Engine (port 8787)..." -ForegroundColor Magenta

    $rustBinary = "services\rust-copy-engine\target\debug\prabu-copy-engine.exe"
    if (Test-Path $rustBinary) {
        $env:RUST_LOG = "info"
        $rustProcess = Start-Process -FilePath $rustBinary -WorkingDirectory $RootDir -NoNewWindow -PassThru
    } else {
        Write-Host "   Building Rust Copy Engine..." -ForegroundColor Yellow
        $buildResult = cargo build --manifest-path "services/rust-copy-engine/Cargo.toml" 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "   ✅ Build successful" -ForegroundColor Green
            $env:RUST_LOG = "info"
            $rustProcess = Start-Process -FilePath $rustBinary -WorkingDirectory $RootDir -NoNewWindow -PassThru
        } else {
            Write-Host "   ❌ Build failed!" -ForegroundColor Red
            Write-Host $buildResult -ForegroundColor Red
        }
    }

    if ($rustProcess) {
        Write-Host "   ✅ Rust Copy Engine started (PID: $($rustProcess.Id))" -ForegroundColor Green
    }
}

# Wait for Rust to initialize
Start-Sleep -Seconds 2
Write-Host ""

# 3. Start Kabayan Bot (Node.js)
Write-Host "🤖 Starting Kabayan Telegram Bot..." -ForegroundColor Blue
Write-Host ""

try {
    npm run dev
} finally {
    # 4. Cleanup: Kill Rust process when Node.js bot stops
    Write-Host ""
    Write-Host "🛑 Stopping all services..." -ForegroundColor Red
    if ($rustProcess -and -not $rustProcess.HasExited) {
        Stop-Process -Id $rustProcess.Id -Force -ErrorAction SilentlyContinue
        Write-Host "   ✅ Rust Copy Engine stopped" -ForegroundColor Green
    }
    Write-Host "   ✅ Kabayan Bot stopped" -ForegroundColor Green
    Write-Host ""
    Write-Host "Goodbye!" -ForegroundColor Cyan
}
