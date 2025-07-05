const { app, BrowserWindow } = require('electron');
const path = require('path');

console.log('Starting test electron app...');

function createWindow() {
  console.log('Creating window...');
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'renderer.html'));
  console.log('Window created and HTML loaded');
}

app.whenReady().then(() => {
  console.log('App ready, creating window...');
  createWindow();
});

app.on('window-all-closed', () => {
  console.log('All windows closed');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

console.log('Test script loaded');
