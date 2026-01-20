const { app, BrowserWindow, Menu, shell, dialog, ipcMain, Tray, nativeImage, Notification } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let serverProcess;
let tray;
let isQuitting = false;
let isRestarting = false;
let isStopping = false; // Track user-initiated stop to avoid false error dialog
let pendingRestart = false; // Guard to prevent multiple concurrent restarts
let autoLaunchEnabled = false; // Track auto-launch status

// Server configuration
const SERVER_PORT = 3000;
const isDev = process.argv.includes('--dev');

// Track if user has seen tray notification
let hasShownTrayNotification = false;

// Function to toggle auto-launch at login
function toggleAutoLaunch() {
  autoLaunchEnabled = !autoLaunchEnabled;
  
  // Set login item settings based on current state
  app.setLoginItemSettings({
    openAtLogin: autoLaunchEnabled,
    name: 'Tally Hub',
    path: app.getPath('exe')
  });
  
  // Update tray menu to reflect new state
  updateTrayMenu();
  
  return autoLaunchEnabled;
}

// Check if server files exist
function checkServerFiles() {
  // In development, server is in ../server
  // In production (packaged), server is in app.asar.unpacked/server
  let serverPath = path.join(__dirname, '../server');
  
  // Check if we're running from asar and adjust path
  if (!fs.existsSync(serverPath)) {
    // Try the unpacked asar path
    serverPath = path.join(process.resourcesPath, 'app.asar.unpacked', 'server');
  }
  
  console.log('Checking for server at:', serverPath);
  const exists = fs.existsSync(serverPath) && fs.existsSync(path.join(serverPath, 'src'));
  console.log('Server exists:', exists);
  
  return exists;
}

function createWindow() {
  // Create the browser window with standard title bar
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    minWidth: 750,
    minHeight: 500,
    backgroundColor: '#667eea',
    frame: true, // Use standard frame with title bar
    titleBarStyle: 'default', // Use standard title bar
    trafficLightPosition: { x: 12, y: 12 }, // Position window controls nicely
    icon: path.join(__dirname, '../assets/icon.png'), // Use the icon.png file as app icon
    show: true, // Show window immediately
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  // Set the window title
  mainWindow.setTitle('Tally Hub');

  // Create application menu
  createMenu();

  // Check if server files exist
  console.log('Checking server files...');
  if (!checkServerFiles()) {
    console.log('Server files not found!');
    showServerError();
    return;
  }
  console.log('Server files found!');

  // Start the TallyHub server
  console.log('Starting TallyHub server...');
  startTallyHubServer();

  // Load the renderer HTML file
  console.log('Loading renderer HTML...');
  mainWindow.loadFile(path.join(__dirname, 'renderer.html'));
  console.log('Showing window...');
  mainWindow.show();
  
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Handle window closed (hide to tray instead of quit)
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      
      // Show notification on first hide (macOS)
      if (process.platform === 'darwin') {
        app.dock.hide();
      }
      
      // Show one-time notification about tray behavior
      if (!hasShownTrayNotification) {
        hasShownTrayNotification = true;
        
        // Use native notification if available
        if (process.platform === 'darwin') {
          new Notification('Tally Hub', {
            body: 'App is running in the background. Click the TH icon in the menu bar to reopen.',
            silent: true
          });
        }
      }
      
      // Update tray menu
      updateTrayMenu();
      return false;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Handle navigation
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const parsedUrl = new URL(navigationUrl);
    
    if (parsedUrl.origin !== `http://localhost:${SERVER_PORT}`) {
      event.preventDefault();
      shell.openExternal(navigationUrl);
    }
  });
}

function showServerError() {
  dialog.showErrorBox(
    'Server Files Missing',
    'TallyHub server files are missing. Please run "npm run copy-server" first.'
  );
  app.quit();
}

function createMenu() {
  const template = [
    {
      label: 'TallyHub',
      submenu: [
        {
          label: 'About TallyHub',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About TallyHub',
              message: 'TallyHub',
              detail: `Professional Tally Light Management System\nVersion ${app.getVersion()}\n\nBuilt with ❤️ by TallyHub Pro`,
              icon: path.join(__dirname, '../assets/tally-hub-icon-128.svg')
            });
          }
        },
        { type: 'separator' },
        {
          label: 'Preferences...',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.executeJavaScript(`
                window.location.hash = '#settings';
              `);
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Restart Server',
          click: () => {
            restartServer();
          }
        },
        { type: 'separator' },
        {
          label: 'Quit TallyHub',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'File',
      submenu: [
        {
          label: 'New Device Assignment',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.executeJavaScript(`
                window.location.hash = '#devices';
              `);
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Import Configuration',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openFile'],
              filters: [
                { name: 'JSON Files', extensions: ['json'] },
                { name: 'All Files', extensions: ['*'] }
              ]
            });
            
            if (!result.canceled && result.filePaths.length > 0) {
              // Handle configuration import
              console.log('Import configuration:', result.filePaths[0]);
              // TODO: Implement import functionality
            }
          }
        },
        {
          label: 'Export Configuration',
          click: async () => {
            const result = await dialog.showSaveDialog(mainWindow, {
              filters: [
                { name: 'JSON Files', extensions: ['json'] },
                { name: 'All Files', extensions: ['*'] }
              ],
              defaultPath: 'tallyhub-config.json'
            });
            
            if (!result.canceled) {
              // Handle configuration export
              console.log('Export configuration:', result.filePath);
              // TODO: Implement export functionality
            }
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Dashboard',
          accelerator: 'CmdOrCtrl+1',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.executeJavaScript(`
                window.location.hash = '#dashboard';
              `);
            }
          }
        },
        {
          label: 'Devices',
          accelerator: 'CmdOrCtrl+2',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.executeJavaScript(`
                window.location.hash = '#devices';
              `);
            }
          }
        },
        {
          label: 'Mixer Settings',
          accelerator: 'CmdOrCtrl+3',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.executeJavaScript(`
                window.location.hash = '#mixer';
              `);
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            if (mainWindow) {
              mainWindow.reload();
            }
          }
        },
        {
          label: 'Force Reload',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.reloadIgnoringCache();
            }
          }
        },
        {
          label: 'Toggle Developer Tools',
          accelerator: 'F12',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.toggleDevTools();
            }
          }
        }
      ]
    },
    {
      label: 'Window',
      submenu: [
        {
          label: 'Minimize',
          accelerator: 'CmdOrCtrl+M',
          click: () => {
            if (mainWindow) {
              mainWindow.minimize();
            }
          }
        },
        {
          label: 'Close',
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            if (mainWindow) {
              mainWindow.close();
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Bring All to Front',
          click: () => {
            if (mainWindow) {
              mainWindow.focus();
            }
          }
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click: () => {
            shell.openExternal('https://tallyhubpro.github.io/docs/');
          }
        },
        {
          label: 'GitHub Repository',
          click: () => {
            shell.openExternal('https://github.com/tallyhubpro/Tallyhub');
          }
        },
        {
          label: 'Report Issue',
          click: () => {
            shell.openExternal('https://github.com/tallyhubpro/Tallyhub/issues');
          }
        },
        { type: 'separator' },
        {
          label: 'Background Running',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Background Running',
              message: 'Tally Hub runs in the background',
              detail: 'When you close the window, Tally Hub continues running in the system tray (menu bar). The server keeps running so your tally lights stay connected.\n\n• Click the TH icon in the menu bar to show/hide the window\n• Right-click the icon to access server controls\n• Choose "Quit Tally Hub" from the tray menu to fully exit'
            });
          }
        },
        {
          label: 'Server Status',
          click: () => {
            const status = serverProcess ? 'Running' : 'Stopped';
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Server Status',
              message: `TallyHub Server: ${status}`,
              detail: `Port: ${SERVER_PORT}\\nPID: ${serverProcess ? serverProcess.pid : 'N/A'}`
            });
          }
        },
        {
          label: 'Toggle Auto-Launch',
          type: 'checkbox',
          checked: autoLaunchEnabled,
          click: () => {
            const enabled = toggleAutoLaunch();
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Auto-Launch Toggled',
              message: `Tally Hub will ${enabled ? 'open' : 'not open'} at login.`,
              detail: 'You can change this setting later in the Preferences.',
              buttons: ['OK']
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function startTallyHubServer() {
  console.log('Starting TallyHub server...');
  
  // In packaged app, server files are in app.asar.unpacked
  const isPackaged = app.isPackaged;
  const serverDir = isPackaged 
    ? path.join(process.resourcesPath, 'app.asar.unpacked', 'server')
    : path.join(__dirname, '../server');
    
  console.log(`Server directory: ${serverDir}`);
  console.log(`App is packaged: ${isPackaged}`);
  console.log(`Resources path: ${process.resourcesPath}`);
  
  const distPath = path.join(serverDir, 'dist/index.js');
  const nodeModulesPath = path.join(serverDir, 'node_modules');
  
  // Check if server directory exists
  if (!fs.existsSync(serverDir)) {
    console.error('Server directory not found:', serverDir);
    showServerError();
    return;
  }
  console.log('✅ Server directory exists');
  
  // Check if node_modules exists
  if (!fs.existsSync(nodeModulesPath)) {
    console.error('Node modules not found:', nodeModulesPath);
    showServerError();
    return;
  }
  console.log('✅ Node modules exist');
  
  // For packaged apps, we should have the built server
  if (!fs.existsSync(distPath)) {
    console.error('Server build not found:', distPath);
    showServerError();
    return;
  }
  console.log('✅ Server build exists');
  
  console.log(`Using built server: node dist/index.js`);
  
  // Find Node.js executable
  let nodeExecutable;
  if (isPackaged) {
    // For packaged apps, look for system Node.js installation
    // Common Node.js locations on macOS
    const possibleNodePaths = [
      '/usr/local/bin/node',
      '/opt/homebrew/bin/node',
      '/opt/homebrew/opt/node@20/bin/node',
      '/opt/homebrew/opt/node@18/bin/node',
      '/usr/bin/node'
    ];
    
    nodeExecutable = null;
    for (const nodePath of possibleNodePaths) {
      if (fs.existsSync(nodePath)) {
        nodeExecutable = nodePath;
        console.log(`Found Node.js at: ${nodePath}`);
        break;
      }
    }
    
    // If no Node found in common locations, try 'node' and hope it's in PATH
    if (!nodeExecutable) {
      console.log('Node.js not found in common locations, trying PATH...');
      nodeExecutable = 'node';
    }
  } else {
    // In development, use system node
    nodeExecutable = 'node';
  }
  
  console.log(`Using Node executable: ${nodeExecutable}`);
  console.log(`Electron Node version: ${process.version}`);
  
  // Set up environment with enhanced PATH for macOS
  const serverEnv = {
    ...process.env,
    PORT: SERVER_PORT,
    NODE_ENV: isDev ? 'development' : 'production',
    NODE_PATH: nodeModulesPath
  };
  
  // For packaged apps, ensure PATH includes common Node.js locations
  if (isPackaged) {
    const originalPath = serverEnv.PATH || '';
    const commonNodePaths = [
      '/usr/local/bin',
      '/opt/homebrew/bin',
      '/opt/homebrew/opt/node@18/bin',
      '/opt/homebrew/opt/node@20/bin',
      '/usr/bin',
      '/bin'
    ];
    
    // Add common paths to the beginning of PATH
    const enhancedPath = [...commonNodePaths, ...originalPath.split(':')].join(':');
    serverEnv.PATH = enhancedPath;
    console.log(`Enhanced PATH for packaged app: ${enhancedPath}`);
  }
  
  console.log(`Starting server with env:`, { 
    PORT: serverEnv.PORT, 
    NODE_ENV: serverEnv.NODE_ENV,
    NODE_PATH: serverEnv.NODE_PATH
  });
  
  try {
    const spawnArgs = ['dist/index.js'];
    
    console.log(`Command: ${nodeExecutable} ${spawnArgs.join(' ')}`);
    console.log(`Working directory: ${serverDir}`);
    console.log(`Environment:`, { PORT: serverEnv.PORT, NODE_ENV: serverEnv.NODE_ENV, NODE_PATH: serverEnv.NODE_PATH });
    
    serverProcess = spawn(nodeExecutable, spawnArgs, {
      cwd: serverDir,
      env: serverEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false
    });
    
    console.log(`✅ Server process spawned with PID: ${serverProcess.pid}`);
    
    // Capture any spawn errors
    serverProcess.on('error', (error) => {
      console.error(`❌ Server process spawn error:`, error);
      if (error.code === 'ENOENT') {
        dialog.showErrorBox(
          'Node.js Not Found',
          `TallyHub requires Node.js to be installed.\\n\\nPlease install Node.js from https://nodejs.org/ and try again.\\n\\nError: ${error.message}`
        );
      } else {
        dialog.showErrorBox('Server Spawn Error', `Failed to start server process: ${error.message}`);
      }
    });
    
    // Add immediate error checking
    setTimeout(() => {
      if (serverProcess && !serverProcess.killed) {
        console.log(`✅ Server process still running after 1 second`);
      } else {
        console.error(`❌ Server process died immediately`);
      }
    }, 1000);
    
  } catch (error) {
    console.error('Failed to spawn server process:', error);
    dialog.showErrorBox('Server Error', `Failed to start server: ${error.message}`);
    return;
  }

  let serverReadyEmitted = false;
  let serverErrorOutput = [];
  
  serverProcess.stdout.on('data', (data) => {
    const line = data.toString().trim();
    try {
      if (!app.isQuitting && mainWindow && !mainWindow.isDestroyed()) {
        console.log(`[Server] ${line}`);
        mainWindow.webContents.send('server-log', line);
      }
      if (!serverReadyEmitted && line.includes('Tally Hub server running')) {
        serverReadyEmitted = true;
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('server-ready');
        }
      }
    } catch (_) { /* swallow */ }
  });

  serverProcess.stderr.on('data', (data) => {
    const errorLine = data.toString().trim();
    serverErrorOutput.push(errorLine);
    try {
      if (!app.isQuitting && mainWindow && !mainWindow.isDestroyed()) {
        console.error(`[Server Error] ${errorLine}`);
        mainWindow.webContents.send('server-log', `ERROR: ${errorLine}`);
      }
    } catch (error) {
      // Ignore write errors when app is quitting
    }
  });

  serverProcess.on('close', (code, signal) => {
    try {
      const normalExitCodes = new Set([0, 143]); // 143 = SIGTERM on Unix (Node reports 143 sometimes)
      const wasNormal = normalExitCodes.has(code) || signal === 'SIGTERM';
      const context = isQuitting ? 'app quitting' : isRestarting ? 'restarting' : isStopping ? 'user stop' : 'unexpected';
      console.log(`Server process exited (code=${code}, signal=${signal || 'none'}, context=${context})`);

      if (!isQuitting && !isRestarting && !isStopping && !wasNormal) {
        if (mainWindow && !mainWindow.isDestroyed()) {
          let errorMessage = `TallyHub server stopped unexpectedly (code: ${code}).`;
          if (serverErrorOutput.length > 0) {
            errorMessage += `\\n\\nError output:\\n${serverErrorOutput.slice(-10).join('\\n')}`;
          }
          if (code === 1) {
            errorMessage += '\\n\\nThis usually means Node.js encountered an error starting the server.';
            errorMessage += '\\nPlease ensure Node.js is installed (https://nodejs.org/) and check Console.app for details.';
          }
          dialog.showErrorBox('Server Error', errorMessage);
        }
      } else if (isRestarting) {
        console.log('Server process stopped for restart');
      }
    } catch (error) {
      if (!isQuitting) {
        console.error('Failed to start server:', error);
        if (mainWindow && !mainWindow.isDestroyed()) {
          dialog.showErrorBox(
            'Server Error',
            `Failed to start TallyHub server: ${error.message}`
          );
        }
      }
    }
  });

  // Update tray menu when server starts
  setTimeout(() => updateTrayMenu(), 1000);
}

function stopTallyHubServer() {
  if (serverProcess && !serverProcess.killed) {
    console.log('Stopping TallyHub server...');
    isStopping = true; // mark intentional stop

    try {
      // Try graceful shutdown first
      serverProcess.kill('SIGTERM');

      // Force kill after 3 seconds if it doesn't stop gracefully
      setTimeout(() => {
        if (serverProcess && !serverProcess.killed) {
          console.log('Force killing server process...');
          serverProcess.kill('SIGKILL');
        }
      }, 3000);
    } catch (error) {
      console.log('Error stopping server:', error.message);
    }
    // Don't null serverProcess here; allow close handler to run
  }
}

function restartServer() {
  if (pendingRestart) {
    console.log('Restart already in progress – ignoring duplicate request');
    return;
  }
  console.log('Restarting TallyHub server (improved sequence)...');
  pendingRestart = true;
  isRestarting = true;

  const startAfterStop = () => {
    try {
      console.log('Starting server after clean shutdown...');
      startTallyHubServer();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('server-status-change', { status: 'running' });
      }
    } finally {
      isRestarting = false;
      pendingRestart = false;
    }
  };

  if (!serverProcess || serverProcess.killed) {
    console.log('No existing server process; starting fresh.');
    startAfterStop();
    return;
  }

  // Attach one-time listener BEFORE sending kill to ensure capture even if exit is immediate
  const restartTimeout = setTimeout(() => {
    console.warn('Server did not exit within expected timeout; forcing start anyway');
    startAfterStop();
  }, 5000);

  serverProcess.once('close', (code, signal) => {
    clearTimeout(restartTimeout);
    console.log(`Previous server closed (code=${code}, signal=${signal}); proceeding with restart`);
    startAfterStop();
  });

  // Initiate graceful stop
  stopTallyHubServer();

  // Notify renderer that restart is underway
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('server-status-change', { status: 'restarting' });
  }
}

// IPC handlers
ipcMain.handle('get-version', () => {
  return app.getVersion();
});

ipcMain.handle('restart-server', () => {
  restartServer();
});

ipcMain.handle('start-server', () => {
  startTallyHubServer();
  return { success: true };
});

ipcMain.handle('stop-server', () => {
  stopTallyHubServer();
  return { success: true };
});

ipcMain.handle('get-server-status', () => {
  // Get IP addresses
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  let ipAddress = '127.0.0.1'; // Default to localhost
  
  // Find a suitable IP address (prefer IPv4)
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip over internal and non-IPv4 addresses
      if (!net.internal && net.family === 'IPv4') {
        ipAddress = net.address;
        break;
      }
    }
  }
  
  return { 
    status: serverProcess && !serverProcess.killed ? 'running' : 'stopped',
    port: SERVER_PORT,
    pid: serverProcess && !serverProcess.killed ? serverProcess.pid : null,
    ip: ipAddress
  };
});

// Additional IPC handlers for renderer communication
ipcMain.handle('open-external', async (event, url) => {
  shell.openExternal(url);
});

ipcMain.handle('open-in-chrome', async (event, url) => {
  const { spawn } = require('child_process');
  
  // Try to open in Google Chrome
  const chromePaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium'
  ];
  
  let chromeFound = false;
  
  for (const chromePath of chromePaths) {
    if (fs.existsSync(chromePath)) {
      try {
        spawn(chromePath, [url], { detached: true, stdio: 'ignore' });
        chromeFound = true;
        console.log(`Opened ${url} in Chrome`);
        break;
      } catch (error) {
        console.error(`Failed to open Chrome at ${chromePath}:`, error);
      }
    }
  }
  
  if (!chromeFound) {
    // Fallback to default browser if Chrome not found
    console.log('Chrome not found, falling back to default browser');
    shell.openExternal(url);
  }
});

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result;
});

ipcMain.handle('show-notification', async (event, title, body) => {
  new Notification({ title, body }).show();
});

// Auto-launch IPC handlers
ipcMain.handle('get-auto-launch-status', () => {
  return autoLaunchEnabled;
});

ipcMain.handle('set-auto-launch', (event, enabled) => {
  if (typeof enabled === 'boolean' && enabled !== autoLaunchEnabled) {
    toggleAutoLaunch();
  }
  return autoLaunchEnabled;
});

// Set the application name properly
app.setName('Tally Hub');

// App event handlers
app.whenReady().then(() => {
  console.log('App is ready, creating window...');
  
  // Check if app is configured to launch at login
  const loginSettings = app.getLoginItemSettings();
  autoLaunchEnabled = loginSettings.openAtLogin;
  console.log('Auto launch at login:', autoLaunchEnabled ? 'enabled' : 'disabled');
  
  // Create system tray
  createTray();
  
  // Create main window
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      showMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Don't quit the app when all windows are closed - keep running in tray
  // Only quit if explicitly requested via isQuitting flag
  if (isQuitting) {
    stopTallyHubServer();
    if (process.platform !== 'darwin') {
      app.quit();
    }
  }
});

app.on('before-quit', (event) => {
  console.log('Application is quitting...');
  isQuitting = true;
  
  // Destroy tray
  if (tray) {
    tray.destroy();
    tray = null;
  }
  
  stopTallyHubServer();
});

app.on('will-quit', (event) => {
  console.log('Application will quit...');
  isQuitting = true;
  if (serverProcess && !serverProcess.killed) {
    event.preventDefault();
    stopTallyHubServer();
    setTimeout(() => {
      app.quit();
    }, 1000);
  }
});

// Prevent multiple instances
console.log('Requesting single instance lock...');
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  console.log('Another instance is already running. Quitting...');
  app.quit();
} else {
  console.log('Got single instance lock!');
  app.on('second-instance', () => {
    // Someone tried to run a second instance, focus our window instead
    console.log('Second instance attempted, focusing existing window...');
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

// Handle protocol for deep linking (optional)
app.setAsDefaultProtocolClient('tallyhub');

function createTray() {
  console.log('Creating system tray...');
  
  // Load the tray icon from the new TallyHub PNG files (converted from SVG)
  const trayIconPNGPath = path.join(__dirname, '../assets/tray-icon.png');
  console.log('Tray icon PNG path:', trayIconPNGPath);
  
  let trayIcon;
  if (fs.existsSync(trayIconPNGPath)) {
    console.log('Using TallyHub PNG tray icon');
    // Use the PNG file (converted from our SVG)
    trayIcon = nativeImage.createFromPath(trayIconPNGPath);
    // Resize for proper tray display
    trayIcon = trayIcon.resize({ width: 16, height: 16 });
  } else {
    console.log('TallyHub PNG tray icon not found, trying SVG conversion');
    // Fallback: try to load and convert SVG
    const trayIconSVGPath = path.join(__dirname, '../assets/tally-hub-icon-128.svg');
    if (fs.existsSync(trayIconSVGPath)) {
      console.log('Converting TallyHub SVG to tray icon');
      // Read the SVG file and convert to data URL
      const svgContent = fs.readFileSync(trayIconSVGPath, 'utf8');
      const iconDataURL = `data:image/svg+xml;base64,${Buffer.from(svgContent).toString('base64')}`;
      trayIcon = nativeImage.createFromDataURL(iconDataURL);
      trayIcon = trayIcon.resize({ width: 16, height: 16 });
    } else {
      console.log('No TallyHub icons found, using programmatic fallback');
      // Final fallback to simple programmatic icon
      const iconSVG = `
        <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
          <circle cx="8" cy="8" r="7" fill="#ffffff"/>
          <circle cx="8" cy="8" r="6" fill="#ff0000"/>
          <text x="8" y="11" text-anchor="middle" fill="white" font-family="system-ui" font-size="8" font-weight="bold">T</text>
        </svg>
      `;
      const iconDataURL = `data:image/svg+xml;base64,${Buffer.from(iconSVG).toString('base64')}`;
      trayIcon = nativeImage.createFromDataURL(iconDataURL);
      trayIcon = trayIcon.resize({ width: 16, height: 16 });
    }
  }
  
  console.log('Tray icon created, size:', trayIcon.getSize());
  
  // Don't set as template image - we want to keep the original colors
  // trayIcon.setTemplateImage(true); // Removed - this makes icons monochrome
  
  tray = new Tray(trayIcon);
  console.log('System tray created successfully');
  
  // Set tray tooltip
  tray.setToolTip('Tally Hub - Professional Tally System');
  
  // Create context menu
  updateTrayMenu();
  
  // Handle tray icon click (show context menu instead of window)
  tray.on('click', () => {
    console.log('Tray icon clicked');
    // Show the context menu instead of the window
    tray.popUpContextMenu();
  });
  
  // Handle right-click (show context menu on Windows/Linux)
  tray.on('right-click', () => {
    console.log('Tray icon right-clicked');
    tray.popUpContextMenu();
  });
}

function updateTrayMenu() {
  if (!tray) return;
  
  const serverRunning = serverProcess && !serverProcess.killed;
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Tally Hub',
      enabled: false
    },
    { type: 'separator' },
    {
      label: serverRunning ? '● Server Running' : '○ Server Stopped',
      enabled: false
    },
    {
      label: serverRunning ? 'Stop Server' : 'Start Server',
      click: () => {
        if (serverRunning) {
          stopTallyHubServer();
        } else {
          startTallyHubServer();
        }
        // Update menu after a short delay
        setTimeout(updateTrayMenu, 500);
      }
    },
    {
      label: 'Restart Server',
      enabled: serverRunning,
      click: () => {
        restartServer();
        setTimeout(updateTrayMenu, 500);
      }
    },
    { type: 'separator' },
    {
      label: 'Open Web Interface',
      enabled: serverRunning,
      click: () => shell.openExternal(`http://localhost:${SERVER_PORT}`)
    },
    {
      label: 'Open Admin Panel',
      enabled: serverRunning,
      click: () => shell.openExternal(`http://localhost:${SERVER_PORT}/admin`)
    },
    { type: 'separator' },
    {
      label: 'Show Window',
      click: () => {
        if (!mainWindow) {
          createWindow();
        } else {
          showMainWindow();
        }
        setTimeout(updateTrayMenu, 100);
      }
    },
    { type: 'separator' },
    {
      label: autoLaunchEnabled ? 'Disable Auto-launch at Login ✓' : 'Enable Auto-launch at Login',
      click: () => {
        const isEnabled = toggleAutoLaunch();
        if (mainWindow && !mainWindow.isDestroyed()) {
          const notification = isEnabled ? 'Tally Hub will launch automatically at login' : 'Auto-launch at login disabled';
          mainWindow.webContents.send('server-log', notification);
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit Tally Hub',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setContextMenu(contextMenu);
}

function showMainWindow() {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    
    // Show dock icon on macOS when window becomes visible
    if (process.platform === 'darwin' && app.dock) {
      app.dock.show();
      
      // Set custom dock icon to match window icon
      const dockIconPath = path.join(__dirname, '../assets/icon.png');
      if (fs.existsSync(dockIconPath)) {
        const dockIcon = nativeImage.createFromPath(dockIconPath);
        app.dock.setIcon(dockIcon);
      }
    }
    
    mainWindow.show();
    mainWindow.focus();
    
    // Ensure window is brought to foreground on macOS
    if (process.platform === 'darwin') {
      app.focus({ steal: true });
    }
  }
  // Removed the else clause to prevent creating duplicate windows
}
