const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('launcher', {
  getSession:     () => ipcRenderer.invoke('get-session'),
  login:          () => ipcRenderer.invoke('login'),
  loginOffline:   (username) => ipcRenderer.invoke('login-offline', username),
  logout:         () => ipcRenderer.invoke('logout'),

  getSkinInfo:    () => ipcRenderer.invoke('get-skin-info'),
  fetchPlayerSkin: (name) => ipcRenderer.invoke('fetch-player-skin', name),
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
  onUpdateStatus:  (cb) => { const h = (_, d) => cb(d); ipcRenderer.on('update-status', h); return () => ipcRenderer.removeListener('update-status', h) },

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

  // ── Fonds d'écran (un est tiré au hasard à chaque lancement) ──
  getBackgrounds:        () => ipcRenderer.invoke('get-backgrounds'),
  createBackground:      (data) => ipcRenderer.invoke('create-background', data),
  deleteBackground:      (id) => ipcRenderer.invoke('delete-background', id),
  uploadBackgroundImage: (data) => ipcRenderer.invoke('background-upload-media', data),

  // ── Shop du jour (calendrier) ──
  getShop:           () => ipcRenderer.invoke('get-shop'),
  getShopDay:        (date) => ipcRenderer.invoke('get-shop-day', date),
  createShopOffer:   (data) => ipcRenderer.invoke('create-shop-offer', data),
  updateShopOffer:   (data) => ipcRenderer.invoke('update-shop-offer', data),
  deleteShopOffer:   (data) => ipcRenderer.invoke('delete-shop-offer', data),
  setShopConfig:     (data) => ipcRenderer.invoke('set-shop-config', data),
  getShopLibrary:    () => ipcRenderer.invoke('get-shop-library'),
  deleteShopLibraryOffer: (id) => ipcRenderer.invoke('delete-shop-library-offer', id),
  // ── Boutique (2e marchand, offres fixes — on y dépense les coins) ──
  getShopStore:         () => ipcRenderer.invoke('get-shop-store'),
  createShopStoreOffer: (data) => ipcRenderer.invoke('create-shop-store-offer', data),
  updateShopStoreOffer: (data) => ipcRenderer.invoke('update-shop-store-offer', data),
  deleteShopStoreOffer: (data) => ipcRenderer.invoke('delete-shop-store-offer', data),
  // ── Course (3e marchand, trades partagés — limite globale) ──
  getShopRace:          () => ipcRenderer.invoke('get-shop-race'),
  createShopRaceOffer:  (data) => ipcRenderer.invoke('create-shop-race-offer', data),
  updateShopRaceOffer:  (data) => ipcRenderer.invoke('update-shop-race-offer', data),
  deleteShopRaceOffer:  (data) => ipcRenderer.invoke('delete-shop-race-offer', data),
  // ── Quêtes (PNJ de quêtes : tuer N d'une cible → récompense) ──
  getQuests:    () => ipcRenderer.invoke('get-quests'),
  createQuest:  (data) => ipcRenderer.invoke('create-quest', data),
  updateQuest:  (data) => ipcRenderer.invoke('update-quest', data),
  deleteQuest:  (id) => ipcRenderer.invoke('delete-quest', id),
  // ── PNJ configurables ──
  getNpcs:      () => ipcRenderer.invoke('get-npcs'),
  createNpc:    (data) => ipcRenderer.invoke('create-npc', data),
  updateNpc:    (data) => ipcRenderer.invoke('update-npc', data),
  deleteNpc:    (id) => ipcRenderer.invoke('delete-npc', id),
  getItemCatalog:    () => ipcRenderer.invoke('get-item-catalog'),
  getEntityCatalog:  () => ipcRenderer.invoke('get-entity-catalog'),
  getBlockCatalog:   () => ipcRenderer.invoke('get-block-catalog'),
  getItemIcons:      (ids) => ipcRenderer.invoke('get-item-icons', ids),

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
