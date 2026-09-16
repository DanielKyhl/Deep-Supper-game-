'use strict';
/* The only doors between the game page and the machine it runs on. The page
   gets these three calls and nothing else: no Node, no filesystem. */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('native', {
  isApp: true,
  setFullscreen: on => ipcRenderer.invoke('set-fullscreen', !!on),
  isFullscreen: () => ipcRenderer.invoke('is-fullscreen'),
  quit: () => ipcRenderer.send('quit')
});

// the window going in or out of fullscreen (a Mac's green button, or a toggle
// macOS ignored mid-animation) reaches the page as a plain DOM event, so the
// bridge above stays three calls
ipcRenderer.on('fullscreen-changed', (event, on) => {
  window.dispatchEvent(new CustomEvent('nativefullscreenchange', { detail: !!on }));
});
