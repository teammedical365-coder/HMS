@echo off
REM ─────────────────────────────────────────────────────────────────────────────
REM backup.bat — Local clinic server backup script for Windows
REM
REM Runs on the hospital's local Windows server/PC.
REM Dumps MongoDB and stores backups in .\clinic-data\backups with 7-day retention.
REM
REM Schedule via Windows Task Scheduler:
REM   Action: Start a program
REM   Program/script: C:\path\to\local-agent\scripts\backup.bat
REM   Trigger: Daily at 2:00 AM
REM ─────────────────────────────────────────────────────────────────────────────

setlocal enabledelayedexpansion

set BACKUP_ROOT=%~dp0..\..\clinic-data\backups
if not exist "%BACKUP_ROOT%" mkdir "%BACKUP_ROOT%"

for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set dt=%%I
set TIMESTAMP=%dt:~0,4%%dt:~4,2%%dt:~6,2%_%dt:~8,2%%dt:~10,2%%dt:~12,2%
set DUMP_DIR=%BACKUP_ROOT%\dump_%TIMESTAMP%

echo ====================================================
echo    Medical365 Local MongoDB Backup
echo    Timestamp: %TIMESTAMP%
echo    Target:    %DUMP_DIR%
echo ====================================================

REM Execute mongodump
where mongodump >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] mongodump is not installed or not in system PATH!
    echo Please install MongoDB Database Tools from mongodb.com.
    exit /b 1
)

echo [1/2] Dumping medical365_local database...
mongodump --host 127.0.0.1 --port 27017 --db medical365_local --out "%DUMP_DIR%" --quiet

if %errorlevel% neq 0 (
    echo [ERROR] mongodump execution failed with code %errorlevel%!
    exit /b %errorlevel%
)

echo [2/2] Cleaning up backups older than 7 days...
forfiles /P "%BACKUP_ROOT%" /M dump_* /D -7 /C "cmd /c if @isdir==TRUE rd /s /q @path" 2>nul

echo ====================================================
echo [SUCCESS] Backup complete: %DUMP_DIR%
echo ====================================================
endlocal
