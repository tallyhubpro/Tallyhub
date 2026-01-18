const { app, BrowserWindow, Menu, shell, dialog, ipcMain, Tray, nativeImage, Notification } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow;
let serverProcess;
let tray;
let isQuitting = false;
let isRestarting = false;
let autoLaunchEnabled = false; // Track auto-launch status

// Server configuration
const SERVER_PORT = 3000;
const isDev = process.argv.includes('--dev');

// Track if user has seen tray notification
let hasShownTrayNotification = false;

// Windows-specific settings
const isWindows = process.platform === 'win32';

// Function to toggle auto-launch at login
function toggleAutoLaunch() {
  autoLaunchEnabled = !autoLaunchEnabled;
  
  // Set login item settings based on current state
  app.setLoginItemSettings({
    openAtLogin: autoLaunchEnabled,
    name: 'TallyHub',
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
  // Create the browser window with Windows-optimized settings
  mainWindow = new BrowserWindow({
    width: 900,
    height: 600,
    minWidth: 750,
    minHeight: 500,
    backgroundColor: '#667eea',
    frame: true, // Use standard frame with title bar
    titleBarStyle: 'default', // Use standard title bar
    icon: isWindows ? path.join(__dirname, '../assets/icon.ico') : path.join(__dirname, '../assets/icon.png'),
    show: false, // Don't show until ready
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  // Set the window title
  mainWindow.setTitle('TallyHub - Professional Tally Light Management');

  // Create application menu (Windows-specific)
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
  
  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    console.log('Showing window...');
    mainWindow.show();
    
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  // Handle window closed (hide to tray instead of quit on Windows)
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      
      // Show one-time notification about tray behavior (Windows-specific)
      if (!hasShownTrayNotification && isWindows) {
        hasShownTrayNotification = true;
        
        // Use native notification
        new Notification({
          title: 'TallyHub',
          body: 'App is running in the background. Click the TH icon in the system tray to reopen.',
          silent: true
        }).show();
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
    'TallyHub server files are missing. Please run \"npm run copy-server\" first.'
  );
  app.quit();
}

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Configuration',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.executeJavaScript(`
                window.location.hash = '#new-config';
              `);
            }
          }
        },
        {
          label: 'Open Admin Panel',
          accelerator: 'CmdOrCtrl+A',
          click: () => {
            shell.openExternal(`http://localhost:${SERVER_PORT}/admin`);
          }
        },
        {
          label: 'Open Web Interface',
          accelerator: 'CmdOrCtrl+W',
          click: () => {
            shell.openExternal(`http://localhost:${SERVER_PORT}`);
          }
        },
        { type: 'separator' },
        {
          label: 'Exit',
          accelerator: isWindows ? 'Alt+F4' : 'CmdOrCtrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Server',
      submenu: [
        {
          label: 'Start Server',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.executeJavaScript(`
                if (window.startServer) window.startServer();
              `);
            }
          }
        },
        {
          label: 'Stop Server',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.executeJavaScript(`
                if (window.stopServer) window.stopServer();
              `);
            }
          }
        },
        {
          label: 'Restart Server',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            restartServer();
          }
        }
      ]
    },
    {
      label: 'Tools',
      submenu: [
        {
          label: 'Flash Firmware',
          click: () => {
            shell.openExternal(`http://localhost:${SERVER_PORT}/flash`);
          }
        },
        {
          label: 'Open Logs Folder',
          click: () => {
            const logsPath = path.join(__dirname, '../server/logs');
            shell.openPath(logsPath);
          }
        },
        { type: 'separator' },
        {
          label: 'Toggle Auto-Launch',
          type: 'checkbox',
          checked: autoLaunchEnabled,
          click: () => {
            const newState = toggleAutoLaunch();
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Auto-Launch',
              message: `Auto-launch at startup is now ${newState ? 'enabled' : 'disabled'}`,
              detail: newState ? 
                'TallyHub will automatically start when Windows starts.' :
                'TallyHub will not start automatically with Windows.'
            });
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
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
        },
        { type: 'separator' },
        {
          label: 'Actual Size',
          accelerator: 'CmdOrCtrl+0',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.zoomLevel = 0;
            }
          }
        },
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+Plus',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.zoomLevel += 0.5;
            }
          }
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => {
            if (mainWindow) {
              mainWindow.webContents.zoomLevel -= 0.5;
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Toggle Fullscreen',
          accelerator: 'F11',
          click: () => {
            if (mainWindow) {
              mainWindow.setFullScreen(!mainWindow.isFullScreen());
            }
          }
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About TallyHub',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About TallyHub',
              message: 'TallyHub for Windows',
              detail: `Professional Tally Light Management System
Version 1.0.0

Built with ❤️ by TallyHub Pro
Platform: Windows ${process.arch}
Electron: ${process.versions.electron}
Node.js: ${process.versions.node}`,
              buttons: ['OK']
            });
          }
        },
        {
          label: 'Documentation',
          click: () => {
            shell.openExternal('https://tallyhubpro.github.io/docs/');
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
          label: 'Check for Updates',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Updates',
              message: 'You are using the latest version of TallyHub.',
              detail: 'Automatic updates will be available in future releases.'
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Create system tray
function createSystemTray() {
  console.log('Creating system tray...');
  
  // Create tray icon (Windows-specific)
  let trayIconPath;
  if (isWindows) {
    trayIconPath = path.join(__dirname, '../assets/tray-icon.ico');
    if (!fs.existsSync(trayIconPath)) {
      trayIconPath = path.join(__dirname, '../assets/icon.ico');
    }
  } else {
    trayIconPath = path.join(__dirname, '../assets/tray-icon.png');
  }
  
  console.log(`Tray icon path: ${trayIconPath}`);
  
  try {
    const icon = nativeImage.createFromPath(trayIconPath);
    console.log(`Using tray icon, size: ${JSON.stringify(icon.getSize())}`);
    
    tray = new Tray(icon);
    console.log('System tray created successfully');
    
    // Set tooltip
    tray.setToolTip('TallyHub - Professional Tally Light Management');
    
    // Handle click events
    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.hide();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    });
    
    // Handle double-click (Windows-specific)
    if (isWindows) {
      tray.on('double-click', () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      });
    }
    
    // Create initial context menu
    updateTrayMenu();
    
  } catch (error) {
    console.error('Failed to create system tray:', error);
  }
}

function updateTrayMenu() {
  if (!tray) return;
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'TallyHub',
      enabled: false
    },
    { type: 'separator' },
    {
      label: mainWindow && mainWindow.isVisible() ? 'Hide Window' : 'Show Window',
      click: () => {
        if (mainWindow) {
          if (mainWindow.isVisible()) {
            mainWindow.hide();
          } else {
            mainWindow.show();
            mainWindow.focus();
          }
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Server Status',
      enabled: false
    },
    {
      label: serverProcess ? '● Server Running' : '○ Server Stopped',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Start Server',
      enabled: !serverProcess,
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.executeJavaScript(`
            if (window.startServer) window.startServer();
          `);
        }
      }
    },
    {
      label: 'Stop Server',
      enabled: !!serverProcess,
      click: () => {
        if (mainWindow) {
          mainWindow.webContents.executeJavaScript(`
            if (window.stopServer) window.stopServer();
          `);
        }
      }
    },
    {
      label: 'Restart Server',
      enabled: !!serverProcess,
      click: () => {
        restartServer();
      }
    },
    { type: 'separator' },
    {
      label: 'Open Web Interface',
      click: () => {
        shell.openExternal(`http://localhost:${SERVER_PORT}`);
      }
    },
    {
      label: 'Open Admin Panel',
      click: () => {
        shell.openExternal(`http://localhost:${SERVER_PORT}/admin`);
      }
    },
    { type: 'separator' },
    {
      label: `Auto-Launch: ${autoLaunchEnabled ? 'On' : 'Off'}`,
      click: () => {
        toggleAutoLaunch();
      }
    },
    { type: 'separator' },
    {
      label: 'Quit TallyHub',
      click: () => {
        app.quit();
      }
    }
  ]);
  
  tray.setContextMenu(contextMenu);
}

// Server management functions
function startTallyHubServer() {
  if (serverProcess) {
    console.log('Server is already running');
    return;
  }

  const serverPath = path.join(__dirname, '../server');
  console.log(`Starting TallyHub server...`);
  console.log(`Server directory: ${serverPath}`);
  
  // Check if we're in a packaged app
  const isPackaged = app.isPackaged;
  console.log(`App is packaged: ${isPackaged}`);
  
  const resourcesPath = process.resourcesPath;
  console.log(`Resources path: ${resourcesPath}`);
  
  // Determine the correct server path
  let actualServerPath;
  let serverCommand;
  
  if (isPackaged) {
    // In packaged app, server is in resources
    actualServerPath = path.join(resourcesPath, 'app.asar.unpacked', 'server');
    if (!fs.existsSync(actualServerPath)) {
      actualServerPath = path.join(resourcesPath, 'server');
    }
  } else {
    // In development, use the local server directory
    actualServerPath = serverPath;
  }
  
  console.log(`✅ Server directory exists: ${fs.existsSync(actualServerPath)}`);
  
  // Check for node_modules
  const nodeModulesPath = path.join(actualServerPath, 'node_modules');
  console.log(`✅ Node modules exist: ${fs.existsSync(nodeModulesPath)}`);
  
  // Check for built server
  const builtServerPath = path.join(actualServerPath, 'dist');
  if (fs.existsSync(builtServerPath)) {
    console.log(`✅ Server build exists`);
    serverCommand = 'node dist/index.js';
    console.log(`Using built server: ${serverCommand}`);
  } else {
    console.log(`Using source server: npm start`);
    serverCommand = 'npm start';
  }
  
  // Determine Node executable
  let nodeExecutable = 'node';
  
  // Windows-specific node detection
  if (isWindows) {
    // Try to find node.exe
    const possiblePaths = [
      'node.exe',
      'C:\\Program Files\\nodejs\\node.exe',
      'C:\\Program Files (x86)\\nodejs\\node.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Programs', 'nodejs', 'node.exe')
    ];
    
    for (const nodePath of possiblePaths) {
      try {
        if (fs.existsSync(nodePath)) {
          nodeExecutable = nodePath;
          console.log(`Found Node.js at: ${nodeExecutable}`);
          break;
        }
      } catch (e) {
        // Continue searching
      }
    }
  }
  
  console.log(`Using Node executable: ${nodeExecutable}`);
  
  // Check if node executable exists
  if (isWindows && !nodeExecutable.includes('\\\\') && nodeExecutable !== 'node.exe') {
    console.log(`Node executable exists: ${fs.existsSync(nodeExecutable)}`);
  } else {
    console.log('Node executable exists: checking PATH');
  }
  
  // Set up environment
  const env = {
    ...process.env,
    PORT: SERVER_PORT.toString(),
    NODE_ENV: 'production',
    NODE_PATH: path.join(actualServerPath, 'node_modules')
  };
  
  console.log(`Starting server with env:`, {
    PORT: env.PORT,
    NODE_ENV: env.NODE_ENV,
    NODE_PATH: env.NODE_PATH
  });
  
  try {
    // Windows-specific command handling
    let spawnCmd, spawnArgs;
    
    if (serverCommand.startsWith('node ')) {
      // Quote the node executable path if it contains spaces (Windows)
      spawnCmd = isWindows && nodeExecutable.includes(' ') ? `"${nodeExecutable}"` : nodeExecutable;
      spawnArgs = serverCommand.split(' ').slice(1);
    } else {
      spawnCmd = isWindows ? 'npm.cmd' : 'npm';
      spawnArgs = serverCommand.split(' ').slice(1);
    }
    
    console.log(`Spawning server with command: ${spawnCmd} ${spawnArgs.join(' ')}`);
    console.log(`Working directory: ${actualServerPath}`);
    console.log(`Environment variables:`, env);
    
    serverProcess = spawn(spawnCmd, spawnArgs, {
      cwd: actualServerPath,
      env: env,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
      shell: isWindows // Use shell on Windows
    });
    
    console.log(`✅ Server process spawned with PID: ${serverProcess.pid}`);
    
    // Handle server output
    serverProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        console.log(`[Server] ${output}`);
        if (mainWindow) {
          // Send log via IPC instead of executing JavaScript
          mainWindow.webContents.send('server-log', output, 'info');
        }
      }
    });
    
    serverProcess.stderr.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        console.error(`[Server Error] ${output}`);
        if (mainWindow) {
          // Send error log via IPC instead of executing JavaScript
          mainWindow.webContents.send('server-log', output, 'error');
        }
      }
    });
    
    serverProcess.on('close', (code) => {
      console.log(`Server process exited with code ${code}`);
      serverProcess = null;
      updateTrayMenu();
      
      if (mainWindow && !isRestarting) {
        mainWindow.webContents.executeJavaScript(`
          if (window.onServerStopped) {
            window.onServerStopped(${code});
          }
        `);
      }
    });
    
    serverProcess.on('error', (error) => {
      console.error(`Failed to start server: ${error.message}`);
      serverProcess = null;
      updateTrayMenu();
      
      if (mainWindow) {
        mainWindow.webContents.executeJavaScript(`
          if (window.onServerError) {
            window.onServerError('${error.message.replace(/'/g, "\\'")}');
          }
        `);
      }
    });
    
    // Verify server is still running after a short delay
    setTimeout(() => {
      if (serverProcess && !serverProcess.killed) {
        console.log('✅ Server process still running after 1 second');
      }
    }, 1000);
    
    // Update tray menu
    updateTrayMenu();
    
  } catch (error) {
    console.error(`Error starting server: ${error.message}`);
    if (mainWindow) {
      mainWindow.webContents.executeJavaScript(`
        if (window.onServerError) {
          window.onServerError('${error.message.replace(/'/g, "\\'")}');
        }
      `);
    }
  }
}

function stopTallyHubServer() {
  if (serverProcess) {
    console.log('Stopping TallyHub server...');
    
    if (isWindows) {
      // Windows-specific termination
      spawn('taskkill', ['/pid', serverProcess.pid, '/f', '/t'], { stdio: 'ignore' });
    } else {
      serverProcess.kill('SIGTERM');
    }
    
    serverProcess = null;
    updateTrayMenu();
    console.log('Server stopped');
  }
}

function restartServer() {
  console.log('Restarting server...');
  isRestarting = true;
  
  stopTallyHubServer();
  
  setTimeout(() => {
    startTallyHubServer();
    isRestarting = false;
  }, 2000);
}

// IPC handlers
ipcMain.handle('get-version', () => {
  return app.getVersion();
});

ipcMain.handle('start-server', () => {
  startTallyHubServer();
});

ipcMain.handle('stop-server', () => {
  stopTallyHubServer();
});

ipcMain.handle('restart-server', () => {
  restartServer();
});

ipcMain.handle('get-server-status', () => {
  // Get the actual local IP address
  function getLocalIPAddress() {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    
    // Look for the first non-internal IPv4 address
    for (const name of Object.keys(nets)) {
      for (const net of nets[name]) {
        // Skip internal (i.e. 127.0.0.1) and non-IPv4 addresses
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
    
    // Fallback to localhost if no network interface found
    return '127.0.0.1';
  }
  
  return {
    running: !!serverProcess,
    pid: serverProcess ? serverProcess.pid : null,
    port: SERVER_PORT,
    ip: getLocalIPAddress()
  };
});

// External link handlers
ipcMain.handle('open-external', async (event, url) => {
  shell.openExternal(url);
});

ipcMain.handle('open-in-chrome', async (event, url) => {
  // On Windows, try to open in Chrome specifically
  const { spawn } = require('child_process');
  
  const chromePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe'
  ];
  
  let chromeFound = false;
  for (const chromePath of chromePaths) {
    try {
      if (fs.existsSync(chromePath)) {
        spawn(chromePath, [url], { detached: true, stdio: 'ignore' });
        chromeFound = true;
        break;
      }
    } catch (error) {
      // Continue to next path
    }
  }
  
  if (!chromeFound) {
    // Fallback to default browser
    shell.openExternal(url);
  }
});

// File system handlers
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  return result.filePaths[0];
});

// Notification handler
ipcMain.handle('show-notification', async (event, title, body) => {
  new Notification({
    title: title,
    body: body
  }).show();
});

// Auto-launch handlers
ipcMain.handle('get-auto-launch-status', () => {
  return autoLaunchEnabled;
});

ipcMain.handle('set-auto-launch', (event, enabled) => {
  autoLaunchEnabled = enabled;
  app.setLoginItemSettings({
    openAtLogin: enabled,
    name: 'TallyHub',
    path: app.getPath('exe')
  });
  updateTrayMenu();
  return autoLaunchEnabled;
});

// App event handlers
app.whenReady().then(() => {
  console.log('Electron app ready, starting TallyHub...');
  createWindow();
  createSystemTray();
});

app.on('window-all-closed', () => {
  // On Windows, keep the app running even when all windows are closed
  // The app will run in the system tray
  if (process.platform !== 'darwin') {
    // Don't quit on Windows - let it run in tray
    console.log('All windows closed, running in system tray');
  }
});

app.on('activate', () => {
  // On macOS, re-create window when dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    // On Windows, show the existing window
    if (mainWindow) {
      mainWindow.show();
    }
  }
});

app.on('before-quit', () => {
  console.log('App quitting...');
  isQuitting = true;
  stopTallyHubServer();
});

// Handle app startup
console.log('TallyHub main process loaded');
