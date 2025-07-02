@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

:: Terminal colors for Windows
set "BLUE=[94m"
set "GREEN=[92m"
set "RED=[91m"
set "YELLOW=[93m"
set "MAGENTA=[95m"
set "NC=[0m"
set "BOLD=[1m"

:: Print header
echo.
echo %BOLD%%BLUE%┌───────────────────────────────────┐%NC%
echo %BOLD%%BLUE%│         Tally Hub System          │%NC%
echo %BOLD%%BLUE%│            v1.5.3                 │%NC%
echo %BOLD%%BLUE%└───────────────────────────────────┘%NC%
echo.

echo %BOLD%🚀 Starting Tally Hub Server...%NC%

:: Check Node.js
node --version >nul 2>&1
if !errorlevel! neq 0 (
    echo %RED%❌ Node.js not found.%NC%
    echo %YELLOW%Please install from nodejs.org%NC%
    echo.
    pause
    exit /b 1
)

:: Check Node.js version
for /f "tokens=1 delims=v" %%i in ('node --version') do set NODE_VERSION=%%i
for /f "tokens=1 delims=." %%i in ("%NODE_VERSION:v=%") do set NODE_MAJOR=%%i

:: Check if npm is available
npm --version >nul 2>&1
if !errorlevel! neq 0 (
    echo %RED%❌ npm not found.%NC%
    echo %YELLOW%Please install npm%NC%
    echo.
    pause
    exit /b 1
)

:: Check for new firmware updates
echo %BLUE%🔍 Checking firmware versions...%NC%
if exist "public\firmware\M5Stick_Tally\firmware.bin" (
    echo %GREEN%✅ M5Stick Tally firmware: Found%NC%
    echo %BLUE%   Latest update: July 1, 2025 (fixed recording indicator)%NC%
) else (
    echo %YELLOW%⚠️ M5Stick Tally firmware: Missing%NC%
)

if exist "public\firmware\ESP32-1732S019\firmware.bin" (
    echo %GREEN%✅ ESP32-1732S019 firmware: Found%NC%
    echo %BLUE%   Latest update: July 1, 2025%NC%
) else (
    echo %YELLOW%⚠️ ESP32-1732S019 firmware: Missing%NC%
)

if %NODE_MAJOR% lss 16 (
    echo %YELLOW%⚠️  Warning: Node.js version %NODE_VERSION% detected.%NC%
    echo %YELLOW%   Recommended version is 16.x or newer.%NC%
    echo.
)

:: Check for required global packages and install if missing
echo %BLUE%🔍 Checking for required global packages...%NC%

:: Check for TypeScript
npx tsc --version >nul 2>&1
if !errorlevel! neq 0 (
    npm list -g typescript >nul 2>&1
    if !errorlevel! neq 0 (
        echo %YELLOW%⚠️  TypeScript not found globally.%NC%
        set /p "response=%BOLD%Would you like to install TypeScript globally? (y/n) %NC%"
        if /i "!response!"=="y" (
            echo %BLUE%📦 Installing TypeScript globally...%NC%
            npm install -g typescript
            if !errorlevel! neq 0 (
                echo %YELLOW%⚠️  Failed to install TypeScript globally. Will use local version.%NC%
            )
        ) else (
            echo %BLUE%ℹ️  Using local TypeScript from node_modules (if available).%NC%
        )
    )
)

:: Check for ts-node
npx ts-node --version >nul 2>&1
if !errorlevel! neq 0 (
    npm list -g ts-node >nul 2>&1
    if !errorlevel! neq 0 (
        echo %YELLOW%⚠️  ts-node not found globally.%NC%
        set /p "response=%BOLD%Would you like to install ts-node globally? (y/n) %NC%"
        if /i "!response!"=="y" (
            echo %BLUE%📦 Installing ts-node globally...%NC%
            npm install -g ts-node
            if !errorlevel! neq 0 (
                echo %YELLOW%⚠️  Failed to install ts-node globally. Will use local version.%NC%
            )
        ) else (
            echo %BLUE%ℹ️  Using local ts-node from node_modules (if available).%NC%
        )
    )
)

:: Check for nodemon
npx nodemon --version >nul 2>&1
if !errorlevel! neq 0 (
    npm list -g nodemon >nul 2>&1
    if !errorlevel! neq 0 (
        echo %YELLOW%⚠️  nodemon not found globally.%NC%
        set /p "response=%BOLD%Would you like to install nodemon globally? (y/n) %NC%"
        if /i "!response!"=="y" (
            echo %BLUE%📦 Installing nodemon globally...%NC%
            npm install -g nodemon
            if !errorlevel! neq 0 (
                echo %YELLOW%⚠️  Failed to install nodemon globally. Will use local version.%NC%
            )
        ) else (
            echo %BLUE%ℹ️  Using local nodemon from node_modules (if available).%NC%
        )
    )
)

echo %GREEN%✅ Global package check completed.%NC%

:: Check if this is a valid Node.js project
if not exist package.json (
    echo %RED%❌ No package.json found in current directory.%NC%
    echo %YELLOW%This doesn't appear to be a valid Node.js project.%NC%
    
    set /p "response=%BOLD%Would you like to initialize a new Node.js project? (y/n) %NC%"
    if /i "!response!"=="y" (
        echo %BLUE%📦 Initializing new Node.js project...%NC%
        npm init -y
        
        echo %BLUE%📦 Adding TypeScript configuration...%NC%
        npm install --save-dev typescript ts-node nodemon @types/node
        npm install express
        
        echo %BLUE%📦 Creating TypeScript configuration...%NC%
        (
            echo {
            echo   "compilerOptions": {
            echo     "target": "ES2020",
            echo     "module": "commonjs",
            echo     "outDir": "./dist",
            echo     "rootDir": "./src",
            echo     "strict": true,
            echo     "esModuleInterop": true,
            echo     "skipLibCheck": true,
            echo     "forceConsistentCasingInFileNames": true,
            echo     "resolveJsonModule": true
            echo   },
            echo   "include": ["src/**/*"],
            echo   "exclude": ["node_modules", "dist"]
            echo }
        ) > tsconfig.json
        
        if not exist src mkdir src
        if not exist src\index.ts (
            (
                echo import express from 'express';
                echo.
                echo const app = express(^);
                echo const PORT = process.env.PORT ^|^| 3000;
                echo.
                echo app.get('/', (req, res^) =^> {
                echo   res.send('Hello from Tally Hub!'^);
                echo }^);
                echo.
                echo app.listen(PORT, (^) =^> {
                echo   console.log(`Server running on http://localhost:${PORT}`^);
                echo }^);
            ) > src\index.ts
        )
        
        echo %GREEN%✅ Project initialized successfully.%NC%
    ) else (
        echo %RED%❌ Cannot continue without a valid Node.js project.%NC%
        echo.
        pause
        exit /b 1
    )
)

:: Install dependencies if needed
if not exist node_modules (
    echo %BLUE%📦 Installing project dependencies...%NC%
    npm install --no-fund --loglevel=error
    if !errorlevel! neq 0 (
        echo %RED%❌ Failed to install dependencies.%NC%
        echo %YELLOW%Try running 'npm install' manually.%NC%
        echo.
        pause
        exit /b 1
    )
    echo %GREEN%✅ Dependencies installed successfully.%NC%
) else (
    :: Check if package.json has been updated more recently than node_modules
    for %%i in (package.json) do set pkg_time=%%~ti
    for %%i in (node_modules) do set nm_time=%%~ti
    
    :: Simple check - in production, you might want more sophisticated date comparison
    echo %BLUE%📦 Checking for dependency updates...%NC%
    npm install --no-fund --loglevel=error >nul 2>&1
    if !errorlevel! equ 0 (
        echo %GREEN%✅ Dependencies are up to date.%NC%
    )
)

:: Verify critical dependencies are available
echo %BLUE%🔍 Verifying project dependencies...%NC%
set "missing_deps="

:: Check critical dependencies
npm list express >nul 2>&1
if !errorlevel! neq 0 set "missing_deps=!missing_deps! express"

npm list typescript >nul 2>&1
if !errorlevel! neq 0 set "missing_deps=!missing_deps! typescript"

npm list ts-node >nul 2>&1
if !errorlevel! neq 0 set "missing_deps=!missing_deps! ts-node"

npm list nodemon >nul 2>&1
if !errorlevel! neq 0 set "missing_deps=!missing_deps! nodemon"

if not "!missing_deps!"=="" (
    echo %YELLOW%⚠️  Missing dependencies:!missing_deps!%NC%
    echo %BLUE%📦 Installing missing dependencies...%NC%
    npm install
    if !errorlevel! neq 0 (
        echo %RED%❌ Failed to install missing dependencies.%NC%
        echo %YELLOW%Some features may not work correctly.%NC%
    )
)

:: Default port is 3000 for Tally Hub
if "%PORT%"=="" set PORT=3000

:: Check if port is already in use
netstat -an | findstr ":%PORT% " | findstr "LISTENING" >nul 2>&1
if !errorlevel! equ 0 (
    echo %YELLOW%⚠️  Port %PORT% is already in use.%NC%
    echo %YELLOW%   Tally Hub might already be running.%NC%
    
    set /p "response=%BOLD%Would you like to stop the existing process and start a new one? (y/n) %NC%"
    if /i "!response!"=="y" (
        echo %BLUE%🔄 Attempting to stop existing process...%NC%
        :: Kill processes using the port (Windows method)
        for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT% "') do (
            taskkill /PID %%a /F >nul 2>&1
        )
        timeout /t 2 >nul
        echo %GREEN%✅ Process stopped.%NC%
    ) else (
        echo %BLUE%ℹ️  Opening existing server in browser...%NC%
        start http://localhost:%PORT%
        timeout /t 2 >nul
        echo %GREEN%🎉 Done! Window will close automatically.%NC%
        timeout /t 1 >nul
        exit /b 0
    )
)

:: Check if TypeScript needs to be compiled
echo %BLUE%🔧 Checking TypeScript compilation...%NC%
set "DEV_MODE="
if not exist dist (
    set "need_build=1"
) else (
    :: Check if src is newer than dist (simplified check)
    set "need_build=1"
)

if defined need_build (
    echo %BLUE%📦 Building TypeScript...%NC%
    npm run build >nul 2>&1
    if !errorlevel! neq 0 (
        echo %RED%❌ Failed to build TypeScript.%NC%
        echo %YELLOW%Starting in development mode instead...%NC%
        set "DEV_MODE=true"
    ) else (
        echo %GREEN%✅ Build completed successfully.%NC%
    )
)

:: Start server in background with proper logging
echo %BLUE%🌐 Starting server on http://localhost:%PORT%%NC%

:: Create logs directory if it doesn't exist
if not exist logs mkdir logs

:: Get timestamp for log file
for /f "tokens=1-6 delims=:./ " %%a in ("%date% %time%") do (
    set "timestamp=%%c-%%a-%%b_%%d-%%e-%%f"
)

::: Display firmware update notice for M5Stick recording status fix
echo %MAGENTA%ℹ️  Recent firmware updates (July 1, 2025):%NC%
echo %MAGENTA%   - M5Stick: Fixed recording status indicator%NC%
echo %MAGENTA%   - ESP32-1732S019: Updated with latest improvements%NC%
echo.

:: Determine which command to use
if "%DEV_MODE%"=="true" (
    echo %BOLD%🚀 Starting server in development mode...%NC%
    set "LOG_FILE=logs\tally-hub-dev-%timestamp%.log"
    start /b cmd /c "npm run dev > !LOG_FILE! 2>&1"
) else (
    echo %BOLD%🚀 Starting server in production mode...%NC%
    set "LOG_FILE=logs\tally-hub-%timestamp%.log"
    start /b cmd /c "npm start > !LOG_FILE! 2>&1"
)

:: Wait for server to start with progress feedback
echo %BLUE%⏳ Starting server%NC%
set /a "attempts=0"
:wait_loop
set /a "attempts+=1"
echo|set /p="."
timeout /t 1 >nul

:: Check if the server is responding (simplified check for Windows)
ping -n 1 127.0.0.1 >nul 2>&1
if !attempts! geq 20 goto :check_server

goto :wait_loop

:check_server
echo.

:: Simple check to see if something is listening on the port
netstat -an | findstr ":%PORT% " | findstr "LISTENING" >nul 2>&1
if !errorlevel! equ 0 (
    echo %GREEN%✅ Tally Hub is running in background!%NC%
    echo %GREEN%🌐 Web interface: %BOLD%http://localhost:%PORT%%NC%
    echo %BLUE%📄 Log file: %LOG_FILE%%NC%
    echo.
    echo %BOLD%Available interfaces:%NC%
    echo   • Main Dashboard: %BOLD%http://localhost:%PORT%%NC%
    echo   • Admin Panel: %BOLD%http://localhost:%PORT%/admin.html%NC%
    echo   • Tally Display: %BOLD%http://localhost:%PORT%/tally.html%NC%
    echo   • Flash Tool: %BOLD%http://localhost:%PORT%/flash.html%NC%
    echo.
    echo %BOLD%To stop the server:%NC%
    echo   • Use the shutdown button in Settings
    echo   • Or close this window and kill the Node.js process
    
    :: Open browser
    start http://localhost:%PORT%
    
    :: Give browser a moment to open
    timeout /t 2 >nul
    
    echo.
    echo %GREEN%🎉 Launch complete! You can close this window.%NC%
    echo %YELLOW%Press any key to keep this window open, or close it manually.%NC%
    pause >nul
) else (
    echo %RED%❌ Failed to start server%NC%
    echo %YELLOW%Server may have crashed or failed to bind to port %PORT%.%NC%
    echo %BLUE%📄 Check the log file for details: %LOG_FILE%%NC%
    echo.
    
    :: Show last few lines of log file if it exists
    if exist "%LOG_FILE%" (
        echo %BOLD%Last few log entries:%NC%
        echo %YELLOW%-----------------------------------%NC%
        more +0 "%LOG_FILE%" | findstr /E /C:""
        echo %YELLOW%-----------------------------------%NC%
        echo.
    )
    
    pause
    exit /b 1
)
