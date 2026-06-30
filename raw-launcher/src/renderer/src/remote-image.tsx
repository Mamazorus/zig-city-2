import { useState, useEffect } from 'react'
import playerImage from './assets/player.png'

// ── Chargement d'images distantes via le processus principal ──
// Chromium (le renderer) suit le proxy / VPN / antivirus du système, ce qui peut
// bloquer les <img> distantes sur certaines machines (têtes mc-heads, visuels de
// news) alors que le reste fonctionne. On récupère donc l'image côté main (Node,
// chemin réseau direct comme Firebase) et on l'affiche en data: URL. Les chemins
// locaux (assets bundlés, data:) sont utilisés tels quels.
export function useRemoteImage(url: string | null | undefined, fallback: string): string {
  const isRemote = !!url && /^https?:\/\//i.test(url)
  const [resolved, setResolved] = useState<string | null>(null)
  useEffect(() => {
    setResolved(null)
    if (!isRemote) return
    let alive = true
    window.launcher.fetchImage(url as string)
      .then((dataUrl) => { if (alive && dataUrl) setResolved(dataUrl) })
      .catch(() => {})
    return () => { alive = false }
  }, [url, isRemote])
  if (!url) return fallback
  if (!isRemote) return url            // asset local / data: → tel quel
  return resolved ?? fallback          // distante : data URL une fois prête, sinon fallback
}

// Comme useRemoteImage, mais essaie plusieurs URL distantes dans l'ordre et garde
// la première qui aboutit. Sert au repli entre fournisseurs de têtes (voir Avatar).
function useFirstRemoteImage(urls: (string | null | undefined)[], fallback: string): string {
  const key = urls.filter(Boolean).join('|')
  const [resolved, setResolved] = useState<string | null>(null)
  useEffect(() => {
    setResolved(null)
    let alive = true
    ;(async () => {
      for (const u of urls) {
        if (!u || !/^https?:\/\//i.test(u)) continue
        const dataUrl = await window.launcher.fetchImage(u).catch(() => null)
        if (!alive) return
        if (dataUrl) { setResolved(dataUrl); return }
      }
    })()
    return () => { alive = false }
    // key résume l'ensemble des URL : ne relancer que si la liste change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return resolved ?? fallback
}

// Compose la tête (face + calque chapeau) depuis un PNG de skin 64×64, en data URL.
// Sert à afficher la tête du joueur courant SANS passer par minotar/mc-heads : ces
// services cachent côté serveur et peuvent servir une tête périmée plusieurs heures
// après un changement de skin (même un cache-buster d'URL ne les force pas). Le skin
// du joueur, lui, vient de Mojang (via le main, `getSkinInfo`) → toujours à jour.
// ⚠️ skinSrc doit être un data: URL (un PNG distant « taint » le canvas → toDataURL échoue).
const headCache = new Map<string, string>()
export function renderHeadFromSkin(skinSrc: string, size = 64): Promise<string> {
  const cached = headCache.get(skinSrc)
  if (cached) return Promise.resolve(cached)
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = size; c.height = size
        const ctx = c.getContext('2d')!
        ctx.imageSmoothingEnabled = false
        ctx.drawImage(img, 8, 8, 8, 8, 0, 0, size, size)    // face (tête, couche de base)
        ctx.drawImage(img, 40, 8, 8, 8, 0, 0, size, size)   // chapeau (couche du dessus)
        const url = c.toDataURL('image/png')
        headCache.set(skinSrc, url)
        resolve(url)
      } catch (e) { reject(e) }
    }
    img.onerror = () => reject(new Error('skin invalide'))
    img.src = skinSrc
  })
}

// Tête de joueur avec repli sur l'avatar Steve bundlé.
// `srcOverride` (data URL) court-circuite le réseau : utilisé pour la tête du joueur
// courant, rendue localement depuis son skin (cf. renderHeadFromSkin) → toujours à jour.
// Sinon on interroge minotar.net en priorité : contrairement à mc-heads.net (qui sert un
// Steve par défaut en HTTP 200 pour certains comptes premium pourtant valides — cache
// périmé côté service), minotar résout ces têtes correctement et renvoie un vrai 404
// pour les pseudos inconnus (→ repli propre sur le Steve bundlé via rejet HTTP). mc-heads
// reste en filet de secours si minotar ne répond pas. /helm = tête + couche chapeau.
export function Avatar({ name, version, srcOverride, className }: { name?: string | null; version?: number; srcOverride?: string | null; className?: string }) {
  const v = version ? `?v=${version}` : ''
  const urls = (!srcOverride && name)
    ? [
        `https://minotar.net/helm/${encodeURIComponent(name)}/64${v}`,
        `https://mc-heads.net/avatar/${encodeURIComponent(name)}/64${v}`,
      ]
    : []
  const remote = useFirstRemoteImage(urls, playerImage)
  const src = srcOverride || remote
  return (
    <img
      alt=""
      className={className}
      src={src}
      onError={(e) => { (e.currentTarget as HTMLImageElement).src = playerImage }}
    />
  )
}

// Visuel de news : asset local direct, URL distante proxyfiée, sinon le repli.
export function RemoteNewsImage({ src, className, fallback }: { src?: string; className?: string; fallback: React.ReactNode }) {
  const resolved = useRemoteImage(src ?? null, '')
  if (!resolved) return <>{fallback}</>
  return <img alt="" className={className} src={resolved} />
}
