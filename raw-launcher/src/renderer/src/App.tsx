import { useState, useEffect, useCallback, useRef } from 'react'
import packData from '../../../modpack.json'
import AdminDashboard from './AdminDashboard'

import bgImage from './assets/bg.png'
import playerImage from './assets/player.png'
import news1Image from './assets/news-1.png'
import news2Image from './assets/news-2.png'
import news3Image from './assets/news-3.png'
import news4Image from './assets/news-4.png'
import iconHomeImage from './assets/icon-home.svg'
import neoforgeImage from './assets/neoforge.svg'
import star1Image from './assets/star-1.svg'
import star2Image from './assets/star-2.svg'
import star3Image from './assets/star-3.svg'
import star4Image from './assets/star-4.svg'
import shop1Image from './assets/shop-1.png'
import shop2Image from './assets/shop-2.png'
import shop3Image from './assets/shop-3.png'
import shop4Image from './assets/shop-4.png'
import currencyImage from './assets/currency.png'

type Phase = 'loading' | 'logged-out' | 'checking' | 'installing' | 'ready' | 'launching' | 'error'
type MainTab = 'home' | 'stats' | 'mods' | 'admin'

interface DynamicNewsItem {
  id: string
  title: string
  date: string
  body: string
  imageUrl?: string
  author?: string
  createdAt?: number
}

type AnyNewsItem = { img?: string; title: string; date: string; body: string; imageUrl?: string; id?: string; author?: string }

interface ProgressState {
  percent: number
  label: string
  detail: string
}

interface ServerStatus {
  online: number
  max: number
  players: { name: string; since: number }[]
  loading: boolean
  error?: string
}

function formatSince(ts: number): string {
  const min = Math.floor((Date.now() - ts) / 60000)
  if (min < 1) return '<1min'
  if (min < 60) return `${min}min`
  return `${Math.floor(min / 60)}h`
}

const SHOP_ITEMS = [
  { from: shop1Image, fromQty: 'x16', toQty: 'x5',  alt: true },
  { from: shop2Image, fromQty: 'x4',  toQty: 'x8',  alt: false },
  { from: shop3Image, fromQty: 'x64', toQty: 'x2',  alt: true },
  { from: shop4Image, fromQty: 'x8',  toQty: 'x4',  alt: false },
]

const NEWS_ITEMS = [
  {
    img: news1Image,
    title: 'Mise à jour 1.3 — Nouvelles dimensions',
    date: '10 juin 2026',
    body: 'La mise à jour 1.3 est arrivée sur Zig City ! Deux nouvelles dimensions sont désormais accessibles via des portails craftables en fin de partie. Explorez la Dimension de Cristal et la Terre Corrompue, chacune avec ses propres boss, ressources rares et récompenses exclusives pour les plus courageux.',
  },
  {
    img: news2Image,
    title: 'Événement — La Chasse au Dragon',
    date: '5 juin 2026',
    body: "Rejoins notre grand événement PvE de la semaine ! L'Ender Dragon revient dans une version renforcée avec plusieurs phases et des mécaniques inédites. Les 3 meilleurs contributeurs remporteront des items légendaires introuvables nulle part ailleurs sur le serveur.",
  },
  {
    img: news3Image,
    title: 'Shop — Nouvelles ressources rares',
    date: '1 juin 2026',
    body: "La boutique du serveur accueille cette semaine une sélection de ressources rares issues des nouvelles dimensions. Échangez vos Zigcoins contre du Cristal Brut, de l'Essence Corrompue et des blueprints de structures exclusives.",
  },
  {
    img: news4Image,
    title: 'Infrastructure — Migration terminée',
    date: '25 mai 2026',
    body: 'La migration vers nos nouveaux serveurs dédiés est un succès complet. Les TPS sont stabilisés à 20, la latence moyenne a été réduite de 40 % et les backups quotidiens sont désormais entièrement automatisés. Merci à tous pour votre patience pendant les fenêtres de maintenance.',
  },
]

const pill = 'backdrop-blur-[5.95px] bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] flex items-center overflow-hidden rounded-full shadow-[2px_2px_8px_0px_rgba(0,0,0,0.1)]'
const iconBtn = 'backdrop-blur-[5.95px] bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] flex items-center justify-center rounded-full shadow-[1px_1px_6px_0px_rgba(0,0,0,0.2)] size-[48px] shrink-0 transition-colors duration-150 hover:bg-[rgba(255,255,255,0.12)] active:bg-[rgba(255,255,255,0.2)]'
const greenDot = 'bg-[rgba(0,255,9,0.36)] rounded-full shadow-[0px_0px_8.6px_0px_rgba(9,255,54,0.4)] size-[8px] shrink-0 dot-twinkle'
const redDot = 'bg-[rgba(255,60,60,0.55)] rounded-full shadow-[0px_0px_8.6px_0px_rgba(255,60,60,0.45)] size-[8px] shrink-0'

export default function App() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [username, setUsername] = useState('')
  const [status, setStatus] = useState('Chargement...')
  const [progress, setProgress] = useState<ProgressState | null>(null)
  const [activeTab, setActiveTab] = useState<MainTab>('home')
  const [uuid, setUuid] = useState<string | null>(null)
  const [serverStatus, setServerStatus] = useState<ServerStatus>({ online: 0, max: 0, players: [], loading: true })
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [playerStatus, setPlayerStatus] = useState<'online' | 'dnd'>('online')
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const [selectedNews, setSelectedNews] = useState<AnyNewsItem | null>(null)
  const [newsClosing, setNewsClosing] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [dynamicNews, setDynamicNews] = useState<DynamicNewsItem[]>([])
  const [heroHovered, setHeroHovered] = useState(false)
  const [playersSeen, setPlayersSeen] = useState<string[]>([])

  const fetchNews = useCallback(async () => {
    const result = await window.launcher.getNews()
    if (result.success && result.news.length > 0) setDynamicNews(result.news)
  }, [])

  const checkAndInstall = useCallback(async () => {
    setPhase('checking')
    setStatus('Vérification du modpack...')
    setProgress(null)

    const check = await window.launcher.checkModpack()
    if (!check.missingMods && !check.needsNeoForge) {
      setStatus(`Prêt — ${check.total} mods installés`)
      setPhase('ready')
    } else {
      setPhase('installing')
      setStatus(
        check.needsNeoForge
          ? `Installation de NeoForge + ${check.missingMods} mod(s)...`
          : `${check.missingMods} mod(s) à télécharger...`
      )
      await window.launcher.installModpack()
    }
  }, [])

  useEffect(() => {
    window.launcher.onInstallProgress((data) => {
      if (data.error) {
        setProgress(null)
        setStatus(`Erreur : ${data.message}`)
        setPhase('error')
        return
      }
      if (data.done) {
        setProgress(null)
        setStatus(`Prêt — ${packData.mods.length} mods installés`)
        setPhase('ready')
        return
      }
      if (data.step === 'java' || data.step === 'neoforge') {
        setProgress({ percent: data.percent ?? 0, label: data.step === 'java' ? 'Java 21' : 'NeoForge', detail: data.name ?? '' })
      } else {
        setProgress({ percent: data.percent ?? 0, label: `${data.current ?? 0} / ${data.total ?? 0}`, detail: data.name ?? '' })
      }
    })

    window.launcher.onLaunchProgress((data) => {
      if (data.total) {
        setProgress({ percent: Math.round((data.task / data.total) * 100), label: data.type ?? '', detail: 'Téléchargement de Minecraft...' })
      }
    })

    window.launcher.onGameClosed((data) => {
      setProgress(null)
      if (data?.code && data.code !== 0) {
        setStatus(`Crash détecté (code ${data.code})`)
        setPhase('error')
      } else {
        setStatus(`Prêt — ${packData.mods.length} mods installés`)
        setPhase('ready')
      }
    })

    ;(async () => {
      const [session, seenPlayers] = await Promise.all([
        window.launcher.getSession(),
        window.launcher.getPlayersSeen(),
      ])
      if (seenPlayers?.length) setPlayersSeen(seenPlayers)

      if (session.logged && session.username) {
        setUsername(session.username)
        if (session.uuid) setUuid(session.uuid)
        const [adminResult] = await Promise.all([
          window.launcher.checkAdmin(),
          fetchNews(),
        ])
        setIsAdmin(adminResult.isAdmin)
        await checkAndInstall()
      } else {
        setPhase('logged-out')
        setStatus('Connecte-toi pour jouer')
      }
    })()
  }, [checkAndInstall, fetchNews])

  useEffect(() => {
    const fetchStatus = async () => {
      const data = await window.launcher.getServerStatus()
      setServerStatus({ ...data, loading: false })
    }
    fetchStatus()
    const id = setInterval(fetchStatus, 30_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    if (!profileMenuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) {
        setProfileMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [profileMenuOpen])

  const handleLogin = async () => {
    setPhase('checking')
    setStatus('Ouverture du login Microsoft...')
    const result = await window.launcher.login()
    if (result.success && result.username) {
      setUsername(result.username)
      if (result.uuid) setUuid(result.uuid)
      const [adminResult] = await Promise.all([
        window.launcher.checkAdmin(),
        fetchNews(),
      ])
      setIsAdmin(adminResult.isAdmin)
      await checkAndInstall()
    } else {
      setPhase('logged-out')
      setStatus(`Erreur de connexion : ${result.error ?? 'inconnue'}`)
    }
  }

  const handleLogout = async () => {
    await window.launcher.logout()
    setUsername('')
    setUuid(null)
    setIsAdmin(false)
    setDynamicNews([])
    setActiveTab('home')
    setPhase('logged-out')
    setStatus('Connecte-toi pour jouer')
    setProgress(null)
  }

  const handlePlay = async () => {
    setPhase('launching')
    setStatus('Lancement en cours...')
    setProgress(null)
    const result = await window.launcher.launch()
    if (!result.success) {
      setPhase('ready')
      setStatus(`Erreur : ${result.error}`)
    }
  }

  const openNews = (item: AnyNewsItem) => {
    setSelectedNews(item)
    setNewsClosing(false)
  }

  const closeNews = () => {
    setNewsClosing(true)
    setTimeout(() => {
      setSelectedNews(null)
      setNewsClosing(false)
    }, 250)
  }

  const isBusy = ['loading', 'checking', 'installing', 'launching'].includes(phase)

  const onlineLabel = serverStatus.loading ? '...' : `${serverStatus.online} en ligne`

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* ── FOND ── */}
      <div className="absolute inset-0">
        <img src={bgImage} className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-[#0e0b16]/50" />
        {/* Vignetage haut */}
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 100% 23.25% at 50% 0%, rgba(0,0,0,0.2) 0%, transparent 100%)' }}
        />
        {/* Vignetage bas */}
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 100% 33.75% at 50% 100%, rgba(0,0,0,0.8) 0%, transparent 100%)' }}
        />
      </div>

      {/* ── CONTENU ── */}
      <div className="relative z-10 flex flex-col h-full px-[32px] py-[16px] gap-[32px]">

        {/* ── BARRE DE NAVIGATION ── */}
        <div
          className="flex items-center justify-between shrink-0"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          {/* Gauche */}
          <div
            className="flex gap-[16px] items-center"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <div className={`${pill} h-[35px] px-[16px] py-[8px]`}>
              <p className="font-ui font-semibold text-[16px] text-white tracking-[-0.64px] whitespace-nowrap">Zig Launcher</p>
            </div>
            <div className={`${pill} h-[35px] gap-[8px] px-[16px] py-[8px]`}>
              <div className={greenDot} />
              <p className="font-ui font-semibold text-[16px] text-white tracking-[-0.64px] whitespace-nowrap">{onlineLabel}</p>
            </div>
          </div>

          {/* Droite */}
          <div
            className="flex gap-[16px] items-center"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            {/* Profil joueur */}
            <div className="relative" ref={profileMenuRef}>
              <button
                className="h-[35px] flex items-center gap-[8px] px-[12px] shrink-0 backdrop-blur-[5.95px] bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-full shadow-[2px_2px_8px_0px_rgba(0,0,0,0.1)] cursor-pointer hover:bg-[rgba(255,255,255,0.1)] transition-colors"
                onClick={() => username && setProfileMenuOpen(v => !v)}
              >
                <div className="size-[25px] rounded-[4px] overflow-hidden shrink-0">
                  <img
                    alt=""
                    className="w-full h-full object-cover pointer-events-none"
                    src={username ? `https://mc-heads.net/avatar/${encodeURIComponent(username)}/64` : playerImage}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).src = playerImage }}
                  />
                </div>
                <p className="font-ui font-semibold text-[16px] text-white tracking-[-0.64px] whitespace-nowrap">
                  {username || 'Joueur'}
                </p>
                {username && <div className={playerStatus === 'dnd' ? redDot : greenDot} />}
              </button>

              {/* Menu profil */}
              {profileMenuOpen && username && (
                <div
                  className="absolute right-0 top-[calc(100%+8px)] z-50 backdrop-blur-[5.95px] bg-[rgba(14,11,22,0.92)] border border-[rgba(255,255,255,0.1)] rounded-[12px] shadow-[2px_4px_24px_0px_rgba(0,0,0,0.55)] overflow-clip"
                  style={{ minWidth: 216, WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                >
                  {/* En-tête profil */}
                  <div className="flex items-center gap-[10px] px-[14px] py-[12px] border-b border-[rgba(255,255,255,0.08)]">
                    <div className="size-[32px] relative rounded shrink-0">
                      <img
                        alt=""
                        className="absolute inset-0 max-w-none object-cover pointer-events-none rounded size-full"
                        src={username ? `https://mc-heads.net/avatar/${encodeURIComponent(username)}/64` : playerImage}
                        onError={(e) => { (e.currentTarget as HTMLImageElement).src = playerImage }}
                      />
                    </div>
                    <div>
                      <p className="font-ui font-semibold text-[14px] text-white tracking-[-0.56px]">{username}</p>
                      <p className="font-ui text-[12px] text-white/40">Compte Minecraft</p>
                    </div>
                  </div>

                  {/* Statuts */}
                  <div className="px-[8px] py-[8px] flex flex-col gap-[2px]">
                    <button
                      className={`flex items-center gap-[10px] w-full px-[10px] py-[8px] rounded-[8px] text-left transition-colors ${playerStatus === 'online' ? 'bg-[rgba(255,255,255,0.08)]' : 'hover:bg-[rgba(255,255,255,0.05)]'}`}
                      onClick={() => setPlayerStatus('online')}
                    >
                      <div className={greenDot} />
                      <p className="font-ui text-[14px] text-white">En ligne</p>
                      {playerStatus === 'online' && (
                        <svg className="ml-auto shrink-0" width="13" height="13" viewBox="0 0 13 13" fill="none">
                          <path d="M2 6.5l3 3 6-6" stroke="rgba(255,255,255,0.65)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </button>
                    <button
                      className={`flex items-center gap-[10px] w-full px-[10px] py-[8px] rounded-[8px] text-left transition-colors ${playerStatus === 'dnd' ? 'bg-[rgba(255,255,255,0.08)]' : 'hover:bg-[rgba(255,255,255,0.05)]'}`}
                      onClick={() => setPlayerStatus('dnd')}
                    >
                      <div className={redDot} />
                      <p className="font-ui text-[14px] text-white">Ne pas déranger</p>
                      {playerStatus === 'dnd' && (
                        <svg className="ml-auto shrink-0" width="13" height="13" viewBox="0 0 13 13" fill="none">
                          <path d="M2 6.5l3 3 6-6" stroke="rgba(255,255,255,0.65)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </button>
                  </div>

                  {/* Séparation */}
                  <div className="mx-[8px] border-t border-[rgba(255,255,255,0.08)]" />

                  {/* Actions */}
                  <div className="px-[8px] py-[8px] flex flex-col gap-[2px]">
                    <button
                      className="flex items-center gap-[10px] w-full px-[10px] py-[8px] rounded-[8px] text-left hover:bg-[rgba(255,255,255,0.05)] transition-colors"
                      onClick={() => {
                        setProfileMenuOpen(false)
                        ;(window.launcher as any).openExternal('https://www.minecraft.net/en-us/msaprofile/mygames/editprofile')
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <circle cx="8" cy="5.5" r="2.5" stroke="rgba(255,255,255,0.55)" strokeWidth="1.3"/>
                        <path d="M2.5 13.5C3.2 11.2 5.3 9.8 8 9.8s4.8 1.4 5.5 3.7" stroke="rgba(255,255,255,0.55)" strokeWidth="1.3" strokeLinecap="round"/>
                      </svg>
                      <p className="font-ui text-[14px] text-white">Changer de skin</p>
                    </button>

                    <button
                      className="flex items-center gap-[10px] w-full px-[10px] py-[8px] rounded-[8px] text-left hover:bg-[rgba(255,40,40,0.15)] transition-colors"
                      onClick={() => {
                        setProfileMenuOpen(false)
                        handleLogout()
                      }}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M10.5 11L13.5 8L10.5 5" stroke="rgba(255,100,100,0.8)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M13.5 8H6.5" stroke="rgba(255,100,100,0.8)" strokeWidth="1.3" strokeLinecap="round"/>
                        <path d="M6.5 2.5H3.5A1 1 0 002.5 3.5v9a1 1 0 001 1h3" stroke="rgba(255,100,100,0.8)" strokeWidth="1.3" strokeLinecap="round"/>
                      </svg>
                      <p className="font-ui text-[14px] text-[rgba(255,120,120,0.9)]">Déconnexion</p>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Bouton réduire */}
            <button
              className="flex items-center justify-center size-[35px] text-white/60 hover:text-white transition-colors"
              onClick={() => window.launcher.windowMinimize()}
            >
              <svg width="12" height="2" viewBox="0 0 12 2" fill="currentColor">
                <rect width="12" height="2" rx="1" />
              </svg>
            </button>

            {/* Bouton maximiser */}
            <button
              className="flex items-center justify-center size-[35px] text-white/60 hover:text-white transition-colors"
              onClick={() => window.launcher.windowMaximize()}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="1" y="1" width="10" height="10" rx="1" />
              </svg>
            </button>

            {/* Bouton fermer */}
            <button
              className="flex items-center justify-center size-[35px] text-white/60 hover:text-red-400 transition-colors"
              onClick={() => window.launcher.windowClose()}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M1 1L11 11M11 1L1 11" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── ZONE PRINCIPALE ── */}
        <div className="flex gap-[16px] flex-1 min-h-0">

          {/* ── BARRE D'OUTILS ── */}
          <aside className="relative z-[1] backdrop-blur-[5.95px] bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] flex flex-col h-full items-center justify-between overflow-clip px-[24px] py-[32px] rounded-[16px] shadow-[2px_2px_8px_0px_rgba(0,0,0,0.1)] shrink-0">
            <div className="flex flex-col gap-[40px] items-start">
              <button
                className={`${iconBtn} group ${activeTab === 'home' ? '!bg-[rgba(255,255,255,0.15)]' : ''}`}
                onClick={() => setActiveTab('home')}
              >
                <img alt="" className="icon-home size-[20px] object-contain shrink-0" src={iconHomeImage} />
              </button>

              {/* Icône barres (statistiques) */}
              <button
                className={`${iconBtn} group ${activeTab === 'stats' ? '!bg-[rgba(255,255,255,0.15)]' : ''}`}
                onClick={() => setActiveTab('stats')}
              >
                <svg viewBox="0 0 131.116 173" fill="none" style={{ width: 15, height: 20 }}>
                  <rect className="sp-finance-bar sp-finance-bar--1" x="0" y="114.726" width="40.0632" height="58.2737" rx="7.28421" fill="white"/>
                  <rect className="sp-finance-bar sp-finance-bar--2" x="45.5264" y="0" width="40.0632" height="173" rx="7.28421" fill="white"/>
                  <rect className="sp-finance-bar sp-finance-bar--3" x="91.0527" y="61.916" width="40.0632" height="111.084" rx="7.28421" fill="white"/>
                </svg>
              </button>

              <button
                className={`${iconBtn} group ${activeTab === 'mods' ? '!bg-[rgba(255,255,255,0.15)]' : ''}`}
                onClick={() => setActiveTab('mods')}
              >

                <div style={{ position: 'relative', width: 23, height: 18 }}>
                  <svg className="sp-mktg-body" viewBox="0 0 166.099 181" fill="none" overflow="visible"
                    style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', width: 14, height: 15 }}>
                    <path d="M57.9131 107.025V161.698C57.9131 170.425 50.839 177.5 42.1123 177.5C33.3855 177.5 26.3105 170.425 26.3105 161.698V107.025H57.9131Z" fill="white" stroke="white" strokeWidth="7"/>
                    <path d="M21.6406 42.688H71.9512V107.044H21.6406C11.6219 107.044 3.50011 98.9226 3.5 88.9038V60.8286C3.50017 50.8099 11.6219 42.6882 21.6406 42.688Z" fill="white" stroke="white" strokeWidth="7"/>
                    <path d="M152.55 4.81071L76.5145 41.21C74.0774 42.3766 72.5264 44.8387 72.5264 47.5406V102.621C72.5264 105.21 73.9519 107.589 76.2352 108.81L152.271 149.472C156.946 151.973 162.599 148.585 162.599 143.283V11.1414C162.599 5.97637 157.209 2.58052 152.55 4.81071Z" fill="white" stroke="white" strokeWidth="7"/>
                  </svg>
                  <svg className="sp-mktg-waves" viewBox="0 0 70 110" fill="none" overflow="visible"
                    style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', width: 7, height: 12, pointerEvents: 'none' }}>
                    <line className="sp-mktg-wave sp-mktg-wave--1" x1="8" y1="22" x2="30" y2="10" stroke="white" strokeWidth="14" strokeLinecap="round"/>
                    <line className="sp-mktg-wave sp-mktg-wave--2" x1="8" y1="55" x2="34" y2="55" stroke="white" strokeWidth="14" strokeLinecap="round"/>
                    <line className="sp-mktg-wave sp-mktg-wave--3" x1="8" y1="88" x2="30" y2="100" stroke="white" strokeWidth="14" strokeLinecap="round"/>
                  </svg>
                </div>
              </button>

              {/* Bouton admin (couronne) — visible uniquement pour les admins */}
              {isAdmin && (
                <button
                  className={`${iconBtn} group ${activeTab === 'admin' ? '!bg-[rgba(255,255,255,0.15)]' : ''}`}
                  onClick={() => setActiveTab('admin')}
                  title="Administration"
                >
                  <svg className="icon-crown" width="22" height="19" viewBox="0 0 22 19" fill="white">
                    <path d="M2 14.5V4l5 5.5 4-7.5 4 7.5 5-5.5v10.5H2Z"/>
                    <rect x="1.5" y="16" width="19" height="3" rx="1.5"/>
                  </svg>
                </button>
              )}
            </div>

            <div className="flex flex-col gap-[40px] items-start">
              <button className={`${iconBtn} group`}>
                <svg className="icon-plus" width="20" height="20" viewBox="0 0 20 20" fill="white">
                  <rect x="8.25" y="1" width="3.5" height="18" rx="1.75"/>
                  <rect x="1" y="8.25" width="18" height="3.5" rx="1.75"/>
                </svg>
              </button>
              <button className={`${iconBtn} group`} onClick={() => window.launcher.openExternal('https://discord.gg/MsVcTAcNGB')}>
                <svg className="icon-discord" width="20" height="16" viewBox="0 0 24 20" fill="white" xmlns="http://www.w3.org/2000/svg">
                  <path d="M20.317 1.84C18.787 1.15 17.147.63 15.44.34a.075.075 0 00-.079.037c-.21.37-.444.85-.608 1.23a18.566 18.566 0 00-5.487 0A12.36 12.36 0 008.649.377.077.077 0 008.562.34C6.848.63 5.208 1.15 3.677 1.84a.07.07 0 00-.032.027C.533 6.093-.32 10.555.099 14.961a.08.08 0 00.031.055 20.03 20.03 0 005.993 2.98.078.078 0 00.084-.026c.462-.62.874-1.275 1.226-1.963a.074.074 0 00-.041-.104 13.2 13.2 0 01-1.872-.878.075.075 0 01-.008-.125c.126-.093.252-.19.372-.287a.075.075 0 01.078-.01c3.927 1.764 8.18 1.764 12.061 0a.075.075 0 01.079.009c.12.098.245.195.372.288a.075.075 0 01-.006.125 12.3 12.3 0 01-1.873.877.075.075 0 00-.041.105c.36.687.772 1.341 1.225 1.962a.077.077 0 00.084.028 19.963 19.963 0 006.002-2.981.076.076 0 00.032-.054c.5-5.094-.838-9.52-3.549-13.442a.06.06 0 00-.031-.028zM8.02 12.278c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.956-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.311-.956 2.38-2.157 2.38zm7.975 0c-1.183 0-2.157-1.069-2.157-2.38 0-1.312.955-2.38 2.157-2.38 1.21 0 2.176 1.077 2.157 2.38 0 1.311-.946 2.38-2.157 2.38z"/>
                </svg>
              </button>
            </div>
          </aside>

          {/* ── CONTENU PRINCIPAL ── */}
          {activeTab === 'admin' && (
            <div className="flex-1 min-h-0 min-w-0">
              <AdminDashboard username={username} onNewsUpdated={fetchNews} />
            </div>
          )}
          <main className={`flex flex-col gap-[16px] flex-1 min-h-0 min-w-0 relative ${activeTab === 'admin' ? 'hidden' : ''} ${heroHovered ? 'hero-hovered' : ''}`}>

            {/* ── CARTE HERO ── */}
            <div
              className={`relative overflow-hidden border border-[rgba(0,255,225,0.18)] flex flex-col gap-[22px] items-center justify-center px-[24px] py-[32px] rounded-[16px] shrink-0 hero-card${phase === 'ready' ? ' hero-card--ready' : ''}`}
              style={{ height: 334, cursor: phase === 'ready' ? 'pointer' : 'default' }}
              onMouseEnter={() => phase === 'ready' && setHeroHovered(true)}
              onMouseLeave={() => setHeroHovered(false)}
              onClick={phase === 'ready' ? handlePlay : undefined}
            >
              {/* Fond verre */}
              <div
                className="absolute backdrop-blur-[5.95px] inset-0 pointer-events-none rounded-[16px]"
                style={{ background: 'linear-gradient(180deg, rgba(0,255,225,0.14) 0%, rgba(2,91,97,0.78) 100%)' }}
              />
              {/* Overlay gradient hover (orange → bleu) */}
              <div className="hero-grad-hover absolute inset-0 pointer-events-none rounded-[16px]" />
              {/* Pulsation idle (prêt à jouer) */}
              <div className="hero-idle-pulse absolute inset-0 pointer-events-none rounded-[inherit] z-[5]" />
              {/* Shimmer sweep au hover */}
              <div className="hero-shimmer absolute inset-0 pointer-events-none z-[5]" />

              {/* État : chargement */}
              {(phase === 'loading' || phase === 'checking') && (
                <p className="relative z-10 font-ui text-white/50 text-[18px]">Chargement...</p>
              )}

              {/* État : non connecté */}
              {phase === 'logged-out' && (
                <>
                  <p
                    className="relative z-10 font-minecraft leading-[normal] whitespace-pre uppercase"
                    style={{ fontSize: 48, color: '#ffffff', fontFamily: 'MinecraftBold, monospace' }}
                  >
                    {`rejoindre zig city  !`}
                  </p>
                  <button
                    className="relative z-10 bg-white text-[#0e0b16] font-ui font-bold text-[15px] px-[32px] py-[12px] rounded-[12px] hover:bg-white/90 transition-colors"
                    onClick={(e) => { e.stopPropagation(); handleLogin() }}
                  >
                    Se connecter avec Microsoft
                  </button>
                </>
              )}

              {/* État : installation */}
              {phase === 'installing' && (
                <>
                  <p
                    className="relative z-10 font-minecraft leading-[normal] whitespace-pre uppercase"
                    style={{ fontSize: 48, color: '#ffffff', fontFamily: 'MinecraftBold, monospace' }}
                  >
                    {`rejoindre zig city  !`}
                  </p>
                  <div className="relative z-10 flex flex-col items-center gap-[8px]" style={{ width: 600 }}>
                    <p className="font-ui text-white/60 text-[13px] text-center truncate w-full">
                      {progress?.detail ?? status}
                      {progress ? ` — ${progress.label}` : ''}
                    </p>
                    <div className="w-full h-[3px] bg-[rgba(255,255,255,0.1)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[rgba(0,255,225,0.8)] rounded-full transition-[width] duration-300 ease-out"
                        style={{ width: `${progress?.percent ?? 0}%` }}
                      />
                    </div>
                  </div>
                </>
              )}

              {/* État : prêt ou lancement */}
              {(phase === 'ready' || phase === 'launching') && (
                <>
                  <p
                    className="relative z-10 font-minecraft leading-[normal] whitespace-pre uppercase"
                    style={{ fontSize: 48, color: '#ffffff', fontFamily: 'MinecraftBold, monospace' }}
                  >
                    {phase === 'launching' ? `chargement...` : `rejoindre zig city  !`}
                  </p>
                  <div className="relative z-10 flex gap-[8px] items-center">
                    <p className="font-minecraft text-[16px] tracking-[-0.64px] whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.5)' }}>Zig Launcher</p>
                    <p className="font-minecraft text-[16px] tracking-[-0.64px] whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.5)' }}>in 1.21.1 with</p>
                    <img alt="" className="h-[18px] w-auto shrink-0" src={neoforgeImage} />
                    <p className="font-minecraft text-[16px] tracking-[-0.64px] whitespace-nowrap" style={{ color: 'rgba(255,255,255,0.5)' }}>Neoforge - {packData.loaderVersion}</p>
                  </div>
                </>
              )}

              {/* État : erreur */}
              {phase === 'error' && (
                <>
                  <p
                    className="relative z-10 font-minecraft leading-[normal] tracking-[-2px] whitespace-pre uppercase text-white"
                    style={{
                      fontSize: 72,
                      background: 'linear-gradient(to bottom, rgba(255,120,120,1) 0%, rgba(255,60,60,0.6) 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text',
                    }}
                  >
                    erreur !
                  </p>
                  <p className="relative z-10 font-ui text-white/60 text-[14px] text-center max-w-[600px]">{status}</p>
                  {username && (
                    <button
                      className="relative z-10 border border-[rgba(255,100,100,0.3)] bg-[rgba(255,100,100,0.1)] text-[rgba(255,160,160,0.9)] font-ui font-semibold text-[15px] px-[24px] py-[10px] rounded-[12px] hover:bg-[rgba(255,100,100,0.2)] transition-colors"
                      onClick={(e) => { e.stopPropagation(); checkAndInstall() }}
                    >
                      Réessayer l'installation
                    </button>
                  )}
                  {!username && (
                    <button
                      className="relative z-10 bg-white/90 text-[#0e0b16] font-ui font-bold text-[15px] px-[32px] py-[12px] rounded-[12px] hover:bg-white transition-colors"
                      onClick={(e) => { e.stopPropagation(); handleLogin() }}
                    >
                      Se connecter
                    </button>
                  )}
                </>
              )}
            </div>

            {/* ── BARRE DE PROGRESSION DU LANCEMENT ── */}
            {phase === 'launching' && (
              <div className="launch-progress-wrap w-full shrink-0">
                <div style={{ padding: '16px 0' }}>
                  <div className="w-full rounded-full" style={{ height: 4, background: 'rgba(255,255,255,0.08)' }}>
                    {progress ? (
                      <div
                        className="launch-bar-fill h-full rounded-full transition-[width] duration-300 ease-out"
                        style={{ width: `${progress.percent}%` }}
                      />
                    ) : (
                      <div className="launch-bar-indeterminate launch-bar-fill h-full rounded-full" />
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── ÉTOILES DÉCORATIVES ── */}
            <div className="absolute pointer-events-none star-wrap-1" style={{ left: 381, top: -49, width: 50, height: 50 }}>
              <img alt="" src={star1Image} className="star-1" style={{ width: '100%', height: '100%' }} />
            </div>
            <div className="absolute pointer-events-none star-wrap-2" style={{ left: 826, top: 274, width: 30, height: 30 }}>
              <img alt="" src={star2Image} className="star-2" style={{ width: '100%', height: '100%' }} />
            </div>
            <div className="absolute pointer-events-none star-wrap-3" style={{ left: -65, top: 285, width: 44, height: 44 }}>
              <img alt="" src={star3Image} className="star-3" style={{ width: '100%', height: '100%' }} />
            </div>
            <div className="absolute pointer-events-none star-wrap-4" style={{ left: 1091, top: -61, width: 68, height: 68 }}>
              <img alt="" src={star4Image} className="star-4" style={{ width: '100%', height: '100%' }} />
            </div>

            {/* ── CARROUSEL DE SKINS ── */}
            {(() => {
              const CAROUSEL_GAP = 80
              const ITEM_SIZE = 48
              const MIN_ITEMS = 12
              const rawList = playersSeen.length > 0 ? playersSeen : []
              const singleSet: (string | null)[] = rawList.length === 0
                ? Array.from({ length: MIN_ITEMS }).map(() => null)
                : rawList.length < MIN_ITEMS
                  ? Array.from({ length: MIN_ITEMS }).map((_, i) => rawList[i % rawList.length])
                  : rawList
              const carouselItems = [...singleSet, ...singleSet]
              const animDuration = (singleSet.length * (ITEM_SIZE + CAROUSEL_GAP)) / 50

              return (
                <div
                  className="backdrop-blur-[5.95px] bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] overflow-hidden rounded-[16px] shadow-[2px_2px_8px_0px_rgba(0,0,0,0.1)] shrink-0 w-full"
                  style={{ height: 88 }}
                >
                  <div
                    className="flex items-center h-full w-full overflow-hidden"
                    style={{
                      maskImage: 'linear-gradient(to right, transparent 0%, black 14%, black 86%, transparent 100%)',
                      WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 14%, black 86%, transparent 100%)',
                    }}
                  >
                    <div className="carousel-track flex items-center" style={{ animationDuration: `${animDuration}s` }}>
                      {carouselItems.map((name, i) => (
                        <div key={i} className="size-[48px] rounded-[8px] shrink-0 overflow-hidden" style={{ marginRight: CAROUSEL_GAP }}>
                          <img
                            alt=""
                            className="size-full object-cover"
                            src={name ? `https://mc-heads.net/avatar/${encodeURIComponent(name)}/64` : playerImage}
                            onError={(e) => { (e.currentTarget as HTMLImageElement).src = playerImage }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* ── NOUVEAUTÉS ── */}
            <div className="backdrop-blur-[5.95px] bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] flex flex-col gap-[16px] items-start overflow-x-clip overflow-y-auto p-[16px] rounded-[16px] shadow-[2px_2px_8px_0px_rgba(0,0,0,0.1)] w-full flex-1 min-h-0">
              <p className="font-ui font-bold text-[20px] text-white tracking-[-0.8px] whitespace-nowrap shrink-0">Nouveautées</p>
              <div className="grid grid-cols-2 gap-[16px] w-full shrink-0">
                {(dynamicNews.length > 0 ? dynamicNews as AnyNewsItem[] : NEWS_ITEMS as AnyNewsItem[]).map((item, i) => {
                  const imgSrc = (item as any).img ?? (item as any).imageUrl
                  return (
                    <div
                      key={(item as any).id ?? i}
                      className="news-card relative rounded-[8px] overflow-hidden cursor-pointer"
                      style={{ height: 264 }}
                      onClick={() => openNews(item)}
                    >
                      {imgSrc ? (
                        <img
                          alt=""
                          className="news-card-img absolute inset-0 max-w-none object-cover pointer-events-none size-full"
                          src={imgSrc}
                        />
                      ) : (
                        <div
                          className="absolute inset-0"
                          style={{ background: 'linear-gradient(135deg, rgba(0,255,225,0.15) 0%, rgba(255,200,0,0.15) 100%)' }}
                        />
                      )}
                      <div
                        className="news-card-overlay absolute inset-0 pointer-events-none flex flex-col justify-end p-[14px]"
                        style={{ background: 'linear-gradient(to top, rgba(14,11,22,0.9) 0%, rgba(14,11,22,0.25) 55%, transparent 100%)' }}
                      >
                        <p className="font-ui font-semibold text-[13px] text-white leading-tight tracking-[-0.4px]">{item.title}</p>
                        <p className="font-ui text-[11px] text-white/45 mt-[3px]">{item.date}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </main>

          {/* ── PANNEAU DROIT ── */}
          <aside className="flex flex-col gap-[16px] h-full shrink-0" style={{ width: 304 }}>

            {/* Liste des joueurs en ligne */}
            <div className="backdrop-blur-[5.95px] bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] flex flex-col gap-[22px] items-start overflow-x-clip overflow-y-auto p-[16px] rounded-[16px] shadow-[2px_2px_8px_0px_rgba(0,0,0,0.1)] w-full flex-1 min-h-0">
              <div className="flex items-center justify-between w-full shrink-0" style={{ height: 20 }}>
                <p className="font-ui font-semibold text-[16px] text-white tracking-[-0.64px] whitespace-nowrap">{onlineLabel}</p>
                <div className={greenDot} />
              </div>
              <div className="flex flex-col gap-[8px] items-start w-full shrink-0" style={{ width: 272 }}>
                {serverStatus.players.map((player, i) => (
                  <div
                    key={player.name}
                    className={`flex gap-[8px] items-center p-[8px] rounded-[8px] w-full ${i % 2 === 0 ? 'bg-[rgba(255,255,255,0.1)]' : ''}`}
                  >
                    <div className="relative rounded-[8px] shrink-0 size-[48px]">
                      <img
                        alt=""
                        className="absolute inset-0 max-w-none object-cover pointer-events-none rounded-[8px] size-full"
                        src={`https://mc-heads.net/avatar/${encodeURIComponent(player.name)}/64`}
                        onError={(e) => { (e.currentTarget as HTMLImageElement).src = playerImage }}
                      />
                    </div>
                    <div className="flex flex-col items-start">
                      <p className="font-mono font-semibold text-[16px] text-white tracking-[-0.64px]">{player.name}</p>
                      <p className="font-mono font-bold text-[14px] text-[rgba(255,255,255,0.5)] tracking-[-0.56px] whitespace-nowrap">
                        En ligne depuis {formatSince(player.since)}
                      </p>
                    </div>
                  </div>
                ))}
                {!serverStatus.loading && serverStatus.players.length === 0 && serverStatus.online > 0 && (
                  <p className="font-mono text-[13px] text-white/30">{serverStatus.online} joueur(s) en ligne</p>
                )}
                {!serverStatus.loading && serverStatus.online === 0 && (
                  <p className="font-mono text-[13px] text-white/30">
                    {serverStatus.error ? 'Serveur hors ligne' : 'Aucun joueur en ligne'}
                  </p>
                )}
              </div>

              {/* Bouton déconnexion */}
              {username && (phase === 'ready' || phase === 'error') && (
                <button
                  className="mt-auto font-ui text-[11px] text-white/20 hover:text-white/40 transition-colors"
                  onClick={handleLogout}
                >
                  Déconnexion
                </button>
              )}

              {/* Indicateur occupation */}
              {isBusy && phase !== 'launching' && (
                <div className="flex items-center gap-[8px] text-white/30 font-ui text-[12px] mt-auto">
                  <svg className="animate-spin" style={{ width: 12, height: 12 }} fill="none" viewBox="0 0 24 24">
                    <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Veuillez patienter...
                </div>
              )}
            </div>

            {/* Shop du jour */}
            <div className="backdrop-blur-[5.95px] bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] flex flex-col gap-[22px] items-start overflow-clip p-[16px] rounded-[16px] shadow-[2px_2px_8px_0px_rgba(0,0,0,0.1)] w-full flex-1 min-h-0">
              <div className="flex items-center justify-between w-full shrink-0" style={{ height: 20 }}>
                <p className="font-ui font-semibold text-[16px] text-white tracking-[-0.64px] whitespace-nowrap">Shop du jour</p>
                <div className={greenDot} />
              </div>
              <div className="flex flex-col gap-[8px] items-start w-full shrink-0" style={{ width: 272 }}>
                {SHOP_ITEMS.map((trade, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-between p-[8px] rounded-[8px] w-full relative ${trade.alt ? 'bg-[rgba(255,255,255,0.1)]' : ''}`}
                  >
                    {/* Item gauche */}
                    <div className="flex items-end">
                      <div className="relative shrink-0 size-[48px]" style={{ marginRight: -18 }}>
                        <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={trade.from} />
                      </div>
                      <p className="relative z-10 font-minecraft text-[16px] text-white tracking-[-0.64px] whitespace-nowrap">{trade.fromQty}</p>
                    </div>

                    {/* Flèche */}
                    <div className="absolute left-1/2 -translate-x-1/2">
                      <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
                        <path d="M0.5 7H17.5M17.5 7L11.5 1M17.5 7L11.5 13" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </div>

                    {/* Monnaie droite */}
                    <div className="flex items-end">
                      <div className="relative shrink-0 size-[48px]" style={{ marginRight: -18 }}>
                        <img alt="" className="absolute inset-0 max-w-none object-cover pointer-events-none size-full" src={currencyImage} />
                      </div>
                      <p className="relative z-10 font-minecraft text-[16px] text-white tracking-[-0.64px] whitespace-nowrap">{trade.toQty}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* ── MODALE NOUVEAUTÉ ── */}
      {selectedNews !== null && (
        <div
          className={`absolute inset-0 z-50 flex items-center justify-center ${newsClosing ? 'modal-backdrop-exit' : 'modal-backdrop-enter'}`}
          style={{ background: 'rgba(14,11,22,0.6)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' } as React.CSSProperties}
          onClick={closeNews}
        >
          <div
            className={`relative flex flex-col rounded-[8px] overflow-hidden shadow-[0px_0px_80px_rgba(0,255,225,0.12)] ${newsClosing ? 'modal-card-exit' : 'modal-card-enter'}`}
            style={{
              width: 680,
              maxHeight: '78vh',
              background: 'rgba(14,11,22,0.85)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
            } as React.CSSProperties}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Image */}
            <div className="relative shrink-0 overflow-hidden" style={{ height: 320 }}>
              {((selectedNews as any).img || (selectedNews as any).imageUrl) ? (
                <img
                  alt=""
                  className="absolute inset-0 max-w-none object-cover size-full"
                  src={(selectedNews as any).img ?? (selectedNews as any).imageUrl}
                />
              ) : (
                <div
                  className="absolute inset-0"
                  style={{ background: 'linear-gradient(135deg, rgba(0,255,225,0.2) 0%, rgba(255,200,0,0.15) 100%)' }}
                />
              )}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: 'linear-gradient(to bottom, transparent 50%, rgba(14,11,22,0.85) 100%)' }}
              />
              <button
                className="absolute top-[16px] left-[16px] flex items-center gap-[8px] backdrop-blur-[8px] bg-[rgba(14,11,22,0.5)] border border-[rgba(255,255,255,0.12)] px-[14px] py-[8px] rounded-full hover:bg-[rgba(255,255,255,0.1)] transition-colors"
                onClick={closeNews}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M9 2.5L4.5 7L9 11.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="font-ui font-semibold text-[13px] text-white tracking-[-0.4px]">Retour</span>
              </button>
            </div>

            {/* Contenu */}
            <div className="flex flex-col gap-[12px] p-[28px] overflow-y-auto">
              <div className="flex items-start justify-between gap-[16px]">
                <p className="font-ui font-bold text-[21px] text-white tracking-[-0.84px] leading-tight">{selectedNews.title}</p>
                <p className="font-ui text-[12px] text-white/35 tracking-[-0.3px] whitespace-nowrap mt-[4px]">{selectedNews.date}</p>
              </div>
              <p className="font-ui text-[14px] text-white/70 leading-[1.7] tracking-[-0.28px]">{selectedNews.body}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
