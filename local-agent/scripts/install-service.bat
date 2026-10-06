@echo off
REM ─────────────────────────────────────────────────────────────────────────────
REM install-service.bat — Medical365 Local Agent Windows Service Installer
REM
REM Uses PM2 or NSSM (Non-Sucking Service Manager) to install Medical365
REM Local Agent as an auto-starting Windows Service with boot recovery.
REM
REM Usage:
REM   Run as Administrator
REM ─────────────────────────────────────────────────────────────────────────────

echo ====================================================
echo    Medical365 Local Agent - Windows Service Setup
echo ====================================================

set CURRENT_DIR=%~dp0..
cd /d "%CURRENT_DIR%"

echo Agent Directory: %CURRENT_DIR%

REM Check Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please install Node.js v18+ from https://nodejs.org
    pause
    exit /b 1
)

REM Check config.json
if not exist "%CURRENT_DIR%\config.json" (
    echo [WARNING] config.json not found. Copying config.example.json...
    copy "%CURRENT_DIR%\config.example.json" "%CURRENT_DIR%\config.json" >nul
    echo Please edit %CURRENT_DIR%\config.json with your hospital installation credentials.
)

REM Check if PM2 is available
where pm2 >nul 2>nul
if %errorlevel% equ 0 (
    echo [INFO] Detected PM2 process manager. Configuring PM2 Windows startup...
    call pm2 start agent.js --name "medical365-agent" --restart-delay=5000
    call pm2 save
    echo [SUCCESS] Medical365 Agent registered with PM2!
    echo To monitor: pm2 status
    echo To view logs: pm2 logs medical365-agent
    pause
    exit /b 0
)

echo [INFO] PM2 not detected. Installing pm2 globally...
call npm install -g pm2
call npm install -g pm2-windows-startup

call pm2 start agent.js --name "medical365-agent" --restart-delay=5000
call pm2-startup install
call pm2 save

echo ====================================================
echo [SUCCESS] Medical365 Local Agent installed as Service!
echo Local Health URL: http://localhost:4000/health
echo ====================================================
pause
