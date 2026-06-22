export {}

interface InstallProgressData {
  done?: boolean
  error?: boolean
  message?: string
  step?: 'java' | 'neoforge' | 'mods'
  name?: string
  percent?: number
  current?: number
  total?: number
}

interface LaunchProgressData {
  task: number
  total: number
  type?: string
}

interface GameClosedData {
  code: number | null
  log?: string
}

interface UpdateStatusData {
  // 'mac-update' : MAJ détectée sur macOS (app non signée) → téléchargement manuel via `url`.
  status: 'checking' | 'available' | 'not-available' | 'progress' | 'downloaded' | 'error' | 'disabled' | 'mac-update'
  version?: string
  url?: string
  percent?: number
  transferred?: number
  total?: number
  bytesPerSecond?: number
  message?: string
}

interface NewsItem {
  id: string
  title: string
  date: string
  body: string
  imageUrl?: string
  author?: string
  createdAt?: number
}

type NewsFormData = Omit<NewsItem, 'id' | 'createdAt'>

// Statistiques d'un joueur, telles que publiées par l'exporteur serveur dans
// Firebase /stats. Toutes optionnelles (un joueur peut ne pas avoir chaque stat).
interface PlayerStats {
  play_time?: number
  distance?: number
  mined?: number
  mob_kills?: number
  seeds?: number
  records?: number
  deaths?: number
  updatedAt?: number
}

// ── Chat (salons type Discord) ──
interface ChatMedia {
  kind: 'upload' | 'link'
  url: string
  mime?: string
  w?: number
  h?: number
}

interface ChatChannel {
  id: string
  name: string
  description?: string
  type: 'open' | 'announce'
  order?: number
  createdAt?: number
  createdBy?: string
}

interface ChatMessage {
  id: string
  author: string
  uuid?: string | null
  text: string
  media?: ChatMedia
  ts: number
}

declare global {
  interface Window {
    launcher: {
      getSession: () => Promise<{ logged: boolean; username?: string; uuid?: string }>
      login: () => Promise<{ success: boolean; username?: string; uuid?: string; error?: string }>
      logout: () => Promise<{ success: boolean }>
      getSkinInfo: () => Promise<{ success: boolean; variant?: 'classic' | 'slim'; skinUrl?: string | null; skinDataUrl?: string | null; name?: string; uuid?: string; error?: string; expired?: boolean; loggedOut?: boolean }>
      pickSkinFile: () => Promise<{ canceled: boolean; path?: string; name?: string; dataUrl?: string; width?: number; height?: number; error?: string }>
      uploadSkin: (payload: { variant: 'classic' | 'slim'; path?: string; dataUrl?: string }) => Promise<{ success: boolean; variant?: 'classic' | 'slim'; skinUrl?: string | null; error?: string; expired?: boolean; loggedOut?: boolean }>
      resetSkin: () => Promise<{ success: boolean; variant?: 'classic' | 'slim'; skinUrl?: string | null; skinDataUrl?: string | null; error?: string; expired?: boolean; loggedOut?: boolean }>
      exportSkin: (payload: { dataUrl: string; name?: string }) => Promise<{ success: boolean; path?: string; canceled?: boolean; error?: string }>
      libraryList: () => Promise<{ id: string; name: string; variant: 'classic' | 'slim'; createdAt: number; dataUrl: string }[]>
      librarySave: (payload: { name: string; dataUrl: string; variant: 'classic' | 'slim' }) => Promise<{ success: boolean; id?: string; error?: string }>
      libraryDelete: (id: string) => Promise<{ success: boolean; error?: string }>
      libraryRename: (payload: { id: string; name: string }) => Promise<{ success: boolean; error?: string }>
      checkModpack: () => Promise<{ total: number; missingMods: number; needsNeoForge: boolean }>
      installModpack: () => Promise<{ success: boolean; error?: string }>
      launch: () => Promise<{ success: boolean; error?: string }>
      getServerStatus: () => Promise<{ online: number; max: number; players: { name: string; since: number }[]; error?: string }>

      // Réglages utilisateur (RAM allouée à la JVM, en Go). Toutes les valeurs sont
      // en Go ; les bornes dépendent de la RAM physique de la machine.
      getSettings: () => Promise<{ ram: number; defaultRam: number; minRam: number; maxRam: number; recommendedRam: number; totalGb: number; custom: boolean }>
      setSettings: (payload: { ram: number | null }) => Promise<{ success: boolean; ram?: number; error?: string }>
      onInstallProgress: (cb: (data: InstallProgressData) => void) => void
      onLaunchProgress: (cb: (data: LaunchProgressData) => void) => void
      onGameClosed: (cb: (data: GameClosedData) => void) => void
      onGameLog: (cb: (data: string) => void) => void
      windowMinimize: () => void
      windowMaximize: () => void
      windowClose: () => void
      openExternal: (url: string) => void

      checkForUpdates: () => Promise<{ status: 'disabled' | 'checking' | 'error'; message?: string }>
      quitAndInstall: () => void
      onUpdateStatus: (cb: (data: UpdateStatusData) => void) => void

      getPlayersSeen: () => Promise<string[]>
      addPlayersSeen: (names: string | string[]) => Promise<{ success: boolean; added: string[]; skipped: string[]; invalid: number; error?: string }>
      removePlayerSeen: (name: string) => Promise<{ success: boolean; error?: string }>
      fetchImage: (url: string) => Promise<string | null>

      getFirebaseStatus: () => Promise<{ configured: boolean }>
      checkAdmin: () => Promise<{ isAdmin: boolean }>
      getNews: () => Promise<{ success: boolean; news: NewsItem[] }>
      getStats: () => Promise<{ success: boolean; players: { name: string; stats: PlayerStats }[]; updatedAt: number | null; error?: string }>
      createNews: (data: NewsFormData) => Promise<{ success: boolean; id?: string; error?: string }>
      updateNews: (data: { id: string } & Partial<NewsFormData>) => Promise<{ success: boolean; error?: string }>
      deleteNews: (id: string) => Promise<{ success: boolean; error?: string }>
      getAdmins: () => Promise<{ success: boolean; admins: Record<string, boolean> }>
      addAdmin: (username: string) => Promise<{ success: boolean; error?: string }>
      removeAdmin: (username: string) => Promise<{ success: boolean; error?: string }>

      // ── Chat ──
      chatGetChannels: () => Promise<{ success: boolean; channels: ChatChannel[]; error?: string }>
      chatCreateChannel: (data: { name: string; description?: string; type?: 'open' | 'announce'; id?: string }) => Promise<{ success: boolean; id?: string; error?: string }>
      chatUpdateChannel: (data: { id: string; name?: string; description?: string; type?: 'open' | 'announce'; order?: number }) => Promise<{ success: boolean; error?: string }>
      chatDeleteChannel: (id: string) => Promise<{ success: boolean; error?: string }>
      chatSendMessage: (data: { channelId: string; text?: string; media?: ChatMedia | null }) => Promise<{ success: boolean; id?: string; error?: string }>
      chatDeleteMessage: (data: { channelId: string; messageId: string }) => Promise<{ success: boolean; error?: string }>
      chatPickMedia: () => Promise<{ canceled: boolean; dataUrl?: string; mime?: string; name?: string; size?: number; error?: string }>
      chatUploadMedia: (data: { channelId: string; dataUrl: string; mime?: string; name?: string }) => Promise<{ success: boolean; url?: string; mime?: string; error?: string }>
      chatSubscribeChannels: () => Promise<{ success: boolean }>
      chatUnsubscribeChannels: () => Promise<{ success: boolean }>
      chatSubscribe: (channelId: string) => Promise<{ success: boolean; error?: string }>
      chatUnsubscribe: (channelId: string) => Promise<{ success: boolean }>
      onChatChannels: (cb: (channels: ChatChannel[]) => void) => () => void
      onChatMessages: (cb: (data: { channelId: string; messages: ChatMessage[] }) => void) => () => void
    }
  }
}
