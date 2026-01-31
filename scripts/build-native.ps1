# Openscreen Native Module Build Script (Windows PowerShell)
#
# Usage:
#   .\scripts\build-native.ps1           # Build Release
#   .\scripts\build-native.ps1 -Debug    # Build Debug

param(
    [switch]$Debug
)

$ErrorActionPreference = "Stop"
$rootDir = Split-Path -Parent $PSScriptRoot
$nativeDir = Join-Path $rootDir "native"

Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host "Openscreen Native Module Builder" -ForegroundColor Cyan
Write-Host "=" * 60 -ForegroundColor Cyan
Write-Host ""
Write-Host "Build mode: $(if ($Debug) { 'Debug' } else { 'Release' })"
Write-Host "Native directory: $nativeDir"
Write-Host ""

# Check Rust
try {
    $rustVersion = rustc --version
    Write-Host "Rust: $rustVersion" -ForegroundColor Green
} catch {
    Write-Host "Error: Rust is not installed!" -ForegroundColor Red
    Write-Host "Please install Rust from https://rustup.rs/" -ForegroundColor Yellow
    exit 1
}

# Check Node.js
try {
    $nodeVersion = node --version
    Write-Host "Node.js: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "Error: Node.js is not installed!" -ForegroundColor Red
    exit 1
}

# Install dependencies
Write-Host ""
Write-Host "Installing dependencies..." -ForegroundColor Yellow
Set-Location $nativeDir
npm install

# Build
Write-Host ""
Write-Host "Building native module..." -ForegroundColor Yellow
Write-Host ""

if ($Debug) {
    npm run build:debug
} else {
    npm run build
}

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "=" * 60 -ForegroundColor Green
    Write-Host "Build completed successfully!" -ForegroundColor Green
    Write-Host "=" * 60 -ForegroundColor Green
    
    # List generated files
    $nodeFiles = Get-ChildItem -Path $nativeDir -Filter "*.node" -File
    $jsFile = Get-ChildItem -Path $nativeDir -Filter "index.js" -File -ErrorAction SilentlyContinue
    $dtsFile = Get-ChildItem -Path $nativeDir -Filter "index.d.ts" -File -ErrorAction SilentlyContinue
    
    Write-Host ""
    Write-Host "Generated files:" -ForegroundColor Cyan
    $nodeFiles | ForEach-Object { Write-Host "  - $($_.Name)" }
    if ($jsFile) { Write-Host "  - index.js" }
    if ($dtsFile) { Write-Host "  - index.d.ts" }
} else {
    Write-Host ""
    Write-Host "Build failed!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Common issues:" -ForegroundColor Yellow
    Write-Host "1. Missing Visual Studio Build Tools"
    Write-Host "   winget install Microsoft.VisualStudio.2022.BuildTools"
    Write-Host ""
    Write-Host "2. Missing FFmpeg (optional)"
    Write-Host "   winget install FFmpeg"
    exit 1
}

Set-Location $rootDir
