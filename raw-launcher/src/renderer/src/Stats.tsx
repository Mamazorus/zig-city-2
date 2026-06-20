import { useState, useEffect, useMemo, useCallback } from 'react'
import { Avatar } from './remote-image'

// ── Page « Statistiques » : classement des joueurs du serveur ─────────────────
// Les stats ne sont PAS récupérables par le ping du jeu (il ne renvoie que les
// pseudos en ligne) : un exporteur tourne côté serveur (tools/zig-stats-exporter),
// lit les fichiers world/stats/*.json et pousse un classement vers Firebase /stats.
// Cette page lit ce nœud (IPC get-stats) et l'affiche, triable par colonne.

export interface PlayerStats {
  play_time?: number   // ticks de jeu (20 ticks = 1 seconde)
  distance?: number    // distance cumulée en cm (marche, sprint, monture, elytra…)
  mined?: number       // blocs minés
  mob_kills?: number   // créatures tuées
  seeds?: number       // graines plantées (clics droit de semis)
  records?: number     // disques de musique joués
  deaths?: number      // morts
  updatedAt?: number   // horodatage de la dernière collecte (ms)
}

interface StatPlayer {
  name: string
  stats: PlayerStats
}

type StatKey = 'play_time' | 'distance' | 'mined' | 'mob_kills' | 'seeds' | 'records' | 'deaths'
type SortDir = 'desc' | 'asc'

// ── Formatage des valeurs ─────────────────────────────────────────────────────
const fmtCount = (n: number) => Math.round(n).toLocaleString('fr-FR')

function fmtDuration(ticks: number): string {
  const totalMin = Math.floor(ticks / 20 / 60)
  if (totalMin <= 0) return '0min'
  const days = Math.floor(totalMin / 1440)
  const hours = Math.floor((totalMin % 1440) / 60)
  const min = totalMin % 60
  if (days > 0) return `${days}j ${hours}h`
  if (hours > 0) return `${hours}h ${min.toString().padStart(2, '0')}`
  return `${min}min`
}

function fmtDistance(cm: number): string {
  const m = cm / 100
  if (m >= 1000) return `${(m / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`
  return `${Math.round(m).toLocaleString('fr-FR')} m`
}

function fmtAgo(ms: number): string {
  const min = Math.floor((Date.now() - ms) / 60000)
  if (min < 1) return "à l'instant"
  if (min < 60) return `il y a ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `il y a ${h} h`
  return `il y a ${Math.floor(h / 24)} j`
}

// ── Colonnes du classement ────────────────────────────────────────────────────
interface Column {
  key: StatKey
  label: string
  format: (v: number) => string
  icon: React.ReactNode
}

const COLUMNS: Column[] = [
  {
    key: 'play_time', label: 'Temps de jeu', format: fmtDuration,
    icon: <path d="M8 4v4l2.5 2M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />,
  },
  {
    key: 'distance', label: 'Distance', format: fmtDistance,
    icon: <path d="M4 14c0-2 1.5-3 3-4.2C8.6 8.6 10 7.6 10 6a2 2 0 1 0-4 0M4 2.2v.01" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />,
  },
  {
    key: 'mined', label: 'Blocs minés', format: fmtCount,
    icon: <path d="M2.5 9.5 9 3l1.2 1.2M12 6 6 12l-1.5-1.5M9.5 4.5 11.5 6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />,
  },
  {
    key: 'mob_kills', label: 'Mobs tués', format: fmtCount,
    icon: <path d="m3 13 6.5-6.5M11.5 2.5 9 5l2 2 2.5-2.5-2-2ZM3 11l2 2M4.2 9.8 2.5 13.5 6.2 11.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />,
  },
  {
    key: 'seeds', label: 'Graines plantées', format: fmtCount,
    icon: <path d="M8 14V7m0 0c0-2 1.5-3.5 3.5-3.5C11.5 5.5 10 7 8 7Zm0 0C8 5 6.5 3.5 4.5 3.5 4.5 5.5 6 7 8 7Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />,
  },
  {
    key: 'records', label: 'Disques joués', format: fmtCount,
    icon: <><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3" /><circle cx="8" cy="8" r="1.6" stroke="currentColor" strokeWidth="1.3" /></>,
  },
  {
    key: 'deaths', label: 'Morts', format: fmtCount,
    icon: <path d="M8 1.5A5.5 5.5 0 0 0 2.5 7c0 2 1 3 2 3.7V13h7v-2.3c1-.7 2-1.7 2-3.7A5.5 5.5 0 0 0 8 1.5ZM6 7v.01M10 7v.01" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />,
  },
]

// Gabarit de grille partagé par l'en-tête et chaque ligne (rang | joueur | colonnes)
const GRID_TEMPLATE = `64px minmax(180px, 1.5fr) repeat(${COLUMNS.length}, minmax(104px, 1fr))`
const MIN_TABLE_WIDTH = 64 + 200 + COLUMNS.length * 120

const MEDALS = ['#FFD23F', '#CBD5E1', '#D9914F'] // or, argent, bronze (top 3)

export default function StatsPage() {
  const [players, setPlayers] = useState<StatPlayer[]>([])
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<StatKey>('play_time')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [query, setQuery] = useState('')

  const fetchStats = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await window.launcher.getStats()
      if (res.success) {
        setPlayers(res.players ?? [])
        setUpdatedAt(res.updatedAt ?? null)
      } else {
        setError(res.error ?? 'Statistiques indisponibles.')
        setPlayers([])
      }
    } catch (e) {
      setError(String((e as Error)?.message || e))
      setPlayers([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchStats() }, [fetchStats])

  // Clic sur une colonne : on trie dessus (ordre décroissant par défaut, comme un
  // classement) ; re-cliquer sur la même colonne inverse le sens.
  const onSort = (key: StatKey) => {
    if (key === sortKey) setSortDir(d => (d === 'desc' ? 'asc' : 'desc'))
    else { setSortKey(key); setSortDir('desc') }
  }

  const sorted = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? players.filter(p => p.name.toLowerCase().includes(q)) : players.slice()
    list.sort((a, b) => {
      const av = a.stats[sortKey] ?? 0
      const bv = b.stats[sortKey] ?? 0
      if (av === bv) return a.name.localeCompare(b.name)
      return sortDir === 'desc' ? bv - av : av - bv
    })
    return list
  }, [players, sortKey, sortDir, query])

  return (
    <div className="backdrop-blur-[5.95px] bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-[16px] shadow-[2px_2px_8px_0px_rgba(0,0,0,0.1)] flex flex-col h-full overflow-hidden">

      {/* ── EN-TÊTE ── */}
      <div className="flex items-center justify-between px-[24px] py-[16px] shrink-0 gap-[16px]">
        <div className="flex flex-col gap-[2px] min-w-0">
          <p className="font-ui font-semibold text-[16px] text-white tracking-[-0.64px] leading-none">Classement</p>
          <p className="font-ui text-[14px] text-white/40 tracking-[-0.3px] truncate">
            {loading
              ? 'Chargement des statistiques…'
              : error
                ? 'Statistiques indisponibles'
                : `${players.length} joueur${players.length !== 1 ? 's' : ''}${updatedAt ? ` · à jour ${fmtAgo(updatedAt)}` : ''}`}
          </p>
        </div>

        <div className="flex items-center gap-[10px] shrink-0">
          {/* Recherche d'un joueur */}
          <div className="flex items-center gap-[8px] bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-[10px] px-[12px] h-[34px] focus-within:border-[rgba(0,255,225,0.4)] transition-colors">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-white/40 shrink-0">
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Rechercher un joueur"
              className="bg-transparent outline-none font-ui text-[14px] text-white placeholder:text-white/25 tracking-[-0.3px] w-[160px]"
            />
          </div>

          {/* Rafraîchir */}
          <button
            onClick={fetchStats}
            disabled={loading}
            title="Rafraîchir"
            className="flex items-center justify-center size-[34px] rounded-[10px] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.05)] text-white/55 hover:text-white hover:bg-[rgba(255,255,255,0.1)] disabled:opacity-40 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={loading ? 'animate-spin' : ''}>
              <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2v2.6h-2.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── TABLEAU ── */}
      <div className="flex-1 overflow-auto px-[16px] pb-[16px] min-h-0">
        <div style={{ minWidth: MIN_TABLE_WIDTH }}>

          {/* En-tête de colonnes (collant) */}
          <div
            className="grid items-center gap-[6px] sticky top-0 z-[2] bg-[rgba(14,11,22,0.72)] backdrop-blur-[6px] rounded-[10px] px-[10px] py-[10px] mb-[6px] border border-[rgba(255,255,255,0.06)]"
            style={{ gridTemplateColumns: GRID_TEMPLATE }}
          >
            <span className="font-ui text-[13px] text-white/35 tracking-[-0.2px] text-center">#</span>
            <span className="font-ui text-[13px] text-white/35 tracking-[-0.2px] pl-[6px]">Joueur</span>
            {COLUMNS.map(col => {
              const active = col.key === sortKey
              return (
                <button
                  key={col.key}
                  onClick={() => onSort(col.key)}
                  aria-label={active ? `Trié par ${col.label}, ordre ${sortDir === 'desc' ? 'décroissant' : 'croissant'}` : `Trier par ${col.label}`}
                  aria-sort={active ? (sortDir === 'desc' ? 'descending' : 'ascending') : 'none'}
                  title={active ? `Trié par « ${col.label} » — ${sortDir === 'desc' ? 'décroissant' : 'croissant'}` : `Trier par « ${col.label} »`}
                  className={`group flex items-center justify-end gap-[5px] h-[24px] pr-[6px] rounded-[6px] transition-colors ${
                    active ? 'text-[rgba(0,255,225,0.95)]' : 'text-white/45 hover:text-white/80'
                  }`}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0">{col.icon}</svg>
                  <span className="font-ui text-[13px] font-medium tracking-[-0.2px] whitespace-nowrap">{col.label}</span>
                  <svg
                    width="11" height="11" viewBox="0 0 16 16" fill="none"
                    className={`shrink-0 transition-all ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-45'}`}
                    style={{ transform: active && sortDir === 'asc' ? 'rotate(180deg)' : undefined }}
                  >
                    <path d="M4 6.5 8 10.5l4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )
            })}
          </div>

          {/* Lignes joueurs */}
          {!loading && !error && sorted.map((p, i) => {
            // Podium : top 3 du critère de tri courant, uniquement en ordre
            // décroissant (en croissant, les premières lignes sont les « moins
            // bien classés » — pas de médaille). Rang et anneau d'avatar alignés.
            const medal = sortDir === 'desc' && i < 3 ? MEDALS[i] : null
            const rankColor = medal
            return (
              <div
                key={p.name}
                className="grid items-center gap-[6px] px-[10px] py-[8px] rounded-[10px] hover:bg-[rgba(255,255,255,0.05)] transition-colors"
                style={{
                  gridTemplateColumns: GRID_TEMPLATE,
                  background: i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'transparent',
                }}
              >
                {/* Rang */}
                <div className="flex items-center justify-center">
                  <span
                    className="font-mono font-bold text-[15px] tabular-nums"
                    style={{ color: rankColor ?? 'rgba(255,255,255,0.5)' }}
                  >
                    {i + 1}
                  </span>
                </div>

                {/* Joueur */}
                <div className="flex items-center gap-[10px] min-w-0 pl-[2px]">
                  <div
                    className="relative rounded-[7px] shrink-0 size-[36px] overflow-hidden"
                    style={medal ? { boxShadow: `0 0 0 2px ${medal}` } : undefined}
                  >
                    <Avatar name={p.name} className="absolute inset-0 max-w-none object-cover pointer-events-none rounded-[7px] size-full" />
                  </div>
                  <span className="font-mono font-semibold text-[15px] text-white tracking-[-0.5px] truncate">{p.name}</span>
                </div>

                {/* Valeurs */}
                {COLUMNS.map(col => {
                  const raw = p.stats[col.key] ?? 0
                  const active = col.key === sortKey
                  return (
                    <div key={col.key} className="flex items-center justify-end pr-[6px]">
                      <span
                        className={`font-mono text-[14px] tabular-nums tracking-[-0.3px] ${
                          raw <= 0 ? 'text-white/25' : active ? 'text-white font-semibold' : 'text-white/70'
                        }`}
                      >
                        {col.format(raw)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )
          })}

          {/* États */}
          {loading && (
            <div className="flex flex-col items-center justify-center gap-[12px] py-[80px] text-white/40">
              <svg className="animate-spin" width="22" height="22" fill="none" viewBox="0 0 24 24">
                <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
              </svg>
              <p className="font-ui text-[14px]">Récupération du classement…</p>
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center justify-center gap-[10px] py-[70px] text-center px-[24px]">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" className="text-white/25">
                <path d="M12 8v5m0 3v.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="font-ui font-semibold text-[15px] text-white/70">Classement indisponible</p>
              <p className="font-ui text-[14px] text-white/35 max-w-[420px]">{error}</p>
            </div>
          )}

          {!loading && !error && sorted.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-[10px] py-[70px] text-center px-[24px]">
              <svg width="34" height="34" viewBox="0 0 131 173" fill="none" className="text-white/20">
                <rect x="0" y="114" width="40" height="58" rx="7" fill="currentColor" />
                <rect x="45.5" y="0" width="40" height="173" rx="7" fill="currentColor" />
                <rect x="91" y="62" width="40" height="111" rx="7" fill="currentColor" />
              </svg>
              <p className="font-ui font-semibold text-[15px] text-white/70">
                {query ? 'Aucun joueur trouvé' : 'Pas encore de statistiques'}
              </p>
              <p className="font-ui text-[14px] text-white/35 max-w-[440px]">
                {query
                  ? 'Aucun pseudo ne correspond à ta recherche.'
                  : 'Le classement se remplira dès que l’exporteur du serveur aura publié les premières données.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
