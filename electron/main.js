'use strict';
/* ========================================================================
   The desktop shell. The game itself is the same index.html that runs in a
   browser; this file only gives it a window, a way to go fullscreen and a
   way to quit.
   ======================================================================== */

const { app, BrowserWindow, ipcMain, Menu, screen, shell } = require('electron');
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

  // no menu bar on Windows. A Mac always has one across the top of the
  // screen, so there it gets the least a Mac app should have: About, Hide,
  // Quit (Cmd+Q), and a Window menu with fullscreen (Ctrl+Cmd+F)
  function appMenu() {
    if (process.platform !== 'darwin') return null;
    return Menu.buildFromTemplate([
      { label: app.name, submenu: [
        { role: 'about' }, { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' },
        { role: 'quit' }
      ] },
      { label: 'Window', submenu: [{ role: 'minimize' }, { role: 'togglefullscreen' }, { role: 'close' }] }
    ]);
  }

  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  // 1280x720, or the largest 16:9 window that fits a smaller screen with room
  // for the title bar, rather than one the system squashes to fit
  function startSize() {
    const area = screen.getPrimaryDisplay().workAreaSize;
    const k = Math.min(1, (area.width - 40) / 1280, (area.height - 80) / 720);
    return { width: Math.max(640, Math.round(1280 * k)), height: Math.max(360, Math.round(720 * k)) };
  }

  function createWindow() {
    win = new BrowserWindow({
      ...startSize(),
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

    Menu.setApplicationMenu(appMenu());

    // tell the page when the window has really gone in or out of fullscreen.
    // On a Mac that animates, ignores a second toggle part-way through, and
    // can be done with the window's own green button
    win.on('enter-full-screen', () => win.webContents.send('fullscreen-changed', true));
    win.on('leave-full-screen', () => win.webContents.send('fullscreen-changed', false));

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
