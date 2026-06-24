// Rendu isométrique d'un bloc Minecraft en canvas 2D, identique au rendu
// d'inventaire du jeu (rotation display 30/225, projection orthographique,
// ombrage par face, teinte herbe/feuilles). Le main fournit un descripteur
// déjà aplati (géométrie + textures dataURL) ; ce module le dessine et met le
// résultat en cache. Aucune dépendance : la projection MC étant orthographique,
// un simple mapping affine par triangle suffit (pas de correction perspective).
//
// Calibré en headless (rotation Rx·Ry·Rz, culling n.z<0, painter meanZ croissant,
// orientation des faces validée sur stone/oak_log/furnace/grass).
import { useEffect, useState } from 'react'

// ── Types du descripteur (doivent rester en phase avec le main + window.d.ts) ──
export type IconTex = { dataUrl: string; w: number; h: number }
export type IconFace = { texture: string; uv?: number[]; rotation?: number; tintindex?: number }
export type IconElement = {
  from: number[]; to: number[]
  rotation?: { origin: number[]; axis: 'x' | 'y' | 'z'; angle: number }
  faces: Partial<Record<'down' | 'up' | 'north' | 'south' | 'west' | 'east', IconFace>>
}
export type IconGui = { rotation: number[]; scale: number[]; translation: number[] }
export type BlockIcon = {
  kind: 'block'; elements: IconElement[]; textures: Record<string, IconTex>
  gui?: IconGui; flatFallback?: string
}
export type FlatIcon = { kind: 'flat'; src: string }
export type ItemIconDesc = FlatIcon | BlockIcon

type V3 = [number, number, number]
type P2 = { x: number; y: number }
type Mat = number[][]

// ── Vecteurs / matrices 3×3 ──
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scaleV = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const mul3 = (M: Mat, v: V3): V3 => [
  M[0][0] * v[0] + M[0][1] * v[1] + M[0][2] * v[2],
  M[1][0] * v[0] + M[1][1] * v[1] + M[1][2] * v[2],
  M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2],
]
const matmul3 = (A: Mat, B: Mat): Mat => [0, 1, 2].map(i => [0, 1, 2].map(j => A[i][0] * B[0][j] + A[i][1] * B[1][j] + A[i][2] * B[2][j]))
const deg = (d: number) => (d * Math.PI) / 180
const Rx = (t: number): Mat => [[1, 0, 0], [0, Math.cos(t), -Math.sin(t)], [0, Math.sin(t), Math.cos(t)]]
const Ry = (t: number): Mat => [[Math.cos(t), 0, Math.sin(t)], [0, 1, 0], [-Math.sin(t), 0, Math.cos(t)]]
const Rz = (t: number): Mat => [[Math.cos(t), -Math.sin(t), 0], [Math.sin(t), Math.cos(t), 0], [0, 0, 1]]

// Rotation d'affichage : MC compose R = Rx·Ry·Rz (Rz agit en premier sur le vecteur).
function displayRotation(gui?: IconGui): Mat {
  const [rx, ry, rz] = gui?.rotation ?? [30, 225, 0]
  return matmul3(matmul3(Rx(deg(rx)), Ry(deg(ry))), Rz(deg(rz)))
}

function elementMatrix(rot: NonNullable<IconElement['rotation']>): { M: Mat; o: V3 } {
  const a = deg(rot.angle || 0)
  const M = rot.axis === 'x' ? Rx(a) : rot.axis === 'y' ? Ry(a) : Rz(a)
  return { M, o: sub((rot.origin as V3) || [8, 8, 8], [8, 8, 8]) }
}

// 4 coins 3D d'une face (coords 0-16), ordre = (u0,v0),(u1,v0),(u1,v1),(u0,v1).
function faceVerts(dir: string, f: number[], t: number[]): V3[] {
  const [x0, y0, z0] = f, [x1, y1, z1] = t
  switch (dir) {
    case 'up': return [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]]
    case 'down': return [[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0]]
    case 'north': return [[x1, y1, z0], [x0, y1, z0], [x0, y0, z0], [x1, y0, z0]]
    case 'south': return [[x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [x0, y0, z1]]
    case 'west': return [[x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [x0, y0, z0]]
    case 'east': return [[x1, y1, z1], [x1, y1, z0], [x1, y0, z0], [x1, y0, z1]]
    default: return [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]]
  }
}

// Ombrage directionnel vanilla (LightUtil) + teinte herbe "plaine".
const SHADE: Record<string, number> = { down: 0.5, up: 1.0, north: 0.8, south: 0.8, west: 0.6, east: 0.6 }
const TINT = { r: 121, g: 192, b: 90 }

// Coins source (px) dans la texture, alignés sur faceVerts, avec rotation de face.
// uv en 0-16 ; on n'utilise que le carré du haut (1re frame d'une texture animée).
function faceUVpx(face: IconFace, texW: number): P2[] {
  const uv = face.uv || [0, 0, 16, 16]
  const k = texW / 16
  let pts: P2[] = [
    { x: uv[0] * k, y: uv[1] * k },
    { x: uv[2] * k, y: uv[1] * k },
    { x: uv[2] * k, y: uv[3] * k },
    { x: uv[0] * k, y: uv[3] * k },
  ]
  const r = (((face.rotation || 0) % 360) + 360) % 360
  const shift = r / 90
  if (shift) pts = pts.map((_, i) => pts[(i + shift) % 4])
  return pts
}

// Triangle texturé : mappe 3 coins source (px) -> 3 coins dest (écran) via une
// transformation affine + clip. img peut être un canvas offscreen (texture ombrée).
function drawTexturedTriangle(ctx: CanvasRenderingContext2D, img: CanvasImageSource, src: P2[], dst: P2[]) {
  const [s0, s1, s2] = src, [d0, d1, d2] = dst
  const sdx1 = s1.x - s0.x, sdy1 = s1.y - s0.y, sdx2 = s2.x - s0.x, sdy2 = s2.y - s0.y
  const det = sdx1 * sdy2 - sdx2 * sdy1
  if (Math.abs(det) < 1e-6) return
  const inv = 1 / det
  const i00 = sdy2 * inv, i01 = -sdx2 * inv, i10 = -sdy1 * inv, i11 = sdx1 * inv
  const ddx1 = d1.x - d0.x, ddy1 = d1.y - d0.y, ddx2 = d2.x - d0.x, ddy2 = d2.y - d0.y
  const a = ddx1 * i00 + ddx2 * i10, c = ddx1 * i01 + ddx2 * i11
  const b = ddy1 * i00 + ddy2 * i10, d = ddy1 * i01 + ddy2 * i11
  const e = d0.x - (a * s0.x + c * s0.y)
  const f = d0.y - (b * s0.x + d * s0.y)
  ctx.save()
  ctx.beginPath(); ctx.moveTo(d0.x, d0.y); ctx.lineTo(d1.x, d1.y); ctx.lineTo(d2.x, d2.y); ctx.closePath(); ctx.clip()
  ctx.setTransform(a, b, c, d, e, f)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(img, 0, 0)
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.restore()
}

// Texture ombrée + teintée (1re frame carrée), alpha d'origine préservé.
function shadeTexture(img: HTMLImageElement, factor: number, tinted: boolean): HTMLCanvasElement {
  const w = img.width
  const cv = document.createElement('canvas'); cv.width = w; cv.height = w
  const ctx = cv.getContext('2d')!
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(img, 0, 0, w, w, 0, 0, w, w)
  const r = Math.round((tinted ? TINT.r : 255) * factor)
  const g = Math.round((tinted ? TINT.g : 255) * factor)
  const b = Math.round((tinted ? TINT.b : 255) * factor)
  ctx.globalCompositeOperation = 'multiply'
  ctx.fillStyle = `rgb(${r},${g},${b})`
  ctx.fillRect(0, 0, w, w)
  ctx.globalCompositeOperation = 'destination-in' // restaure l'alpha d'origine
  ctx.drawImage(img, 0, 0, w, w, 0, 0, w, w)
  ctx.globalCompositeOperation = 'source-over'
  return cv
}

type RFace = { proj: P2[]; meanZ: number; dir: string; face: IconFace }

// Dessine le bloc sur ctx (canvas N×N déjà vierge). images : Map(texRef -> Image
// décodée). Renvoie false si rien n'a pu être dessiné.
function renderBlockToCtx(ctx: CanvasRenderingContext2D, model: BlockIcon, images: Map<string, HTMLImageElement>, N: number): boolean {
  const R = displayRotation(model.gui)
  const scale = model.gui?.scale?.[0] ?? 0.625

  const faces: RFace[] = []
  for (const el of model.elements) {
    const er = el.rotation ? elementMatrix(el.rotation) : null
    for (const dir of ['down', 'up', 'north', 'south', 'west', 'east'] as const) {
      const face = el.faces[dir]; if (!face) continue
      let vs = faceVerts(dir, el.from, el.to).map(p => sub(p as V3, [8, 8, 8]))
      if (er) vs = vs.map(p => add(mul3(er.M, sub(p, er.o)), er.o))
      vs = vs.map(p => mul3(R, scaleV(p, scale)))
      const n = cross(sub(vs[1], vs[0]), sub(vs[2], vs[0]))
      if (n[2] >= 0) continue // backface culling (n.z < 0 = vers la caméra)
      const proj = vs.map(p => ({ x: p[0], y: -p[1] }))
      const meanZ = (vs[0][2] + vs[1][2] + vs[2][2] + vs[3][2]) / 4
      faces.push({ proj, meanZ, dir, face })
    }
  }
  if (!faces.length) return false

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const rf of faces) for (const p of rf.proj) {
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y
  }
  const span = Math.max(maxX - minX, maxY - minY) || 1
  const fit = (N * 0.94) / span
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2
  const toScreen = (p: P2): P2 => ({ x: N / 2 + (p.x - cx) * fit, y: N / 2 + (p.y - cy) * fit })

  faces.sort((A, B) => A.meanZ - B.meanZ) // painter back-to-front (tri stable = ordre des elements)

  ctx.imageSmoothingEnabled = false
  let drew = 0
  for (const rf of faces) {
    const tex = images.get(rf.face.texture)
    const D = rf.proj.map(toScreen)
    if (!tex) {
      ctx.save(); ctx.beginPath(); ctx.moveTo(D[0].x, D[0].y); D.slice(1).forEach(p => ctx.lineTo(p.x, p.y)); ctx.closePath()
      ctx.fillStyle = '#9b9b9b'; ctx.fill(); ctx.restore(); continue
    }
    const factor = SHADE[rf.dir] ?? 1
    const tinted = rf.face.tintindex != null && rf.face.tintindex >= 0
    const shaded = shadeTexture(tex, factor, tinted)
    const uv = faceUVpx(rf.face, tex.width)
    drawTexturedTriangle(ctx, shaded, [uv[0], uv[1], uv[2]], [D[0], D[1], D[2]])
    drawTexturedTriangle(ctx, shaded, [uv[0], uv[2], uv[3]], [D[0], D[2], D[3]])
    drew++
  }
  return drew > 0
}

// ── Caches + chargement asynchrone des textures ──
const imgCache = new Map<string, Promise<HTMLImageElement>>() // dataUrl -> Image décodée
const renderCache = new Map<string, string>()                 // `${id}:${N}` -> dataURL PNG

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  let p = imgCache.get(dataUrl)
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = dataUrl
    })
    imgCache.set(dataUrl, p)
  }
  return p
}

// Rend un bloc en dataURL (mémoïsé par id:N). null si non rendable.
export async function renderBlock(id: string, model: BlockIcon, N = 56): Promise<string | null> {
  const key = `${id}:${N}`
  const cached = renderCache.get(key)
  if (cached) return cached
  try {
    const refs = Object.keys(model.textures)
    const imgs = await Promise.all(refs.map(r => loadImage(model.textures[r].dataUrl).catch(() => null)))
    const images = new Map<string, HTMLImageElement>()
    refs.forEach((r, i) => { if (imgs[i]) images.set(r, imgs[i] as HTMLImageElement) })
    const canvas = document.createElement('canvas'); canvas.width = N; canvas.height = N
    const ctx = canvas.getContext('2d')!
    const ok = renderBlockToCtx(ctx, model, images, N)
    // Bloc non rendable (modèle exotique) -> dégradation gracieuse vers la texture
    // plate fournie par le main, plutôt qu'une case vide.
    if (!ok) return model.flatFallback ?? null
    const url = canvas.toDataURL('image/png')
    renderCache.set(key, url)
    return url
  } catch {
    return model.flatFallback ?? null
  }
}

export function getCachedBlock(id: string, N = 56): string | null {
  return renderCache.get(`${id}:${N}`) ?? null
}

// Hook : rend le bloc et renvoie son dataURL (ou null tant que non prêt /
// non rendable). StrictMode-safe (flag alive). Cache hit = synchrone.
export function useBlockIcon(id: string, model: BlockIcon | null, N = 56): string | null {
  const [url, setUrl] = useState<string | null>(() => (model ? getCachedBlock(id, N) : null))
  useEffect(() => {
    if (!model) { setUrl(null); return }
    const cached = getCachedBlock(id, N)
    if (cached) { setUrl(cached); return }
    let alive = true
    renderBlock(id, model, N).then(u => { if (alive) setUrl(u) }).catch(() => { if (alive) setUrl(null) })
    return () => { alive = false }
  }, [id, model, N])
  return url
}
