const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  sendPlayerState: (state) => ipcRenderer.send('player-state-update', state),
  onPlayerCommand: (callback) => ipcRenderer.on('player-command', (_event, command) => callback(command))
});
