import { app, BrowserWindow, Tray, Menu, shell, nativeImage, globalShortcut, ipcMain, screen, dialog } from 'electron';
import path from 'path';
import pkg from 'electron-updater';
const { autoUpdater } = pkg;
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Start the Express server
import { setElectronApp, startServer } from './server.js';
setElectronApp(app);

let tray = null;
let mainWindow = null;
let miniWindow = null;

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  startServer();
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
  });

  app.on('before-quit', () => {
    app.isQuitting = true;
  });

  app.whenReady().then(() => {
    // Check for updates with error handling
    try {
      autoUpdater.on('error', (err) => {
        console.log('Update check failed:', err);
      });
      autoUpdater.checkForUpdatesAndNotify().catch(err => console.log('AutoUpdater caught error:', err));
    } catch (e) {
      console.log('AutoUpdater sync error:', e);
    }

    mainWindow = new BrowserWindow({
      width: 480,
      height: 850,
      autoHideMenuBar: true,
      webPreferences: { 
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.cjs'),
        backgroundThrottling: false // Keep running in background
      }
    });

    // Create Mini Window
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;
    miniWindow = new BrowserWindow({
      width: 320,
      height: 120,
      x: width - 330,
      y: height - 130,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      skipTaskbar: true,
      show: false,
      resizable: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'mini-preload.cjs')
      }
    });
    
    // IPC Routing
    ipcMain.on('player-state-update', (event, state) => {
      if (miniWindow && !miniWindow.isDestroyed()) {
        miniWindow.webContents.send('player-state-update', state);
      }
    });

    ipcMain.on('player-command', (event, command) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('player-command', command);
      }
    });

    // Register Global Media Keys (Keyboard & Stream Deck)
    globalShortcut.register('MediaPlayPause', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.executeJavaScript('if (typeof togglePlay === "function") togglePlay();');
      }
    });

    globalShortcut.register('MediaNextTrack', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.executeJavaScript('if (typeof playNext === "function") playNext();');
      }
    });

    globalShortcut.register('MediaPreviousTrack', () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.executeJavaScript('if (typeof playPrev === "function") playPrev();');
      }
    });

    mainWindow.webContents.session.clearCache().then(() => {
      return mainWindow.webContents.session.clearStorageData({ storages: ['serviceworkers', 'caches'] });
    }).then(() => {
      // The Express server runs on 5173
      mainWindow.loadURL('http://localhost:5173');
      miniWindow.loadURL('http://localhost:5173/mini.html');
    });

    // Handle Renderer crashes (Network switch might crash chromium)
    mainWindow.webContents.on('render-process-gone', (e, details) => {
      console.error('Renderer process gone:', details.reason);
      if (details.reason !== 'clean-exit') mainWindow.reload();
    });

    miniWindow.webContents.on('render-process-gone', (e, details) => {
      console.error('Mini renderer process gone:', details.reason);
      if (details.reason !== 'clean-exit') miniWindow.reload();
    });

    mainWindow.on('close', (event) => {
      if (!app.isQuitting) {
        event.preventDefault();
        if (!mainWindow.isDestroyed()) mainWindow.hide();
      }
      return false;
    });

    miniWindow.on('close', (event) => {
      if (!app.isQuitting) {
        event.preventDefault();
        if (!miniWindow.isDestroyed()) miniWindow.hide();
      }
      return false;
    });

    // Icon cho Khay hệ thống
    const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon);
    tray.setToolTip('YB Music - Youtube Background Music');

    const updateContextMenu = () => {
      const loginSettings = app.getLoginItemSettings();
      const contextMenu = Menu.buildFromTemplate([
        { label: 'Mở cửa sổ nghe nhạc', click: () => mainWindow.show() },
        { label: 'Nghe trên Trình duyệt Web', click: () => shell.openExternal('http://localhost:5173') },
        { type: 'separator' },
        { 
          label: 'Khởi động cùng Windows', 
          type: 'checkbox', 
          checked: loginSettings.openAtLogin,
          click: (item) => {
            app.setLoginItemSettings({ openAtLogin: item.checked });
          }
        },
        { type: 'separator' },
        { label: 'Thoát hoàn toàn', click: () => {
          app.isQuitting = true;
          app.quit();
        }}
      ]);
      tray.setContextMenu(contextMenu);
    };

    updateContextMenu();

    tray.on('click', () => {
      if (mainWindow.isDestroyed() || miniWindow.isDestroyed()) return;
      const isMainVisible = mainWindow.isVisible();
      const isMiniVisible = miniWindow.isVisible();

      if (!isMainVisible && !isMiniVisible) {
        // Both hidden -> Show mini
        miniWindow.show();
      } else if (isMiniVisible) {
        // Mini visible -> Hide mini, show main
        miniWindow.hide();
        mainWindow.show();
        mainWindow.focus();
      } else if (isMainVisible) {
        // Main visible -> Hide main
        mainWindow.hide();
      }
    });
  });
}
