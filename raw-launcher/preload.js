const { contextBridge, ipcRenderer } = require('electron')

// Expose une API propre au renderer (pas d'accès direct à Node)
contextBridge.exposeInMainWorld('launcher', {

  // Auth
  getSession:     () => ipcRenderer.invoke('get-session'),
  login:          () => ipcRenderer.invoke('login'),
  logout:         () => ipcRenderer.invoke('logout'),

  // Modpack
  checkModpack:   () => ipcRenderer.invoke('check-modpack'),
  installModpack: () => ipcRenderer.invoke('install-modpack'),

  // Jeu
  launch:         () => ipcRenderer.invoke('launch'),

  // Events (main → renderer)
  onInstallProgress: (cb) => ipcRenderer.on('install-progress',  (_, d) => cb(d)),
  onLaunchProgress:  (cb) => ipcRenderer.on('launch-progress',   (_, d) => cb(d)),
  onGameClosed:      (cb) => ipcRenderer.on('game-closed',       ()     => cb()),
  onGameLog:         (cb) => ipcRenderer.on('game-log',          (_, d) => cb(d)),
})
