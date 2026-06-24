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

// Tête de joueur avec repli sur l'avatar Steve bundlé.
// On interroge minotar.net en priorité : contrairement à mc-heads.net (qui sert un
// Steve par défaut en HTTP 200 pour certains comptes premium pourtant valides — cache
// périmé côté service), minotar résout ces têtes correctement et renvoie un vrai 404
// pour les pseudos inconnus (→ repli propre sur le Steve bundlé via rejet HTTP). mc-heads
// reste en filet de secours si minotar ne répond pas. /helm = tête + couche chapeau.
export function Avatar({ name, version, className }: { name?: string | null; version?: number; className?: string }) {
  const v = version ? `?v=${version}` : ''
  const urls = name
    ? [
        `https://minotar.net/helm/${encodeURIComponent(name)}/64${v}`,
        `https://mc-heads.net/avatar/${encodeURIComponent(name)}/64${v}`,
      ]
    : []
  const src = useFirstRemoteImage(urls, playerImage)
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
