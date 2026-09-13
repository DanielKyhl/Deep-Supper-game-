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
