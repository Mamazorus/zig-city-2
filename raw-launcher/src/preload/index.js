const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('launcher', {
  getSession:     () => ipcRenderer.invoke('get-session'),
  login:          () => ipcRenderer.invoke('login'),
  logout:         () => ipcRenderer.invoke('logout'),

  getSkinInfo:    () => ipcRenderer.invoke('get-skin-info'),
  pickSkinFile:   () => ipcRenderer.invoke('pick-skin-file'),
  uploadSkin:     (payload) => ipcRenderer.invoke('upload-skin', payload),
  resetSkin:      () => ipcRenderer.invoke('reset-skin'),

  checkModpack:   () => ipcRenderer.invoke('check-modpack'),
  installModpack: () => ipcRenderer.invoke('install-modpack'),

  launch:         () => ipcRenderer.invoke('launch'),
  getServerStatus: () => ipcRenderer.invoke('get-server-status'),

  onInstallProgress: (cb) => ipcRenderer.on('install-progress',  (_, d) => cb(d)),
  onLaunchProgress:  (cb) => ipcRenderer.on('launch-progress',   (_, d) => cb(d)),
  onGameClosed:      (cb) => ipcRenderer.on('game-closed',       (_, d) => cb(d)),
  onGameLog:         (cb) => ipcRenderer.on('game-log',          (_, d) => cb(d)),

  windowMinimize: () => ipcRenderer.invoke('window-minimize'),
  windowMaximize: () => ipcRenderer.invoke('window-maximize'),
  windowClose:    () => ipcRenderer.invoke('window-close'),
  openExternal:   (url) => ipcRenderer.invoke('open-external', url),

  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  quitAndInstall:  () => ipcRenderer.invoke('quit-and-install'),
  onUpdateStatus:  (cb) => ipcRenderer.on('update-status', (_, d) => cb(d)),

  getPlayersSeen:    () => ipcRenderer.invoke('get-players-seen'),

  getFirebaseStatus: () => ipcRenderer.invoke('get-firebase-status'),
  checkAdmin:        () => ipcRenderer.invoke('check-admin'),
  getNews:           () => ipcRenderer.invoke('get-news'),
  createNews:        (data) => ipcRenderer.invoke('create-news', data),
  updateNews:        (data) => ipcRenderer.invoke('update-news', data),
  deleteNews:        (id) => ipcRenderer.invoke('delete-news', id),
  getAdmins:         () => ipcRenderer.invoke('get-admins'),
  addAdmin:          (username) => ipcRenderer.invoke('add-admin', username),
  removeAdmin:       (username) => ipcRenderer.invoke('remove-admin', username),
})
