#!/bin/zsh
cd "$(dirname "$0")"

# Terminal colors
BLUE='\033[0;34m'
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Helper: Check firmware presence in a directory (prefers firmware-merged.bin, then firmware.bin, then latest *.bin)
check_firmware_dir() {
    local dir="$1"
    local label="$2"
    local file=""

    if [ -f "$dir/firmware-merged.bin" ]; then
        file="$dir/firmware-merged.bin"
    elif [ -f "$dir/firmware.bin" ]; then
        file="$dir/firmware.bin"
    else
        # pick the newest .bin if any exist
        local latest
        latest=$(ls -t "$dir"/*.bin 2>/dev/null | head -n 1)
        if [ -n "$latest" ]; then
            file="$latest"
        fi
    fi

    if [ -n "$file" ]; then
        echo "${GREEN}✅ ${label} firmware: Found${NC}"
        # macOS stat (-f). Fallback to GNU stat (-c) if needed
        FIRMWARE_DATE=$(stat -f "%Sm" -t "%Y-%m-%d" "$file" 2>/dev/null || stat -c "%y" "$file" 2>/dev/null)
        echo "   File: $(basename "$file")"
        echo "   Last updated: $FIRMWARE_DATE"
    else
        echo "${YELLOW}⚠️ ${label} firmware: Missing${NC}"
    fi
}

# Print header
printf "\n${BOLD}${BLUE}┌───────────────────────────────────┐${NC}\n"
printf "${BOLD}${BLUE}│         Tally Hub System          │${NC}\n"
printf "${BOLD}${BLUE}│            v1.5.3                 │${NC}\n"
printf "${BOLD}${BLUE}└───────────────────────────────────┘${NC}\n\n"

echo "${BOLD}🚀 Starting Tally Hub Server...${NC}"

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "${RED}❌ Node.js not found.${NC}"
    echo "${YELLOW}Please install from nodejs.org${NC}"
    echo
    read "?Press Enter to exit..."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d 'v' -f 2)
NODE_MAJOR=$(echo $NODE_VERSION | cut -d '.' -f 1)

# Check if npx is available
if ! command -v npx &> /dev/null; then
    echo "${RED}❌ npx not found.${NC}"
    echo "${YELLOW}Please install npm/npx${NC}"
    echo
    read "?Press Enter to exit..."
    exit 1
fi

if [ $NODE_MAJOR -lt 16 ]; then
    echo "${YELLOW}⚠️  Warning: Node.js version $NODE_VERSION detected.${NC}"
    echo "${YELLOW}   Recommended version is 16.x or newer.${NC}"
    echo
fi

# Check for firmware updates (supports firmware-merged.bin or firmware.bin)
echo "${BLUE}🔍 Checking firmware versions...${NC}"
check_firmware_dir "public/firmware/M5Stick_Tally" "M5Stick Tally"
check_firmware_dir "public/firmware/M5Stick_Tally_Plus2" "M5Stick Tally Plus2"
check_firmware_dir "public/firmware/ESP32-1732S019" "ESP32-1732S019"

# Check for required global packages and install if missing
echo "${BLUE}🔍 Checking for required global packages...${NC}"

# Check for TypeScript
if ! npx tsc --version >/dev/null 2>&1 && ! npm list -g typescript >/dev/null 2>&1; then
    echo "${YELLOW}⚠️  TypeScript not found globally.${NC}"
    read "response?${BOLD}Would you like to install TypeScript globally? (y/n) ${NC}"
    if [[ $response =~ ^([yY][eE][sS]|[yY])$ ]]; then
        echo "${BLUE}📦 Installing TypeScript globally...${NC}"
        npm install -g typescript || {
            echo "${YELLOW}⚠️  Failed to install TypeScript globally. Will use local version.${NC}"
        }
    else
        echo "${BLUE}ℹ️  Using local TypeScript from node_modules (if available).${NC}"
    fi
fi

# Check for ts-node
if ! npx ts-node --version >/dev/null 2>&1 && ! npm list -g ts-node >/dev/null 2>&1; then
    echo "${YELLOW}⚠️  ts-node not found globally.${NC}"
    read "response?${BOLD}Would you like to install ts-node globally? (y/n) ${NC}"
    if [[ $response =~ ^([yY][eE][sS]|[yY])$ ]]; then
        echo "${BLUE}📦 Installing ts-node globally...${NC}"
        npm install -g ts-node || {
            echo "${YELLOW}⚠️  Failed to install ts-node globally. Will use local version.${NC}"
        }
    else
        echo "${BLUE}ℹ️  Using local ts-node from node_modules (if available).${NC}"
    fi
fi

# Check for nodemon (for development mode)
if ! npx nodemon --version >/dev/null 2>&1 && ! npm list -g nodemon >/dev/null 2>&1; then
    echo "${YELLOW}⚠️  nodemon not found globally.${NC}"
    read "response?${BOLD}Would you like to install nodemon globally? (y/n) ${NC}"
    if [[ $response =~ ^([yY][eE][sS]|[yY])$ ]]; then
        echo "${BLUE}📦 Installing nodemon globally...${NC}"
        npm install -g nodemon || {
            echo "${YELLOW}⚠️  Failed to install nodemon globally. Will use local version.${NC}"
        }
    else
        echo "${BLUE}ℹ️  Using local nodemon from node_modules (if available).${NC}"
    fi
fi

echo "${GREEN}✅ Global package check completed.${NC}"

# Check if this is a valid Node.js project
if [ ! -f "package.json" ]; then
    echo "${RED}❌ No package.json found in current directory.${NC}"
    echo "${YELLOW}This doesn't appear to be a valid Node.js project.${NC}"
    
    read "response?${BOLD}Would you like to initialize a new Node.js project? (y/n) ${NC}"
    if [[ $response =~ ^([yY][eE][sS]|[yY])$ ]]; then
        echo "${BLUE}📦 Initializing new Node.js project...${NC}"
        npm init -y
        
        # Add basic TypeScript configuration
        echo "${BLUE}📦 Adding TypeScript configuration...${NC}"
        npm install --save-dev typescript ts-node nodemon @types/node
        npm install express
        
        # Create basic tsconfig.json
        cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
EOF
        
        # Create basic src structure
        mkdir -p src
        if [ ! -f "src/index.ts" ]; then
            cat > src/index.ts << 'EOF'
import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Hello from Tally Hub!');
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
EOF
        fi
        
        echo "${GREEN}✅ Project initialized successfully.${NC}"
    else
        echo "${RED}❌ Cannot continue without a valid Node.js project.${NC}"
        echo
        read "?Press Enter to exit..."
        exit 1
    fi
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "${BLUE}📦 Installing project dependencies...${NC}"
    npm install --no-fund --loglevel=error || {
        echo "${RED}❌ Failed to install dependencies.${NC}"
        echo "${YELLOW}Try running 'npm install' manually.${NC}"
        echo
        read "?Press Enter to exit..."
        exit 1
    }
    echo "${GREEN}✅ Dependencies installed successfully.${NC}"
else
    # Check if package.json has been updated more recently than node_modules
    if [ "package.json" -nt "node_modules" ] || [ "package-lock.json" -nt "node_modules" ]; then
        echo "${BLUE}📦 Package.json updated, reinstalling dependencies...${NC}"
        npm install --no-fund --loglevel=error || {
            echo "${YELLOW}⚠️  Failed to update dependencies. Continuing with existing ones.${NC}"
        }
        echo "${GREEN}✅ Dependencies updated successfully.${NC}"
    fi
fi

# Verify critical dependencies are available
echo "${BLUE}🔍 Verifying project dependencies...${NC}"
MISSING_DEPS=()

# Check for express (main dependency)
if ! npm list express >/dev/null 2>&1; then
    MISSING_DEPS+=("express")
fi

# Check for typescript (dev dependency)
if ! npm list typescript >/dev/null 2>&1; then
    MISSING_DEPS+=("typescript")
fi

# Check for ts-node (dev dependency)
if ! npm list ts-node >/dev/null 2>&1; then
    MISSING_DEPS+=("ts-node")
fi

# Check for nodemon (dev dependency)
if ! npm list nodemon >/dev/null 2>&1; then
    MISSING_DEPS+=("nodemon")
fi

if [ ${#MISSING_DEPS[@]} -gt 0 ]; then
    echo "${YELLOW}⚠️  Missing dependencies: ${MISSING_DEPS[*]}${NC}"
    echo "${BLUE}📦 Installing missing dependencies...${NC}"
    npm install || {
        echo "${RED}❌ Failed to install missing dependencies.${NC}"
        echo "${YELLOW}Some features may not work correctly.${NC}"
    }
fi

# Default port is 3000 for Tally Hub
PORT=${PORT:-3000}

# Check if port is already in use
if lsof -i:$PORT -sTCP:LISTEN >/dev/null 2>&1; then
    echo "${YELLOW}⚠️  Port $PORT is already in use.${NC}"
    echo "${YELLOW}   Tally Hub might already be running.${NC}"
    
    # Ask if user wants to terminate existing process
    echo
    read "response?${BOLD}Would you like to stop the existing process and start a new one? (y/n) ${NC}"
    if [[ $response =~ ^([yY][eE][sS]|[yY])$ ]]; then
        echo "${BLUE}🔄 Stopping existing process...${NC}"
        lsof -i:$PORT -sTCP:LISTEN | awk 'NR>1 {print $2}' | xargs -r kill -9
        sleep 2
        echo "${GREEN}✅ Process stopped.${NC}"
    else
        echo "${BLUE}ℹ️  Opening existing server in browser...${NC}"
        open "http://localhost:$PORT"
        sleep 2
        echo "${GREEN}🎉 Done! Terminal will close automatically.${NC}"
        sleep 1
        osascript -e 'tell application "Terminal" to close (every window whose name contains ".command")' &
        exit 0
    fi
fi

# Check if TypeScript needs to be compiled
echo "${BLUE}🔧 Checking TypeScript compilation...${NC}"
if [ ! -d "dist" ] || [ "src" -nt "dist" ]; then
    echo "${BLUE}📦 Building TypeScript...${NC}"
    npm run build || {
        echo "${RED}❌ Failed to build TypeScript.${NC}"
        echo "${YELLOW}Starting in development mode instead...${NC}"
        DEV_MODE=true
    }
    if [ "$DEV_MODE" != true ]; then
        echo "${GREEN}✅ Build completed successfully.${NC}"
    fi
fi

# Start server in background with proper logging
echo "${BLUE}🌐 Starting server on http://localhost:$PORT${NC}"

# Display firmware update notice for M5Stick recording status fix
echo "${MAGENTA}ℹ️  Recent firmware updates (July 1, 2025):${NC}"
echo "${MAGENTA}   - M5Stick: Fixed recording status indicator${NC}"
echo "${MAGENTA}   - ESP32-1732S019: Updated with latest improvements${NC}"
echo

# Create logs directory if it doesn't exist
mkdir -p logs

# Determine which command to use
if [ "$DEV_MODE" = true ]; then
    echo "${BOLD}🚀 Starting server in development mode...${NC}"
    LOG_FILE="logs/tally-hub-dev-$(date +%Y-%m-%d_%H-%M-%S).log"
    nohup npm run dev > "$LOG_FILE" 2>&1 &
else
    echo "${BOLD}🚀 Starting server in production mode...${NC}"
    LOG_FILE="logs/tally-hub-$(date +%Y-%m-%d_%H-%M-%S).log"
    nohup npm start > "$LOG_FILE" 2>&1 &
fi

SERVER_PID=$!

# Store PID for later reference
echo $SERVER_PID > .server.pid

# Server has been started and is running in the background

# Wait for server to start with progress feedback
echo -n "${BLUE}⏳ Starting server"
for i in {1..20}; do  # Increased to 20 attempts for TypeScript compilation
    echo -n "."
    sleep 0.5
    
    # Check if the server is already responding
    if curl -s http://localhost:$PORT >/dev/null; then
        break
    fi
done
echo " ${NC}"

# Check if server is running
if kill -0 $SERVER_PID 2>/dev/null && curl -s http://localhost:$PORT >/dev/null; then
    echo "${GREEN}✅ Tally Hub is running in background!${NC}"
    echo "${GREEN}🌐 Web interface: ${BOLD}http://localhost:$PORT${NC}"
    echo "${BLUE}📝 Server PID: ${SERVER_PID}${NC}"
    echo "${BLUE}📄 Log file: ${LOG_FILE}${NC}"
    
    # Save PID for possible later use (like shutdown scripts)
    echo $SERVER_PID > .server.pid
    
    echo 
    echo "${BOLD}Available interfaces:${NC}"
    echo "  • Main Dashboard: ${BOLD}http://localhost:$PORT${NC}"
    echo "  • Admin Panel: ${BOLD}http://localhost:$PORT/admin${NC}"
    echo "  • Tally Display: ${BOLD}http://localhost:$PORT/tally${NC}"
    echo "  • Flash Tool: ${BOLD}http://localhost:$PORT/flash.html${NC}"
    echo 
    echo "${BOLD}To stop the server:${NC}"
    echo "  • Use the shutdown button in Settings"
    echo "  • Or run: ${BOLD}kill ${SERVER_PID}${NC}"
    
    # Open browser
    open "http://localhost:$PORT"
    
    # Give browser a moment to open
    sleep 2
    
    echo 
    echo "${GREEN}🎉 Launch complete! Terminal will close automatically.${NC}"
    
    # Close terminal window automatically
    sleep 2
    osascript -e 'tell application "Terminal" to close (every window whose name contains ".command")' &
    else
    echo "${RED}❌ Failed to start server${NC}"
    echo "${YELLOW}Server may have crashed or failed to bind to port $PORT.${NC}"
    echo "${BLUE}📄 Check the log file for details: ${LOG_FILE}${NC}"
    echo
    
    # Show last few lines of log file if it exists
    if [ -f "$LOG_FILE" ]; then
        echo "${BOLD}Last few log entries:${NC}"
        echo "${YELLOW}-----------------------------------${NC}"
        tail -n 10 "$LOG_FILE"
        echo "${YELLOW}-----------------------------------${NC}"
        echo
    fi
    
    read "?Press Enter to exit..."
    exit 1
fi
