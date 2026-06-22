import { useState, useEffect, useRef, useCallback } from 'react'

// ── Page « Réglages » ─────────────────────────────────────────────────────────
// Préférences propres à l'utilisateur. Pour l'instant : la mémoire (RAM) allouée
// au jeu, à la manière de CurseForge. La valeur est persistée côté processus
// principal (hors de modpack.json, qui est écrasé à chaque mise à jour) et
// appliquée au prochain lancement. Les bornes du curseur dépendent de la RAM
// physique de la machine ; une valeur « conseillée » est dérivée et affichée.

interface RamSettings {
  ram: number            // valeur effective (Go)
  defaultRam: number     // défaut automatique (Go)
  minRam: number         // plancher du curseur (Go)
  maxRam: number         // plafond du curseur = RAM physique (Go)
  recommendedRam: number // valeur conseillée pour cette machine (Go)
  totalGb: number        // RAM physique détectée (Go)
  custom: boolean        // l'utilisateur a-t-il déjà réglé une valeur ?
}

type SaveStatus = 'idle' | 'saving' | 'saved'

// Affiche un nombre de Go à la française (« 6,5 », « 8 ») sans décimale superflue.
const fmtGb = (n: number) => n.toLocaleString('fr-FR', { maximumFractionDigits: 1 })
// Variante toujours à 1 décimale (« 8,0 ») : largeur stable pour le grand chiffre
// pendant le glissement du curseur — sinon il « saute » en passant par un entier.
const fmtGb1 = (n: number) => n.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export default function SettingsPage() {
  const [info, setInfo] = useState<RamSettings | null>(null)
  const [value, setValue] = useState(0)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const [loadError, setLoadError] = useState<string | null>(null)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<number | null>(null)

  useEffect(() => {
    let alive = true
    window.launcher.getSettings()
      .then(s => { if (alive) { setInfo(s); setValue(s.ram) } })
      .catch(e => { if (alive) setLoadError(String((e as Error)?.message || e)) })
    // Au démontage : on n'oublie pas une sauvegarde encore en attente (l'utilisateur
    // a bougé le curseur puis quitté l'onglet avant la fin du débounce).
    return () => {
      alive = false
      if (saveTimer.current) clearTimeout(saveTimer.current)
      if (pending.current !== null) window.launcher.setSettings({ ram: pending.current })
    }
  }, [])

  // Persistance débouncée : on n'écrit pas à chaque pixel de déplacement du curseur.
  const persist = useCallback((ram: number) => {
    pending.current = ram
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setStatus('saving')
    saveTimer.current = setTimeout(() => {
      pending.current = null
      window.launcher.setSettings({ ram })
        .then(() => setStatus('saved'))
        .catch(() => setStatus('idle'))
    }, 350)
  }, [])

  const onSlide = (v: number) => {
    setValue(v)
    persist(v)
  }

  // Réinitialiser = effacer la préférence (retour au défaut automatique).
  const handleReset = () => {
    if (!info) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    pending.current = null
    setValue(info.defaultRam)
    setStatus('saving')
    window.launcher.setSettings({ ram: null })
      .then(() => { setInfo({ ...info, custom: false }); setStatus('saved') })
      .catch(() => setStatus('idle'))
  }

  return (
    <div className="backdrop-blur-[5.95px] bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-[16px] shadow-[2px_2px_8px_0px_rgba(0,0,0,0.1)] flex flex-col h-full overflow-hidden">

      {/* ── EN-TÊTE ── */}
      <div className="flex items-center justify-between px-[24px] py-[16px] shrink-0 gap-[16px] border-b border-[rgba(255,255,255,0.06)]">
        <div className="flex flex-col gap-[2px] min-w-0">
          <p className="font-ui font-semibold text-[16px] text-white tracking-[-0.64px] leading-none">Réglages</p>
          <p className="font-ui text-[14px] text-white/40 tracking-[-0.3px] truncate">Personnalise le launcher</p>
        </div>
      </div>

      {/* ── CONTENU ── */}
      <div className="flex-1 overflow-auto px-[24px] py-[24px] min-h-0">
        <div className="max-w-[640px] mx-auto flex flex-col gap-[20px]">

          {loadError && (
            <div className="flex items-center gap-[10px] rounded-[12px] border border-[rgba(255,150,100,0.3)] bg-[rgba(255,150,100,0.06)] px-[16px] py-[14px]">
              <WarnIcon className="text-[rgba(255,150,100,0.95)] shrink-0" />
              <p className="font-ui text-[14px] text-white/70">Impossible de charger les réglages : {loadError}</p>
            </div>
          )}

          {!info && !loadError && (
            <div className="flex flex-col items-center justify-center gap-[12px] py-[80px] text-white/40">
              <svg className="animate-spin" width="22" height="22" fill="none" viewBox="0 0 24 24">
                <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
              </svg>
              <p className="font-ui text-[14px]">Chargement…</p>
            </div>
          )}

          {info && <RamSection info={info} value={value} status={status} onSlide={onSlide} onReset={handleReset} />}

        </div>
      </div>
    </div>
  )
}

// ── Section « Mémoire allouée » ───────────────────────────────────────────────
function RamSection({
  info, value, status, onSlide, onReset,
}: {
  info: RamSettings
  value: number
  status: SaveStatus
  onSlide: (v: number) => void
  onReset: () => void
}) {
  const { minRam, maxRam, recommendedRam, totalGb, defaultRam, custom } = info

  const span = Math.max(1, maxRam - minRam)
  const pct = ((value - minRam) / span) * 100
  const recPct = ((recommendedRam - minRam) / span) * 100

  // Niveaux d'alerte. « tooHigh » = laisse moins de ~2 Go au système (Windows +
  // launcher), donc risque réel d'instabilité. Sinon on conseille simplement.
  const tooHigh = value > totalGb - 2
  const aboveRec = !tooHigh && value > recommendedRam
  const belowRec = value < recommendedRam

  const isDefault = value === defaultRam && !custom

  let banner: { tone: 'good' | 'note' | 'warn'; text: string }
  if (tooHigh) {
    banner = {
      tone: 'warn',
      text: 'Tu réserves presque toute la mémoire de ta machine. Le système et le launcher risquent d’en manquer — garde au moins 2 Go libres pour éviter les ralentissements ou un plantage.',
    }
  } else if (aboveRec) {
    banner = {
      tone: 'note',
      text: 'Au-delà du conseillé pour cette machine. Donner plus de mémoire à Minecraft n’améliore pas les performances au-delà d’un certain point et peut même rallonger les petits gels (récupération mémoire).',
    }
  } else if (belowRec) {
    banner = {
      tone: 'note',
      text: 'En dessous du conseillé pour ce modpack, qui est lourd. Tu peux manquer de mémoire et subir des ralentissements ou des plantages.',
    }
  } else {
    banner = { tone: 'good', text: 'Réglage équilibré pour ta machine.' }
  }

  return (
    <section className="rounded-[14px] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.025)] p-[22px] flex flex-col gap-[20px]">

      {/* Titre de section */}
      <div className="flex items-start gap-[12px]">
        <div className="flex items-center justify-center size-[38px] rounded-[10px] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.05)] shrink-0">
          <RamIcon className="text-[rgba(0,255,225,0.9)]" />
        </div>
        <div className="flex flex-col gap-[3px] min-w-0">
          <p className="font-ui font-semibold text-[15px] text-white tracking-[-0.4px] leading-none">Mémoire allouée</p>
          <p className="font-ui text-[14px] text-white/45 tracking-[-0.2px]">
            Quantité de mémoire vive réservée au jeu. Plus de mémoire aide les modpacks lourds, jusqu’à un certain point.
          </p>
        </div>
      </div>

      {/* Valeur + recommandation + reset */}
      <div className="flex items-end justify-between gap-[16px] flex-wrap">
        <div className="flex items-baseline gap-[8px]">
          <span className="font-ui font-bold text-[44px] leading-none text-white tabular-nums tracking-[-1.5px]">{fmtGb1(value)}</span>
          <span className="font-ui font-semibold text-[20px] text-white/50">Go</span>
          <span className="font-ui text-[14px] text-white/35 ml-[6px]">sur {totalGb} Go détectés</span>
        </div>

        <div className="flex items-center gap-[10px]">
          <div className="flex items-center gap-[7px] px-[12px] h-[32px] rounded-[10px] border border-[rgba(0,255,225,0.25)] bg-[rgba(0,255,225,0.06)]">
            <CheckIcon className="text-[rgba(0,255,225,0.9)] shrink-0" size={13} />
            <span className="font-ui text-[13px] text-[rgba(0,255,225,0.9)] tracking-[-0.2px] whitespace-nowrap tabular-nums">Conseillé · {recommendedRam} Go</span>
          </div>
          <button
            onClick={onReset}
            disabled={isDefault}
            title="Revenir à la valeur par défaut"
            className="flex items-center gap-[6px] px-[12px] h-[32px] rounded-[10px] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.05)] text-white/55 hover:text-white hover:bg-[rgba(255,255,255,0.1)] disabled:opacity-35 disabled:hover:bg-[rgba(255,255,255,0.05)] disabled:hover:text-white/55 transition-colors"
          >
            <ResetIcon size={14} />
            <span className="font-ui text-[13px] tracking-[-0.2px]">Réinitialiser</span>
          </button>
        </div>
      </div>

      {/* Curseur */}
      <div>
        <div className="relative">
          <input
            type="range"
            min={minRam}
            max={maxRam}
            step={0.1}
            value={value}
            onChange={e => onSlide(Number(e.target.value))}
            aria-label="Mémoire allouée en gigaoctets"
            className={`ram-range ${tooHigh ? 'ram-range--warn' : ''}`}
            style={{ '--ram-pct': `${pct}%` } as React.CSSProperties}
          />
          {/* Repère « conseillé » aligné sur la course du centre du pouce (rayon 10px) */}
          {recPct >= 0 && recPct <= 100 && (
            <div className="absolute left-[10px] right-[10px] top-[19px] h-0 pointer-events-none">
              <div className="absolute -translate-x-1/2" style={{ left: `${recPct}%` }}>
                <div className="w-px h-[6px] bg-[rgba(0,255,225,0.55)] mx-auto" />
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-between mt-[14px] px-[2px]">
          <span className="font-ui text-[13px] text-white/35 tabular-nums">{minRam} Go</span>
          <span className="font-ui text-[13px] text-white/35 tabular-nums">{maxRam} Go</span>
        </div>
      </div>

      {/* Bandeau contextuel */}
      <Banner tone={banner.tone} text={banner.text} />

      {/* Pied : portée + statut d'enregistrement */}
      <div className="flex items-center justify-between gap-[12px] pt-[4px] border-t border-[rgba(255,255,255,0.06)]">
        <p className="font-ui text-[13px] text-white/35 tracking-[-0.2px]">Appliqué au prochain lancement du jeu.</p>
        <div className="h-[16px] flex items-center">
          {status === 'saving' && (
            <span className="font-ui text-[13px] text-white/40 tracking-[-0.2px]">Enregistrement…</span>
          )}
          {status === 'saved' && (
            <span className="flex items-center gap-[5px] font-ui text-[13px] text-[rgba(0,255,225,0.85)] tracking-[-0.2px]">
              <CheckIcon size={13} /> Enregistré
            </span>
          )}
        </div>
      </div>
    </section>
  )
}

// ── Bandeau d'information / avertissement ─────────────────────────────────────
function Banner({ tone, text }: { tone: 'good' | 'note' | 'warn'; text: string }) {
  const styles = {
    good: { border: 'rgba(0,255,225,0.22)', bg: 'rgba(0,255,225,0.05)', color: 'rgba(0,255,225,0.9)' },
    note: { border: 'rgba(255,255,255,0.1)', bg: 'rgba(255,255,255,0.03)', color: 'rgba(255,255,255,0.5)' },
    warn: { border: 'rgba(255,150,100,0.3)', bg: 'rgba(255,150,100,0.06)', color: 'rgba(255,150,100,0.95)' },
  }[tone]
  return (
    <div
      className="flex items-start gap-[10px] rounded-[12px] px-[14px] py-[12px]"
      style={{ border: `1px solid ${styles.border}`, background: styles.bg }}
    >
      <span className="shrink-0 mt-[1px]" style={{ color: styles.color }}>
        {tone === 'warn' ? <WarnIcon /> : tone === 'good' ? <CheckCircleIcon /> : <InfoIcon />}
      </span>
      <p className="font-ui text-[14px] leading-[1.5] text-white/65 tracking-[-0.2px]">{text}</p>
    </div>
  )
}

// ── Icônes (stroke 1.3, cohérentes avec Stats.tsx) ────────────────────────────
function RamIcon({ className = '' }: { className?: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className={className}>
      <rect x="2" y="6" width="16" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6 14v2M10 14v2M14 14v2M6 4v2M10 4v2M14 4v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <rect x="5.5" y="9" width="3" height="2.5" rx="0.5" fill="currentColor" />
      <rect x="11.5" y="9" width="3" height="2.5" rx="0.5" fill="currentColor" />
    </svg>
  )
}

function ResetIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2v2.6h-2.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CheckIcon({ className = '', size = 16 }: { className?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M3 8.5 6.5 12 13 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function CheckCircleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5.2 8.2 7.2 10.2 10.9 5.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function InfoIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.3" />
      <path d="M8 7.2v3.4M8 5.2v.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

function WarnIcon({ className = '' }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={className}>
      <path d="M8 1.8 1.4 13.2A1 1 0 0 0 2.3 14.7h11.4a1 1 0 0 0 .9-1.5L8 1.8Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M8 6.2v3M8 11.4v.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}
