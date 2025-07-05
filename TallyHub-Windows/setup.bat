@echo off
echo.
echo ===============================================
echo    TallyHub Windows Setup Script
echo ===============================================
echo.

echo [1/6] Checking Node.js installation...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js is not installed or not in PATH
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)
echo ✅ Node.js found: 
node --version

echo.
echo [2/6] Checking npm installation...
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: npm is not installed or not in PATH
    pause
    exit /b 1
)
echo ✅ npm found: 
npm --version

echo.
echo [3/6] Installing dependencies...
npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo [4/6] Copying server files...
npm run copy-server
if %errorlevel% neq 0 (
    echo ERROR: Failed to copy server files
    pause
    exit /b 1
)

echo.
echo [5/6] Converting icons for Windows...
npm run convert-icons
if %errorlevel% neq 0 (
    echo ERROR: Failed to convert icons
    pause
    exit /b 1
)

echo.
echo [6/6] Building server...
cd server
npm install
npm run build
if %errorlevel% neq 0 (
    echo ERROR: Failed to build server
    pause
    exit /b 1
)
cd ..

echo.
echo ===============================================
echo    Setup Complete! 
echo ===============================================
echo.
echo You can now start TallyHub with:
echo   npm start
echo.
echo Or run in development mode with:
echo   npm run dev
echo.
pause
