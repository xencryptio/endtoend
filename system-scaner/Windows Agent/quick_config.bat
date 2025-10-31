@echo off
REM Quick Configuration Update for Crypto Agent
REM Updates config.json with new API URL

echo ========================================
echo CRYPTO AGENT - QUICK CONFIG UPDATE
echo ========================================
echo.

REM Check for admin rights
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo [!] This script requires Administrator privileges
    echo [!] Right-click and select "Run as administrator"
    pause
    exit /b 1
)

set CONFIG_FILE=C:\ProgramData\CryptoAgent\config.json

REM Check if config exists
if not exist "%CONFIG_FILE%" (
    echo [!] Configuration file not found
    echo [!] Crypto Agent may not be installed
    echo [!] Expected: %CONFIG_FILE%
    pause
    exit /b 1
)

REM Display current config
echo Current Configuration:
echo.
type "%CONFIG_FILE%"
echo.
echo ========================================
echo.

REM Get new API URL
set /p NEW_API_URL="Enter new API URL (or press Enter to skip): "

if "%NEW_API_URL%"=="" (
    echo [*] No changes made
    pause
    exit /b 0
)

REM Get new poll interval
set /p NEW_POLL="Enter new poll interval in seconds (or press Enter for 5): "

if "%NEW_POLL%"=="" (
    set NEW_POLL=5
)

REM Create new config
echo [*] Creating new configuration...

(
echo {
echo     "api_base_url": "%NEW_API_URL%",
echo     "poll_interval": %NEW_POLL%,
echo     "log_level": "INFO",
echo     "description": "Crypto Agent Configuration File"
echo }
) > "%CONFIG_FILE%"

echo [+] Configuration updated!
echo.
echo New configuration:
type "%CONFIG_FILE%"
echo.

REM Ask to restart service
set /p RESTART="Restart service to apply changes? (Y/N): "

if /i "%RESTART%"=="Y" (
    echo.
    echo [*] Restarting service...
    sc stop CryptoAgentService >nul 2>&1
    timeout /t 3 /nobreak >nul
    sc start CryptoAgentService
    
    if %errorlevel% equ 0 (
        echo [+] Service restarted successfully!
    ) else (
        echo [!] Failed to restart service
        echo [!] Please restart manually: sc start CryptoAgentService
    )
) else (
    echo.
    echo [!] Remember to restart the service to apply changes:
    echo     sc stop CryptoAgentService
    echo     sc start CryptoAgentService
)

echo.
pause