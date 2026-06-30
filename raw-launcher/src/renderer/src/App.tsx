import { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef, forwardRef, useImperativeHandle } from 'react'
import { SkinViewer } from 'skinview3d'
import { Raycaster, Vector2, MOUSE, type Object3D } from 'three'
import packData from '../../../modpack.json'
import AdminDashboard from './AdminDashboard'
import StatsPage from './Stats'
import SettingsPage from './Settings'
import ChatPanel from './ChatPanel'
import { resolveCategory, CategoryBadge, NewsFallback, NEWS_BANNER_RATIO, type NewsCategory } from './news'
import { Avatar, RemoteNewsImage, useRemoteImage } from './remote-image'
import { useItemIconSrc } from './item-icon'
import type { ItemIconDesc } from './block-renderer'

import bgImage from './assets/bg.png'
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

type Phase = 'loading' | 'updating' | 'logged-out' | 'checking' | 'installing' | 'ready' | 'launching' | 'error'
type MainTab = 'home' | 'stats' | 'chat' | 'admin' | 'settings'

interface DynamicNewsItem {
  id: string
  title: string
  date: string
  body: string
  imageUrl?: string
  author?: string
  category?: NewsCategory
  createdAt?: number
}

type AnyNewsItem = { img?: string; title: string; date: string; body: string; imageUrl?: string; id?: string; author?: string; category?: NewsCategory }

// Offre (troc) du shop du jour, renvoyée par le main (lecture de /shop/days/{aujourd'hui}).
type ShopOfferView = { id: string; input: string; inputQty: number; output: string; outputQty: number; maxUses?: number; used?: number; inputIcon?: ItemIconDesc | null; outputIcon?: ItemIconDesc | null }

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

// Compose une vue de face du personnage à partir d'un PNG de skin Minecraft
// (64×64 ou 64×32 legacy). Rendu pixel-perfect, sans dépendance externe.
function drawSkinBody(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | HTMLCanvasElement,
  variant: 'classic' | 'slim',
  canvasW: number,
  canvasH: number
) {
  const legacy = img.height === 32
  const armW = variant === 'slim' ? 3 : 4

  // Disposition virtuelle (1 unité = 1 pixel de skin), vue de face :
  //   largeur 16 = bras(4) + corps(8) + bras(4)   |   hauteur 32 = tête(8) + corps(12) + jambes(12)
  const VW = 16
  const VH = 32
  const scale = Math.max(1, Math.floor(Math.min(canvasW / VW, canvasH / VH)))
  const offsetX = Math.round((canvasW - VW * scale) / 2)
  const offsetY = Math.round((canvasH - VH * scale) / 2)

  ctx.imageSmoothingEnabled = false

  // Dessine une région source (sx,sy,sw,sh) à la position virtuelle (dx,dy)
  const part = (sx: number, sy: number, sw: number, sh: number, dx: number, dy: number) => {
    ctx.drawImage(img, sx, sy, sw, sh, offsetX + dx * scale, offsetY + dy * scale, sw * scale, sh * scale)
  }

  // ── Couche de base ──
  part(8, 8, 8, 8, 4, 0)               // tête
  part(20, 20, 8, 12, 4, 8)            // corps
  part(44, 20, armW, 12, 4 - armW, 8)  // bras droit (côté gauche de l'écran)
  part(4, 20, 4, 12, 4, 20)            // jambe droite
  if (legacy) {
    part(44, 20, armW, 12, 12, 8)      // bras gauche (réutilise la région droite)
    part(4, 20, 4, 12, 8, 20)          // jambe gauche
  } else {
    part(36, 52, armW, 12, 12, 8)      // bras gauche
    part(20, 52, 4, 12, 8, 20)         // jambe gauche
  }

  // ── Couche overlay (2e couche) ──
  part(40, 8, 8, 8, 4, 0)              // chapeau / cheveux
  if (!legacy) {
    part(20, 36, 8, 12, 4, 8)            // veste
    part(44, 36, armW, 12, 4 - armW, 8)  // manche droite
    part(52, 52, armW, 12, 12, 8)        // manche gauche
    part(4, 36, 4, 12, 4, 20)            // surcouche jambe droite
    part(4, 52, 4, 12, 8, 20)            // surcouche jambe gauche
  }
}

function SkinPreview({
  src = null,
  sourceCanvas = null,
  version = 0,
  variant,
  width = 176
}: {
  src?: string | null
  sourceCanvas?: HTMLCanvasElement | null
  version?: number
  variant: 'classic' | 'slim'
  width?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Mode édition en direct : on dessine depuis un canvas source (déjà en mémoire)
    if (sourceCanvas) {
      try { drawSkinBody(ctx, sourceCanvas, variant, canvas.width, canvas.height) } catch {}
      return
    }

    if (!src) return
    const img = new Image()
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      try { drawSkinBody(ctx, img, variant, canvas.width, canvas.height) } catch {}
    }
    // En cas d'échec de chargement (réseau/CORS), on laisse l'aperçu vide proprement
    img.onerror = () => { ctx.clearRect(0, 0, canvas.width, canvas.height) }
    img.src = src
    return () => { img.onload = null; img.onerror = null }
  }, [src, sourceCanvas, version, variant])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={width * 2}
      style={{ imageRendering: 'pixelated', width, height: width * 2 }}
    />
  )
}

// Aperçu 3D du personnage (skinview3d / WebGL). Statique (pas d'animation) ;
// clic gauche = peindre directement sur le modèle (à la Novaskin), clic droit =
// pivoter, molette = zoomer. Le clic est converti en pixel via l'UV : skinview3d
// mappe (x/64, 1 - y/64), donc UV (u,v) → pixel (u·64, (1-v)·64).
function Skin3DViewer({
  sourceCanvas,
  version,
  variant,
  width,
  height,
  paintLayer,
  showOverlay,
  onModelDown,
  onModelMove,
  onModelUp
}: {
  sourceCanvas: HTMLCanvasElement | null
  version: number
  variant: 'classic' | 'slim'
  width: number
  height: number
  paintLayer: 'base' | 'overlay'
  showOverlay: boolean
  onModelDown: (px: number, py: number) => void
  onModelMove: (px: number, py: number) => void
  onModelUp: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const viewerRef = useRef<SkinViewer | null>(null)
  const rafRef = useRef<number | null>(null)
  const [failed, setFailed] = useState(false)
  const raycaster = useRef(new Raycaster())
  const ndc = useRef(new Vector2())
  const painting = useRef(false)
  const layerRef = useRef(paintLayer)
  useEffect(() => { layerRef.current = paintLayer }, [paintLayer])

  const parts = (): Array<{ inner: Object3D; outer: Object3D }> => {
    const s = viewerRef.current?.playerObject?.skin
    if (!s) return []
    return [s.head, s.body, s.rightArm, s.leftArm, s.rightLeg, s.leftLeg]
      .map(p => ({ inner: p.innerLayer, outer: p.outerLayer }))
  }

  const tagMeshes = () => {
    for (const p of parts()) {
      p.inner.traverse(o => { o.userData.skinLayer = 'inner' })
      p.outer.traverse(o => { o.userData.skinLayer = 'outer' })
    }
  }

  const applyOverlayVisibility = (v: boolean) => {
    for (const p of parts()) p.outer.visible = v
  }

  // Initialisation unique du viewer
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let viewer: SkinViewer | null = null
    try {
      viewer = new SkinViewer({ canvas, width, height })
      viewer.animation = null          // personnage statique
      viewer.autoRotate = false
      viewer.background = null          // fond transparent
      viewer.fov = 45
      viewer.zoom = 0.82
      viewer.controls.enableRotate = true
      viewer.controls.enableZoom = true
      viewer.controls.enablePan = false
      viewer.controls.minPolarAngle = 0          // permet de voir le dessus
      viewer.controls.maxPolarAngle = Math.PI    // ...et le dessous
      // clic gauche libéré pour peindre, clic droit pour pivoter
      viewer.controls.mouseButtons = { LEFT: null as unknown as MOUSE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE }
      viewerRef.current = viewer
    } catch {
      setFailed(true)
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      viewerRef.current?.dispose()
      viewerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Redimensionnement
  useEffect(() => { viewerRef.current?.setSize(width, height) }, [width, height])

  // (Re)charge la texture depuis le canvas de travail à chaque édition / variante
  useEffect(() => {
    const viewer = viewerRef.current
    if (!viewer || !sourceCanvas) return
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      try {
        viewer.loadSkin(sourceCanvas, { model: variant === 'slim' ? 'slim' : 'default' })
        tagMeshes()
        applyOverlayVisibility(showOverlay)
      } catch {}
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, variant, sourceCanvas])

  // Visibilité de la couche du dessus
  useEffect(() => { applyOverlayVisibility(showOverlay) }, [showOverlay])

  // Convertit un point écran en pixel de skin via raycast (couche sélectionnée)
  const pixelFromEvent = (clientX: number, clientY: number): { px: number; py: number } | null => {
    const viewer = viewerRef.current
    const canvas = canvasRef.current
    if (!viewer || !canvas) return null
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return null
    ndc.current.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    )
    viewer.playerObject.updateMatrixWorld(true)
    raycaster.current.setFromCamera(ndc.current, viewer.camera)
    const want = layerRef.current === 'overlay' ? 'outer' : 'inner'
    const hits = raycaster.current.intersectObject(viewer.playerObject, true)
    for (const h of hits) {
      if (!h.uv || h.object.userData?.skinLayer !== want) continue
      const px = Math.min(63, Math.max(0, Math.floor(h.uv.x * 64)))
      const py = Math.min(63, Math.max(0, Math.floor((1 - h.uv.y) * 64)))
      return { px, py }
    }
    return null
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return            // clic droit → laissé à la rotation
    const hit = pixelFromEvent(e.clientX, e.clientY)
    if (!hit) return                       // clic dans le vide → ne peint pas
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    painting.current = true
    onModelDown(hit.px, hit.py)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!painting.current) return
    const hit = pixelFromEvent(e.clientX, e.clientY)
    if (hit) onModelMove(hit.px, hit.py)
  }

  const endStroke = () => {
    if (!painting.current) return
    painting.current = false
    onModelUp()
  }

  // Repli 2D si WebGL indisponible
  if (failed) {
    return (
      <div className="absolute inset-0 flex items-end justify-center pb-[16px]">
        <SkinPreview sourceCanvas={sourceCanvas} version={version} variant={variant} width={Math.min(width - 24, 150)} />
      </div>
    )
  }

  return (
    <canvas
      ref={canvasRef}
      className="touch-none select-none"
      style={{ cursor: 'crosshair' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endStroke}
      onPointerCancel={endStroke}
    />
  )
}

// ── Éditeur de skin pixel par pixel intégré ──────────────────────────────────
const SKIN_PX = 64                 // dimension logique d'un skin (64×64)
const EDIT_CELL = 8                // taille d'affichage d'un pixel de skin (px)

const SKIN_PALETTE = [
  '#000000', '#3a3a3a', '#6e6e6e', '#a8a8a8', '#e6e6e6', '#ffffff',
  '#5a3417', '#8a4f24', '#c07a3e', '#e7b07a', '#ffd9a8', '#f1c27d',
  '#7a1f1f', '#c43c3c', '#ff5a5a', '#b5651d', '#e08a2e', '#ffcb45',
  '#1f5f2a', '#3fa04a', '#7fe06a', '#1f3f7a', '#3a6fc4', '#5aa0ff',
  '#3d2470', '#6f44c0', '#b48aff', '#1f6f6a', '#2fb0a0', '#0e0b16',
]

// Repères des zones (couche de base, vue de face) pour s'orienter sur la grille
const SKIN_GUIDES = [
  { x: 8, y: 8, w: 8, h: 8 },    // tête
  { x: 20, y: 20, w: 8, h: 12 }, // corps
  { x: 44, y: 20, w: 4, h: 12 }, // bras droit
  { x: 36, y: 52, w: 4, h: 12 }, // bras gauche
  { x: 4, y: 20, w: 4, h: 12 },  // jambe droite
  { x: 20, y: 52, w: 4, h: 12 }, // jambe gauche
  { x: 40, y: 8, w: 8, h: 8 },   // chapeau (overlay tête)
]

// ── Sélecteur de couleur chromatique (carré saturation/valeur + teinte) ──────
function hexToHsv(hex: string): { h: number; s: number; v: number } {
  let r = 0, g = 0, b = 0
  const m = /^#?([0-9a-f]{6})$/i.exec((hex || '').trim())
  if (m) { const n = parseInt(m[1], 16); r = (n >> 16) & 255; g = (n >> 8) & 255; b = n & 255 }
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h = h * 60; if (h < 0) h += 360
  }
  return { h, s: max === 0 ? 0 : d / max, v: max }
}

function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const mm = v - c
  let r = 0, g = 0, b = 0
  if (h < 60) { r = c; g = x } else if (h < 120) { r = x; g = c }
  else if (h < 180) { g = c; b = x } else if (h < 240) { g = x; b = c }
  else if (h < 300) { r = x; b = c } else { r = c; b = x }
  const to = (n: number) => Math.round((n + mm) * 255).toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

function ColorPicker({ color, onChange }: { color: string; onChange: (hex: string) => void }) {
  const svRef = useRef<HTMLCanvasElement>(null)
  const [hsv, setHsv] = useState(() => hexToHsv(color))
  const dragSV = useRef(false)
  const dragHue = useRef(false)

  // Synchronise quand la couleur vient de l'extérieur (pipette, couleur récente)
  useEffect(() => {
    if (hsvToHex(hsv.h, hsv.s, hsv.v).toLowerCase() !== (color || '').toLowerCase()) {
      setHsv(hexToHsv(color))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color])

  // Dessine le carré saturation/valeur pour la teinte courante
  useEffect(() => {
    const cv = svRef.current; if (!cv) return
    const ctx = cv.getContext('2d'); if (!ctx) return
    const W = cv.width, H = cv.height
    ctx.fillStyle = `hsl(${hsv.h}, 100%, 50%)`
    ctx.fillRect(0, 0, W, H)
    const gw = ctx.createLinearGradient(0, 0, W, 0)
    gw.addColorStop(0, 'rgba(255,255,255,1)'); gw.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = gw; ctx.fillRect(0, 0, W, H)
    const gb = ctx.createLinearGradient(0, 0, 0, H)
    gb.addColorStop(0, 'rgba(0,0,0,0)'); gb.addColorStop(1, 'rgba(0,0,0,1)')
    ctx.fillStyle = gb; ctx.fillRect(0, 0, W, H)
  }, [hsv.h])

  const commit = (n: { h: number; s: number; v: number }) => { setHsv(n); onChange(hsvToHex(n.h, n.s, n.v)) }

  const svFromEvent = (e: React.PointerEvent) => {
    const r = svRef.current!.getBoundingClientRect()
    const s = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    const v = 1 - Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    commit({ h: hsv.h, s, v })
  }
  const hueFromEvent = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const h = Math.min(359.99, Math.max(0, ((e.clientX - r.left) / r.width) * 360))
    commit({ h, s: hsv.s, v: hsv.v })
  }

  return (
    <div className="flex flex-col gap-[8px]">
      <div className="relative rounded-[8px] overflow-hidden border border-[rgba(255,255,255,0.12)]">
        <canvas
          ref={svRef}
          width={252}
          height={120}
          className="block touch-none select-none"
          style={{ width: '100%', height: 120, cursor: 'crosshair' }}
          onPointerDown={e => { dragSV.current = true; e.currentTarget.setPointerCapture(e.pointerId); svFromEvent(e) }}
          onPointerMove={e => { if (dragSV.current) svFromEvent(e) }}
          onPointerUp={() => { dragSV.current = false }}
          onPointerCancel={() => { dragSV.current = false }}
        />
        <div
          className="absolute rounded-full border-2 border-white pointer-events-none"
          style={{ width: 12, height: 12, left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, transform: 'translate(-50%,-50%)', boxShadow: '0 0 0 1px rgba(0,0,0,0.55)' }}
        />
      </div>
      <div
        className="relative rounded-full touch-none select-none"
        style={{ height: 14, cursor: 'pointer', background: 'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)' }}
        onPointerDown={e => { dragHue.current = true; e.currentTarget.setPointerCapture(e.pointerId); hueFromEvent(e) }}
        onPointerMove={e => { if (dragHue.current) hueFromEvent(e) }}
        onPointerUp={() => { dragHue.current = false }}
        onPointerCancel={() => { dragHue.current = false }}
      >
        <div
          className="absolute top-1/2 rounded-full border-2 border-white pointer-events-none"
          style={{ width: 16, height: 16, left: `${(hsv.h / 360) * 100}%`, transform: 'translate(-50%,-50%)', boxShadow: '0 0 0 1px rgba(0,0,0,0.55)' }}
        />
      </div>
    </div>
  )
}

type EditorTool = 'brush' | 'eraser' | 'eyedropper'
interface SkinEditorHandle { getDataURL: () => string | null }

const SkinEditor = forwardRef<SkinEditorHandle, {
  loadSrc: string | null
  loadKey: number
  variant: 'classic' | 'slim'
  onVariantChange: (v: 'classic' | 'slim') => void
}>(function SkinEditor({ loadSrc, loadKey, variant, onVariantChange }, ref) {
  const workRef = useRef<HTMLCanvasElement | null>(null)   // 64×64 (source de vérité)
  const gridRef = useRef<HTMLCanvasElement>(null)          // grille zoomée visible
  const [tool, setTool] = useState<EditorTool>('brush')
  const [color, setColor] = useState('#c43c3c')
  const [showGuides, setShowGuides] = useState(true)
  const [previewVer, setPreviewVer] = useState(0)
  const [, setHistVer] = useState(0)
  const [paintLayer, setPaintLayer] = useState<'base' | 'overlay'>('base')
  const [hideOverlay, setHideOverlay] = useState(false)
  const [showFlat, setShowFlat] = useState(true)
  const [recentColors, setRecentColors] = useState<string[]>(
    ['#ffffff', '#c9c9c9', '#000000', '#c43c3c', '#e08a2e', '#ffcb45', '#3fa04a', '#3a6fc4']
  )
  // la couche du dessus est forcément visible quand on l'édite
  const overlayVisible = paintLayer === 'overlay' ? true : !hideOverlay

  const noteColorUsed = (c: string) => {
    setRecentColors(prev => [c, ...prev.filter(x => x.toLowerCase() !== c.toLowerCase())].slice(0, 14))
  }

  const undoStack = useRef<ImageData[]>([])
  const redoStack = useRef<ImageData[]>([])
  const painting = useRef(false)
  const lastCell = useRef<{ x: number; y: number } | null>(null)
  const toolRef = useRef(tool)
  const colorRef = useRef(color)
  useEffect(() => { toolRef.current = tool }, [tool])
  useEffect(() => { colorRef.current = color }, [color])

  const workCtx = () => workRef.current!.getContext('2d', { willReadFrequently: true })!

  // Dessine la grille zoomée (damier de transparence + skin + lignes + repères)
  const drawGrid = useCallback(() => {
    const grid = gridRef.current
    const work = workRef.current
    if (!grid || !work) return
    const g = grid.getContext('2d')!
    const S = EDIT_CELL
    g.clearRect(0, 0, grid.width, grid.height)
    // damier de transparence
    for (let y = 0; y < SKIN_PX; y++) {
      for (let x = 0; x < SKIN_PX; x++) {
        g.fillStyle = (x + y) % 2 === 0 ? '#2a2733' : '#211e2a'
        g.fillRect(x * S, y * S, S, S)
      }
    }
    g.imageSmoothingEnabled = false
    g.drawImage(work, 0, 0, SKIN_PX, SKIN_PX, 0, 0, grid.width, grid.height)
    // lignes de grille
    g.strokeStyle = 'rgba(255,255,255,0.06)'
    g.lineWidth = 1
    g.beginPath()
    for (let i = 0; i <= SKIN_PX; i++) {
      g.moveTo(i * S + 0.5, 0); g.lineTo(i * S + 0.5, grid.height)
      g.moveTo(0, i * S + 0.5); g.lineTo(grid.width, i * S + 0.5)
    }
    g.stroke()
    if (showGuides) {
      g.strokeStyle = 'rgba(0,255,225,0.55)'
      g.lineWidth = 1.5
      for (const r of SKIN_GUIDES) g.strokeRect(r.x * S, r.y * S, r.w * S, r.h * S)
    }
  }, [showGuides])

  const renderAll = useCallback(() => {
    drawGrid()
    setPreviewVer(v => v + 1)
  }, [drawGrid])

  // (Re)charge le skin dans le canvas de travail
  useEffect(() => {
    if (!workRef.current) {
      const c = document.createElement('canvas')
      c.width = SKIN_PX; c.height = SKIN_PX
      workRef.current = c
    }
    const ctx = workCtx()
    ctx.clearRect(0, 0, SKIN_PX, SKIN_PX)
    undoStack.current = []
    redoStack.current = []
    setHistVer(v => v + 1)

    if (!loadSrc) { renderAll(); return }
    const img = new Image()
    img.onload = () => {
      ctx.clearRect(0, 0, SKIN_PX, SKIN_PX)
      ctx.imageSmoothingEnabled = false
      // 64×32 legacy : dessiné en haut, le reste reste transparent
      try { ctx.drawImage(img, 0, 0) } catch {}
      renderAll()
    }
    img.onerror = () => renderAll()
    img.src = loadSrc
    return () => { img.onload = null; img.onerror = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadKey])

  // redessine la grille quand les repères changent
  useEffect(() => { drawGrid() }, [drawGrid])

  useImperativeHandle(ref, () => ({
    getDataURL: () => {
      try { return workRef.current ? workRef.current.toDataURL('image/png') : null } catch { return null }
    }
  }), [])

  const cellFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const grid = gridRef.current!
    const rect = grid.getBoundingClientRect()
    const x = Math.floor((e.clientX - rect.left) / (rect.width / SKIN_PX))
    const y = Math.floor((e.clientY - rect.top) / (rect.height / SKIN_PX))
    if (x < 0 || y < 0 || x >= SKIN_PX || y >= SKIN_PX) return null
    return { x, y }
  }

  const applyAt = (x: number, y: number) => {
    const ctx = workCtx()
    if (toolRef.current === 'eraser') {
      ctx.clearRect(x, y, 1, 1)
    } else {
      ctx.fillStyle = colorRef.current
      ctx.fillRect(x, y, 1, 1)
    }
  }

  // trace une ligne entre deux cellules (évite les trous en déplacement rapide)
  const paintLine = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    let { x: x0, y: y0 } = a
    const { x: x1, y: y1 } = b
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0)
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1
    let err = dx - dy
    while (true) {
      applyAt(x0, y0)
      if (x0 === x1 && y0 === y1) break
      const e2 = 2 * err
      if (e2 > -dy) { err -= dy; x0 += sx }
      if (e2 < dx) { err += dx; y0 += sy }
    }
  }

  // getImageData peut lever une SecurityError si le canvas est "tainted"
  // (skin chargé depuis une URL distante au lieu d'un data URL) → on protège.
  const snapshot = (): ImageData | null => {
    try { return workCtx().getImageData(0, 0, SKIN_PX, SKIN_PX) } catch { return null }
  }

  const pushUndo = () => {
    const snap = snapshot()
    if (!snap) return
    undoStack.current.push(snap)
    if (undoStack.current.length > 50) undoStack.current.shift()
    redoStack.current = []
    setHistVer(v => v + 1)
  }

  // Pipette : récupère la couleur d'un pixel et repasse au pinceau
  const pickAt = (px: number, py: number) => {
    try {
      const d = workCtx().getImageData(px, py, 1, 1).data
      if (d[3] > 0) {
        setColor('#' + [d[0], d[1], d[2]].map(n => n.toString(16).padStart(2, '0')).join(''))
      }
    } catch {}
    setTool('brush')
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const cell = cellFromEvent(e)
    if (!cell) return
    if (toolRef.current === 'eyedropper') { pickAt(cell.x, cell.y); return }
    if (toolRef.current === 'brush') noteColorUsed(colorRef.current)
    e.currentTarget.setPointerCapture(e.pointerId)
    pushUndo()
    painting.current = true
    lastCell.current = cell
    applyAt(cell.x, cell.y)
    renderAll()
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!painting.current) return
    const cell = cellFromEvent(e)
    if (!cell) return
    if (lastCell.current) paintLine(lastCell.current, cell)
    else applyAt(cell.x, cell.y)
    lastCell.current = cell
    renderAll()
  }

  const endStroke = () => {
    painting.current = false
    lastCell.current = null
  }

  // ── Dessin direct sur le modèle 3D (pixel par pixel, sans interpolation) ──
  const model3DDown = (px: number, py: number) => {
    if (toolRef.current === 'eyedropper') { pickAt(px, py); return }
    if (toolRef.current === 'brush') noteColorUsed(colorRef.current)
    pushUndo()
    painting.current = true
    applyAt(px, py)
    renderAll()
  }
  const model3DMove = (px: number, py: number) => {
    if (!painting.current) return
    applyAt(px, py)
    renderAll()
  }
  const model3DUp = () => { painting.current = false; lastCell.current = null }

  const undo = () => {
    if (!undoStack.current.length) return
    const cur = snapshot()
    if (cur) redoStack.current.push(cur)
    workCtx().putImageData(undoStack.current.pop()!, 0, 0)
    setHistVer(v => v + 1)
    renderAll()
  }

  const redo = () => {
    if (!redoStack.current.length) return
    const cur = snapshot()
    if (cur) undoStack.current.push(cur)
    workCtx().putImageData(redoStack.current.pop()!, 0, 0)
    setHistVer(v => v + 1)
    renderAll()
  }

  const toolBtn = (t: EditorTool, label: string, icon: React.ReactNode) => (
    <button
      onClick={() => setTool(t)}
      title={label}
      className={`flex items-center justify-center size-[44px] rounded-[11px] border transition-colors ${
        tool === t
          ? 'border-[rgba(0,255,225,0.55)] bg-[rgba(0,255,225,0.14)] text-white'
          : 'border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.04)] text-white/60 hover:text-white hover:bg-[rgba(255,255,255,0.08)]'
      }`}
    >
      {icon}
    </button>
  )

  const miniBtn = (active: boolean) =>
    `flex items-center justify-center size-[44px] rounded-[11px] border transition-colors disabled:opacity-30 ${
      active
        ? 'border-[rgba(0,255,225,0.55)] bg-[rgba(0,255,225,0.14)] text-white'
        : 'border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.04)] text-white/60 hover:text-white hover:bg-[rgba(255,255,255,0.08)]'
    }`

  const gridSize = SKIN_PX * EDIT_CELL   // résolution du patron (buffer)
  const FLAT_DISPLAY = 168               // petit patron à plat (bas de colonne)
  const VIEWER_W = 540                   // espace 3D agrandi
  const VIEWER_H = 600

  return (
    <div className="flex gap-[16px] items-stretch">
      {/* Espace 3D (principal) */}
      <div
        className="relative shrink-0 rounded-[14px] overflow-hidden border border-[rgba(255,255,255,0.08)]"
        style={{ width: VIEWER_W, height: VIEWER_H, background: 'radial-gradient(ellipse 65% 60% at 50% 42%, rgba(0,255,225,0.10) 0%, rgba(14,11,22,0.30) 80%)' }}
      >
        <Skin3DViewer
          sourceCanvas={workRef.current}
          version={previewVer}
          variant={variant}
          width={VIEWER_W}
          height={VIEWER_H}
          paintLayer={paintLayer}
          showOverlay={overlayVisible}
          onModelDown={model3DDown}
          onModelMove={model3DMove}
          onModelUp={model3DUp}
        />

        <p className="absolute bottom-[10px] inset-x-0 text-center font-ui text-[12px] text-white/45 pointer-events-none leading-tight px-[8px]">
          Clic gauche : peindre • Clic droit : pivoter • molette : zoom
        </p>
      </div>

      {/* Colonne outils + couleurs */}
      <div className="flex flex-col gap-[12px]" style={{ width: 268 }}>
        {/* Modèle du personnage */}
        <div className="flex gap-[8px]">
          {(['classic', 'slim'] as const).map(v => (
            <button
              key={v}
              onClick={() => onVariantChange(v)}
              className={`flex-1 flex flex-col items-start px-[12px] py-[7px] rounded-[10px] border transition-colors ${
                variant === v
                  ? 'border-[rgba(0,255,225,0.5)] bg-[rgba(0,255,225,0.08)]'
                  : 'border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.06)]'
              }`}
            >
              <span className="font-ui font-semibold text-[14px] text-white">{v === 'classic' ? 'Classique' : 'Fin'}</span>
              <span className="font-ui text-[12px] text-white/40">{v === 'classic' ? 'Bras larges' : 'Bras fins'}</span>
            </button>
          ))}
        </div>

        {/* Couche éditée */}
        <div className="flex items-center gap-[8px]">
          <div className="flex gap-[6px] flex-1">
            {([['base', 'Base'], ['overlay', 'Dessus']] as const).map(([l, label]) => (
              <button
                key={l}
                onClick={() => setPaintLayer(l)}
                title={l === 'overlay' ? 'Le 2e calque (chapeau, veste, manches…) qui ressort en 3D' : 'Le corps du personnage'}
                className={`flex-1 px-[10px] py-[8px] rounded-[10px] border font-ui text-[14px] font-semibold transition-colors ${
                  paintLayer === l
                    ? 'border-[rgba(0,255,225,0.5)] bg-[rgba(0,255,225,0.08)] text-white'
                    : 'border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] text-white/60 hover:bg-[rgba(255,255,255,0.06)]'
                }`}
              >
                {l === 'base' ? 'Couche base' : 'Couche dessus'}
              </button>
            ))}
          </div>
          <button
            onClick={() => setHideOverlay(h => !h)}
            disabled={paintLayer === 'overlay'}
            title="Masquer la couche du dessus pour voir/éditer la base en dessous"
            className={miniBtn(hideOverlay && paintLayer !== 'overlay')}
          >
            {hideOverlay && paintLayer !== 'overlay' ? (
              <svg width="20" height="20" viewBox="0 0 16 16" fill="none"><path d="M2 8s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4Z" stroke="currentColor" strokeWidth="1.2"/><path d="M2.5 2.5l11 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 16 16" fill="none"><path d="M2 8s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4Z" stroke="currentColor" strokeWidth="1.2"/><circle cx="8" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.2"/></svg>
            )}
          </button>
        </div>

        <div className="border-t border-[rgba(255,255,255,0.08)]" />

        {/* Outils */}
        <div className="flex items-center gap-[8px]">
          {toolBtn('brush', 'Pinceau', (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M4 20l4-1L19 8l-3-3L5 16l-1 4Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
              <path d="M14.5 6.5l3 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          ))}
          {toolBtn('eraser', 'Gomme', (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M9 18l-4-4 8-8 4 4-8 8Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
              <path d="M8.5 18.5H20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          ))}
          {toolBtn('eyedropper', 'Pipette', (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path d="M5 19l.8-3.2 7.4-7.4 2.4 2.4-7.4 7.4L5 19Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
              <path d="M14 7l3-3 3 3-3 3" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
            </svg>
          ))}
          <div className="flex-1" />
          <button onClick={undo} disabled={!undoStack.current.length} title="Annuler" className={miniBtn(false)}>
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none"><path d="M6 4 3 7l3 3M3 7h6.5A3.5 3.5 0 0 1 13 10.5v0A3.5 3.5 0 0 1 9.5 14H6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <button onClick={redo} disabled={!redoStack.current.length} title="Refaire" className={miniBtn(false)}>
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none"><path d="M10 4l3 3-3 3M13 7H6.5A3.5 3.5 0 0 0 3 10.5v0A3.5 3.5 0 0 0 6.5 14H10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
        </div>

        {/* Repères de zones */}
        <button
          onClick={() => setShowGuides(s => !s)}
          className={`flex items-center gap-[8px] px-[12px] py-[8px] rounded-[10px] border font-ui text-[14px] font-semibold transition-colors ${
            showGuides ? 'border-[rgba(0,255,225,0.5)] bg-[rgba(0,255,225,0.08)] text-white' : 'border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] text-white/55 hover:text-white'
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2.5" y="2.5" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M2.5 8h11M8 2.5v11" stroke="currentColor" strokeWidth="1"/></svg>
          Repères de zones
        </button>

        <div className="border-t border-[rgba(255,255,255,0.08)]" />

        {/* Couleur */}
        <div className="flex items-center justify-between">
          <p className="font-ui font-semibold text-[14px] text-white/60 tracking-[-0.3px]">Couleur</p>
          <div className="flex items-center gap-[7px]">
            <div className="size-[20px] rounded-[5px] border border-[rgba(255,255,255,0.2)]" style={{ background: color }} />
            <span className="font-mono text-[13px] text-white/55 uppercase">{color}</span>
          </div>
        </div>
        <ColorPicker color={color} onChange={setColor} />

        {/* Couleurs récentes */}
        <div className="flex flex-col gap-[6px]">
          <p className="font-ui text-[13px] text-white/40 tracking-[-0.3px]">Couleurs récentes</p>
          <div className="flex flex-wrap gap-[5px]">
            {recentColors.map((c, i) => (
              <button
                key={c + i}
                onClick={() => { setColor(c); setTool('brush') }}
                title={c}
                className={`size-[22px] rounded-[6px] border transition-transform hover:scale-110 ${color.toLowerCase() === c.toLowerCase() ? 'border-white' : 'border-[rgba(255,255,255,0.15)]'}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </div>

        {/* Patron à plat — petit, en bas de colonne pour combler l'espace */}
        <div className="flex flex-col gap-[6px] mt-auto">
          <div className="flex items-center justify-between">
            <p className="font-ui text-[13px] text-white/40 tracking-[-0.3px]">Patron à plat</p>
            <button
              onClick={() => setShowFlat(s => !s)}
              title="Afficher / masquer le patron"
              className="text-white/40 hover:text-white transition-colors"
            >
              {showFlat ? (
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2 8s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4Z" stroke="currentColor" strokeWidth="1.2"/><circle cx="8" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.2"/></svg>
              ) : (
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2 8s2.2-4 6-4 6 4 6 4-2.2 4-6 4-6-4-6-4Z" stroke="currentColor" strokeWidth="1.2"/><path d="M2.5 2.5l11 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
              )}
            </button>
          </div>
          <div
            className={`self-center rounded-[10px] overflow-hidden border border-[rgba(255,255,255,0.12)] ${showFlat ? '' : 'hidden'}`}
            style={{ background: 'rgba(14,11,22,0.45)' }}
          >
            <canvas
              ref={gridRef}
              width={gridSize}
              height={gridSize}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endStroke}
              onPointerCancel={endStroke}
              className="block touch-none select-none"
              style={{ width: FLAT_DISPLAY, height: FLAT_DISPLAY, cursor: 'crosshair', imageRendering: 'pixelated' }}
            />
          </div>
        </div>
      </div>
    </div>
  )
})

const SHOP_ITEMS = [
  { from: shop1Image, fromQty: 'x16', toQty: 'x5',  alt: true },
  { from: shop2Image, fromQty: 'x4',  toQty: 'x8',  alt: false },
  { from: shop3Image, fromQty: 'x64', toQty: 'x2',  alt: true },
  { from: shop4Image, fromQty: 'x8',  toQty: 'x4',  alt: false },
]

type ShopRowData = {
  key: string
  inDesc?: ItemIconDesc | null; inId?: string; inCurrencyUrl?: string; inFallback: string; inQty: string
  outDesc?: ItemIconDesc | null; outId?: string; outCurrencyUrl?: string; outFallback: string; outQty: string
  quota?: { remaining: number; max: number }
  alt: boolean
}

// Icône d'un côté d'échange : la monnaie (currencyUrl, distante) passe par le proxy
// main (useRemoteImage) ; un item normal est rendu localement (descripteur → dataURL).
function ShopIcon({ desc, id, currencyUrl, fallback }: { desc?: ItemIconDesc | null; id?: string; currencyUrl?: string; fallback: string }) {
  const auto = useItemIconSrc(id, desc)
  const curr = useRemoteImage(currencyUrl || undefined, fallback)
  const src = currencyUrl ? curr : (auto || fallback)
  return (
    <div className="relative shrink-0 size-[48px]" style={{ marginRight: -18 }}>
      <img alt="" className="absolute inset-0 max-w-none object-contain pointer-events-none size-full [image-rendering:pixelated]" src={src} />
    </div>
  )
}

// Une ligne du shop du jour : [entrée ×qté]  →  [sortie ×qté], icônes automatiques.
function ShopRow({ row }: { row: ShopRowData }) {
  return (
    <div className={`flex items-center justify-between p-[8px] rounded-[8px] w-full relative ${row.alt ? 'bg-[rgba(255,255,255,0.1)]' : ''}`}>
      {/* Entrée */}
      <div className="flex items-end">
        <ShopIcon desc={row.inDesc} id={row.inId} currencyUrl={row.inCurrencyUrl} fallback={row.inFallback} />
        <p className="relative z-10 font-minecraft text-[16px] text-white tracking-[-0.64px] whitespace-nowrap">{row.inQty}</p>
      </div>

      {/* Flèche + quota restant du joueur (sous la flèche) */}
      <div className="absolute left-1/2 -translate-x-1/2 flex flex-col items-center gap-[2px]">
        <svg width="18" height="14" viewBox="0 0 18 14" fill="none">
          <path d="M0.5 7H17.5M17.5 7L11.5 1M17.5 7L11.5 13" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {row.quota && (
          <span
            className={`font-ui font-semibold text-[10px] leading-none tracking-[-0.2px] whitespace-nowrap ${row.quota.remaining > 0 ? 'text-[rgba(0,255,225,0.9)]' : 'text-[rgba(255,120,120,0.95)]'}`}
            title={`Il te reste ${row.quota.remaining} échange(s) sur ${row.quota.max}`}
          >
            {row.quota.remaining}/{row.quota.max}
          </span>
        )}
      </div>

      {/* Sortie */}
      <div className="flex items-end">
        <ShopIcon desc={row.outDesc} id={row.outId} currencyUrl={row.outCurrencyUrl} fallback={row.outFallback} />
        <p className="relative z-10 font-minecraft text-[16px] text-white tracking-[-0.64px] whitespace-nowrap">{row.outQty}</p>
      </div>
    </div>
  )
}

const NEWS_ITEMS: AnyNewsItem[] = [
  {
    img: news1Image,
    category: 'update',
    title: 'Mise à jour 1.3 — Nouvelles dimensions',
    date: '10 juin 2026',
    body: 'La mise à jour 1.3 est arrivée sur Zig City ! Deux nouvelles dimensions sont désormais accessibles via des portails craftables en fin de partie. Explorez la Dimension de Cristal et la Terre Corrompue, chacune avec ses propres boss, ressources rares et récompenses exclusives pour les plus courageux.',
  },
  {
    img: news2Image,
    category: 'event',
    title: 'Événement — La Chasse au Dragon',
    date: '5 juin 2026',
    body: "Rejoins notre grand événement PvE de la semaine ! L'Ender Dragon revient dans une version renforcée avec plusieurs phases et des mécaniques inédites. Les 3 meilleurs contributeurs remporteront des items légendaires introuvables nulle part ailleurs sur le serveur.",
  },
  {
    img: news3Image,
    category: 'shop',
    title: 'Shop — Nouvelles ressources rares',
    date: '1 juin 2026',
    body: "La boutique du serveur accueille cette semaine une sélection de ressources rares issues des nouvelles dimensions. Échangez vos Zigcoins contre du Cristal Brut, de l'Essence Corrompue et des blueprints de structures exclusives.",
  },
  {
    img: news4Image,
    category: 'infra',
    title: 'Infrastructure — Migration terminée',
    date: '25 mai 2026',
    body: 'La migration vers nos nouveaux serveurs dédiés est un succès complet. Les TPS sont stabilisés à 20, la latence moyenne a été réduite de 40 % et les backups quotidiens sont désormais entièrement automatisés. Merci à tous pour votre patience pendant les fenêtres de maintenance.',
  },
]

const pill = 'backdrop-blur-[5.95px] bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] flex items-center overflow-hidden rounded-full shadow-[2px_2px_8px_0px_rgba(0,0,0,0.1)]'
const iconBtn = 'backdrop-blur-[5.95px] bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] flex items-center justify-center rounded-full shadow-[1px_1px_6px_0px_rgba(0,0,0,0.2)] size-[48px] shrink-0 transition-colors duration-150 hover:bg-[rgba(255,255,255,0.12)] active:bg-[rgba(255,255,255,0.2)]'
const greenDot = 'bg-[rgba(0,255,9,0.36)] rounded-full shadow-[0px_0px_8.6px_0px_rgba(9,255,54,0.4)] size-[8px] shrink-0 dot-twinkle'
const redDot = 'bg-[rgba(255,60,60,0.55)] rounded-full shadow-[0px_0px_8.6px_0px_rgba(255,60,60,0.45)] size-[8px] shrink-0'

// Formatte des octets en Mo pour la progression de la mise à jour.
const fmtMo = (bytes: number) => `${(bytes / 1048576).toFixed(1)} Mo`

export default function App() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [username, setUsername] = useState('')
  const [status, setStatus] = useState('Chargement...')
  const [progress, setProgress] = useState<ProgressState | null>(null)
  // macOS uniquement : MAJ détectée mais non auto-installable (app non signée).
  // Quand défini, l'overlay « mise à jour » affiche un bouton de téléchargement manuel.
  const [macUpdate, setMacUpdate] = useState<{ version?: string; url?: string } | null>(null)
  // Dernières lignes de log du jeu en cas de crash (affichées dans l'écran d'erreur).
  const [crashLog, setCrashLog] = useState('')
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
  // Fond d'écran : URL tirée au hasard parmi ceux configurés en admin (null = fond par défaut).
  const [bgUrl, setBgUrl] = useState<string | null>(null)
  const [shopOffers, setShopOffers] = useState<ShopOfferView[]>([])
  const [shopCurrencyIcon, setShopCurrencyIcon] = useState('')
  const [shopCurrencyItem, setShopCurrencyItem] = useState('')
  const [heroHovered, setHeroHovered] = useState(false)
  const [playersSeen, setPlayersSeen] = useState<string[]>([])
  // Têtes affichées dans le carrousel : ordre stable et déterministe (tri
  // alphabétique, insensible à la casse) — le carrousel garde toujours le même
  // ordre, sans mélange aléatoire ni doublon. On plafonne (chaque tête = une
  // requête mc-heads) sans toucher à l'historique complet.
  const carouselNames = useMemo(() => {
    return Array.from(new Set(playersSeen))
      .sort((a, b) => a.localeCompare(b, 'fr', { sensitivity: 'base' }))
      .slice(0, 48)
  }, [playersSeen])

  // ── Carrousel : pseudo « façon Minecraft » au survol d'une tête ──
  // Le pseudo flotte au-dessus de la tête survolée. Comme la carte est en
  // overflow-hidden (coins arrondis + masque de fondu), on rend l'étiquette hors de
  // la carte, dans un wrapper `relative` non rogné — elle ne peut donc pas être enfant
  // de la tête. Au survol, le défilement ne se fige pas : il ralentit fortement (Web
  // Animations API, playbackRate). Pour que le pseudo colle à la tête SANS décalage
  // d'une frame, on ne le repositionne pas en JS (un rAF qui lit la position et écrit
  // left/top traîne d'une frame derrière l'animation compositée de la piste). À la
  // place, le « rail » du pseudo reçoit une animation transform identique à celle de la
  // piste (même translateX, même durée), calée sur la même timeline (startTime +
  // playbackRate copiés) : les deux avancent sur le compositor au même rythme, donc à
  // la même frame.
  const carouselWrapRef = useRef<HTMLDivElement>(null)
  const carouselTrackRef = useRef<HTMLDivElement>(null)
  const nametagRailRef = useRef<HTMLDivElement>(null)
  const [hoveredHead, setHoveredHead] = useState<{ name: string; x: number; y: number } | null>(null)

  const handleHeadEnter = useCallback((name: string, el: HTMLElement) => {
    const wrap = carouselWrapRef.current
    const track = carouselTrackRef.current
    if (!wrap || !track) return
    const wr = wrap.getBoundingClientRect()
    const hr = el.getBoundingClientRect()
    // translateX courant de la piste, pour ramener la tête à son origine (translateX = 0).
    const cs = getComputedStyle(track).transform
    const tx = cs && cs !== 'none' ? new DOMMatrixReadOnly(cs).m41 : 0
    // Position « de base » de la tête (à translateX = 0) : constante géométrique,
    // indépendante du temps. Le rail, calé là, suivra via le même transform animé.
    setHoveredHead({
      name,
      x: hr.left - wr.left + hr.width / 2 - tx,
      y: hr.top - wr.top,
    })
    // Ralentir (sans figer) le défilement ; le rail se cale dessus juste après (effet).
    const anim = track.getAnimations()?.[0]
    if (anim) anim.playbackRate = 0.2
  }, [])

  const handleHeadLeave = useCallback(() => {
    setHoveredHead(null)
    const anim = carouselTrackRef.current?.getAnimations()?.[0]
    if (anim) anim.playbackRate = 1
  }, [])

  // Cale l'animation du rail du pseudo sur celle de la piste (même translateX, même
  // durée, même phase) dès que le pseudo est monté. useLayoutEffect : exécuté avant le
  // paint, donc aucun flash à la position d'origine. Annulée à la sortie / au changement.
  useLayoutEffect(() => {
    if (!hoveredHead) return
    const rail = nametagRailRef.current
    const track = carouselTrackRef.current
    const trackAnim = track?.getAnimations()?.[0]
    if (!rail || !track || !trackAnim) return
    const half = track.offsetWidth / 2 // 50 % de la piste = un jeu de têtes, en px
    const timing = trackAnim.effect?.getComputedTiming()
    const duration = typeof timing?.duration === 'number' ? timing.duration : 0
    if (!half || !duration) return
    const railAnim = rail.animate(
      [{ transform: 'translateX(0)' }, { transform: `translateX(-${half}px)` }],
      { duration, iterations: Infinity, easing: 'linear' },
    )
    railAnim.playbackRate = trackAnim.playbackRate // même vitesse (ralenti ≈ 0.2)…
    railAnim.startTime = trackAnim.startTime // …et même phase → calage parfait
    return () => railAnim.cancel()
  }, [hoveredHead])

  const initRef = useRef(false) // garde anti double-exécution de l'init (React.StrictMode)

  // ── Changer de skin (éditeur intégré) ──
  const [skinModalOpen, setSkinModalOpen] = useState(false)
  const [skinModalClosing, setSkinModalClosing] = useState(false)
  const [skinInfoLoading, setSkinInfoLoading] = useState(false)
  const [selectedVariant, setSelectedVariant] = useState<'classic' | 'slim'>('classic')
  const [editorSrc, setEditorSrc] = useState<string | null>(null)   // skin chargé dans l'éditeur
  const [editorLoadKey, setEditorLoadKey] = useState(0)             // bump → (re)charge l'éditeur
  const [skinBusy, setSkinBusy] = useState(false)
  const [skinError, setSkinError] = useState<string | null>(null)
  const [skinSuccess, setSkinSuccess] = useState(false)
  const [skinVersion, setSkinVersion] = useState(0)                 // cache-buster avatar
  const skinRequestRef = useRef(false)                              // garde anti double-soumission
  const editorApiRef = useRef<SkinEditorHandle>(null)
  const [skinTab, setSkinTab] = useState<'editor' | 'library'>('editor')
  const [libraryItems, setLibraryItems] = useState<{ id: string; name: string; variant: 'classic' | 'slim'; createdAt: number; dataUrl: string }[]>([])
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [librarySaveName, setLibrarySaveName] = useState('')

  const fetchNews = useCallback(async () => {
    const result = await window.launcher.getNews()
    if (result.success && result.news.length > 0) setDynamicNews(result.news)
  }, [])

  // Shop du jour : lecture publique des offres de la date courante (bascule à
  // minuit côté main). Rechargé à chaque arrivée sur l'accueil (effet plus bas).
  const fetchShop = useCallback(async () => {
    const result = await window.launcher.getShop()
    if (result.success) {
      setShopOffers((result.offers || []) as ShopOfferView[])
      setShopCurrencyIcon(result.config?.currencyIcon || '')
      setShopCurrencyItem(result.config?.currencyItem || '')
    }
  }, [])

  // Lignes affichées : offres réelles du jour si présentes, sinon repli statique.
  // Chaque côté = un item (icône auto via descripteur) ou la monnaie (currencyIcon).
  const shopRows = useMemo<ShopRowData[]>(() => {
    const curr = shopCurrencyItem
    if (shopOffers.length > 0) {
      return shopOffers.map((o, i) => ({
        key: o.id || `o-${i}`,
        inDesc: o.inputIcon, inId: o.input, inCurrencyUrl: o.input === curr ? (shopCurrencyIcon || undefined) : undefined, inFallback: shop1Image, inQty: `x${o.inputQty}`,
        outDesc: o.outputIcon, outId: o.output, outCurrencyUrl: o.output === curr ? (shopCurrencyIcon || undefined) : undefined, outFallback: currencyImage, outQty: `x${o.outputQty}`,
        quota: o.maxUses && o.maxUses > 0 ? { remaining: Math.max(0, o.maxUses - (o.used || 0)), max: o.maxUses } : undefined,
        alt: i % 2 === 0,
      }))
    }
    return SHOP_ITEMS.map((s, i) => ({
      key: `static-${i}`,
      inDesc: { kind: 'flat', src: s.from } as ItemIconDesc, inId: '', inFallback: s.from, inQty: s.fromQty,
      outCurrencyUrl: shopCurrencyIcon || undefined, outFallback: currencyImage, outQty: s.toQty,
      alt: s.alt,
    }))
  }, [shopOffers, shopCurrencyIcon, shopCurrencyItem])

  // Charge / rafraîchit le shop du jour à chaque arrivée sur l'accueil.
  useEffect(() => { if (activeTab === 'home') fetchShop() }, [activeTab, fetchShop])

  const checkAndInstall = useCallback(async () => {
    setPhase('checking')
    setStatus('Vérification du modpack...')
    setProgress(null)

    const check = await window.launcher.checkModpack()
    if (!check.missingMods && !check.missingShaders && !check.needsNeoForge) {
      setStatus(`Prêt — ${check.total} mods installés`)
      setPhase('ready')
    } else {
      setPhase('installing')
      setStatus(
        check.needsNeoForge
          ? `Installation de NeoForge + ${check.missingMods} mod(s)...`
          : check.missingMods
            ? `${check.missingMods} mod(s) à télécharger...`
            : `${check.missingShaders} shader(s) à télécharger...`
      )
      await window.launcher.installModpack()
    }
  }, [])

  useEffect(() => {
    // React.StrictMode exécute cet effet deux fois en dev : on ne s'abonne et on
    // ne lance la recherche de MAJ qu'une seule fois (sinon double check / listeners).
    if (initRef.current) return
    initRef.current = true

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
        setCrashLog(data.log ?? '')
        setStatus(`Crash détecté (code ${data.code})`)
        setPhase('error')
      } else {
        setCrashLog('')
        setStatus(`Prêt — ${packData.mods.length} mods installés`)
        setPhase('ready')
      }
    })

    ;(async () => {
      // ── PORTE DE MISE À JOUR (obligatoire au démarrage) ──
      // On interroge GitHub AVANT tout le reste. Si une nouvelle version existe,
      // elle se télécharge puis l'app redémarre seule sur la version à jour.
      await new Promise<void>((resolve) => {
        let settled = false
        const proceed = () => { if (!settled) { settled = true; resolve() } }
        // Filet de sécurité : tant que rien n'aboutit, on finit par libérer le joueur
        // pour ne jamais l'enfermer sur l'overlay. Re-armé à chaque étape qui avance.
        let timer = setTimeout(proceed, 20000)
        const rearm = (ms: number) => { clearTimeout(timer); timer = setTimeout(proceed, ms) }

        window.launcher.onUpdateStatus((u) => {
          if (settled) return // après le démarrage, c'est la page Réglages qui pilote les vérifications manuelles
          switch (u.status) {
            case 'checking':
              setPhase('updating')
              setStatus('Recherche de mises à jour...')
              setProgress(null)
              // Laisse au check le temps d'aboutir avant que le filet anti-blocage ne
              // libère : sur Mac l'appel API GitHub peut prendre jusqu'à ~15 s, et on veut
              // que l'event terminal ('mac-update'/'not-available') gagne la course.
              rearm(30000)
              break
            case 'available':
              setPhase('updating')
              setStatus(`Mise à jour ${u.version ?? ''} disponible`)
              setProgress({ percent: 0, label: '', detail: 'Téléchargement de la mise à jour...' })
              rearm(180000) // téléchargement en cours : on ne libère pas prématurément
              break
            case 'progress':
              setPhase('updating')
              setProgress({
                percent: Math.round(u.percent ?? 0),
                label: u.bytesPerSecond ? `${fmtMo(u.bytesPerSecond)}/s` : '',
                detail: u.total
                  ? `Téléchargement — ${fmtMo(u.transferred ?? 0)} / ${fmtMo(u.total)}`
                  : 'Téléchargement de la mise à jour...',
              })
              rearm(180000) // chaque progrès repousse le filet : pas de blocage tant que ça avance
              break
            case 'downloaded':
              // Si le joueur a déjà été libéré (filet écoulé), ne PAS fermer l'app par
              // surprise : la MAJ s'installera à la prochaine fermeture (autoInstallOnAppQuit).
              if (settled) return
              setPhase('updating')
              setStatus('Mise à jour prête — redémarrage...')
              setProgress({ percent: 100, label: '', detail: 'Installation et redémarrage...' })
              setTimeout(() => window.launcher.quitAndInstall(), 900)
              // Si l'installation ne ferme pas l'app (antivirus, fichier verrouillé...),
              // on libère après 15 s pour laisser le joueur entrer malgré tout.
              rearm(15000)
              break
            case 'mac-update':
              // macOS : MAJ obligatoire mais non auto-installable (app non signée).
              // On BLOQUE le démarrage (pas de proceed) : le joueur doit télécharger
              // le nouveau .dmg et relancer. On annule le filet pour ne pas le libérer.
              clearTimeout(timer)
              setPhase('updating')
              setMacUpdate({ version: u.version, url: u.url })
              setStatus(`Nouvelle version ${u.version ?? ''} disponible`)
              setProgress(null)
              break
            case 'not-available':
            case 'error':
              clearTimeout(timer)
              proceed() // pas de MAJ (ou échec) → on continue le démarrage normal
              break
            default:
              console.warn('[update] statut inattendu :', u.status)
          }
        })

        window.launcher.checkForUpdates().then((res) => {
          // En dev (non packagé) ou si l'appel échoue d'emblée : on ne bloque pas.
          if (res?.status === 'disabled' || res?.status === 'error') { clearTimeout(timer); proceed() }
        }).catch(() => { clearTimeout(timer); proceed() })
      })

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

  // Fond d'écran : lecture publique de la bibliothèque (gérée en admin) et tirage
  // d'une image au hasard, une seule fois au lancement. Tant qu'aucun fond n'est
  // configuré (ou en cas d'échec), on garde le fond par défaut embarqué.
  useEffect(() => {
    window.launcher.getBackgrounds()
      .then((res) => {
        if (res.success && res.backgrounds.length > 0) {
          const pick = res.backgrounds[Math.floor(Math.random() * res.backgrounds.length)]
          if (pick?.url) setBgUrl(pick.url)
        }
      })
      .catch(() => {})
  }, [])

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

  // Recharge l'historique partagé (n'actualise l'état que si l'ensemble a changé,
  // pour ne pas re-télécharger les têtes du carrousel à chaque appel).
  const refreshPlayersSeen = async () => {
    const list = await window.launcher.getPlayersSeen()
    if (!Array.isArray(list)) return
    setPlayersSeen(prev => {
      const a = new Set(prev)
      if (a.size === list.length && list.every(x => a.has(x))) return prev
      return list
    })
  }

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
        refreshPlayersSeen(),   // sa propre tête apparaît sans redémarrage
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

  const sessionMessage = 'Ta session Minecraft a expiré. Reconnecte-toi pour changer de skin.'

  const refreshLibrary = useCallback(async () => {
    setLibraryLoading(true)
    try { setLibraryItems(await window.launcher.libraryList()) } catch {}
    setLibraryLoading(false)
  }, [])

  const openSkinModal = async () => {
    setProfileMenuOpen(false)
    setSkinModalOpen(true)
    setSkinModalClosing(false)
    setSkinTab('editor')
    setSkinError(null)
    setSkinSuccess(false)
    setEditorSrc(null)
    setSkinInfoLoading(true)
    refreshLibrary()
    const info = await window.launcher.getSkinInfo()
    setSkinInfoLoading(false)
    if (info.success) {
      setSelectedVariant(info.variant ?? 'classic')
      setEditorSrc(info.skinDataUrl ?? info.skinUrl ?? null)
      setEditorLoadKey(k => k + 1)
    } else {
      setSkinError(info.expired || info.loggedOut ? sessionMessage : (info.error ?? 'Impossible de charger ton skin actuel.'))
    }
  }

  const closeSkinModal = () => {
    setSkinModalClosing(true)
    setTimeout(() => {
      setSkinModalOpen(false)
      setSkinModalClosing(false)
      setEditorSrc(null)   // libère le dataUrl base64
      setSkinError(null)
      setSkinSuccess(false)
    }, 250)
  }

  const handlePickSkin = async () => {
    setSkinError(null)
    setSkinSuccess(false)
    const res = await window.launcher.pickSkinFile()
    if (res.canceled) return
    if (res.error || !res.dataUrl) {
      setSkinError(res.error ?? 'Fichier invalide.')
      return
    }
    // Charge le PNG importé dans l'éditeur (modifiable avant envoi)
    setEditorSrc(res.dataUrl)
    setEditorLoadKey(k => k + 1)
  }

  const handleApplySkin = async () => {
    if (skinRequestRef.current) return
    const dataUrl = editorApiRef.current?.getDataURL()
    if (!dataUrl) { setSkinError('Aucun skin à appliquer.'); return }
    skinRequestRef.current = true
    setSkinBusy(true)
    setSkinError(null)
    setSkinSuccess(false)
    try {
      const res = await window.launcher.uploadSkin({ variant: selectedVariant, dataUrl })
      if (res.success) {
        setSkinSuccess(true)
        setSkinVersion(v => v + 1)
      } else {
        setSkinError(res.expired || res.loggedOut ? sessionMessage : (res.error ?? 'Échec du changement de skin.'))
      }
    } finally {
      skinRequestRef.current = false
      setSkinBusy(false)
    }
  }

  const handleResetSkin = async () => {
    if (skinRequestRef.current) return
    skinRequestRef.current = true
    setSkinBusy(true)
    setSkinError(null)
    setSkinSuccess(false)
    try {
      const res = await window.launcher.resetSkin()
      if (res.success) {
        setSelectedVariant(res.variant ?? 'classic')
        setEditorSrc(res.skinDataUrl ?? res.skinUrl ?? null)
        setEditorLoadKey(k => k + 1)
        setSkinVersion(v => v + 1)
        setSkinSuccess(true)
      } else {
        setSkinError(res.expired || res.loggedOut ? sessionMessage : (res.error ?? 'Échec de la réinitialisation.'))
      }
    } finally {
      skinRequestRef.current = false
      setSkinBusy(false)
    }
  }

  const handleExportSkin = async () => {
    const dataUrl = editorApiRef.current?.getDataURL()
    if (!dataUrl) { setSkinError('Aucun skin à exporter.'); return }
    setSkinError(null)
    const name = (librarySaveName.trim() || 'mon-skin')
    const res = await window.launcher.exportSkin({ dataUrl, name })
    if (res.success) { setSkinSuccess(true) }
    else if (!res.canceled) setSkinError(res.error ?? "Échec de l'export.")
  }

  const handleSaveToLibrary = async () => {
    const dataUrl = editorApiRef.current?.getDataURL()
    if (!dataUrl) { setSkinError('Aucun skin à enregistrer.'); return }
    setSkinError(null)
    const name = librarySaveName.trim() || `Skin ${libraryItems.length + 1}`
    const res = await window.launcher.librarySave({ name, dataUrl, variant: selectedVariant })
    if (res.success) {
      setLibrarySaveName('')
      setSkinSuccess(true)
      await refreshLibrary()
    } else {
      setSkinError(res.error ?? "Échec de l'enregistrement.")
    }
  }

  const handleLoadFromLibrary = (item: { dataUrl: string; variant: 'classic' | 'slim' }) => {
    setSelectedVariant(item.variant)
    setEditorSrc(item.dataUrl)
    setEditorLoadKey(k => k + 1)
    setSkinTab('editor')
    setSkinError(null)
    setSkinSuccess(false)
  }

  const handleDeleteFromLibrary = async (id: string) => {
    await window.launcher.libraryDelete(id)
    await refreshLibrary()
  }

  const isBusy = ['loading', 'updating', 'checking', 'installing', 'launching'].includes(phase)

  const onlineLabel = serverStatus.loading ? '...' : `${serverStatus.online} en ligne`

  // Fond résolu : l'image distante choisie (via le main, pour contourner proxy/VPN/AV)
  // une fois prête, sinon le fond par défaut embarqué tant qu'elle charge / si absente.
  const resolvedBg = useRemoteImage(bgUrl, bgImage)

  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* ── FOND ── */}
      <div className="absolute inset-0">
        <img src={resolvedBg} className="absolute inset-0 w-full h-full object-cover" />
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
                  <Avatar name={username} version={skinVersion} className="w-full h-full object-cover pointer-events-none" />
                </div>
                <p className="font-ui font-semibold text-[16px] text-white tracking-[-0.64px] whitespace-nowrap">
                  {username || 'Joueur'}
                </p>
                {username && <div className={playerStatus === 'dnd' ? redDot : greenDot} />}
              </button>

              {/* Menu profil */}
              {profileMenuOpen && username && (
                <div
                  className="absolute right-0 top-[calc(100%+8px)] z-50 backdrop-blur-[24px] bg-[rgba(255,255,255,0.08)] border border-[rgba(255,255,255,0.16)] rounded-[12px] shadow-[2px_4px_24px_0px_rgba(0,0,0,0.5)] overflow-clip"
                  style={{ minWidth: 216, WebkitAppRegion: 'no-drag' } as React.CSSProperties}
                >
                  {/* En-tête profil */}
                  <div className="flex items-center gap-[10px] px-[14px] py-[12px]">
                    <div className="size-[32px] relative rounded shrink-0">
                      <Avatar name={username} version={skinVersion} className="absolute inset-0 max-w-none object-cover pointer-events-none rounded size-full" />
                    </div>
                    <div>
                      <p className="font-ui font-semibold text-[14px] text-white tracking-[-0.56px]">{username}</p>
                      <p className="font-ui text-[14px] text-white/40">Compte Minecraft</p>
                    </div>
                  </div>

                  {/* Statuts */}
                  <div className="px-[8px] py-[8px] flex flex-col gap-[2px]">
                    <button
                      className={`flex items-center gap-[10px] w-full px-[10px] py-[8px] rounded-[8px] text-left transition-colors ${playerStatus === 'online' ? 'bg-[rgba(255,255,255,0.16)]' : 'hover:bg-[rgba(255,255,255,0.09)]'}`}
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
                      className={`flex items-center gap-[10px] w-full px-[10px] py-[8px] rounded-[8px] text-left transition-colors ${playerStatus === 'dnd' ? 'bg-[rgba(255,255,255,0.16)]' : 'hover:bg-[rgba(255,255,255,0.09)]'}`}
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

                  {/* Actions */}
                  <div className="px-[8px] py-[8px] flex flex-col gap-[2px]">
                    <button
                      className="flex items-center gap-[10px] w-full px-[10px] py-[8px] rounded-[8px] text-left hover:bg-[rgba(255,255,255,0.09)] transition-colors"
                      onClick={openSkinModal}
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

              {/* Icône bulle de message (espace de discussion / salons) */}
              <button
                className={`${iconBtn} group ${activeTab === 'chat' ? '!bg-[rgba(255,255,255,0.15)]' : ''}`}
                onClick={() => setActiveTab('chat')}
                title="Discussion"
              >
                <svg className="icon-chat" width="21" height="20" viewBox="0 0 24 22" fill="white">
                  <path d="M12 2C6.2 2 1.5 5.6 1.5 10c0 2.2 1.2 4.2 3.1 5.6-.2 1.5-.9 2.9-2 4 .12.07.27.1.42.1 1.9 0 3.7-.7 5.06-1.9 1.2.32 2.5.5 3.92.5 5.8 0 10.5-3.6 10.5-8S17.8 2 12 2Z"/>
                </svg>
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
              {/* Réglages */}
              <button
                className={`${iconBtn} group ${activeTab === 'settings' ? '!bg-[rgba(255,255,255,0.15)]' : ''}`}
                onClick={() => setActiveTab('settings')}
                title="Réglages"
              >
                <svg className="icon-settings" width="21" height="21" viewBox="0 0 24 24" fill="white">
                  <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
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
          {activeTab === 'stats' && (
            <div className="flex-1 min-h-0 min-w-0">
              <StatsPage />
            </div>
          )}
          {activeTab === 'chat' && (
            <div className="flex-1 min-h-0 min-w-0">
              <ChatPanel username={username} isAdmin={isAdmin} onlinePlayers={serverStatus.players} />
            </div>
          )}
          {activeTab === 'settings' && (
            <div className="flex-1 min-h-0 min-w-0">
              <SettingsPage />
            </div>
          )}
          <main className={`flex flex-col gap-[16px] flex-1 min-h-0 min-w-0 relative ${activeTab === 'admin' || activeTab === 'stats' || activeTab === 'chat' || activeTab === 'settings' ? 'hidden' : ''} ${heroHovered ? 'hero-hovered' : ''}`}>

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

              {/* État : mise à jour du launcher */}
              {phase === 'updating' && (macUpdate ? (
                /* macOS : MAJ obligatoire mais non auto-installable (app non signée).
                   Téléchargement manuel du .dmg, puis le joueur relance le launcher. */
                <>
                  <p
                    className="relative z-10 font-minecraft leading-[normal] whitespace-pre uppercase"
                    style={{ fontSize: 48, color: '#ffffff', fontFamily: 'MinecraftBold, monospace' }}
                  >
                    {`mise à jour requise`}
                  </p>
                  <div className="relative z-10 flex flex-col items-center gap-[16px]" style={{ width: 600 }}>
                    <p className="font-ui text-white/70 text-[15px] text-center leading-[1.5]">
                      La version {macUpdate.version ?? ''} est disponible. Sur Mac, télécharge-la
                      manuellement pour continuer à jouer.
                    </p>
                    <button
                      className="bg-white text-[#0e0b16] font-ui font-bold text-[15px] px-[32px] py-[12px] rounded-[12px] hover:bg-white/90 transition-colors disabled:opacity-40"
                      disabled={!macUpdate.url}
                      onClick={(e) => { e.stopPropagation(); if (macUpdate.url) window.launcher.openExternal(macUpdate.url) }}
                    >
                      Télécharger la mise à jour
                    </button>
                    <p className="font-ui text-white/40 text-[13px] text-center leading-[1.5]">
                      Ouvre le .dmg, glisse Zig City 2 dans Applications, puis relance le launcher.
                      <br />Si macOS bloque l'ouverture : clic droit sur l'app → Ouvrir.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <p
                    className="relative z-10 font-minecraft leading-[normal] whitespace-pre uppercase"
                    style={{ fontSize: 48, color: '#ffffff', fontFamily: 'MinecraftBold, monospace' }}
                  >
                    {`mise à jour`}
                  </p>
                  <div className="relative z-10 flex flex-col items-center gap-[8px]" style={{ width: 600 }}>
                    <p className="font-ui text-white/60 text-[14px] text-center truncate w-full">
                      {progress?.detail ?? status}
                      {progress?.label ? ` — ${progress.label}` : ''}
                    </p>
                    <div className="w-full h-[3px] bg-[rgba(255,255,255,0.1)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[rgba(0,255,225,0.8)] rounded-full transition-[width] duration-300 ease-out"
                        style={{ width: `${progress?.percent ?? 0}%` }}
                      />
                    </div>
                  </div>
                </>
              ))}

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
                    <p className="font-ui text-white/60 text-[14px] text-center truncate w-full">
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
                  {crashLog && (
                    <div className="relative z-10 w-full max-w-[680px] flex flex-col items-center gap-[8px]">
                      <pre
                        className="w-full font-mono text-[11px] text-white/55 text-left whitespace-pre-wrap break-words bg-black/40 border border-white/10 rounded-[10px] p-[12px] max-h-[200px] overflow-auto"
                        style={{ userSelect: 'text' }}
                      >
                        {crashLog}
                      </pre>
                      <button
                        className="font-ui text-white/50 text-[12px] underline hover:text-white/80 transition-colors"
                        onClick={(e) => { e.stopPropagation(); navigator.clipboard?.writeText(crashLog) }}
                      >
                        Copier le log
                      </button>
                    </div>
                  )}
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
              // Chaque joueur apparaît une seule fois, dans l'ordre stable défini
              // plus haut (plus de remplissage par répétition). Le set est ensuite
              // dupliqué une seule fois — uniquement pour rendre la boucle continue
              // (translateX 0 → -50%) sans couture ni saut.
              const singleSet: (string | null)[] = carouselNames.length === 0
                ? Array.from({ length: MIN_ITEMS }).map(() => null)   // aucun joueur vu : têtes Steve décoratives
                : carouselNames
              const carouselItems = [...singleSet, ...singleSet]
              const animDuration = (singleSet.length * (ITEM_SIZE + CAROUSEL_GAP)) / 50

              return (
                <div ref={carouselWrapRef} className="relative w-full shrink-0">
                  <div
                    className="backdrop-blur-[5.95px] bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] overflow-hidden rounded-[16px] shadow-[2px_2px_8px_0px_rgba(0,0,0,0.1)] w-full"
                    style={{ height: 88 }}
                  >
                    <div
                      className="flex items-center h-full w-full overflow-hidden"
                      style={{
                        maskImage: 'linear-gradient(to right, transparent 0%, black 14%, black 86%, transparent 100%)',
                        WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 14%, black 86%, transparent 100%)',
                      }}
                    >
                      <div ref={carouselTrackRef} className="carousel-track flex items-center" style={{ animationDuration: `${animDuration}s` }}>
                        {carouselItems.map((name, i) => (
                          <div
                            key={i}
                            className="carousel-head size-[48px] rounded-[8px] shrink-0 overflow-hidden"
                            style={{ marginRight: CAROUSEL_GAP }}
                            onMouseEnter={name ? (e) => handleHeadEnter(name, e.currentTarget) : undefined}
                            onMouseLeave={name ? handleHeadLeave : undefined}
                          >
                            <Avatar name={name} className="size-full object-cover" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Pseudo « façon Minecraft » au survol — rendu hors de la carte rognée */}
                  {hoveredHead && (
                    <div
                      ref={nametagRailRef}
                      className="mc-nametag-rail"
                      style={{ left: hoveredHead.x, top: hoveredHead.y }}
                    >
                      <div className="mc-nametag-anchor">
                        <span className="mc-nametag">{hoveredHead.name}</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}

            {/* ── NOUVEAUTÉS ── */}
            <div className="backdrop-blur-[5.95px] bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] flex flex-col gap-[16px] items-start overflow-x-clip overflow-y-auto p-[16px] rounded-[16px] shadow-[2px_2px_8px_0px_rgba(0,0,0,0.1)] w-full flex-1 min-h-0">
              <div className="flex items-center w-full shrink-0">
                <p className="font-ui font-semibold text-[16px] text-white tracking-[-0.64px] whitespace-nowrap">Nouveautés</p>
              </div>
              <div className="grid grid-cols-2 gap-[14px] w-full shrink-0">
                {(dynamicNews.length > 0 ? dynamicNews as AnyNewsItem[] : NEWS_ITEMS).map((item, i) => {
                  const imgSrc = item.img ?? item.imageUrl
                  const cat = resolveCategory(item)
                  return (
                    <article
                      key={item.id ?? i}
                      className="news-card group flex flex-col rounded-[12px] overflow-hidden cursor-pointer bg-[rgba(255,255,255,0.035)] border border-[rgba(255,255,255,0.08)]"
                      style={{ ['--cat' as string]: cat.rgb }}
                      onClick={() => openNews(item)}
                    >
                      {/* Visuel */}
                      <div className="news-card-media relative overflow-hidden shrink-0" style={{ height: 128 }}>
                        <RemoteNewsImage
                          src={imgSrc}
                          className="news-card-img absolute inset-0 max-w-none object-cover pointer-events-none size-full"
                          fallback={<NewsFallback category={cat.key} />}
                        />
                      </div>
                      {/* Contenu */}
                      <div className="flex flex-col gap-[8px] p-[14px] flex-1">
                        <CategoryBadge category={cat.key} />
                        <p className="font-ui font-semibold text-[14px] text-white leading-[1.32] tracking-[-0.3px] line-clamp-2 break-words min-h-[37px]">{item.title}</p>
                        <div className="flex items-center gap-[6px] text-white/40">
                          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" className="shrink-0">
                            <rect x="1.5" y="2.5" width="9" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.1" />
                            <path d="M1.5 5h9M4 1.5v2M8 1.5v2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
                          </svg>
                          <p className="font-ui text-[13px] tracking-[-0.2px] whitespace-nowrap">{item.date}</p>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            </div>
          </main>

          {/* ── PANNEAU DROIT ── */}
          <aside className={`flex flex-col gap-[16px] h-full shrink-0 ${activeTab === 'stats' || activeTab === 'chat' || activeTab === 'settings' ? 'hidden' : ''}`} style={{ width: 304 }}>

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
                      <Avatar name={player.name} className="absolute inset-0 max-w-none object-cover pointer-events-none rounded-[8px] size-full" />
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
                  <p className="font-mono text-[14px] text-white/30">{serverStatus.online} joueur(s) en ligne</p>
                )}
                {!serverStatus.loading && serverStatus.online === 0 && (
                  <p className="font-mono text-[14px] text-white/30">
                    {serverStatus.error ? 'Serveur hors ligne' : 'Aucun joueur en ligne'}
                  </p>
                )}
              </div>

              {/* Indicateur occupation */}
              {isBusy && phase !== 'launching' && (
                <div className="flex items-center gap-[8px] text-white/30 font-ui text-[14px] mt-auto">
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
                {shopRows.map((row) => (
                  <ShopRow key={row.key} row={row} />
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>

      {/* ── MODALE NOUVEAUTÉ ── */}
      {selectedNews !== null && (() => {
        const modalImg = selectedNews.img ?? selectedNews.imageUrl
        const modalCat = resolveCategory(selectedNews)
        return (
          <div
            className={`absolute inset-0 z-50 flex items-center justify-center ${newsClosing ? 'modal-backdrop-exit' : 'modal-backdrop-enter'}`}
            style={{ background: 'rgba(8,8,12,0.55)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' } as React.CSSProperties}
            onClick={closeNews}
          >
            <div
              className={`news-modal relative flex flex-col rounded-[16px] overflow-hidden border border-[rgba(255,255,255,0.16)] ${newsClosing ? 'modal-card-exit' : 'modal-card-enter'}`}
              style={{
                width: 740,
                maxHeight: '82vh',
                background: 'rgba(255,255,255,0.08)',
                backdropFilter: 'blur(28px) saturate(1.4)',
                WebkitBackdropFilter: 'blur(28px) saturate(1.4)',
                boxShadow: '0 30px 90px rgba(0,0,0,0.5)',
              } as React.CSSProperties}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Bouton retour — sur la bannière, fond neutre pour lisibilité */}
              <button
                className="absolute top-[16px] left-[16px] z-20 flex items-center gap-[8px] backdrop-blur-[8px] bg-[rgba(0,0,0,0.42)] border border-[rgba(255,255,255,0.18)] px-[14px] py-[8px] rounded-full hover:bg-[rgba(0,0,0,0.55)] active:scale-[0.97] transition-all"
                onClick={closeNews}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M9 2.5L4.5 7L9 11.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span className="font-ui font-semibold text-[14px] text-white tracking-[-0.4px]">Retour</span>
              </button>

              {/* Bannière — image nette (ou aplat sobre), séparée du contenu par un hairline.
                  Hauteur = largeur modale (740) / ratio bannière → l'image cadrée en 2:1 dans
                  l'éditeur admin s'affiche entière, sans rognage supplémentaire. */}
              <div className="relative shrink-0 overflow-hidden" style={{ height: modalImg ? 740 / NEWS_BANNER_RATIO : 150 }}>
                <RemoteNewsImage
                  src={modalImg}
                  className="absolute inset-0 max-w-none object-cover size-full"
                  fallback={<NewsFallback category={modalCat.key} />}
                />
              </div>

              {/* Contenu — sur le verre clair. flex-1 min-h-0 : avec la bannière plus haute,
                  le texte scrolle dans l'espace restant au lieu d'être rogné par la carte. */}
              <div className="flex flex-col overflow-y-auto flex-1 min-h-0" style={{ padding: '24px 30px 30px' }}>
                {/* En-tête éditorial : catégorie + méta */}
                <div className="flex items-center justify-between gap-[12px] mb-[14px]">
                  <CategoryBadge category={modalCat.key} size="md" />
                  <p className="font-ui text-[14px] text-white/45 tracking-[-0.3px] whitespace-nowrap select-text">
                    {selectedNews.date}{selectedNews.author ? ` · ${selectedNews.author}` : ''}
                  </p>
                </div>

                {/* Titre */}
                <p className="font-ui font-bold text-[23px] text-white tracking-[-0.9px] leading-[1.18] break-words select-text">{selectedNews.title}</p>

                {/* Corps */}
                <p className="mt-[18px] font-ui text-[15px] text-white/80 leading-[1.78] tracking-[-0.2px] whitespace-pre-line break-words select-text">{selectedNews.body}</p>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── MODALE CHANGER DE SKIN (éditeur intégré) ── */}
      {skinModalOpen && (
        <div
          className={`absolute inset-0 z-50 flex items-center justify-center ${skinModalClosing ? 'modal-backdrop-exit' : 'modal-backdrop-enter'}`}
          style={{ background: 'rgba(8,8,12,0.55)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' } as React.CSSProperties}
          onClick={closeSkinModal}
        >
          <div
            className={`relative flex flex-col rounded-[16px] overflow-hidden border border-[rgba(255,255,255,0.16)] ${skinModalClosing ? 'modal-card-exit' : 'modal-card-enter'}`}
            style={{
              width: 900,
              maxHeight: '94vh',
              background: 'rgba(255,255,255,0.08)',
              backdropFilter: 'blur(28px) saturate(1.4)',
              WebkitBackdropFilter: 'blur(28px) saturate(1.4)',
              boxShadow: '0 30px 90px rgba(0,0,0,0.5)',
            } as React.CSSProperties}
            onClick={(e) => e.stopPropagation()}
          >
            {/* En-tête + onglets */}
            <div className="flex items-center justify-between px-[24px] py-[14px] shrink-0 border-b border-[rgba(255,255,255,0.08)]">
              <div className="flex items-center gap-[16px]">
                <div className="flex items-center gap-[10px]">
                  <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="5.5" r="2.5" stroke="rgba(0,255,225,0.9)" strokeWidth="1.4"/>
                    <path d="M2.5 13.5C3.2 11.2 5.3 9.8 8 9.8s4.8 1.4 5.5 3.7" stroke="rgba(0,255,225,0.9)" strokeWidth="1.4" strokeLinecap="round"/>
                  </svg>
                  <p className="font-ui font-bold text-[18px] text-white tracking-[-0.6px]">Changer de skin</p>
                </div>
                <div className="flex gap-[3px] bg-[rgba(0,0,0,0.22)] border border-[rgba(255,255,255,0.06)] rounded-full p-[3px]">
                  {(['editor', 'library'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => { setSkinTab(t); if (t === 'library') refreshLibrary() }}
                      className={`font-ui text-[14px] tracking-[-0.3px] px-[14px] h-[28px] rounded-full transition-colors ${
                        skinTab === t ? 'bg-[rgba(255,255,255,0.12)] text-white font-semibold' : 'text-white/45 hover:text-white/70'
                      }`}
                    >
                      {t === 'editor' ? 'Éditeur' : 'Bibliothèque'}
                    </button>
                  ))}
                </div>
              </div>
              <button
                className="flex items-center justify-center size-[30px] rounded-full text-white/55 hover:text-white hover:bg-[rgba(255,255,255,0.08)] transition-colors"
                onClick={closeSkinModal}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M1 1L11 11M11 1L1 11" />
                </svg>
              </button>
            </div>

            {/* Corps */}
            <div className="flex flex-col gap-[14px] p-[24px] overflow-y-auto">
              {skinInfoLoading ? (
                <div className="flex items-center justify-center" style={{ height: 320 }}>
                  <svg className="animate-spin text-white/40" style={{ width: 26, height: 26 }} fill="none" viewBox="0 0 24 24">
                    <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
              ) : skinError && !editorSrc ? (
                <div className="flex flex-col items-center justify-center gap-[12px] text-center" style={{ height: 320 }}>
                  <p className="font-ui text-[14px] text-[rgba(255,120,120,0.95)] max-w-[420px] leading-snug">{skinError}</p>
                  <button
                    onClick={openSkinModal}
                    className="font-ui text-[14px] text-white/70 border border-[rgba(255,255,255,0.15)] px-[16px] py-[8px] rounded-[10px] hover:bg-[rgba(255,255,255,0.06)] hover:text-white transition-colors"
                  >
                    Réessayer
                  </button>
                </div>
              ) : (
                <>
                  {/* Éditeur (toujours monté pour préserver le dessin en cours) */}
                  <div className={skinTab === 'editor' ? 'flex flex-col gap-[14px]' : 'hidden'}>
                    <SkinEditor
                      ref={editorApiRef}
                      loadSrc={editorSrc}
                      loadKey={editorLoadKey}
                      variant={selectedVariant}
                      onVariantChange={setSelectedVariant}
                    />
                    {skinError && (
                      <p className="font-ui text-[14px] text-[rgba(255,120,120,0.95)] leading-snug">{skinError}</p>
                    )}
                    {skinSuccess && !skinError && (
                      <p className="font-ui text-[14px] text-[rgba(120,255,180,0.95)] leading-snug">
                        Skin enregistré / appliqué ! En jeu, il peut mettre quelques secondes à apparaître.
                      </p>
                    )}
                  </div>

                  {/* Bibliothèque */}
                  <div className={skinTab === 'library' ? 'flex flex-col gap-[14px]' : 'hidden'} style={{ minHeight: 360 }}>
                    <div className="flex items-center gap-[8px]">
                      <input
                        value={librarySaveName}
                        onChange={e => setLibrarySaveName(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleSaveToLibrary() }}
                        placeholder="Nom du skin à enregistrer…"
                        maxLength={60}
                        className="flex-1 bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.12)] rounded-[10px] px-[12px] py-[9px] text-white font-ui text-[14px] focus:outline-none focus:border-[rgba(0,255,225,0.4)] placeholder:text-white/30 transition-colors"
                      />
                      <button
                        onClick={handleSaveToLibrary}
                        className="px-[16px] py-[9px] rounded-[10px] font-ui font-bold text-[14px] text-[#0e0b16] bg-[rgba(0,255,225,0.9)] hover:bg-[rgba(0,255,225,1)] transition-colors whitespace-nowrap"
                      >
                        Enregistrer le skin actuel
                      </button>
                    </div>

                    {libraryLoading ? (
                      <p className="font-ui text-[14px] text-white/40 py-[48px] text-center">Chargement…</p>
                    ) : libraryItems.length === 0 ? (
                      <p className="font-ui text-[14px] text-white/35 py-[48px] text-center">
                        Aucun skin enregistré pour l'instant. Dessine un skin puis enregistre-le ici pour le retrouver plus tard.
                      </p>
                    ) : (
                      <div className="grid grid-cols-4 gap-[12px]" style={{ maxHeight: 440, overflowY: 'auto' }}>
                        {libraryItems.map(item => (
                          <div key={item.id} className="flex flex-col items-center gap-[7px] p-[10px] rounded-[12px] border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)]">
                            <div className="rounded-[8px] overflow-hidden" style={{ background: 'rgba(0,255,225,0.05)' }}>
                              <SkinPreview src={item.dataUrl} variant={item.variant} width={62} />
                            </div>
                            <p className="font-ui text-[13px] text-white/70 text-center truncate w-full" title={item.name}>{item.name}</p>
                            <div className="flex gap-[6px] w-full">
                              <button
                                onClick={() => handleLoadFromLibrary(item)}
                                className="flex-1 py-[6px] rounded-[8px] font-ui text-[13px] font-semibold text-white bg-[rgba(0,255,225,0.14)] border border-[rgba(0,255,225,0.3)] hover:bg-[rgba(0,255,225,0.22)] transition-colors"
                              >
                                Charger
                              </button>
                              <button
                                onClick={() => handleDeleteFromLibrary(item.id)}
                                title="Supprimer"
                                className="flex items-center justify-center px-[8px] py-[6px] rounded-[8px] text-white/45 border border-[rgba(255,255,255,0.1)] hover:text-[rgba(255,120,120,0.95)] hover:bg-[rgba(255,60,60,0.12)] transition-colors"
                              >
                                <svg width="13" height="14" viewBox="0 0 11 12" fill="currentColor"><rect x="0.6" y="2.1" width="9.8" height="2.2" rx="1.1"/><rect x="3.6" y="0.4" width="3.8" height="2.1" rx="1"/><path d="M1.55 4.6h7.9l-.62 6.1a1.05 1.05 0 0 1-1.04.9H3.21a1.05 1.05 0 0 1-1.04-.9L1.55 4.6Z"/></svg>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Pied : actions (onglet Éditeur) */}
            {!skinInfoLoading && !(skinError && !editorSrc) && skinTab === 'editor' && (
              <div className="flex items-center gap-[8px] px-[24px] py-[14px] shrink-0 border-t border-[rgba(255,255,255,0.08)]">
                <button
                  onClick={handlePickSkin}
                  disabled={skinBusy}
                  className="flex items-center gap-[7px] px-[14px] py-[11px] rounded-[10px] font-ui font-semibold text-[14px] text-white/75 border border-[rgba(255,255,255,0.14)] hover:bg-[rgba(255,255,255,0.06)] hover:text-white transition-colors disabled:opacity-40"
                >
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                    <path d="M10 13V4M10 4L6.5 7.5M10 4l3.5 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M3.5 13v2A1.5 1.5 0 005 16.5h10a1.5 1.5 0 001.5-1.5v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  Importer
                </button>

                <button
                  onClick={handleExportSkin}
                  disabled={skinBusy}
                  title="Exporter le skin en fichier PNG"
                  className="flex items-center gap-[7px] px-[14px] py-[11px] rounded-[10px] font-ui font-semibold text-[14px] text-white/75 border border-[rgba(255,255,255,0.14)] hover:bg-[rgba(255,255,255,0.06)] hover:text-white transition-colors disabled:opacity-40"
                >
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                    <path d="M10 4v9M10 13l-3.5-3.5M10 13l3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    <path d="M3.5 13v2A1.5 1.5 0 005 16.5h10a1.5 1.5 0 001.5-1.5v-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  Exporter
                </button>

                <button
                  onClick={handleResetSkin}
                  disabled={skinBusy}
                  title="Revenir au skin par défaut Minecraft"
                  className="px-[14px] py-[11px] rounded-[10px] font-ui font-semibold text-[14px] text-white/55 border border-[rgba(255,255,255,0.12)] hover:bg-[rgba(255,255,255,0.06)] hover:text-white transition-colors disabled:opacity-40"
                >
                  Défaut
                </button>

                <button
                  onClick={handleApplySkin}
                  disabled={skinBusy}
                  className="flex items-center justify-center gap-[8px] flex-1 py-[11px] rounded-[10px] font-ui font-bold text-[14px] text-[#0e0b16] bg-[rgba(0,255,225,0.9)] hover:bg-[rgba(0,255,225,1)] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {skinBusy && (
                    <svg className="animate-spin" style={{ width: 14, height: 14 }} fill="none" viewBox="0 0 24 24">
                      <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  )}
                  Appliquer le skin
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
