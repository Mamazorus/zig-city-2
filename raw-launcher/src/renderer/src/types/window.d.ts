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

declare global {
  interface Window {
    launcher: {
      getSession: () => Promise<{ logged: boolean; username?: string; uuid?: string }>
      login: () => Promise<{ success: boolean; username?: string; uuid?: string; error?: string }>
      logout: () => Promise<{ success: boolean }>
      checkModpack: () => Promise<{ total: number; missingMods: number; needsNeoForge: boolean }>
      installModpack: () => Promise<{ success: boolean; error?: string }>
      launch: () => Promise<{ success: boolean; error?: string }>
      getServerStatus: () => Promise<{ online: number; max: number; players: { name: string; since: number }[]; error?: string }>
      onInstallProgress: (cb: (data: InstallProgressData) => void) => void
      onLaunchProgress: (cb: (data: LaunchProgressData) => void) => void
      onGameClosed: (cb: (data: GameClosedData) => void) => void
      onGameLog: (cb: (data: string) => void) => void
      windowMinimize: () => void
      windowMaximize: () => void
      windowClose: () => void
      openExternal: (url: string) => void

      getPlayersSeen: () => Promise<string[]>

      getFirebaseStatus: () => Promise<{ configured: boolean }>
      checkAdmin: () => Promise<{ isAdmin: boolean }>
      getNews: () => Promise<{ success: boolean; news: NewsItem[] }>
      createNews: (data: NewsFormData) => Promise<{ success: boolean; id?: string; error?: string }>
      updateNews: (data: { id: string } & Partial<NewsFormData>) => Promise<{ success: boolean; error?: string }>
      deleteNews: (id: string) => Promise<{ success: boolean; error?: string }>
      getAdmins: () => Promise<{ success: boolean; admins: Record<string, boolean> }>
      addAdmin: (username: string) => Promise<{ success: boolean; error?: string }>
      removeAdmin: (username: string) => Promise<{ success: boolean; error?: string }>
    }
  }
}
