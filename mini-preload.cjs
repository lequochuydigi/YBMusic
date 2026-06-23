const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onPlayerStateUpdate: (callback) => ipcRenderer.on('player-state-update', (_event, state) => callback(state)),
  sendCommand: (command) => ipcRenderer.send('player-command', command)
});
