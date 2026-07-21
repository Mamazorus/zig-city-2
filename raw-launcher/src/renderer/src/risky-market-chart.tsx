// Graphique en bougies du taux RISQUÉ de la banque (dashboard admin). Une bougie par cycle
// écoulé, PARTAGÉ entre tous les joueurs (cf. zig-shop-mod BankAccountData#riskyCandles) :
// open/close = valeur d'un indice synthétique (base 1000) qui capitalise le tirage de chaque
// cycle — permet une vraie courbe de tendance (open == close du cycle précédent), pas une série
// de barres indépendantes. Couleurs validées séparation CVD + contraste (script dataviz du
// skill) sur le fond sombre de l'appli (#0e0b16), cohérentes avec le vert/rouge déjà utilisés
// pour les messages de succès/erreur ailleurs dans le launcher.
import { useMemo, useState } from 'react'

export interface RiskyCandle {
  date: string
  pct: number
  open: number
  close: number
}

const UP = '#78ffb4'
const DOWN = '#ff7878'
const VIEW_W = 640
const VIEW_H = 190
const PAD_L = 40
const PAD_R = 6
const PAD_T = 10
const PAD_B = 6

function fmtPct(v: number): string {
  return (v >= 0 ? '+' : '') + v.toFixed(1) + '%'
}

export function RiskyMarketChart({ candles }: { candles: RiskyCandle[] }) {
  const [hover, setHover] = useState<number | null>(null)

  const { minV, maxV, ticks } = useMemo(() => {
    if (candles.length === 0) return { minV: 0, maxV: 1, ticks: [] as number[] }
    let lo = Infinity
    let hi = -Infinity
    for (const c of candles) {
      lo = Math.min(lo, c.open, c.close)
      hi = Math.max(hi, c.open, c.close)
    }
    const pad = Math.max(1, (hi - lo) * 0.15)
    lo -= pad
    hi += pad
    return { minV: lo, maxV: hi, ticks: [hi, (lo + hi) / 2, lo] }
  }, [candles])

  if (candles.length === 0) {
    return <p className="font-ui text-[14px] text-white/30 text-center py-[20px]">Pas encore de cycle enregistré.</p>
  }

  const plotW = VIEW_W - PAD_L - PAD_R
  const plotH = VIEW_H - PAD_T - PAD_B
  const slotW = plotW / candles.length
  const bodyW = Math.max(2, Math.min(14, slotW * 0.6))
  const toY = (v: number) => PAD_T + plotH - ((v - minV) / (maxV - minV || 1)) * plotH

  const shown = candles[hover ?? candles.length - 1]

  return (
    <div className="flex flex-col gap-[8px]">
      <div className="flex items-baseline gap-[8px]">
        <span className="font-ui text-[13px] text-white/50 tracking-[-0.3px]">{hover != null ? shown.date : 'Dernier cycle'}</span>
        <span className="font-ui font-semibold text-[15px] tracking-[-0.3px]" style={{ color: shown.pct >= 0 ? UP : DOWN }}>
          {fmtPct(shown.pct)}
        </span>
        <span className="font-ui text-[12px] text-white/35 tracking-[-0.3px]">indice {Math.round(shown.close)}</span>
      </div>

      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="w-full h-auto block" role="img" aria-label="Historique en bougies du taux risque">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD_L} x2={VIEW_W - PAD_R} y1={toY(t)} y2={toY(t)} stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
            <text x={PAD_L - 6} y={toY(t)} textAnchor="end" dominantBaseline="middle" fontSize={9} fill="rgba(255,255,255,0.35)">
              {Math.round(t)}
            </text>
          </g>
        ))}
        {candles.map((c, i) => {
          const cx = PAD_L + i * slotW + slotW / 2
          const yOpen = toY(c.open)
          const yClose = toY(c.close)
          const top = Math.min(yOpen, yClose)
          const h = Math.max(1.5, Math.abs(yClose - yOpen))
          const up = c.close >= c.open
          const dim = hover != null && hover !== i
          return (
            <g key={i}>
              <rect x={cx - bodyW / 2} y={top} width={bodyW} height={h} fill={up ? UP : DOWN} opacity={dim ? 0.4 : 1} />
              <rect
                x={PAD_L + i * slotW}
                y={PAD_T}
                width={slotW}
                height={plotH}
                fill="transparent"
                pointerEvents="all"
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover((h2) => (h2 === i ? null : h2))}
              />
            </g>
          )
        })}
      </svg>
    </div>
  )
}
