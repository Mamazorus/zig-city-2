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

// Tête de joueur (mc-heads) avec repli sur l'avatar Steve bundlé.
export function Avatar({ name, version, className }: { name?: string | null; version?: number; className?: string }) {
  const url = name
    ? `https://mc-heads.net/avatar/${encodeURIComponent(name)}/64${version ? `?v=${version}` : ''}`
    : null
  const src = useRemoteImage(url, playerImage)
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
