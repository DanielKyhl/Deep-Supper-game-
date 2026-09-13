'use strict';
/* ========================================================================
   The desktop shell. The game itself is the same index.html that runs in a
   browser; this file only gives it a window, a way to go fullscreen and a
   way to quit.
   ======================================================================== */

const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// tests point this at a throwaway folder so every run starts from a clean save
if (process.env.DEEPSUPPER_USER_DATA) {
  app.setPath('userData', process.env.DEEPSUPPER_USER_DATA);
}

// one copy of the game at a time; a second launch just focuses the first
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let win = null;

  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  function createWindow() {
    win = new BrowserWindow({
      width: 1280,
      height: 720,
      useContentSize: true,
      minWidth: 640,
      minHeight: 360,
      backgroundColor: '#07080f',
      title: 'Deep Supper',
      icon: path.join(ROOT, 'build', 'icon.png'),
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
        spellcheck: false
      }
    });

    Menu.setApplicationMenu(null);

    // the game never navigates anywhere; anything that tries is refused
    win.webContents.on('will-navigate', e => e.preventDefault());
    win.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https:\/\//.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });

    win.once('ready-to-show', () => win.show());
    win.on('closed', () => { win = null; });
    win.loadFile(path.join(ROOT, 'index.html'));
  }

  ipcMain.handle('set-fullscreen', (event, on) => {
    const w = BrowserWindow.fromWebContents(event.sender);
    if (w) w.setFullScreen(!!on);
    return w ? w.isFullScreen() : false;
  });

  ipcMain.handle('is-fullscreen', event => {
    const w = BrowserWindow.fromWebContents(event.sender);
    return w ? w.isFullScreen() : false;
  });

  ipcMain.on('quit', () => app.quit());

  app.whenReady().then(createWindow);
  app.on('window-all-closed', () => app.quit());
}
