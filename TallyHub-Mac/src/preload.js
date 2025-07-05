const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App info
  getVersion: () => ipcRenderer.invoke('get-version'),
  
  // Server control
  startServer: () => ipcRenderer.invoke('start-server'),
  stopServer: () => ipcRenderer.invoke('stop-server'),
  restartServer: () => ipcRenderer.invoke('restart-server'),
  getServerStatus: () => ipcRenderer.invoke('get-server-status'),
  
  // Event listeners
  onServerStatusChange: (callback) => ipcRenderer.on('server-status-change', callback),
  onServerLog: (callback) => ipcRenderer.on('server-log', callback),
  
  // Remove listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
  
  // Notifications
  showNotification: (title, body) => ipcRenderer.invoke('show-notification', title, body),
  
  // External links
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openInChrome: (url) => ipcRenderer.invoke('open-in-chrome', url),
  
  // File operations
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  
  // System info
  getPlatform: () => process.platform,
  getArch: () => process.arch
});
