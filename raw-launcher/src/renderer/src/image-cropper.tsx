import {
  useEffect, useRef, useState, useCallback,
  type WheelEvent as ReactWheelEvent, type MouseEvent as ReactMouseEvent,
} from 'react'

// Éditeur de recadrage maison (aucune dépendance externe / réseau). L'admin déplace
// et zoome l'image dans un cadre au ratio EXACT de la bannière de news, puis valide.
// La sortie est une image déjà au bon ratio → l'affichage (object-cover) ne rogne plus
// rien. Les zones non couvertes restent transparentes : un visuel transparent (logo,
// Zig Coin) peut donc être dézoomé pour tenir entier, centré, sans fond ajouté.
//
// ⚠️ `src` DOIT être une data: URL (pas une URL http distante) : on exporte le canvas
//    via toDataURL, ce qui échoue sur un canvas « taché » par une image cross-origin.
//    Le dashboard résout les images distantes en data: URL (proxy main) avant d'ouvrir.

const FRAME_W = 468                          // largeur du cadre d'édition (px)
const OUT_W = 1480                           // largeur de sortie (740 @2x, net en HiDPI)

type Props = {
  src: string
  aspect: number                             // largeur / hauteur (2 = 2:1)
  onCancel: () => void
  onConfirm: (dataUrl: string, mime: string) => void
}

export function ImageCropper({ src, aspect, onCancel, onConfirm }: Props) {
  const frameW = FRAME_W
  const frameH = Math.round(FRAME_W / aspect)

  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [nat, setNat] = useState({ w: 0, h: 0 })
  const [scale, setScale] = useState(1)
  const [minScale, setMinScale] = useState(0.1)
  const [maxScale, setMaxScale] = useState(4)
  const [off, setOff] = useState({ x: 0, y: 0 })
  const [panning, setPanning] = useState(false)
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  // Chargement + cadrage initial (l'image remplit le cadre, centrée).
  useEffect(() => {
    let alive = true
    const im = new Image()
    im.onload = () => {
      if (!alive) return
      const fit = Math.min(frameW / im.naturalWidth, frameH / im.naturalHeight)   // tout visible
      const cover = Math.max(frameW / im.naturalWidth, frameH / im.naturalHeight) // remplit
      setImg(im); setNat({ w: im.naturalWidth, h: im.naturalHeight })
      setMinScale(fit); setMaxScale(Math.max(cover * 4, fit * 6))
      setScale(cover); setOff({ x: 0, y: 0 })
    }
    im.onerror = () => { if (alive) onCancel() }
    im.src = src
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  // Borne le déplacement : pas de vide quand l'image couvre, centrage quand elle est
  // plus petite que le cadre sur un axe (cas letterbox d'un visuel transparent).
  const clampOff = useCallback((s: number, x: number, y: number) => {
    const dw = nat.w * s, dh = nat.h * s
    const mx = Math.max(0, (dw - frameW) / 2)
    const my = Math.max(0, (dh - frameH) / 2)
    return { x: Math.min(mx, Math.max(-mx, x)), y: Math.min(my, Math.max(-my, y)) }
  }, [nat, frameW, frameH])

  const applyScale = useCallback((s: number) => {
    const ns = Math.min(maxScale, Math.max(minScale, s))
    setScale(ns)
    setOff(o => clampOff(ns, o.x, o.y))
  }, [minScale, maxScale, clampOff])

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!drag.current) return
      setOff(clampOff(scale, drag.current.ox + (e.clientX - drag.current.x), drag.current.oy + (e.clientY - drag.current.y)))
    }
    const up = () => { drag.current = null; setPanning(false) }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  }, [scale, clampOff])

  const onWheel = (e: ReactWheelEvent) => { e.preventDefault(); applyScale(scale * (e.deltaY < 0 ? 1.08 : 1 / 1.08)) }
  const onDown = (e: ReactMouseEvent) => { drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y }; setPanning(true) }

  const dispW = nat.w * scale, dispH = nat.h * scale
  const left = frameW / 2 + off.x - dispW / 2
  const top = frameH / 2 + off.y - dispH / 2

  const confirm = () => {
    if (!img) return
    const render = (ow: number) => {
      const oh = Math.round(ow / aspect)
      const cv = document.createElement('canvas'); cv.width = ow; cv.height = oh
      const ctx = cv.getContext('2d')!
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'
      const f = ow / frameW
      ctx.drawImage(img, left * f, top * f, dispW * f, dispH * f)
      return { cv, ctx }
    }
    let { cv, ctx } = render(OUT_W)
    // Opaque → JPEG (léger) ; transparence détectée → PNG (la préserve).
    let opaque = true
    try {
      const d = ctx.getImageData(0, 0, cv.width, cv.height).data
      for (let i = 3; i < d.length; i += 4) { if (d[i] < 255) { opaque = false; break } }
    } catch { opaque = false }
    const mime = opaque ? 'image/jpeg' : 'image/png'
    let dataUrl = cv.toDataURL(mime, 0.9)
    // Garde-fou 4 Mo (le main refuse au-delà) : PNG transparent trop lourd → 1×.
    if (dataUrl.length * 0.75 > 3.8 * 1024 * 1024) {
      ;({ cv } = render(Math.round(OUT_W / 2)))
      dataUrl = cv.toDataURL(mime, 0.85)
    }
    onConfirm(dataUrl, mime)
  }

  const checker =
    'linear-gradient(45deg,#26262c 25%,transparent 25%),linear-gradient(-45deg,#26262c 25%,transparent 25%),' +
    'linear-gradient(45deg,transparent 75%,#26262c 75%),linear-gradient(-45deg,transparent 75%,#26262c 75%)'

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center modal-backdrop-enter"
      style={{ background: 'rgba(8,8,12,0.62)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}
      onMouseDown={onCancel}
    >
      <div
        className="relative flex flex-col gap-[16px] rounded-[16px] border border-[rgba(255,255,255,0.16)] p-[20px] modal-card-enter"
        style={{ background: 'rgba(18,18,24,0.94)', backdropFilter: 'blur(28px)', WebkitBackdropFilter: 'blur(28px)', boxShadow: '0 30px 90px rgba(0,0,0,0.5)' }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <p className="font-ui font-semibold text-[16px] text-white tracking-[-0.4px]">Recadrer l'image</p>

        {/* Cadre au format de la bannière */}
        <div
          className="relative overflow-hidden rounded-[10px] select-none"
          style={{ width: frameW, height: frameH, cursor: panning ? 'grabbing' : 'grab', backgroundColor: '#1c1c22', backgroundImage: checker, backgroundSize: '18px 18px', backgroundPosition: '0 0,0 9px,9px -9px,-9px 0' }}
          onWheel={onWheel}
          onMouseDown={onDown}
        >
          {img && (
            <img
              src={src}
              alt=""
              draggable={false}
              style={{ position: 'absolute', left, top, width: dispW, height: dispH, maxWidth: 'none', userSelect: 'none', pointerEvents: 'none' }}
            />
          )}
          <div className="absolute inset-0 pointer-events-none rounded-[10px] border border-[rgba(255,255,255,0.18)]" />
        </div>

        {/* Zoom */}
        <div className="flex items-center gap-[12px]">
          <span className="font-ui text-[13px] text-white/50 shrink-0">Zoom</span>
          <input
            type="range"
            min={minScale}
            max={maxScale}
            step={(maxScale - minScale) / 120 || 0.01}
            value={scale}
            onChange={(e) => applyScale(parseFloat(e.target.value))}
            className="flex-1 accent-[#00ffe1] cursor-pointer"
          />
        </div>

        <div className="flex items-center justify-between gap-[12px]">
          <p className="font-ui text-[12px] text-white/35">Glisse pour déplacer · molette ou curseur pour zoomer</p>
          <div className="flex items-center gap-[10px] shrink-0">
            <button
              type="button"
              onClick={onCancel}
              className="font-ui text-[14px] tracking-[-0.3px] text-white/80 px-[16px] h-[36px] rounded-[9px] border border-[rgba(255,255,255,0.2)] bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.1)] transition-colors"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={confirm}
              className="font-ui font-semibold text-[14px] tracking-[-0.3px] text-black px-[18px] h-[36px] rounded-[9px] bg-white hover:bg-white/90 active:scale-[0.98] transition-all"
            >
              Recadrer
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
