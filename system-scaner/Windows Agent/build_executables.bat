@echo off
REM Build script to create EXE files for Crypto Agent (Windows Only)
REM Requires PyInstaller: pip install pyinstaller

echo ========================================
echo CRYPTO AGENT EXE BUILDER - WINDOWS
echo ========================================
echo.

REM Check if PyInstaller is installed
python -c "import PyInstaller" 2>nul
if errorlevel 1 (
    echo [*] PyInstaller not found. Installing...
    pip install pyinstaller
    if errorlevel 1 (
        echo [!] Failed to install PyInstaller
        pause
        exit /b 1
    )
)

REM Clean previous builds
echo [*] Cleaning previous builds...
if exist "build" rmdir /s /q build
if exist "dist" rmdir /s /q dist
if exist "*.spec" del /q *.spec

echo [*] Creating output directory...
mkdir dist

echo.
echo [*] Building install.exe...
pyinstaller --onefile --uac-admin --name install --icon=NONE --console install.py
if errorlevel 1 (
    echo [!] Failed to build install.exe
    pause
    exit /b 1
)

echo.
echo [*] Building uninstall.exe...
pyinstaller --onefile --uac-admin --name uninstall --icon=NONE --console uninstall.py
if errorlevel 1 (
    echo [!] Failed to build uninstall.exe
    pause
    exit /b 1
)

echo.
echo [*] Building config_editor.exe...
pyinstaller --onefile --uac-admin --name config_editor --icon=NONE --console config_editor.py
if errorlevel 1 (
    echo [!] Failed to build config_editor.exe
    pause
    exit /b 1
)

echo.
echo [*] Copying service files to dist...
copy crypto_agent_service_windows.py dist\
copy windows_audit.py dist\

echo.
echo [*] Creating deployment package...
if not exist "CryptoAgent_Deployment" mkdir CryptoAgent_Deployment
copy dist\install.exe CryptoAgent_Deployment\
copy dist\uninstall.exe CryptoAgent_Deployment\
copy dist\config_editor.exe CryptoAgent_Deployment\
copy dist\crypto_agent_service_windows.py CryptoAgent_Deployment\
copy dist\windows_audit.py CryptoAgent_Deployment\
copy DEPLOYMENT_GUIDE.txt CryptoAgent_Deployment\ 2>nul

echo.
echo ========================================
echo BUILD COMPLETED SUCCESSFULLY!
echo ========================================
echo.
echo Deployment Package Created:
echo   Folder: CryptoAgent_Deployment\
echo.
echo Contents:
echo   [32m✓[0m install.exe
echo   [32m✓[0m uninstall.exe
echo   [32m✓[0m config_editor.exe
echo   [32m✓[0m crypto_agent_service_windows.py
echo   [32m✓[0m windows_audit.py
echo   [32m✓[0m DEPLOYMENT_GUIDE.txt
echo.
echo [33mREADY TO DEPLOY![0m
echo.
echo Next Steps:
echo   1. Copy 'CryptoAgent_Deployment' folder to target Windows machine
echo   2. Right-click install.exe and select "Run as administrator"
echo   3. Follow the prompts
echo.
echo Cleaning up build files...
rmdir /s /q build
del /q *.spec

echo.
echo [32mDone! Your deployment package is ready.[0m
echo.
pause