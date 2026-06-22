const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('launcher', {
  getSession:     () => ipcRenderer.invoke('get-session'),
  login:          () => ipcRenderer.invoke('login'),
  logout:         () => ipcRenderer.invoke('logout'),

  getSkinInfo:    () => ipcRenderer.invoke('get-skin-info'),
  pickSkinFile:   () => ipcRenderer.invoke('pick-skin-file'),
  uploadSkin:     (payload) => ipcRenderer.invoke('upload-skin', payload),
  resetSkin:      () => ipcRenderer.invoke('reset-skin'),
  exportSkin:     (payload) => ipcRenderer.invoke('export-skin', payload),
  libraryList:    () => ipcRenderer.invoke('library-list'),
  librarySave:    (payload) => ipcRenderer.invoke('library-save', payload),
  libraryDelete:  (id) => ipcRenderer.invoke('library-delete', id),
  libraryRename:  (payload) => ipcRenderer.invoke('library-rename', payload),

  checkModpack:   () => ipcRenderer.invoke('check-modpack'),
  installModpack: () => ipcRenderer.invoke('install-modpack'),

  launch:         () => ipcRenderer.invoke('launch'),
  getServerStatus: () => ipcRenderer.invoke('get-server-status'),

  getSettings:    () => ipcRenderer.invoke('get-settings'),
  setSettings:    (payload) => ipcRenderer.invoke('set-settings', payload),

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
  addPlayersSeen:    (names) => ipcRenderer.invoke('add-players-seen', names),
  removePlayerSeen:  (name) => ipcRenderer.invoke('remove-player-seen', name),
  fetchImage:        (url) => ipcRenderer.invoke('fetch-image', url),

  getFirebaseStatus: () => ipcRenderer.invoke('get-firebase-status'),
  checkAdmin:        () => ipcRenderer.invoke('check-admin'),
  getNews:           () => ipcRenderer.invoke('get-news'),
  getStats:          () => ipcRenderer.invoke('get-stats'),
  createNews:        (data) => ipcRenderer.invoke('create-news', data),
  updateNews:        (data) => ipcRenderer.invoke('update-news', data),
  deleteNews:        (id) => ipcRenderer.invoke('delete-news', id),
  // Image de news : upload d'un fichier vers Firebase Storage → URL permanente
  // (≠ liens Discord qui expirent). Sélection/glisser-déposer/collage côté renderer.
  uploadNewsImage:   (data) => ipcRenderer.invoke('news-upload-media', data),
  getAdmins:         () => ipcRenderer.invoke('get-admins'),
  addAdmin:          (username) => ipcRenderer.invoke('add-admin', username),
  removeAdmin:       (username) => ipcRenderer.invoke('remove-admin', username),

  // ── Chat (salons type Discord) ──
  chatGetChannels:    () => ipcRenderer.invoke('chat-get-channels'),
  chatCreateChannel:  (data) => ipcRenderer.invoke('chat-create-channel', data),
  chatUpdateChannel:  (data) => ipcRenderer.invoke('chat-update-channel', data),
  chatDeleteChannel:  (id) => ipcRenderer.invoke('chat-delete-channel', id),
  chatSendMessage:    (data) => ipcRenderer.invoke('chat-send-message', data),
  chatDeleteMessage:  (data) => ipcRenderer.invoke('chat-delete-message', data),
  chatPickMedia:      () => ipcRenderer.invoke('chat-pick-media'),
  chatUploadMedia:    (data) => ipcRenderer.invoke('chat-upload-media', data),
  chatSubscribeChannels:   () => ipcRenderer.invoke('chat-subscribe-channels'),
  chatUnsubscribeChannels: () => ipcRenderer.invoke('chat-unsubscribe-channels'),
  chatSubscribe:      (channelId) => ipcRenderer.invoke('chat-subscribe', channelId),
  chatUnsubscribe:    (channelId) => ipcRenderer.invoke('chat-unsubscribe', channelId),
  // Abonnements aux flux : renvoient une fonction de nettoyage (retire le listener).
  onChatChannels:     (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('chat:channels', h); return () => ipcRenderer.removeListener('chat:channels', h) },
  onChatMessages:     (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('chat:messages', h); return () => ipcRenderer.removeListener('chat:messages', h) },
})
