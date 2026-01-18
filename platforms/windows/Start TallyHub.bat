@echo off
title TallyHub for Windows

echo.
echo ===============================================
echo    TallyHub - Professional Tally Management
echo    Windows Edition
echo ===============================================
echo.

:: Check if node_modules exists
if not exist "node_modules" (
    echo First time setup required...
    echo Running setup script...
    call setup.bat
    if %errorlevel% neq 0 (
        echo Setup failed. Please check the errors above.
        pause
        exit /b 1
    )
)

:: Check if server files exist
if not exist "server" (
    echo Server files not found. Running copy-server...
    npm run copy-server
)

echo Starting TallyHub...
echo.
echo 🚀 TallyHub will open in a new window
echo 🌐 Web interface will be available at http://localhost:3000
echo 📱 System tray icon will appear in the notification area
echo.
echo To stop TallyHub: Close the main window or right-click the tray icon
echo.

npm start

echo.
echo TallyHub has stopped.
pause
