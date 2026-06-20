import { useState, useEffect, useRef, useMemo } from 'react'
import { Avatar, useRemoteImage, RemoteNewsImage } from './remote-image'

// ── Espace de discussion type Discord ────────────────────────────────────────
// Salons (channels) à gauche, fil de messages au centre, joueurs en jeu à droite.
// Tout le temps réel et toutes les écritures passent par le main process (cf.
// handlers chat-* dans src/main/index.js) ; ici, le composant reste « bête » : il
// s'abonne aux flux et ré-affiche les maps reçues.

interface ChatMedia { kind: 'upload' | 'link'; url: string; mime?: string; w?: number; h?: number }
interface ChatChannel { id: string; name: string; description?: string; type: 'open' | 'announce'; order?: number; createdAt?: number; createdBy?: string }
interface ChatMessage { id: string; author: string; uuid?: string | null; text: string; media?: ChatMedia; ts: number }
interface OnlinePlayer { name: string; since: number }

type PendingAttachment =
  | { kind: 'upload'; dataUrl: string; mime: string; name: string; w?: number; h?: number }
  | { kind: 'link'; url: string }

const TEXT_MAX = 2000   // doit rester aligné avec CHAT_TEXT_MAX côté main

const glass = 'backdrop-blur-[5.95px] bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-[16px] shadow-[2px_2px_8px_0px_rgba(0,0,0,0.1)]'

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']

function formatTime(ts: number) {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
function formatDayLabel(ts: number) {
  const d = new Date(ts), now = new Date()
  const yest = new Date(now); yest.setDate(now.getDate() - 1)
  if (sameDay(d, now)) return "Aujourd'hui"
  if (sameDay(d, yest)) return 'Hier'
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}
const dayKey = (ts: number) => { const d = new Date(ts); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}` }

function loadImageSize(src: string): Promise<{ w: number; h: number }> {
  return new Promise((res) => {
    const img = new Image()
    img.onload = () => res({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => res({ w: 0, h: 0 })
    img.src = src
  })
}

// Icône de salon : # (ouvert) ou mégaphone (annonces)
function ChannelIcon({ type, className }: { type: 'open' | 'announce'; className?: string }) {
  if (type === 'announce') {
    return (
      <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
        <path d="M2.5 6.5v3a1 1 0 0 0 1 1H5l4.5 2.8V2.7L5 5.5H3.5a1 1 0 0 0-1 1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
        <path d="M12 6.2c.6.5.9 1.1.9 1.8s-.3 1.3-.9 1.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" className={className} aria-hidden="true">
      <path d="M6.4 2.2 5 13.8M11 2.2 9.6 13.8M2.6 5.6h11.2M2.2 10.4h11.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  )
}

// Image d'un message (résolue via le proxy fetch-image du main, comme les news).
// onLoaded permet de réajuster le scroll une fois la hauteur réelle connue.
function ChatImage({ media, onOpen, onLoaded }: { media: ChatMedia; onOpen: (url: string) => void; onLoaded?: () => void }) {
  const resolved = useRemoteImage(media.url, '')
  const boxStyle = media.w && media.h
    ? { width: Math.min(380, media.w), aspectRatio: `${media.w} / ${media.h}`, maxHeight: 280 }
    : { width: 280, height: 180 }   // place réservée pour les liens sans dimensions
  if (!resolved) {
    return <div className="rounded-[10px] bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.08)] animate-pulse max-w-full" style={boxStyle} />
  }
  return (
    <button
      onClick={() => onOpen(resolved)}
      className="block rounded-[10px] overflow-hidden border border-[rgba(255,255,255,0.1)] hover:border-[rgba(0,255,225,0.35)] transition-colors max-w-[380px]"
      aria-label="Agrandir l'image"
    >
      <img src={resolved} alt="Image partagée" className="block max-w-full" style={{ maxHeight: 280, objectFit: 'cover' }} onLoad={onLoaded} />
    </button>
  )
}

export default function ChatPanel({
  username,
  isAdmin,
  onlinePlayers,
}: {
  username: string
  isAdmin: boolean
  onlinePlayers: OnlinePlayer[]
}) {
  const [channels, setChannels] = useState<ChatChannel[]>([])
  const [channelsLoaded, setChannelsLoaded] = useState(false)
  const [channelsError, setChannelsError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loaded, setLoaded] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [attachment, setAttachment] = useState<PendingAttachment | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkVal, setLinkVal] = useState('')

  const activeIdRef = useRef<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const atBottomRef = useRef(true)
  const taRef = useRef<HTMLTextAreaElement>(null)

  const activeChannel = useMemo(() => channels.find(c => c.id === activeId) || null, [channels, activeId])
  const canWrite = !!username && (activeChannel?.type !== 'announce' || isAdmin)
  const hash = activeChannel?.type === 'open' ? '#' : ''

  const scrollToEndIfAtBottom = () => {
    const el = scrollRef.current
    if (el && atBottomRef.current) el.scrollTop = el.scrollHeight
  }

  // ── Salons : chargement initial + flux temps réel ──
  useEffect(() => {
    let alive = true
    window.launcher.chatGetChannels().then(r => {
      if (!alive) return
      if (r.success) setChannels(r.channels)
      else setChannelsError(r.error || 'Salons indisponibles.')
      setChannelsLoaded(true)
    })
    const off = window.launcher.onChatChannels((chs) => { if (alive) { setChannels(chs); setChannelsLoaded(true); setChannelsError(null) } })
    window.launcher.chatSubscribeChannels()
    return () => { alive = false; off(); window.launcher.chatUnsubscribeChannels() }
  }, [])

  // Sélection auto du premier salon ; bascule si le salon actif disparaît
  useEffect(() => {
    if (!channels.length) { setActiveId(null); return }
    if (!activeId || !channels.some(c => c.id === activeId)) setActiveId(channels[0].id)
  }, [channels, activeId])

  // ── Messages du salon actif : flux temps réel (cleanup symétrique au changement) ──
  useEffect(() => {
    activeIdRef.current = activeId
    atBottomRef.current = true            // un salon s'ouvre toujours collé en bas
    setMessages([]); setLoaded(false)
    // État propre par salon (évite erreur/brouillon/pièce jointe résiduels d'un autre salon)
    setConfirmDel(null); setError(null); setAttachment(null); setLinkOpen(false); setLinkVal('')
    if (!activeId) return
    const off = window.launcher.onChatMessages((data) => {
      if (data.channelId !== activeIdRef.current) return   // évènement d'un ancien salon
      setMessages(data.messages)
      setLoaded(true)
    })
    window.launcher.chatSubscribe(activeId)
    return () => { off(); window.launcher.chatUnsubscribe(activeId) }
  }, [activeId])

  // Auto-scroll en bas à l'arrivée de nouveaux messages (uniquement si déjà en bas)
  useEffect(() => { scrollToEndIfAtBottom() }, [messages])

  // Hauteur auto du champ de saisie
  useEffect(() => {
    const t = taRef.current
    if (t) { t.style.height = 'auto'; t.style.height = `${Math.min(120, t.scrollHeight)}px` }
  }, [text])

  // Fermeture de la lightbox au clavier (Échap)
  useEffect(() => {
    if (!lightbox) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox])

  const onScroll = () => {
    const el = scrollRef.current
    if (el) atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
  }

  // ── Pièces jointes ──
  const pickFile = async () => {
    setError(null)
    const r = await window.launcher.chatPickMedia()
    if (r.canceled) return
    if (r.error || !r.dataUrl) { setError(r.error || 'Image illisible.'); return }
    const { w, h } = await loadImageSize(r.dataUrl)
    setAttachment({ kind: 'upload', dataUrl: r.dataUrl, mime: r.mime || 'image/png', name: r.name || 'image', w, h })
    setLinkOpen(false)
  }

  const onPaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const it of Array.from(items)) {
      if (it.type.startsWith('image/')) {
        const file = it.getAsFile()
        if (!file) continue
        e.preventDefault()
        const reader = new FileReader()
        reader.onload = async () => {
          const dataUrl = String(reader.result || '')
          const { w, h } = await loadImageSize(dataUrl)
          setAttachment({ kind: 'upload', dataUrl, mime: file.type || 'image/png', name: file.name || 'collage.png', w, h })
        }
        reader.readAsDataURL(file)
        return
      }
    }
  }

  const addLink = () => {
    const url = linkVal.trim()
    if (!/^https?:\/\//i.test(url)) { setError('Lien invalide (http/https requis).'); return }
    setAttachment({ kind: 'link', url })
    setLinkVal(''); setLinkOpen(false); setError(null)
  }

  // ── Envoi ──
  const send = async () => {
    if (sending || uploading || !activeId) return
    const target = activeId               // salon ciblé, figé pour tout l'envoi
    const body = text.trim()
    if (!body && !attachment) return
    setError(null)
    setSending(true)
    try {
      let media: ChatMedia | null = null
      if (attachment) {
        if (attachment.kind === 'upload') {
          setUploading(true)
          const up = await window.launcher.chatUploadMedia({ channelId: target, dataUrl: attachment.dataUrl, mime: attachment.mime, name: attachment.name })
          setUploading(false)
          if (!up.success || !up.url) { setError(up.error || "Échec de l'upload."); return }
          media = { kind: 'upload', url: up.url, mime: up.mime, w: attachment.w, h: attachment.h }
        } else {
          media = { kind: 'link', url: attachment.url }
        }
      }
      const res = await window.launcher.chatSendMessage({ channelId: target, text: body, media })
      if (!res.success) { setError(res.error || "Échec de l'envoi."); return }
      // N'effacer le brouillon que si on est toujours sur le salon ciblé
      if (activeIdRef.current === target) {
        setText(''); setAttachment(null)
        atBottomRef.current = true
      }
    } finally {
      setSending(false); setUploading(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const doDelete = async (id: string) => {
    setConfirmDel(null)
    const res = await window.launcher.chatDeleteMessage({ channelId: activeId!, messageId: id })
    if (!res.success) setError(res.error || 'Suppression impossible.')
    // le flux temps réel reflètera la suppression
  }

  return (
    <div className="flex gap-[16px] h-full min-h-0">

      {/* ── PANE SALONS ── */}
      <div className={`${glass} flex flex-col shrink-0 overflow-hidden`} style={{ width: 232 }}>
        <div className="px-[18px] pt-[18px] pb-[12px] shrink-0">
          <p className="font-ui font-semibold text-[16px] text-white tracking-[-0.64px] leading-none">Salons</p>
          <p className="font-ui text-[14px] text-white/35 tracking-[-0.3px] mt-[4px]">Discute avec la communauté</p>
        </div>
        <div className="flex-1 overflow-y-auto px-[10px] pb-[12px] flex flex-col gap-[3px] min-h-0">
          {!channelsLoaded ? (
            <p className="font-ui text-[14px] text-white/25 text-center px-[10px] py-[24px]">Connexion aux salons…</p>
          ) : channelsError && channels.length === 0 ? (
            <p className="font-ui text-[14px] text-white/30 text-center px-[10px] py-[24px]">Salons indisponibles — vérifie ta connexion.</p>
          ) : channels.length === 0 ? (
            <p className="font-ui text-[14px] text-white/25 text-center px-[10px] py-[24px]">Aucun salon pour le moment.</p>
          ) : channels.map(c => {
            const active = c.id === activeId
            return (
              <button
                key={c.id}
                onClick={() => setActiveId(c.id)}
                className={`flex items-center gap-[9px] px-[10px] py-[8px] rounded-[10px] text-left transition-colors ${
                  active
                    ? 'bg-[rgba(0,255,225,0.1)] border border-[rgba(0,255,225,0.3)]'
                    : 'border border-transparent hover:bg-[rgba(255,255,255,0.05)]'
                }`}
              >
                <ChannelIcon type={c.type} className={`shrink-0 ${active ? 'text-[rgba(0,255,225,0.9)]' : 'text-white/35'}`} />
                <span className={`font-ui text-[14px] tracking-[-0.3px] truncate flex-1 ${active ? 'text-white font-semibold' : 'text-white/55'}`}>{c.name}</span>
                {c.type === 'announce' && (
                  <span className="font-ui text-[13px] text-white/30 shrink-0">lecture</span>
                )}
              </button>
            )
          })}
        </div>
        {isAdmin && (
          <div className="px-[18px] py-[12px] border-t border-[rgba(255,255,255,0.08)] shrink-0">
            <p className="font-ui text-[13px] text-white/30 tracking-[-0.2px] leading-snug">
              Gère les salons depuis l'onglet <span className="text-white/50">Administration → Salons</span>.
            </p>
          </div>
        )}
      </div>

      {/* ── PANE MESSAGES ── */}
      <div className={`${glass} flex-1 flex flex-col min-w-0 overflow-hidden`}>
        {/* En-tête du salon */}
        <div className="flex items-center gap-[10px] px-[20px] py-[14px] border-b border-[rgba(255,255,255,0.08)] shrink-0">
          {activeChannel && <ChannelIcon type={activeChannel.type} className="text-white/45 shrink-0" />}
          <div className="flex flex-col min-w-0">
            <p className="font-ui font-semibold text-[16px] text-white tracking-[-0.64px] leading-none truncate">
              {activeChannel ? activeChannel.name : 'Salon'}
            </p>
            {activeChannel?.description && (
              <p className="font-ui text-[14px] text-white/40 tracking-[-0.3px] truncate mt-[4px]">{activeChannel.description}</p>
            )}
          </div>
          {activeChannel?.type === 'announce' && (
            <span className="ml-auto font-ui text-[13px] text-[rgba(0,255,225,0.75)] bg-[rgba(0,255,225,0.08)] border border-[rgba(0,255,225,0.25)] rounded-full px-[10px] py-[3px] shrink-0">
              Annonces
            </span>
          )}
        </div>

        {/* Fil de messages */}
        <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto px-[14px] py-[12px] min-h-0">
          {!activeId ? null : !loaded ? (
            <p className="font-ui text-[14px] text-white/25 text-center py-[40px]">Connexion au salon…</p>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-[8px] h-full text-center">
              <div className="size-[52px] rounded-full bg-[rgba(0,255,225,0.08)] border border-[rgba(0,255,225,0.2)] flex items-center justify-center">
                {activeChannel && <ChannelIcon type={activeChannel.type} className="text-[rgba(0,255,225,0.8)]" />}
              </div>
              <p className="font-ui text-[15px] text-white/55 tracking-[-0.3px]">
                Bienvenue dans {hash}{activeChannel?.name}
              </p>
              <p className="font-ui text-[14px] text-white/30 tracking-[-0.3px]">
                {canWrite ? "C'est le tout début de ce salon." : "Personne n'a encore publié ici."}
              </p>
            </div>
          ) : (
            <div className="flex flex-col">
              {messages.map((m, i) => {
                const prev = messages[i - 1]
                const newDay = !prev || dayKey(prev.ts) !== dayKey(m.ts)
                const grouped = !newDay && prev && prev.author === m.author && (m.ts - prev.ts) < 5 * 60 * 1000
                const canDelete = isAdmin || (!!username && m.author === username)
                return (
                  <div key={m.id}>
                    {newDay && (
                      <div className="flex items-center gap-[12px] my-[12px] px-[6px]">
                        <div className="flex-1 h-px bg-[rgba(255,255,255,0.08)]" />
                        <span className="font-ui text-[12px] text-white/30 tracking-[-0.2px] shrink-0">{formatDayLabel(m.ts)}</span>
                        <div className="flex-1 h-px bg-[rgba(255,255,255,0.08)]" />
                      </div>
                    )}
                    <div className={`group relative flex gap-[10px] px-[8px] rounded-[8px] hover:bg-[rgba(255,255,255,0.03)] ${grouped ? 'py-[1px]' : 'pt-[6px] pb-[2px]'}`}>
                      {/* Gouttière : avatar (en-tête) ou heure au survol (groupé) */}
                      <div className="w-[40px] shrink-0 flex justify-center">
                        {grouped ? (
                          <span className="font-mono text-[10px] text-white/30 opacity-0 group-hover:opacity-100 transition-opacity pt-[3px] leading-none">{formatTime(m.ts)}</span>
                        ) : (
                          <div className="size-[40px] rounded-[9px] overflow-hidden">
                            <Avatar name={m.author} className="size-full object-cover" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        {!grouped && (
                          <div className="flex items-baseline gap-[8px]">
                            <span className="font-mono font-semibold text-[14px] text-white tracking-[-0.4px]">{m.author}</span>
                            <span className="font-ui text-[12px] text-white/30">{formatTime(m.ts)}</span>
                          </div>
                        )}
                        {m.text && (
                          <p className="font-ui text-[14px] text-white/85 leading-[1.45] tracking-[-0.2px] whitespace-pre-wrap break-words">{m.text}</p>
                        )}
                        {m.media && (
                          <div className="mt-[5px]">
                            <ChatImage media={m.media} onOpen={setLightbox} onLoaded={scrollToEndIfAtBottom} />
                          </div>
                        )}
                      </div>

                      {/* Suppression (admin ou auteur) */}
                      {canDelete && (
                        confirmDel === m.id ? (
                          <div className="absolute top-[2px] right-[6px] flex gap-[4px] items-center bg-[rgba(20,18,28,0.92)] rounded-[8px] px-[6px] py-[3px] border border-[rgba(255,255,255,0.1)]">
                            <button onClick={() => doDelete(m.id)} className="font-ui text-[12px] text-[rgba(255,100,100,0.9)] hover:text-[rgba(255,130,130,1)] px-[6px] py-[2px] rounded-[6px] bg-[rgba(255,60,60,0.12)]">Supprimer</button>
                            <button onClick={() => setConfirmDel(null)} className="font-ui text-[12px] text-white/35 hover:text-white/60 px-[6px] py-[2px] rounded-[6px]">Annuler</button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDel(m.id)}
                            title="Supprimer"
                            aria-label="Supprimer le message"
                            className="absolute top-[2px] right-[6px] opacity-0 group-hover:opacity-100 flex items-center justify-center size-[26px] rounded-[7px] text-white/35 hover:text-[rgba(255,120,120,0.95)] hover:bg-[rgba(255,60,60,0.12)] transition-all"
                          >
                            <svg width="13" height="14" viewBox="0 0 11 12" fill="currentColor" aria-hidden="true">
                              <rect x="0.6" y="2.1" width="9.8" height="2.2" rx="1.1" />
                              <rect x="3.6" y="0.4" width="3.8" height="2.1" rx="1" />
                              <path d="M1.55 4.6h7.9l-.62 6.1a1.05 1.05 0 0 1-1.04.9H3.21a1.05 1.05 0 0 1-1.04-.9L1.55 4.6Z" />
                            </svg>
                          </button>
                        )
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Composer / bandeau lecture seule */}
        {canWrite ? (
          <div className="px-[14px] pb-[14px] pt-[4px] shrink-0">
            {attachment && (
              <div className="flex items-center gap-[10px] mb-[8px] p-[8px] rounded-[10px] bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)]">
                <div className="size-[44px] rounded-[8px] overflow-hidden shrink-0 bg-[rgba(0,0,0,0.3)]">
                  {attachment.kind === 'upload'
                    ? <img src={attachment.dataUrl} alt="" className="size-full object-cover" />
                    : <RemoteNewsImage src={attachment.url} className="size-full object-cover" fallback={<div className="size-full" />} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-ui text-[14px] text-white/70 truncate">{attachment.kind === 'upload' ? attachment.name : attachment.url}</p>
                  <p className="font-ui text-[14px] text-white/35">{attachment.kind === 'upload' ? 'Image — sera envoyée' : "Lien d'image"}</p>
                </div>
                <button onClick={() => setAttachment(null)} title="Retirer" aria-label="Retirer la pièce jointe" className="flex items-center justify-center size-[28px] rounded-[8px] text-white/40 hover:text-white hover:bg-[rgba(255,255,255,0.08)] transition-colors shrink-0">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><rect x="5" y="-1" width="2" height="14" rx="1" transform="rotate(45 6 6)" /><rect x="5" y="-1" width="2" height="14" rx="1" transform="rotate(-45 6 6)" /></svg>
                </button>
              </div>
            )}

            {linkOpen && (
              <div className="flex gap-[8px] mb-[8px]">
                <input
                  autoFocus
                  className="flex-1 bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[12px] py-[8px] text-white font-ui text-[14px] tracking-[-0.3px] focus:outline-none focus:border-[rgba(0,255,225,0.4)] placeholder:text-white/25"
                  placeholder="https://… (lien d'une image)"
                  value={linkVal}
                  onChange={e => setLinkVal(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLink() } if (e.key === 'Escape') setLinkOpen(false) }}
                />
                <button onClick={addLink} disabled={!linkVal.trim()} className="shrink-0 font-ui font-semibold text-[14px] bg-white text-[#0e0b16] px-[14px] rounded-[10px] hover:bg-white/90 active:scale-[0.98] disabled:opacity-30 disabled:hover:bg-white disabled:active:scale-100 transition-all">Joindre</button>
              </div>
            )}

            {error && <p className="font-ui text-[13px] text-[rgba(255,120,120,0.9)] mb-[6px] px-[2px]">{error}</p>}

            <div className="flex items-end gap-[8px] bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-[12px] px-[10px] py-[8px] focus-within:border-[rgba(0,255,225,0.35)] transition-colors">
              <button
                onClick={pickFile}
                title="Joindre une image"
                aria-label="Joindre une image"
                className="flex items-center justify-center size-[32px] rounded-[9px] text-white/45 hover:text-white hover:bg-[rgba(255,255,255,0.08)] transition-colors shrink-0"
              >
                <svg width="19" height="19" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M9 5v10M4 10h10" transform="rotate(45 10 10)" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="M13.5 6.5 7 13a2.5 2.5 0 0 0 3.5 3.5l6-6A4 4 0 0 0 11 5L5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <button
                onClick={() => { setLinkOpen(o => !o); setError(null) }}
                title="Coller un lien d'image"
                aria-label="Coller un lien d'image"
                className={`flex items-center justify-center size-[32px] rounded-[9px] transition-colors shrink-0 ${linkOpen ? 'text-[rgba(0,255,225,0.9)] bg-[rgba(0,255,225,0.1)]' : 'text-white/45 hover:text-white hover:bg-[rgba(255,255,255,0.08)]'}`}
              >
                <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M8 12a3 3 0 0 0 4.2.3l2.5-2.5a3 3 0 0 0-4.2-4.2L9 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M12 8a3 3 0 0 0-4.2-.3L5.3 10.2a3 3 0 0 0 4.2 4.2L11 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <textarea
                ref={taRef}
                rows={1}
                maxLength={TEXT_MAX}
                value={text}
                onChange={e => setText(e.target.value)}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                placeholder={activeChannel ? `Écrire dans ${hash}${activeChannel.name}…` : 'Écrire un message…'}
                className="flex-1 resize-none bg-transparent border-0 outline-none text-white font-ui text-[14px] tracking-[-0.2px] leading-[1.4] placeholder:text-white/25 py-[5px] max-h-[120px]"
              />
              <button
                onClick={send}
                disabled={(!text.trim() && !attachment) || sending}
                title="Envoyer"
                aria-label="Envoyer le message"
                className="flex items-center justify-center size-[32px] rounded-[9px] bg-white text-[#0e0b16] hover:bg-white/90 disabled:opacity-25 disabled:hover:bg-white active:scale-[0.95] transition-all shrink-0"
              >
                {sending ? (
                  <svg className="animate-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" style={{ opacity: 0.25 }} /><path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M2.5 10 17 3.5 13 17l-3.5-4.5L15 7l-7 4.5L2.5 10Z" /></svg>
                )}
              </button>
            </div>
            <div className="flex items-center justify-between mt-[6px] px-[4px]">
              <p className="font-ui text-[13px] text-white/25">
                {uploading ? 'Envoi du média…' : 'Entrée pour envoyer · Maj+Entrée pour un retour à la ligne'}
              </p>
              {text.length > 1800 && (
                <p className="font-ui text-[13px] text-white/30 shrink-0">{text.length}/{TEXT_MAX}</p>
              )}
            </div>
          </div>
        ) : (
          <div className="px-[14px] pb-[14px] pt-[4px] shrink-0">
            <div className="flex items-center gap-[10px] bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] rounded-[12px] px-[16px] py-[12px]">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-white/40 shrink-0" aria-hidden="true"><rect x="3" y="7" width="10" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.3" /><path d="M5 7V5a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth="1.3" /></svg>
              <p className="font-ui text-[14px] text-white/45 tracking-[-0.3px]">
                {username ? 'Ce salon est en lecture seule — réservé aux annonces.' : 'Connecte-toi pour participer à la discussion.'}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── PANE EN JEU (joueurs connectés au serveur) ── */}
      <div className={`${glass} flex flex-col shrink-0 overflow-hidden`} style={{ width: 208 }}>
        <div className="flex items-center justify-between px-[16px] pt-[16px] pb-[10px] shrink-0" title="Joueurs connectés au serveur Minecraft">
          <p className="font-ui font-semibold text-[15px] text-white tracking-[-0.5px]">En jeu</p>
          <span className="font-mono text-[14px] text-white/40">{onlinePlayers.length}</span>
        </div>
        <div className="flex-1 overflow-y-auto px-[8px] pb-[12px] flex flex-col gap-[2px] min-h-0">
          {onlinePlayers.length === 0 ? (
            <p className="font-ui text-[14px] text-white/25 text-center px-[8px] py-[20px]">Aucun joueur en jeu.</p>
          ) : onlinePlayers.map(p => (
            <div key={p.name} className="flex items-center gap-[9px] px-[8px] py-[6px] rounded-[8px] hover:bg-[rgba(255,255,255,0.04)] transition-colors">
              <div className="relative size-[34px] rounded-[8px] overflow-hidden shrink-0">
                <Avatar name={p.name} className="size-full object-cover" />
                <span className="dot-twinkle absolute -bottom-[1px] -right-[1px] size-[9px] rounded-full bg-[rgba(0,255,9,0.36)] shadow-[0px_0px_8.6px_0px_rgba(9,255,54,0.4)] border-2 border-[#14121c]" />
              </div>
              <span className="font-mono text-[14px] text-white/70 truncate">{p.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── LIGHTBOX ── */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center"
          style={{ background: 'rgba(8,8,12,0.7)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Image agrandie"
        >
          <img src={lightbox} alt="Image agrandie" className="max-w-[80%] max-h-[80%] rounded-[12px] object-contain shadow-[0_8px_40px_rgba(0,0,0,0.5)]" onClick={e => e.stopPropagation()} />
          <button
            onClick={() => setLightbox(null)}
            aria-label="Fermer l'image"
            className="absolute top-[24px] right-[24px] flex items-center justify-center size-[40px] rounded-full bg-[rgba(255,255,255,0.1)] hover:bg-[rgba(255,255,255,0.2)] text-white transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 14 14" fill="currentColor" aria-hidden="true"><rect x="6" y="-1" width="2" height="16" rx="1" transform="rotate(45 7 7)" /><rect x="6" y="-1" width="2" height="16" rx="1" transform="rotate(-45 7 7)" /></svg>
          </button>
        </div>
      )}
    </div>
  )
}
