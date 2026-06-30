import { useState, useEffect, useCallback, useRef, useMemo, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { NEWS_CATEGORIES, CATEGORY_ORDER, resolveCategory, CategoryBadge, NewsFallback, NEWS_BANNER_RATIO, type NewsCategory } from './news'
import { Avatar, RemoteNewsImage } from './remote-image'
import { ItemIcon } from './item-icon'
import { type ItemIconDesc } from './block-renderer'
import { ImageCropper } from './image-cropper'

type AdminTab = 'news' | 'admins' | 'players' | 'channels' | 'shop' | 'quests' | 'backgrounds'

// Image de fond d'écran (miroir local de window.d.ts).
interface BackgroundImage {
  id: string
  url: string
  fileName?: string
  uploadedAt?: number
}

interface ChatChannel {
  id: string
  name: string
  description?: string
  type: 'open' | 'announce'
  order?: number
  createdAt?: number
  createdBy?: string
}

interface NewsItem {
  id: string
  title: string
  date: string
  body: string
  imageUrl?: string
  author?: string
  category?: NewsCategory
  createdAt?: number
}

interface NewsForm {
  title: string
  date: string
  body: string
  imageUrl: string
  category: NewsCategory
}

const EMPTY_FORM: NewsForm = { title: '', date: '', body: '', imageUrl: '', category: 'info' }

// ── Shop du jour (calendrier : offres datées, troc entrée→sortie) ──
interface ShopOfferRow {
  id: string
  input: string
  inputQty: number
  output: string
  outputQty: number
  maxUses?: number
  createdAt?: number
  inputIcon?: ItemIconDesc | null
  outputIcon?: ItemIconDesc | null
}

interface OfferForm { input: string; inputQty: number; output: string; outputQty: number; maxUses: number }
const EMPTY_OFFER: OfferForm = { input: '', inputQty: 1, output: '', outputQty: 1, maxUses: 0 }

// ── Quêtes (PNJ de quêtes : tuer N mobs → récompense) ──
// Types locaux (miroirs de window.d.ts, qui les déclare hors `declare global`).
interface QuestDef {
  id: string
  title: string
  description: string
  target: string
  amount: number
  rewardItem: string
  rewardQty: number
  createdAt?: number
  rewardIcon?: ItemIconDesc | null
}
type QuestForm = { title: string; description: string; target: string; amount: number; rewardItem: string; rewardQty: number }
const EMPTY_QUEST: QuestForm = { title: '', description: '', target: '', amount: 1, rewardItem: '', rewardQty: 1 }

interface ShopConfigState { currencyName: string; currencyItem: string; currencyIcon: string }

// Clé de jour LOCALE (YYYY-MM-DD) pour un décalage en jours (doit matcher shopDayKey du main).
function dayKeyFromOffset(offset: number): string {
  const d = new Date(); d.setDate(d.getDate() + offset)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// Libellé lisible d'un jour (« Aujourd'hui · mar. 24 juin »).
function dayLabel(offset: number): string {
  const d = new Date(); d.setDate(d.getDate() + offset)
  const rel = offset === 0 ? "Aujourd'hui" : offset === 1 ? 'Demain' : null
  const txt = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'long' })
  return rel ? `${rel} · ${txt}` : txt.charAt(0).toUpperCase() + txt.slice(1)
}

// Entrée du catalogue d'items (id + nom anglais) renvoyée par get-item-catalog.
interface ItemCatalogEntry { id: string; name: string }

const inputCls =
  'w-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[12px] py-[8px] text-white font-ui text-[14px] tracking-[-0.3px] focus:outline-none focus:border-[rgba(0,255,225,0.4)] placeholder:text-white/25 transition-colors'

const labelCls = 'font-ui text-[14px] text-white/40 tracking-[-0.3px] mb-[6px]'

// Sélecteur de quantité : champ réellement éditable (on peut tout effacer pour
// retaper, sans blocage forcé à 1 — le clamp ne s'applique qu'à la validation) +
// boutons − / + stylés, au lieu des spinners HTML natifs non stylables.
function QtyInput({ value, onChange, min = 1, max = 9999 }: { value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  const [text, setText] = useState(String(value))
  useEffect(() => { setText(String(value)) }, [value])
  const clamp = (n: number) => Math.max(min, Math.min(max, n))
  const step = (d: number) => { const n = clamp(value + d); onChange(n); setText(String(n)) }
  const btn = 'flex items-center justify-center w-[32px] h-full shrink-0 text-white/55 hover:text-white hover:bg-[rgba(255,255,255,0.07)] disabled:opacity-25 disabled:hover:bg-transparent transition-colors'
  return (
    <div className="flex-1 flex items-center h-[38px] rounded-[8px] border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.05)] focus-within:border-[rgba(0,255,225,0.4)] transition-colors overflow-hidden">
      <button type="button" onClick={() => step(-1)} disabled={value <= min} className={btn} aria-label="Diminuer">
        <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor"><rect x="1" y="5.1" width="10" height="1.8" rx="0.9" /></svg>
      </button>
      <input
        type="text" inputMode="numeric" aria-label="Quantité"
        className="w-full min-w-0 bg-transparent text-center text-white font-ui text-[14px] tracking-[-0.3px] outline-none"
        value={text}
        onChange={e => { const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 4); setText(v); if (v !== '') onChange(clamp(Number(v))) }}
        onBlur={() => { const n = text === '' ? value : clamp(Number(text) || min); setText(String(n)); onChange(n) }}
      />
      <button type="button" onClick={() => step(1)} disabled={value >= max} className={btn} aria-label="Augmenter">
        <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor"><rect x="5.1" y="1" width="1.8" height="10" rx="0.9" /><rect x="1" y="5.1" width="10" height="1.8" rx="0.9" /></svg>
      </button>
    </div>
  )
}

// Champ d'identifiant d'item avec autocomplétion sur le catalogue du modpack
// (items vanilla + moddés, extraits des jars installés). Filtre sur l'id ET le
// nom anglais, priorise les correspondances en début de chaîne, navigation au
// clavier (↑/↓/Entrée/Échap). La saisie libre reste toujours possible.
function ItemAutocomplete({
  value, onChange, catalog, loading, placeholder,
}: {
  value: string
  onChange: (v: string) => void
  catalog: ItemCatalogEntry[]
  loading?: boolean
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [iconMap, setIconMap] = useState<Record<string, ItemIconDesc | ''>>({})
  const wrapRef = useRef<HTMLDivElement>(null)

  const q = value.trim().toLowerCase()
  const matches = useMemo(() => {
    if (!q) return [] as ItemCatalogEntry[]
    const scored: { e: ItemCatalogEntry; score: number }[] = []
    for (const e of catalog) {
      const name = e.name.toLowerCase()
      const idPath = e.id.includes(':') ? e.id.slice(e.id.indexOf(':') + 1) : e.id
      let score = -1
      if (name.startsWith(q)) score = 0
      else if (idPath.startsWith(q) || e.id.startsWith(q)) score = 1
      else if (name.includes(q) || e.id.includes(q)) score = 2
      if (score >= 0) scored.push({ e, score })
    }
    // À pertinence égale, on remonte les items dont l'icône est résolue (vrais
    // items identifiables) avant ceux sans icône (bruit type carcasses de mods).
    const noIcon = (id: string) => { const d = iconMap[id]; return d && typeof d === 'object' ? 0 : 1 }
    scored.sort((a, b) => a.score - b.score || noIcon(a.e.id) - noIcon(b.e.id) || a.e.name.localeCompare(b.e.name))
    return scored.slice(0, 60).map(o => o.e)
  }, [q, catalog, iconMap])

  // Ferme la liste sur un clic en dehors du champ.
  useEffect(() => {
    if (!open) return
    const onDoc = (ev: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(ev.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const exact = useMemo(() => catalog.find(e => e.id === value.trim()) || null, [catalog, value])

  // Charge les icônes du lot visible (+ item sélectionné), debouncé. Les ids déjà
  // demandés (résolus ou non, marqués '') ne sont pas redemandés. Le main cache.
  useEffect(() => {
    const want = matches.map(m => m.id)
    if (exact) want.push(exact.id)
    const ids = want.filter(id => iconMap[id] === undefined)
    if (ids.length === 0) return
    const t = setTimeout(() => {
      window.launcher.getItemIcons(ids).then(r => {
        if (!r.success) return
        setIconMap(prev => {
          const next = { ...prev }
          for (const id of ids) next[id] = r.icons[id] || ''
          return next
        })
      })
    }, 130)
    return () => clearTimeout(t)
  }, [matches, exact, iconMap])

  const select = (e: ItemCatalogEntry) => { onChange(e.id); setOpen(false) }

  const onKeyDown = (ev: ReactKeyboardEvent<HTMLInputElement>) => {
    if (!open && ev.key === 'ArrowDown') { setOpen(true); return }
    if (!open || matches.length === 0) return
    if (ev.key === 'ArrowDown') { ev.preventDefault(); setHighlight(h => Math.min(h + 1, matches.length - 1)) }
    else if (ev.key === 'ArrowUp') { ev.preventDefault(); setHighlight(h => Math.max(h - 1, 0)) }
    else if (ev.key === 'Enter') { ev.preventDefault(); const m = matches[highlight]; if (m) select(m) }
    else if (ev.key === 'Escape') { setOpen(false) }
  }

  return (
    <div ref={wrapRef} className="relative">
      <input
        className={inputCls}
        placeholder={placeholder}
        value={value}
        maxLength={120}
        autoComplete="off"
        spellCheck={false}
        onChange={e => { onChange(e.target.value); setOpen(true); setHighlight(0) }}
        onFocus={() => { if (value.trim()) setOpen(true) }}
        onKeyDown={onKeyDown}
      />
      {exact && !open && (
        <div className="flex items-center gap-[7px] mt-[5px] min-w-0">
          <ItemIcon desc={iconMap[exact.id]} id={exact.id} box={22} />
          <p className="font-ui text-[12px] text-[rgba(0,255,225,0.75)] tracking-[-0.3px] truncate">✓ {exact.name}</p>
        </div>
      )}
      {open && q.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-[4px] z-50 max-h-[240px] overflow-y-auto rounded-[10px] border border-[rgba(255,255,255,0.12)] bg-[#181320] shadow-[0_12px_40px_rgba(0,0,0,0.55)]">
          {loading ? (
            <p className="font-ui text-[13px] text-white/40 px-[12px] py-[10px]">Chargement du catalogue…</p>
          ) : matches.length === 0 ? (
            <p className="font-ui text-[13px] text-white/35 px-[12px] py-[10px]">Aucun item — la saisie libre reste possible.</p>
          ) : (
            matches.map((e, i) => (
              <button
                key={e.id}
                type="button"
                onMouseEnter={() => setHighlight(i)}
                onMouseDown={ev => { ev.preventDefault(); select(e) }}
                className={`w-full text-left flex items-center justify-between gap-[10px] px-[12px] py-[7px] transition-colors ${i === highlight ? 'bg-[rgba(0,255,225,0.1)]' : 'hover:bg-[rgba(255,255,255,0.05)]'}`}
              >
                <span className="flex items-center gap-[9px] min-w-0">
                  <ItemIcon desc={iconMap[e.id]} id={e.id} box={24} />
                  <span className="font-ui text-[14px] text-white tracking-[-0.3px] truncate">{e.name}</span>
                </span>
                <span className="font-ui text-[12px] text-white/40 tracking-[-0.3px] shrink-0 truncate max-w-[42%]">{e.id}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

function todayLabel() {
  const d = new Date()
  const months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
}

// Convertit un fichier/blob image (sélecteur, glisser-déposer, presse-papier) en
// data URL, pour l'envoyer au main qui le réhéberge sur Firebase Storage.
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(r.result as string)
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

export default function AdminDashboard({
  username,
  onNewsUpdated,
}: {
  username: string
  onNewsUpdated: () => void
}) {
  const [tab, setTab] = useState<AdminTab>('news')
  const [news, setNews] = useState<NewsItem[]>([])
  const [admins, setAdmins] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<NewsForm>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Image en attente de recadrage (data: URL + mime source). Non-null = éditeur ouvert.
  const [cropState, setCropState] = useState<{ src: string; mime: string } | null>(null)
  const [newAdminName, setNewAdminName] = useState('')
  const [addingAdmin, setAddingAdmin] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmRemoveAdmin, setConfirmRemoveAdmin] = useState<string | null>(null)
  const [players, setPlayers] = useState<string[]>([])
  const [newPlayers, setNewPlayers] = useState('')
  const [addingPlayers, setAddingPlayers] = useState(false)
  const [playersMsg, setPlayersMsg] = useState<string | null>(null)
  const [confirmRemovePlayer, setConfirmRemovePlayer] = useState<string | null>(null)
  const [channels, setChannels] = useState<ChatChannel[]>([])
  const [showChannelForm, setShowChannelForm] = useState(false)
  const [editingChannelId, setEditingChannelId] = useState<string | null>(null)
  const [channelForm, setChannelForm] = useState<{ name: string; description: string; type: 'open' | 'announce' }>({ name: '', description: '', type: 'open' })
  const [savingChannel, setSavingChannel] = useState(false)
  const [confirmDeleteChannel, setConfirmDeleteChannel] = useState<string | null>(null)
  const [channelMsg, setChannelMsg] = useState<string | null>(null)

  // ── Shop : 2 catégories — « daily » = shop du jour (calendrier), « store » = boutique (offres fixes) ──
  const [shopCat, setShopCat] = useState<'daily' | 'store' | 'race'>('daily')
  const [dayOffset, setDayOffset] = useState(0)              // 0 = aujourd'hui, 1 = demain…
  const [dayOffers, setDayOffers] = useState<ShopOfferRow[]>([])
  const [shopLoading, setShopLoading] = useState(false)
  const [shopConfig, setShopConfig] = useState<ShopConfigState>({ currencyName: 'Z-Coin', currencyItem: '', currencyIcon: '' })
  const [showOfferForm, setShowOfferForm] = useState(false)
  const [editingOfferId, setEditingOfferId] = useState<string | null>(null)
  const [offerForm, setOfferForm] = useState<OfferForm>(EMPTY_OFFER)
  const [savingOffer, setSavingOffer] = useState(false)
  const [confirmDeleteOffer, setConfirmDeleteOffer] = useState<string | null>(null)
  const [offerMsg, setOfferMsg] = useState<string | null>(null)
  const [uploadingCurrencyIcon, setUploadingCurrencyIcon] = useState(false)
  const [savingConfig, setSavingConfig] = useState(false)
  const [shopMsg, setShopMsg] = useState<string | null>(null)
  const currencyFileRef = useRef<HTMLInputElement>(null)
  const shopDayKey = dayKeyFromOffset(dayOffset)
  // Bibliothèque d'offres réutilisables (modèles à replacer sur un jour).
  const [showLibrary, setShowLibrary] = useState(false)
  const [libraryOffers, setLibraryOffers] = useState<ShopOfferRow[]>([])
  const [libraryLoading, setLibraryLoading] = useState(false)
  const [libMsg, setLibMsg] = useState<string | null>(null)
  // Catalogue d'items (extrait des jars du modpack) pour l'autocomplétion.
  const [itemCatalog, setItemCatalog] = useState<ItemCatalogEntry[]>([])
  const [itemCatalogLoading, setItemCatalogLoading] = useState(false)

  // ── Quêtes : CRUD des définitions (la progression joueur est gérée côté serveur/mod) ──
  const [quests, setQuests] = useState<QuestDef[]>([])
  const [questLoading, setQuestLoading] = useState(false)
  const [showQuestForm, setShowQuestForm] = useState(false)
  const [editingQuestId, setEditingQuestId] = useState<string | null>(null)
  const [questForm, setQuestForm] = useState<QuestForm>(EMPTY_QUEST)
  const [savingQuest, setSavingQuest] = useState(false)
  const [confirmDeleteQuest, setConfirmDeleteQuest] = useState<string | null>(null)
  const [questMsg, setQuestMsg] = useState<string | null>(null)

  // ── Fonds d'écran : galerie d'images (le launcher en tire une au hasard au lancement) ──
  const [backgrounds, setBackgrounds] = useState<BackgroundImage[]>([])
  const [backgroundsLoading, setBackgroundsLoading] = useState(false)
  const [bgUploading, setBgUploading] = useState(false)
  const [bgError, setBgError] = useState<string | null>(null)
  const [bgDragging, setBgDragging] = useState(false)
  const [confirmDeleteBg, setConfirmDeleteBg] = useState<string | null>(null)
  const bgFileInputRef = useRef<HTMLInputElement>(null)

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [nr, ar, ps, cr, br] = await Promise.all([
        window.launcher.getNews(),
        window.launcher.getAdmins(),
        window.launcher.getPlayersSeen(),
        window.launcher.chatGetChannels(),
        window.launcher.getBackgrounds(),
      ])
      if (nr.success) setNews(nr.news)
      if (ar.success) setAdmins(Object.keys(ar.admins).filter(k => ar.admins[k]))
      if (Array.isArray(ps)) setPlayers([...ps].sort((a, b) => a.localeCompare(b)))
      if (cr.success) setChannels(cr.channels)
      if (br.success) setBackgrounds(br.backgrounds)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  // Offres du jour sélectionné + config monnaie : (re)chargées à l'ouverture de
  // l'onglet Shop et à chaque changement de jour.
  const loadShopDay = useCallback(async () => {
    setShopLoading(true)
    try {
      const r = shopCat === 'race'
        ? await window.launcher.getShopRace()
        : shopCat === 'store'
          ? await window.launcher.getShopStore()
          : await window.launcher.getShopDay(dayKeyFromOffset(dayOffset))
      if (r.success) {
        setDayOffers(r.offers as ShopOfferRow[])
        setShopConfig({ currencyName: r.config.currencyName, currencyItem: r.config.currencyItem ?? '', currencyIcon: r.config.currencyIcon ?? '' })
      }
    } finally { setShopLoading(false) }
  }, [dayOffset, shopCat])
  useEffect(() => { if (tab === 'shop') loadShopDay() }, [tab, loadShopDay])

  // Icônes des items en cours de saisie dans le formulaire (aperçu live, debouncé).
  const [offerIcons, setOfferIcons] = useState<Record<string, ItemIconDesc | ''>>({})
  useEffect(() => {
    const ids = [offerForm.input, offerForm.output].filter(id => id && offerIcons[id] === undefined)
    if (!ids.length) return
    const t = setTimeout(() => {
      window.launcher.getItemIcons(ids).then(r => {
        if (!r.success) return
        setOfferIcons(prev => { const next = { ...prev }; for (const id of ids) next[id] = r.icons[id] || ''; return next })
      })
    }, 120)
    return () => clearTimeout(t)
  }, [offerForm.input, offerForm.output, offerIcons])
  // Icône d'un côté d'offre : la monnaie utilise son icône configurée (re-skin) en priorité.
  const iconDescFor = (id: string | undefined, desc: ItemIconDesc | '' | null | undefined): ItemIconDesc | '' => {
    if (id && id === shopConfig.currencyItem && shopConfig.currencyIcon) return { kind: 'flat', src: shopConfig.currencyIcon }
    return (desc as ItemIconDesc | '') ?? ''
  }

  // Catalogue d'items : chargé paresseusement à la 1re ouverture de l'onglet Shop
  // (scan ~5 s à froid côté main, puis instantané via cache disque).
  useEffect(() => {
    if ((tab !== 'shop' && tab !== 'quests') || itemCatalog.length > 0 || itemCatalogLoading) return
    setItemCatalogLoading(true)
    window.launcher.getItemCatalog()
      .then(r => { if (r.success) setItemCatalog(r.items) })
      .finally(() => setItemCatalogLoading(false))
  }, [tab, itemCatalog.length, itemCatalogLoading])

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, date: todayLabel() })
    setEditingId(null)
    setShowForm(true)
    setConfirmDeleteId(null)
    setImageError(null)
  }

  const openEdit = (item: NewsItem) => {
    setForm({
      title: item.title,
      date: item.date,
      body: item.body,
      imageUrl: item.imageUrl ?? '',
      category: item.category ?? resolveCategory(item).key,
    })
    setEditingId(item.id)
    setShowForm(true)
    setConfirmDeleteId(null)
    setImageError(null)
  }

  const cancelForm = () => {
    setShowForm(false)
    setEditingId(null)
    setImageError(null)
  }

  // Réhéberge un dataURL (image DÉJÀ recadrée par l'éditeur) sur Firebase Storage et
  // renseigne l'URL permanente dans le formulaire. Remplace les liens Discord qui
  // expirent (~24 h). Le main revalide tout (magic bytes, 4 Mo, garde admin).
  const uploadDataUrl = useCallback(async (dataUrl: string, mime: string, name: string) => {
    setImageError(null)
    setUploadingImage(true)
    try {
      const up = await window.launcher.uploadNewsImage({ dataUrl, mime, name })
      if (!up.success || !up.url) { setImageError(up.error || "Échec de l'envoi."); return }
      setForm(f => ({ ...f, imageUrl: up.url! }))
    } catch {
      setImageError("Échec de l'envoi.")
    } finally {
      setUploadingImage(false)
    }
  }, [])

  // Sélecteur / glisser-déposer / presse-papier : on lit le fichier puis on ouvre
  // l'éditeur de recadrage. L'upload n'a lieu qu'après validation du cadrage, sur une
  // image déjà au format de la bannière (donc plus aucun rognage à l'affichage).
  const uploadFile = useCallback(async (file: File | null | undefined) => {
    setImageError(null)
    if (!file) return
    if (!file.type.startsWith('image/')) { setImageError('Choisis une image (PNG, JPEG, GIF, WebP).'); return }
    if (file.size > 4 * 1024 * 1024) { setImageError('Image trop lourde (max 4 Mo).'); return }
    try {
      const dataUrl = await blobToDataUrl(file)
      setCropState({ src: dataUrl, mime: file.type })
    } catch {
      setImageError('Image illisible.')
    }
  }, [])

  // Re-recadrer l'image déjà attachée. Une URL distante est d'abord rapatriée en data:
  // URL via le proxy main : sinon le canvas de l'éditeur serait « taché » (cross-origin)
  // et son export échouerait.
  const recropCurrent = useCallback(async () => {
    setImageError(null)
    const url = form.imageUrl
    if (!url) return
    try {
      let dataUrl = url
      if (/^https?:\/\//i.test(url)) {
        const d = await window.launcher.fetchImage(url)
        if (!d) { setImageError("Impossible de charger l'image à recadrer."); return }
        dataUrl = d
      }
      setCropState({ src: dataUrl, mime: /^data:image\/jpeg/i.test(dataUrl) ? 'image/jpeg' : 'image/png' })
    } catch {
      setImageError("Impossible de charger l'image à recadrer.")
    }
  }, [form.imageUrl])

  // Coller (Ctrl+V) une image n'importe où tant que le formulaire est ouvert. On
  // n'intercepte que les images : coller du texte dans les champs reste normal.
  useEffect(() => {
    if (!showForm) return
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (let i = 0; i < items.length; i++) {
        const it = items[i]
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          const file = it.getAsFile()
          if (file) { e.preventDefault(); uploadFile(file); break }
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [showForm, uploadFile])

  // Garde-fou : un fichier lâché hors de la zone de dépôt ferait naviguer Electron
  // vers file:// (fenêtre cassée). On neutralise le drop par défaut sur toute la
  // fenêtre ; la zone de dépôt, elle, gère son propre onDrop avant ce garde.
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault()
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [])

  // ── Fonds d'écran ──
  const fetchBackgrounds = useCallback(async () => {
    setBackgroundsLoading(true)
    try {
      const res = await window.launcher.getBackgrounds()
      if (res.success) setBackgrounds(res.backgrounds)
    } finally {
      setBackgroundsLoading(false)
    }
  }, [])

  // Upload direct (sélecteur, glisser-déposer ou presse-papier) : réhéberge l'image
  // sur Firebase Storage puis l'enregistre dans /backgrounds. Le main revalide tout
  // (magic bytes, 4 Mo, admin). Pas de formulaire : ajout immédiat à la galerie.
  const uploadBackground = useCallback(async (file: File | null | undefined) => {
    setBgError(null)
    if (!file) return
    if (!file.type.startsWith('image/')) { setBgError('Choisis une image (PNG, JPEG, GIF, WebP).'); return }
    if (file.size > 4 * 1024 * 1024) { setBgError('Image trop lourde (max 4 Mo).'); return }
    setBgUploading(true)
    try {
      const dataUrl = await blobToDataUrl(file)
      const up = await window.launcher.uploadBackgroundImage({ dataUrl, mime: file.type, name: file.name || 'fond' })
      if (!up.success || !up.url) { setBgError(up.error || "Échec de l'envoi."); return }
      const created = await window.launcher.createBackground({ url: up.url, fileName: file.name || '' })
      if (!created.success) { setBgError(created.error || "Échec de l'enregistrement."); return }
      await fetchBackgrounds()
    } catch {
      setBgError('Image illisible.')
    } finally {
      setBgUploading(false)
    }
  }, [fetchBackgrounds])

  const deleteBackground = async (id: string) => {
    await window.launcher.deleteBackground(id)
    setConfirmDeleteBg(null)
    await fetchBackgrounds()
  }

  // Coller (Ctrl+V) une image quand l'onglet Fonds d'écran est ouvert.
  useEffect(() => {
    if (tab !== 'backgrounds') return
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      for (let i = 0; i < items.length; i++) {
        const it = items[i]
        if (it.kind === 'file' && it.type.startsWith('image/')) {
          const file = it.getAsFile()
          if (file) { e.preventDefault(); uploadBackground(file); break }
        }
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [tab, uploadBackground])

  const saveNews = async () => {
    if (!form.title.trim() || !form.body.trim()) return
    setSaving(true)
    try {
      const payload = { title: form.title.trim(), date: form.date.trim(), body: form.body.trim(), imageUrl: form.imageUrl.trim(), category: form.category, author: username }
      if (editingId) {
        await window.launcher.updateNews({ id: editingId, ...payload })
      } else {
        await window.launcher.createNews(payload)
      }
      setShowForm(false)
      setEditingId(null)
      await fetchAll()
      onNewsUpdated()
    } finally {
      setSaving(false)
    }
  }

  const doDeleteNews = async (id: string) => {
    await window.launcher.deleteNews(id)
    setConfirmDeleteId(null)
    await fetchAll()
    onNewsUpdated()
  }

  const duplicateNews = async (item: NewsItem) => {
    setSaving(true)
    try {
      const payload = {
        title: `${item.title} (Copie)`,
        date: item.date,
        body: item.body,
        imageUrl: item.imageUrl ?? '',
        category: item.category ?? resolveCategory(item).key,
        author: username,
      }
      await window.launcher.createNews(payload)
      await fetchAll()
      onNewsUpdated()
    } finally {
      setSaving(false)
    }
  }

  const doAddAdmin = async () => {
    const name = newAdminName.trim()
    if (!name) return
    setAddingAdmin(true)
    try {
      await window.launcher.addAdmin(name)
      setNewAdminName('')
      await fetchAll()
    } finally {
      setAddingAdmin(false)
    }
  }

  const doRemoveAdmin = async (name: string) => {
    await window.launcher.removeAdmin(name)
    setConfirmRemoveAdmin(null)
    await fetchAll()
  }

  // Rafraîchit seulement la liste des joueurs (pas d'état loading global → pas de
  // clignotement « Chargement… » à chaque ajout/retrait dans l'onglet Joueurs).
  const refreshPlayers = async () => {
    const ps = await window.launcher.getPlayersSeen()
    if (Array.isArray(ps)) setPlayers([...ps].sort((a, b) => a.localeCompare(b)))
  }

  const doAddPlayers = async () => {
    const raw = newPlayers.trim()
    if (!raw) return
    setAddingPlayers(true)
    setPlayersMsg(null)
    try {
      const res = await window.launcher.addPlayersSeen(raw)
      if (res.success) {
        const parts: string[] = []
        if (res.added.length) parts.push(`${res.added.length} ajouté${res.added.length > 1 ? 's' : ''}`)
        if (res.skipped.length) parts.push(`${res.skipped.length} déjà présent${res.skipped.length > 1 ? 's' : ''}`)
        if (res.invalid) parts.push(`${res.invalid} ignoré${res.invalid > 1 ? 's' : ''} (pseudo invalide)`)
        setPlayersMsg(parts.length ? parts.join(' · ') : 'Aucun pseudo valide détecté.')
        setNewPlayers('')
        await refreshPlayers()
      } else {
        setPlayersMsg(res.error ?? 'Échec de l\'ajout.')
      }
    } finally {
      setAddingPlayers(false)
    }
  }

  const doRemovePlayer = async (name: string) => {
    await window.launcher.removePlayerSeen(name)
    setConfirmRemovePlayer(null)
    await refreshPlayers()
  }

  // ── Salons de discussion ──
  const refreshChannels = async () => {
    const cr = await window.launcher.chatGetChannels()
    if (cr.success) setChannels(cr.channels)
  }

  const openCreateChannel = () => {
    setChannelForm({ name: '', description: '', type: 'open' })
    setEditingChannelId(null)
    setShowChannelForm(true)
    setConfirmDeleteChannel(null)
    setChannelMsg(null)
  }

  const openEditChannel = (c: ChatChannel) => {
    setChannelForm({ name: c.name, description: c.description ?? '', type: c.type })
    setEditingChannelId(c.id)
    setShowChannelForm(true)
    setConfirmDeleteChannel(null)
    setChannelMsg(null)
  }

  const cancelChannelForm = () => {
    setShowChannelForm(false)
    setEditingChannelId(null)
    setChannelMsg(null)
  }

  const saveChannel = async () => {
    const name = channelForm.name.trim()
    if (!name) return
    setSavingChannel(true)
    setChannelMsg(null)
    try {
      const description = channelForm.description.trim()
      const res = editingChannelId
        ? await window.launcher.chatUpdateChannel({ id: editingChannelId, name, description, type: channelForm.type })
        : await window.launcher.chatCreateChannel({ name, description, type: channelForm.type })
      if (!res.success) { setChannelMsg(res.error ?? 'Échec de l\'enregistrement.'); return }
      setShowChannelForm(false)
      setEditingChannelId(null)
      await refreshChannels()
    } finally {
      setSavingChannel(false)
    }
  }

  const doDeleteChannel = async (id: string) => {
    setConfirmDeleteChannel(null)
    const res = await window.launcher.chatDeleteChannel(id)
    if (!res.success) setChannelMsg(res.error ?? 'Suppression impossible.')
    await refreshChannels()
  }

  // ── Shop : handlers (offres du jour + réglages monnaie) ──
  const openCreateOffer = () => {
    // Pré-remplit la monnaie du bon côté : shop du jour = vendre CONTRE des coins (sortie) ;
    // boutique = dépenser des coins pour acheter (entrée).
    setOfferForm(shopCat === 'store'
      ? { ...EMPTY_OFFER, input: shopConfig.currencyItem || '' }
      : shopCat === 'race'
        ? { ...EMPTY_OFFER } // course : l'admin choisit l'objet à rapporter, pas de pré-remplissage
        : { ...EMPTY_OFFER, output: shopConfig.currencyItem || '' })
    setEditingOfferId(null); setShowOfferForm(true); setConfirmDeleteOffer(null); setOfferMsg(null)
  }
  const openEditOffer = (o: ShopOfferRow) => {
    setOfferForm({ input: o.input ?? '', inputQty: o.inputQty ?? 1, output: o.output ?? '', outputQty: o.outputQty ?? 1, maxUses: o.maxUses ?? 0 })
    setEditingOfferId(o.id); setShowOfferForm(true); setConfirmDeleteOffer(null); setOfferMsg(null)
  }
  const cancelOfferForm = () => { setShowOfferForm(false); setEditingOfferId(null); setOfferMsg(null) }

  // Aiguille les écritures vers la bonne catégorie : jour daté / boutique / course.
  const createOfferApi = (data: OfferForm) =>
    shopCat === 'race' ? window.launcher.createShopRaceOffer(data)
      : shopCat === 'store' ? window.launcher.createShopStoreOffer(data)
        : window.launcher.createShopOffer({ date: shopDayKey, ...data })
  const updateOfferApi = (id: string, data: OfferForm) =>
    shopCat === 'race' ? window.launcher.updateShopRaceOffer({ id, ...data })
      : shopCat === 'store' ? window.launcher.updateShopStoreOffer({ id, ...data })
        : window.launcher.updateShopOffer({ date: shopDayKey, id, ...data })
  const deleteOfferApi = (id: string) =>
    shopCat === 'race' ? window.launcher.deleteShopRaceOffer({ id })
      : shopCat === 'store' ? window.launcher.deleteShopStoreOffer({ id })
        : window.launcher.deleteShopOffer({ date: shopDayKey, id })

  const saveOffer = async () => {
    if (!offerForm.input.trim() || !offerForm.output.trim()) { setOfferMsg('Indique un item d\'entrée et un item de sortie.'); return }
    setSavingOffer(true)
    try {
      const payload = {
        input: offerForm.input.trim(),
        inputQty: Math.max(1, Math.floor(offerForm.inputQty) || 1),
        output: offerForm.output.trim(),
        outputQty: Math.max(1, Math.floor(offerForm.outputQty) || 1),
        maxUses: Math.max(0, Math.floor(offerForm.maxUses) || 0),
      }
      const res = editingOfferId ? await updateOfferApi(editingOfferId, payload) : await createOfferApi(payload)
      if (!res.success) { setOfferMsg(res.error || 'Échec de l\'enregistrement.'); return }
      setShowOfferForm(false); setEditingOfferId(null)
      await loadShopDay()
    } finally {
      setSavingOffer(false)
    }
  }

  const doDeleteOffer = async (id: string) => {
    const res = await deleteOfferApi(id)
    setConfirmDeleteOffer(null)
    if (res.success) await loadShopDay()
  }

  // Copie une offre à l'identique (pour créer vite une variante).
  const duplicateOffer = async (o: ShopOfferRow) => {
    const data = { input: o.input, inputQty: o.inputQty, output: o.output, outputQty: o.outputQty, maxUses: o.maxUses ?? 0 }
    const res = await createOfferApi(data)
    if (res.success) await loadShopDay()
  }

  // ── Bibliothèque : ouvrir le panneau, replacer un modèle sur le jour, en retirer ──
  const openLibrary = async () => {
    setShowOfferForm(false); setConfirmDeleteOffer(null); setLibMsg(null); setShowLibrary(true)
    setLibraryLoading(true)
    try {
      const r = await window.launcher.getShopLibrary()
      if (r.success) setLibraryOffers(r.offers as ShopOfferRow[])
    } finally { setLibraryLoading(false) }
  }
  const addFromLibrary = async (o: ShopOfferRow) => {
    const data = { input: o.input, inputQty: o.inputQty, output: o.output, outputQty: o.outputQty, maxUses: o.maxUses ?? 0 }
    const res = await createOfferApi(data)
    if (res.success) { setLibMsg(shopCat === 'daily' ? `Ajouté à ${dayLabel(dayOffset).toLowerCase()}` : shopCat === 'race' ? 'Ajouté à la course' : 'Ajouté à la boutique'); await loadShopDay() }
  }
  const deleteFromLibrary = async (id: string) => {
    const res = await window.launcher.deleteShopLibraryOffer(id)
    if (res.success) setLibraryOffers(prev => prev.filter(o => o.id !== id))
  }

  const saveShopConfig = async () => {
    setSavingConfig(true)
    setShopMsg(null)
    try {
      const res = await window.launcher.setShopConfig({
        currencyName: shopConfig.currencyName.trim(),
        currencyItem: shopConfig.currencyItem.trim(),
        currencyIcon: shopConfig.currencyIcon.trim(),
      })
      setShopMsg(res.success ? 'Réglages enregistrés.' : (res.error || 'Échec de l\'enregistrement.'))
    } finally {
      setSavingConfig(false)
    }
  }

  // Réhéberge l'icône de la monnaie (même upload que les news / icônes d'offre).
  const uploadCurrencyIcon = useCallback(async (file: File | null | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) { setShopMsg('Choisis une image (PNG, JPEG, GIF, WebP).'); return }
    if (file.size > 4 * 1024 * 1024) { setShopMsg('Image trop lourde (max 4 Mo).'); return }
    setUploadingCurrencyIcon(true)
    try {
      const dataUrl = await blobToDataUrl(file)
      const up = await window.launcher.uploadNewsImage({ dataUrl, mime: file.type, name: file.name || 'currency' })
      if (!up.success || !up.url) { setShopMsg(up.error || "Échec de l'envoi."); return }
      setShopConfig(c => ({ ...c, currencyIcon: up.url! }))
    } catch {
      setShopMsg('Image illisible.')
    } finally {
      setUploadingCurrencyIcon(false)
    }
  }, [])

  // ── Quêtes : chargement + CRUD des définitions ──
  const loadQuests = useCallback(async () => {
    setQuestLoading(true)
    try {
      const r = await window.launcher.getQuests()
      if (r.success) setQuests(r.quests)
    } finally { setQuestLoading(false) }
  }, [])
  useEffect(() => { if (tab === 'quests') loadQuests() }, [tab, loadQuests])

  // Icône de la récompense en cours de saisie (aperçu live dans le formulaire, debouncé).
  const [questRewardIcon, setQuestRewardIcon] = useState<Record<string, ItemIconDesc | ''>>({})
  useEffect(() => {
    const id = questForm.rewardItem
    if (!id || questRewardIcon[id] !== undefined) return
    const t = setTimeout(() => {
      window.launcher.getItemIcons([id]).then(r => {
        if (!r.success) return
        setQuestRewardIcon(prev => ({ ...prev, [id]: r.icons[id] || '' }))
      })
    }, 120)
    return () => clearTimeout(t)
  }, [questForm.rewardItem, questRewardIcon])

  const openCreateQuest = () => {
    setQuestForm(EMPTY_QUEST)
    setEditingQuestId(null); setShowQuestForm(true); setConfirmDeleteQuest(null); setQuestMsg(null)
  }
  const openEditQuest = (q: QuestDef) => {
    setQuestForm({ title: q.title, description: q.description, target: q.target, amount: q.amount ?? 1, rewardItem: q.rewardItem, rewardQty: q.rewardQty ?? 1 })
    setEditingQuestId(q.id); setShowQuestForm(true); setConfirmDeleteQuest(null); setQuestMsg(null)
  }
  const cancelQuestForm = () => { setShowQuestForm(false); setEditingQuestId(null); setQuestMsg(null) }

  const saveQuest = async () => {
    if (!questForm.title.trim()) { setQuestMsg('Donne un titre à la quête.'); return }
    if (!questForm.target.trim()) { setQuestMsg('Indique la cible (id du mob, ex : minecraft:pig).'); return }
    if (!questForm.rewardItem.trim()) { setQuestMsg('Indique un item de récompense.'); return }
    setSavingQuest(true)
    try {
      const payload: QuestForm = {
        title: questForm.title.trim(),
        description: questForm.description.trim(),
        target: questForm.target.trim(),
        amount: Math.max(1, Math.floor(questForm.amount) || 1),
        rewardItem: questForm.rewardItem.trim(),
        rewardQty: Math.max(1, Math.floor(questForm.rewardQty) || 1),
      }
      const res = editingQuestId
        ? await window.launcher.updateQuest({ id: editingQuestId, ...payload })
        : await window.launcher.createQuest(payload)
      if (!res.success) { setQuestMsg(res.error || 'Échec de l\'enregistrement.'); return }
      setShowQuestForm(false); setEditingQuestId(null)
      await loadQuests()
    } finally {
      setSavingQuest(false)
    }
  }

  const doDeleteQuest = async (id: string) => {
    const res = await window.launcher.deleteQuest(id)
    setConfirmDeleteQuest(null)
    if (res.success) await loadQuests()
  }

  return (
    <div className="backdrop-blur-[5.95px] bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-[16px] shadow-[2px_2px_8px_0px_rgba(0,0,0,0.1)] flex flex-col h-full overflow-hidden">

      {/* ── EN-TÊTE ── */}
      <div className="flex items-center justify-between px-[24px] py-[16px] shrink-0">
        {/* Titre de panneau + sous-titre contextuel (le pseudo est déjà dans la barre de nav) */}
        <div className="flex flex-col gap-[2px]">
          <p className="font-ui font-semibold text-[16px] text-white tracking-[-0.64px] leading-none">Administration</p>
          <p className="font-ui text-[14px] text-white/40 tracking-[-0.3px]">
            {tab === 'news' ? 'Gestion du contenu' : tab === 'admins' ? 'Gestion des accès' : tab === 'players' ? 'Carrousel d\'accueil' : tab === 'channels' ? 'Salons de discussion' : tab === 'shop' ? 'Boutique du serveur' : tab === 'quests' ? 'Quêtes du serveur' : 'Fonds d\'écran du launcher'}
          </p>
        </div>

        <div className="flex gap-[3px] bg-[rgba(0,0,0,0.22)] border border-[rgba(255,255,255,0.06)] rounded-full p-[3px]">
          {(['news', 'admins', 'players', 'channels', 'shop', 'quests', 'backgrounds'] as AdminTab[]).map(t => (
            <button
              key={t}
              className={`font-ui text-[14px] tracking-[-0.3px] px-[14px] h-[28px] rounded-full transition-colors ${
                tab === t
                  ? 'bg-[rgba(255,255,255,0.12)] text-white font-semibold'
                  : 'text-white/40 hover:text-white/70'
              }`}
              onClick={() => { setTab(t); setShowForm(false); setConfirmDeleteId(null); setConfirmRemoveAdmin(null); setConfirmRemovePlayer(null); setPlayersMsg(null); setShowChannelForm(false); setConfirmDeleteChannel(null); setChannelMsg(null); setShowOfferForm(false); setConfirmDeleteOffer(null); setOfferMsg(null); setShopMsg(null); setShowQuestForm(false); setConfirmDeleteQuest(null); setQuestMsg(null); setConfirmDeleteBg(null); setBgError(null) }}
            >
              {t === 'news' ? 'Actualités' : t === 'admins' ? 'Administrateurs' : t === 'players' ? 'Joueurs' : t === 'channels' ? 'Salons' : t === 'shop' ? 'Shop' : t === 'quests' ? 'Quêtes' : 'Fonds'}
            </button>
          ))}
        </div>
      </div>

      {/* ── CONTENU ── */}
      <div className="flex-1 overflow-y-auto p-[22px] min-h-0">

        {/* ═══ ONGLET ACTUALITÉS ═══ */}
        {tab === 'news' && (
          <div className="flex flex-col gap-[14px]">

            {/* Barre supérieure */}
            <div className="flex items-center justify-between h-[34px] shrink-0">
              <p className="font-ui text-[14px] text-white/40 tracking-[-0.3px]">
                {news.length} actualité{news.length !== 1 ? 's' : ''} publiée{news.length !== 1 ? 's' : ''}
              </p>
              {!showForm && (
                <button
                  className="flex items-center gap-[7px] bg-white text-[#0e0b16] font-ui font-bold text-[14px] tracking-[-0.3px] px-[16px] h-[34px] rounded-[12px] hover:bg-white/90 active:scale-[0.98] transition-all"
                  onClick={openCreate}
                >
                  <svg className="icon-adm-plus" width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                    <rect x="4.85" y="1" width="2.3" height="10" rx="1.15" />
                    <rect x="1" y="4.85" width="10" height="2.3" rx="1.15" />
                  </svg>
                  Nouvelle actualité
                </button>
              )}
            </div>

            {/* ── Formulaire ── */}
            {showForm && (
              <div className="bg-[rgba(0,0,0,0.28)] border border-[rgba(0,255,225,0.18)] rounded-[12px] p-[18px] flex flex-col gap-[14px]">
                <div className="flex items-center justify-between">
                  <p className="font-ui font-semibold text-[16px] text-white tracking-[-0.64px]">
                    {editingId ? 'Modifier l\'actualité' : 'Nouvelle actualité'}
                  </p>
                  <button
                    className="text-white/40 hover:text-white/70 transition-colors p-[4px]"
                    onClick={cancelForm}
                  >
                    <svg className="icon-adm-close" width="13" height="13" viewBox="0 0 13 13" fill="currentColor">
                      <rect x="5.3" y="-1" width="2.4" height="15" rx="1.2" transform="rotate(45 6.5 6.5)" />
                      <rect x="5.3" y="-1" width="2.4" height="15" rx="1.2" transform="rotate(-45 6.5 6.5)" />
                    </svg>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-[12px]">
                  <div className="flex flex-col">
                    <p className={labelCls}>Titre <span className="text-white/30">*</span></p>
                    <input
                      className={inputCls}
                      placeholder="Ex : Mise à jour 2.0"
                      value={form.title}
                      onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    />
                  </div>
                  <div className="flex flex-col">
                    <p className={labelCls}>Date</p>
                    <input
                      className={inputCls}
                      placeholder="Ex : 11 juin 2026"
                      value={form.date}
                      onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="flex flex-col">
                  <p className={labelCls}>Catégorie</p>
                  <div className="flex flex-wrap gap-[7px]">
                    {CATEGORY_ORDER.map(key => {
                      const meta = NEWS_CATEGORIES[key]
                      const active = form.category === key
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setForm(f => ({ ...f, category: key }))}
                          className="flex items-center gap-[7px] rounded-[8px] px-[11px] py-[6px] font-ui text-[14px] font-medium tracking-[-0.2px] transition-all active:scale-[0.97]"
                          style={{
                            color: active ? `rgb(${meta.rgb})` : 'rgba(255,255,255,0.5)',
                            background: active ? `rgba(${meta.rgb},0.12)` : 'rgba(255,255,255,0.04)',
                            border: `1px solid ${active ? `rgba(${meta.rgb},0.4)` : 'rgba(255,255,255,0.09)'}`,
                          }}
                        >
                          <span
                            className="rounded-full shrink-0"
                            style={{
                              width: 6,
                              height: 6,
                              background: `rgb(${meta.rgb})`,
                              boxShadow: active ? `0 0 7px rgba(${meta.rgb},0.8)` : 'none',
                              opacity: active ? 1 : 0.55,
                            }}
                          />
                          {meta.label}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="flex flex-col">
                  <p className={labelCls}>Image de la news (optionnel)</p>

                  {form.imageUrl ? (
                    <div className="relative rounded-[10px] overflow-hidden border border-[rgba(255,255,255,0.12)] group" style={{ height: 132 }}>
                      <RemoteNewsImage src={form.imageUrl} className="size-full object-cover" fallback={null} />
                      <div className="absolute inset-0 flex items-center justify-center gap-[8px] bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={recropCurrent}
                          disabled={uploadingImage}
                          className="font-ui text-[13px] tracking-[-0.3px] text-white px-[12px] h-[32px] rounded-[8px] border border-[rgba(255,255,255,0.3)] bg-[rgba(0,0,0,0.4)] hover:bg-[rgba(0,0,0,0.6)] disabled:opacity-40 transition-colors"
                        >
                          Recadrer
                        </button>
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploadingImage}
                          className="font-ui text-[13px] tracking-[-0.3px] text-white px-[12px] h-[32px] rounded-[8px] border border-[rgba(255,255,255,0.3)] bg-[rgba(0,0,0,0.4)] hover:bg-[rgba(0,0,0,0.6)] disabled:opacity-40 transition-colors"
                        >
                          Remplacer
                        </button>
                        <button
                          type="button"
                          onClick={() => { setForm(f => ({ ...f, imageUrl: '' })); setImageError(null) }}
                          className="font-ui text-[13px] tracking-[-0.3px] text-white px-[12px] h-[32px] rounded-[8px] border border-[rgba(255,255,255,0.3)] bg-[rgba(0,0,0,0.4)] hover:bg-[rgba(0,0,0,0.6)] transition-colors"
                        >
                          Retirer
                        </button>
                      </div>
                      {uploadingImage && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/55">
                          <p className="font-ui text-[14px] text-white/80">Envoi en cours…</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => fileInputRef.current?.click()}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click() } }}
                      onDragOver={e => { e.preventDefault(); setDragging(true) }}
                      onDragLeave={() => setDragging(false)}
                      onDrop={e => { e.preventDefault(); setDragging(false); uploadFile(e.dataTransfer.files?.[0]) }}
                      className={`flex flex-col items-center justify-center gap-[7px] rounded-[10px] border border-dashed px-[16px] py-[20px] cursor-pointer text-center outline-none transition-colors ${dragging ? 'border-[rgba(0,255,225,0.55)] bg-[rgba(0,255,225,0.07)]' : 'border-[rgba(255,255,255,0.2)] bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.06)]'}`}
                    >
                      {uploadingImage ? (
                        <p className="font-ui text-[14px] text-white/70">Envoi en cours…</p>
                      ) : (
                        <>
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-white/45">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <circle cx="8.5" cy="8.5" r="1.5" />
                            <path d="m21 15-5-5L5 21" />
                          </svg>
                          <p className="font-ui text-[14px] text-white/70 tracking-[-0.3px]">
                            Glisse une image, colle (Ctrl+V) ou clique pour parcourir
                          </p>
                          <p className="font-ui text-[13px] text-white/35">PNG, JPEG, GIF ou WebP — 4 Mo max</p>
                        </>
                      )}
                    </div>
                  )}

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    className="hidden"
                    onChange={e => { uploadFile(e.target.files?.[0]); e.currentTarget.value = '' }}
                  />

                  {cropState && (
                    <ImageCropper
                      src={cropState.src}
                      aspect={NEWS_BANNER_RATIO}
                      onCancel={() => setCropState(null)}
                      onConfirm={(dataUrl, mime) => {
                        setCropState(null)
                        uploadDataUrl(dataUrl, mime, mime === 'image/png' ? 'news.png' : 'news.jpg')
                      }}
                    />
                  )}

                  {imageError && (
                    <p className="font-ui text-[13px] text-[rgba(255,120,120,0.9)] mt-[6px]">{imageError}</p>
                  )}
                </div>

                <div className="flex flex-col">
                  <p className={labelCls}>Contenu <span className="text-white/30">*</span></p>
                  <textarea
                    className={`${inputCls} resize-none`}
                    rows={4}
                    placeholder="Décrivez la nouveauté…"
                    value={form.body}
                    onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                  />
                </div>

                <div className="flex gap-[8px] justify-end pt-[4px]">
                  <button
                    className="font-ui text-[14px] text-white/40 px-[14px] h-[34px] rounded-[12px] hover:bg-[rgba(255,255,255,0.05)] hover:text-white/70 transition-colors"
                    onClick={cancelForm}
                  >
                    Annuler
                  </button>
                  <button
                    className="font-ui font-bold text-[14px] tracking-[-0.3px] bg-white text-[#0e0b16] px-[18px] h-[34px] rounded-[12px] hover:bg-white/90 disabled:opacity-30 disabled:hover:bg-white active:scale-[0.98] transition-all"
                    disabled={saving || !form.title.trim() || !form.body.trim()}
                    onClick={saveNews}
                  >
                    {saving ? 'Enregistrement…' : editingId ? 'Enregistrer' : 'Publier'}
                  </button>
                </div>
              </div>
            )}

            {/* ── Liste des actualités ── */}
            {loading ? (
              <p className="font-ui text-[14px] text-white/25 text-center py-[40px]">Chargement…</p>
            ) : news.length === 0 ? (
              <div className="flex flex-col items-center gap-[14px] py-[60px]">
                <p className="font-ui text-[14px] text-white/30 tracking-[-0.3px]">Aucune actualité publiée pour le moment</p>
                {!showForm && (
                  <button
                    className="flex items-center gap-[7px] bg-white text-[#0e0b16] font-ui font-bold text-[14px] tracking-[-0.3px] px-[16px] h-[34px] rounded-[12px] hover:bg-white/90 active:scale-[0.98] transition-all"
                    onClick={openCreate}
                  >
                    <svg className="icon-adm-plus" width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                      <rect x="4.85" y="1" width="2.3" height="10" rx="1.15" />
                      <rect x="1" y="4.85" width="10" height="2.3" rx="1.15" />
                    </svg>
                    Créer la première actualité
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-[8px]">
                {news.map(item => {
                  const cat = resolveCategory(item)
                  return (
                  <div
                    key={item.id}
                    className="flex items-center gap-[12px] bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] rounded-[8px] p-[8px] group hover:bg-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)] transition-colors"
                  >
                    {/* Miniature */}
                    <div className="relative size-[48px] rounded-[8px] overflow-hidden shrink-0 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)]">
                      <RemoteNewsImage src={item.imageUrl} className="size-full object-cover" fallback={<NewsFallback category={cat.key} />} />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-ui font-semibold text-[14px] text-white tracking-[-0.3px] truncate">{item.title}</p>
                      <div className="flex items-center gap-[8px] mt-[4px]">
                        <CategoryBadge category={cat.key} />
                        <p className="font-ui text-[14px] text-white/40 truncate tracking-[-0.3px]">{item.date}{item.author ? ` · ${item.author}` : ''}</p>
                      </div>
                    </div>

                    {/* Actions */}
                    {confirmDeleteId === item.id ? (
                      <div className="flex gap-[6px] items-center shrink-0">
                        <span className="font-ui text-[14px] text-white/40">Supprimer ?</span>
                        <button
                          className="font-ui text-[14px] text-[rgba(255,100,100,0.8)] hover:text-[rgba(255,120,120,1)] px-[10px] py-[5px] rounded-[8px] bg-[rgba(255,60,60,0.1)] border border-[rgba(255,60,60,0.2)] transition-colors"
                          onClick={() => doDeleteNews(item.id)}
                        >
                          Confirmer
                        </button>
                        <button
                          className="font-ui text-[14px] text-white/30 hover:text-white/60 px-[10px] py-[5px] rounded-[8px] hover:bg-[rgba(255,255,255,0.05)] transition-colors"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Annuler
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-[6px] opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          className="flex items-center justify-center size-[38px] rounded-[10px] text-white/40 hover:text-white hover:bg-[rgba(255,255,255,0.08)] transition-colors"
                          onClick={() => openEdit(item)}
                          title="Modifier"
                        >
                          <svg className="icon-adm-edit" width="16" height="16" viewBox="0 0 12 12" fill="currentColor">
                            <path d="M7.9 1.35 10.65 4.1 9.25 5.5 6.5 2.75 7.9 1.35Z" />
                            <path d="M5.85 3.4 8.6 6.15 3.35 11.4l-2.85.6.6-2.85L5.85 3.4Z" />
                          </svg>
                        </button>
                        <button
                          className="flex items-center justify-center size-[38px] rounded-[10px] text-white/40 hover:text-white hover:bg-[rgba(255,255,255,0.08)] transition-colors"
                          onClick={() => duplicateNews(item)}
                          disabled={saving}
                          title="Dupliquer"
                        >
                          <svg className="icon-adm-dup" width="16" height="16" viewBox="0 0 12 12" fill="none">
                            <rect className="icon-adm-dup-back" x="3.7" y="0.7" width="7.6" height="7.6" rx="1.6" stroke="currentColor" strokeWidth="1.2" />
                            <rect x="0.7" y="3.7" width="7.6" height="7.6" rx="1.6" fill="currentColor" />
                          </svg>
                        </button>
                        <button
                          className="flex items-center justify-center size-[38px] rounded-[10px] text-white/40 hover:text-[rgba(255,120,120,0.95)] hover:bg-[rgba(255,60,60,0.12)] transition-colors"
                          onClick={() => setConfirmDeleteId(item.id)}
                          title="Supprimer"
                        >
                          <svg className="icon-adm-trash" width="15" height="16" viewBox="0 0 11 12" fill="currentColor">
                            <rect className="icon-adm-trash-lid" x="0.6" y="2.1" width="9.8" height="2.2" rx="1.1" />
                            <rect x="3.6" y="0.4" width="3.8" height="2.1" rx="1" />
                            <path d="M1.55 4.6h7.9l-.62 6.1a1.05 1.05 0 0 1-1.04.9H3.21a1.05 1.05 0 0 1-1.04-.9L1.55 4.6Z" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ═══ ONGLET ADMINISTRATEURS ═══ */}
        {tab === 'admins' && (
          <div className="flex flex-col gap-[14px]">

            <div className="flex items-center h-[34px] shrink-0">
              <p className="font-ui text-[14px] text-white/40 tracking-[-0.3px]">
                {admins.length} administrateur{admins.length !== 1 ? 's' : ''}
              </p>
            </div>

            {/* Ajouter un admin */}
            <div className="flex gap-[8px]">
              <input
                className={inputCls}
                placeholder="Pseudo Minecraft exact…"
                value={newAdminName}
                onChange={e => setNewAdminName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && doAddAdmin()}
              />
              <button
                className="shrink-0 font-ui font-bold text-[14px] tracking-[-0.3px] bg-white text-[#0e0b16] px-[16px] h-[38px] rounded-[12px] hover:bg-white/90 disabled:opacity-30 disabled:hover:bg-white active:scale-[0.98] transition-all"
                disabled={!newAdminName.trim() || addingAdmin}
                onClick={doAddAdmin}
              >
                {addingAdmin ? '…' : 'Ajouter'}
              </button>
            </div>

            {/* Liste */}
            {loading ? (
              <p className="font-ui text-[14px] text-white/25 text-center py-[40px]">Chargement…</p>
            ) : (
              <div className="flex flex-col gap-[8px]">
                {admins.map(name => (
                  <div
                    key={name}
                    className="flex items-center gap-[12px] bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] rounded-[8px] p-[8px] group hover:bg-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)] transition-colors"
                  >
                    <div className="size-[48px] rounded-[8px] overflow-hidden shrink-0">
                      <Avatar name={name} className="size-full object-cover" />
                    </div>
                    <p className="font-ui font-semibold text-[16px] text-white tracking-[-0.64px] flex-1">
                      {name}
                      {name === username && (
                        <span className="font-normal text-[14px] text-white/30 ml-[8px]">(vous)</span>
                      )}
                    </p>

                    {name === username ? (
                      <span className="font-ui text-[14px] text-white/30 px-[10px] h-[26px] inline-flex items-center rounded-full border border-[rgba(255,255,255,0.08)]">
                        Protégé
                      </span>
                    ) : confirmRemoveAdmin === name ? (
                      <div className="flex gap-[6px] items-center shrink-0">
                        <span className="font-ui text-[14px] text-white/40">Retirer ?</span>
                        <button
                          className="font-ui text-[14px] text-[rgba(255,100,100,0.8)] px-[10px] py-[5px] rounded-[8px] bg-[rgba(255,60,60,0.1)] border border-[rgba(255,60,60,0.2)] hover:text-[rgba(255,120,120,1)] transition-colors"
                          onClick={() => doRemoveAdmin(name)}
                        >
                          Confirmer
                        </button>
                        <button
                          className="font-ui text-[14px] text-white/30 hover:text-white/60 px-[10px] py-[5px] rounded-[8px] hover:bg-[rgba(255,255,255,0.05)] transition-colors"
                          onClick={() => setConfirmRemoveAdmin(null)}
                        >
                          Annuler
                        </button>
                      </div>
                    ) : (
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          className="flex items-center justify-center size-[30px] rounded-[8px] text-white/40 hover:text-[rgba(255,120,120,0.95)] hover:bg-[rgba(255,60,60,0.12)] transition-colors"
                          onClick={() => setConfirmRemoveAdmin(name)}
                          title="Retirer les droits admin"
                        >
                          <svg className="icon-adm-trash" width="11" height="12" viewBox="0 0 11 12" fill="currentColor">
                            <rect className="icon-adm-trash-lid" x="0.6" y="2.1" width="9.8" height="2.2" rx="1.1" />
                            <rect x="3.6" y="0.4" width="3.8" height="2.1" rx="1" />
                            <path d="M1.55 4.6h7.9l-.62 6.1a1.05 1.05 0 0 1-1.04.9H3.21a1.05 1.05 0 0 1-1.04-.9L1.55 4.6Z" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ ONGLET JOUEURS (carrousel d'accueil) ═══ */}
        {tab === 'players' && (
          <div className="flex flex-col gap-[14px]">

            <div className="flex items-center h-[34px] shrink-0">
              <p className="font-ui text-[14px] text-white/40 tracking-[-0.3px]">
                {players.length} joueur{players.length !== 1 ? 's' : ''} dans l'historique
              </p>
            </div>

            <p className="font-ui text-[14px] text-white/35 tracking-[-0.3px] leading-snug -mt-[8px]">
              Têtes affichées dans le carrousel d'accueil. Les joueurs vus en ligne s'ajoutent
              automatiquement ; colle ici les anciens pseudos pour les ajouter (séparés par des
              espaces, virgules ou retours à la ligne).
            </p>

            {/* Ajout en masse */}
            <div className="flex flex-col gap-[8px]">
              <textarea
                className={`${inputCls} resize-none`}
                rows={3}
                placeholder="Pseudo1, Pseudo2, Pseudo3…"
                value={newPlayers}
                onChange={e => setNewPlayers(e.target.value)}
              />
              <div className="flex items-center justify-between gap-[8px]">
                <p className="font-ui text-[14px] text-white/40 tracking-[-0.3px] min-h-[16px]">
                  {playersMsg}
                </p>
                <button
                  className="shrink-0 font-ui font-bold text-[14px] tracking-[-0.3px] bg-white text-[#0e0b16] px-[16px] h-[38px] rounded-[12px] hover:bg-white/90 disabled:opacity-30 disabled:hover:bg-white active:scale-[0.98] transition-all"
                  disabled={!newPlayers.trim() || addingPlayers}
                  onClick={doAddPlayers}
                >
                  {addingPlayers ? '…' : 'Ajouter'}
                </button>
              </div>
            </div>

            {/* Liste */}
            {loading ? (
              <p className="font-ui text-[14px] text-white/25 text-center py-[40px]">Chargement…</p>
            ) : players.length === 0 ? (
              <p className="font-ui text-[14px] text-white/25 text-center py-[40px]">Aucun joueur dans l'historique pour l'instant.</p>
            ) : (
              <div className="grid grid-cols-2 gap-[8px]">
                {players.map(name => (
                  <div
                    key={name}
                    className="flex items-center gap-[10px] bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] rounded-[8px] p-[8px] group hover:bg-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)] transition-colors"
                  >
                    <div className="size-[36px] rounded-[6px] overflow-hidden shrink-0">
                      <Avatar name={name} className="size-full object-cover" />
                    </div>
                    <p className="font-ui font-semibold text-[14px] text-white tracking-[-0.3px] flex-1 truncate">{name}</p>

                    {confirmRemovePlayer === name ? (
                      <div className="flex gap-[4px] items-center shrink-0">
                        <button
                          className="font-ui text-[13px] text-[rgba(255,100,100,0.8)] px-[8px] py-[4px] rounded-[6px] bg-[rgba(255,60,60,0.1)] border border-[rgba(255,60,60,0.2)] hover:text-[rgba(255,120,120,1)] transition-colors"
                          onClick={() => doRemovePlayer(name)}
                        >
                          Retirer
                        </button>
                        <button
                          className="font-ui text-[13px] text-white/30 hover:text-white/60 px-[8px] py-[4px] rounded-[6px] hover:bg-[rgba(255,255,255,0.05)] transition-colors"
                          onClick={() => setConfirmRemovePlayer(null)}
                        >
                          Annuler
                        </button>
                      </div>
                    ) : (
                      <button
                        className="opacity-0 group-hover:opacity-100 flex items-center justify-center size-[28px] rounded-[8px] text-white/40 hover:text-[rgba(255,120,120,0.95)] hover:bg-[rgba(255,60,60,0.12)] transition-all shrink-0"
                        onClick={() => setConfirmRemovePlayer(name)}
                        title="Retirer du carrousel"
                      >
                        <svg className="icon-adm-trash" width="11" height="12" viewBox="0 0 11 12" fill="currentColor">
                          <rect className="icon-adm-trash-lid" x="0.6" y="2.1" width="9.8" height="2.2" rx="1.1" />
                          <rect x="3.6" y="0.4" width="3.8" height="2.1" rx="1" />
                          <path d="M1.55 4.6h7.9l-.62 6.1a1.05 1.05 0 0 1-1.04.9H3.21a1.05 1.05 0 0 1-1.04-.9L1.55 4.6Z" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ ONGLET SALONS ═══ */}
        {tab === 'channels' && (
          <div className="flex flex-col gap-[14px]">

            <div className="flex items-center justify-between h-[34px] shrink-0">
              <p className="font-ui text-[14px] text-white/40 tracking-[-0.3px]">
                {channels.length} salon{channels.length !== 1 ? 's' : ''}
              </p>
              {!showChannelForm && (
                <button
                  className="flex items-center gap-[7px] bg-white text-[#0e0b16] font-ui font-bold text-[14px] tracking-[-0.3px] px-[16px] h-[34px] rounded-[12px] hover:bg-white/90 active:scale-[0.98] transition-all"
                  onClick={openCreateChannel}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                    <rect x="4.85" y="1" width="2.3" height="10" rx="1.15" />
                    <rect x="1" y="4.85" width="10" height="2.3" rx="1.15" />
                  </svg>
                  Nouveau salon
                </button>
              )}
            </div>

            {/* Formulaire */}
            {showChannelForm && (
              <div className="bg-[rgba(0,0,0,0.28)] border border-[rgba(0,255,225,0.18)] rounded-[12px] p-[18px] flex flex-col gap-[14px]">
                <div className="flex items-center justify-between">
                  <p className="font-ui font-semibold text-[16px] text-white tracking-[-0.64px]">
                    {editingChannelId ? 'Modifier le salon' : 'Nouveau salon'}
                  </p>
                  <button className="text-white/40 hover:text-white/70 transition-colors p-[4px]" onClick={cancelChannelForm}>
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor">
                      <rect x="5.3" y="-1" width="2.4" height="15" rx="1.2" transform="rotate(45 6.5 6.5)" />
                      <rect x="5.3" y="-1" width="2.4" height="15" rx="1.2" transform="rotate(-45 6.5 6.5)" />
                    </svg>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-[12px]">
                  <div className="flex flex-col">
                    <p className={labelCls}>Nom <span className="text-white/30">*</span></p>
                    <input
                      className={inputCls}
                      placeholder="Ex : événements"
                      maxLength={40}
                      value={channelForm.name}
                      onChange={e => setChannelForm(f => ({ ...f, name: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && saveChannel()}
                    />
                  </div>
                  <div className="flex flex-col">
                    <p className={labelCls}>Type</p>
                    <div className="flex gap-[6px]">
                      {(['open', 'announce'] as const).map(t => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setChannelForm(f => ({ ...f, type: t }))}
                          className={`flex-1 px-[10px] h-[38px] rounded-[10px] border font-ui text-[14px] font-semibold transition-colors ${
                            channelForm.type === t
                              ? 'border-[rgba(0,255,225,0.5)] bg-[rgba(0,255,225,0.08)] text-white'
                              : 'border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.03)] text-white/60 hover:bg-[rgba(255,255,255,0.06)]'
                          }`}
                        >
                          {t === 'open' ? 'Ouvert' : 'Annonces'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex flex-col">
                  <p className={labelCls}>Description</p>
                  <input
                    className={inputCls}
                    placeholder="Sujet du salon (optionnel)"
                    value={channelForm.description}
                    onChange={e => setChannelForm(f => ({ ...f, description: e.target.value }))}
                  />
                </div>

                <p className="font-ui text-[13px] text-white/35 tracking-[-0.3px] leading-snug -mt-[4px]">
                  Un salon « Annonces » est en lecture seule : seuls les administrateurs peuvent y écrire.
                  {editingChannelId ? ' L\'identifiant du salon ne change pas lors d\'un renommage.' : ''}
                </p>

                {channelMsg && <p className="font-ui text-[13px] text-[rgba(255,120,120,0.9)]">{channelMsg}</p>}

                <div className="flex gap-[8px] justify-end pt-[4px]">
                  <button
                    className="font-ui text-[14px] text-white/40 px-[14px] h-[34px] rounded-[12px] hover:bg-[rgba(255,255,255,0.05)] hover:text-white/70 transition-colors"
                    onClick={cancelChannelForm}
                  >
                    Annuler
                  </button>
                  <button
                    className="font-ui font-bold text-[14px] tracking-[-0.3px] bg-white text-[#0e0b16] px-[18px] h-[34px] rounded-[12px] hover:bg-white/90 disabled:opacity-30 disabled:hover:bg-white active:scale-[0.98] transition-all"
                    disabled={savingChannel || !channelForm.name.trim()}
                    onClick={saveChannel}
                  >
                    {savingChannel ? 'Enregistrement…' : editingChannelId ? 'Enregistrer' : 'Créer'}
                  </button>
                </div>
              </div>
            )}

            {/* Liste */}
            {loading ? (
              <p className="font-ui text-[14px] text-white/25 text-center py-[40px]">Chargement…</p>
            ) : channels.length === 0 ? (
              <div className="flex flex-col items-center gap-[14px] py-[60px]">
                <p className="font-ui text-[14px] text-white/30 tracking-[-0.3px]">Aucun salon pour le moment</p>
                {!showChannelForm && (
                  <button
                    className="flex items-center gap-[7px] bg-white text-[#0e0b16] font-ui font-bold text-[14px] tracking-[-0.3px] px-[16px] h-[34px] rounded-[12px] hover:bg-white/90 active:scale-[0.98] transition-all"
                    onClick={openCreateChannel}
                  >
                    Créer le premier salon
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-[8px]">
                {channels.map(c => (
                  <div
                    key={c.id}
                    className="flex items-center gap-[12px] bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] rounded-[8px] p-[8px] group hover:bg-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)] transition-colors"
                  >
                    <div className="size-[40px] rounded-[8px] flex items-center justify-center shrink-0 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] text-white/50">
                      {c.type === 'announce' ? (
                        <svg width="17" height="17" viewBox="0 0 16 16" fill="none"><path d="M2.5 6.5v3a1 1 0 0 0 1 1H5l4.5 2.8V2.7L5 5.5H3.5a1 1 0 0 0-1 1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" /><path d="M12 6.2c.6.5.9 1.1.9 1.8s-.3 1.3-.9 1.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" /></svg>
                      ) : (
                        <svg width="17" height="17" viewBox="0 0 16 16" fill="none"><path d="M6.4 2.2 5 13.8M11 2.2 9.6 13.8M2.6 5.6h11.2M2.2 10.4h11.2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /></svg>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-[8px]">
                        <p className="font-ui font-semibold text-[14px] text-white tracking-[-0.3px] truncate">{c.name}</p>
                        <span
                          className={`font-ui text-[12px] px-[8px] py-[1px] rounded-full border shrink-0 ${
                            c.type === 'announce'
                              ? 'text-[rgba(0,255,225,0.8)] bg-[rgba(0,255,225,0.08)] border-[rgba(0,255,225,0.25)]'
                              : 'text-white/45 border-[rgba(255,255,255,0.12)]'
                          }`}
                        >
                          {c.type === 'announce' ? 'Annonces' : 'Ouvert'}
                        </span>
                      </div>
                      <p className="font-ui text-[13px] text-white/40 truncate tracking-[-0.3px] mt-[3px]">{c.description || 'Sans description'}</p>
                    </div>

                    {confirmDeleteChannel === c.id ? (
                      <div className="flex gap-[6px] items-center shrink-0">
                        <span className="font-ui text-[14px] text-white/40">Supprimer ?</span>
                        <button
                          className="font-ui text-[14px] text-[rgba(255,100,100,0.8)] hover:text-[rgba(255,120,120,1)] px-[10px] py-[5px] rounded-[8px] bg-[rgba(255,60,60,0.1)] border border-[rgba(255,60,60,0.2)] transition-colors"
                          onClick={() => doDeleteChannel(c.id)}
                        >
                          Confirmer
                        </button>
                        <button
                          className="font-ui text-[14px] text-white/30 hover:text-white/60 px-[10px] py-[5px] rounded-[8px] hover:bg-[rgba(255,255,255,0.05)] transition-colors"
                          onClick={() => setConfirmDeleteChannel(null)}
                        >
                          Annuler
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-[6px] opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          className="flex items-center justify-center size-[38px] rounded-[10px] text-white/40 hover:text-white hover:bg-[rgba(255,255,255,0.08)] transition-colors"
                          onClick={() => openEditChannel(c)}
                          title="Modifier"
                        >
                          <svg width="16" height="16" viewBox="0 0 12 12" fill="currentColor">
                            <path d="M7.9 1.35 10.65 4.1 9.25 5.5 6.5 2.75 7.9 1.35Z" />
                            <path d="M5.85 3.4 8.6 6.15 3.35 11.4l-2.85.6.6-2.85L5.85 3.4Z" />
                          </svg>
                        </button>
                        <button
                          className="flex items-center justify-center size-[38px] rounded-[10px] text-white/40 hover:text-[rgba(255,120,120,0.95)] hover:bg-[rgba(255,60,60,0.12)] transition-colors"
                          onClick={() => setConfirmDeleteChannel(c.id)}
                          title="Supprimer"
                        >
                          <svg width="15" height="16" viewBox="0 0 11 12" fill="currentColor">
                            <rect x="0.6" y="2.1" width="9.8" height="2.2" rx="1.1" />
                            <rect x="3.6" y="0.4" width="3.8" height="2.1" rx="1" />
                            <path d="M1.55 4.6h7.9l-.62 6.1a1.05 1.05 0 0 1-1.04.9H3.21a1.05 1.05 0 0 1-1.04-.9L1.55 4.6Z" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ ONGLET SHOP ═══ */}
        {tab === 'shop' && (
          <div className="flex flex-col gap-[14px]">

            {/* Réglages : la monnaie */}
            <div className="bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] rounded-[12px] p-[16px] flex flex-col gap-[14px]">
              <p className="font-ui font-semibold text-[15px] text-white tracking-[-0.4px]">Monnaie du serveur</p>

              <div className="grid grid-cols-2 gap-[12px]">
                <div className="flex flex-col">
                  <p className={labelCls}>Nom de la monnaie</p>
                  <input
                    className={inputCls} maxLength={40} value={shopConfig.currencyName} placeholder="Ex : Zig coin"
                    onChange={e => setShopConfig(c => ({ ...c, currencyName: e.target.value }))}
                  />
                </div>
                <div className="flex flex-col">
                  <p className={labelCls}>Identifiant de l'item monnaie</p>
                  <ItemAutocomplete
                    value={shopConfig.currencyItem}
                    onChange={v => setShopConfig(c => ({ ...c, currencyItem: v }))}
                    catalog={itemCatalog}
                    loading={itemCatalogLoading}
                    placeholder="Cherche l'item monnaie…"
                  />
                </div>
              </div>

              <div className="flex flex-col">
                <p className={labelCls}>Icône de la monnaie (optionnel — sinon icône auto de l'item)</p>
                <div className="flex gap-[8px] items-center">
                  <div className="size-[38px] shrink-0 rounded-[8px] flex items-center justify-center bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] overflow-hidden">
                    <RemoteNewsImage
                      src={shopConfig.currencyIcon}
                      className="size-full object-cover"
                      fallback={<span className="font-ui text-[13px] text-white/25">—</span>}
                    />
                  </div>
                  <input
                    className={inputCls} placeholder="https://… (aperçu launcher)" value={shopConfig.currencyIcon}
                    onChange={e => setShopConfig(c => ({ ...c, currencyIcon: e.target.value }))}
                  />
                  <input
                    ref={currencyFileRef} type="file" accept="image/*" className="hidden"
                    onChange={e => { uploadCurrencyIcon(e.target.files?.[0]); e.target.value = '' }}
                  />
                  <button
                    type="button"
                    className="shrink-0 font-ui text-[13px] text-white/70 hover:text-white px-[12px] h-[38px] rounded-[8px] border border-[rgba(255,255,255,0.12)] bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.08)] transition-colors disabled:opacity-40"
                    disabled={uploadingCurrencyIcon}
                    onClick={() => currencyFileRef.current?.click()}
                  >
                    {uploadingCurrencyIcon ? 'Envoi…' : 'Importer'}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                {shopMsg ? <p className="font-ui text-[13px] text-white/55 tracking-[-0.3px]">{shopMsg}</p> : <span />}
                <button
                  className="font-ui font-bold text-[14px] tracking-[-0.3px] bg-white text-[#0e0b16] px-[16px] h-[32px] rounded-[10px] hover:bg-white/90 disabled:opacity-30 disabled:hover:bg-white active:scale-[0.98] transition-all"
                  disabled={savingConfig}
                  onClick={saveShopConfig}
                >
                  {savingConfig ? 'Enregistrement…' : 'Enregistrer'}
                </button>
              </div>
            </div>

            {/* Sélecteur de catégorie : shop du jour (calendrier) vs boutique (offres fixes) */}
            <div className="flex items-center gap-[4px] p-[3px] rounded-[12px] bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)] w-fit shrink-0">
              {([['daily', 'Shop du jour'], ['store', 'Boutique'], ['race', 'Course']] as const).map(([key, label]) => (
                <button
                  key={key}
                  className={`font-ui font-semibold text-[13px] tracking-[-0.3px] px-[16px] h-[30px] rounded-[9px] transition-colors ${shopCat === key ? 'bg-white text-[#0e0b16]' : 'text-white/55 hover:text-white'}`}
                  onClick={() => { setShopCat(key); cancelOfferForm(); setShowLibrary(false) }}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Sélecteur de jour (shop du jour seulement) + nouvelle offre */}
            <div className="flex items-center justify-between h-[34px] shrink-0">
              {shopCat === 'daily' ? (
              <div className="flex items-center gap-[6px]">
                <button
                  className="flex items-center justify-center size-[30px] rounded-[8px] text-white/55 hover:text-white hover:bg-[rgba(255,255,255,0.08)] disabled:opacity-25 disabled:hover:bg-transparent transition-colors"
                  disabled={dayOffset <= 0}
                  onClick={() => { setDayOffset(o => Math.max(0, o - 1)); cancelOfferForm() }}
                  title="Jour précédent"
                >
                  <svg width="9" height="14" viewBox="0 0 9 14" fill="none"><path d="M7.5 1 1.5 7l6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <p className="font-ui font-semibold text-[14px] text-white tracking-[-0.3px] min-w-[190px] text-center">{dayLabel(dayOffset)}</p>
                <button
                  className="flex items-center justify-center size-[30px] rounded-[8px] text-white/55 hover:text-white hover:bg-[rgba(255,255,255,0.08)] transition-colors"
                  onClick={() => { setDayOffset(o => o + 1); cancelOfferForm() }}
                  title="Jour suivant"
                >
                  <svg width="9" height="14" viewBox="0 0 9 14" fill="none"><path d="M1.5 1 7.5 7l-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              </div>
              ) : (
                <p className="font-ui font-semibold text-[14px] text-white tracking-[-0.3px]">{shopCat === 'race' ? 'Course' : 'Boutique'} <span className="text-white/40 font-medium">{shopCat === 'race' ? '· trades partagés (1er arrivé bloque les autres)' : '· offres permanentes (on y dépense les coins)'}</span></p>
              )}
              <div className="flex items-center gap-[8px]">
                <button
                  className={`flex items-center gap-[7px] font-ui font-medium text-[14px] tracking-[-0.3px] px-[14px] h-[34px] rounded-[12px] border transition-colors ${showLibrary ? 'border-[rgba(0,255,225,0.5)] bg-[rgba(0,255,225,0.12)] text-white' : 'border-[rgba(255,255,255,0.14)] bg-[rgba(255,255,255,0.04)] text-white/75 hover:text-white hover:bg-[rgba(255,255,255,0.08)]'}`}
                  onClick={() => (showLibrary ? setShowLibrary(false) : openLibrary())}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <rect x="1.2" y="2" width="3.2" height="10" rx="1" stroke="currentColor" strokeWidth="1.3" />
                    <rect x="5.6" y="2" width="3.2" height="10" rx="1" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M10.4 2.7 12.7 3.3 11.1 11.6 8.8 11" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  </svg>
                  {showLibrary ? 'Fermer la bibliothèque' : 'Bibliothèque'}
                </button>
                {!showOfferForm && !showLibrary && (
                  <button
                    className="flex items-center gap-[7px] bg-white text-[#0e0b16] font-ui font-bold text-[14px] tracking-[-0.3px] px-[16px] h-[34px] rounded-[12px] hover:bg-white/90 active:scale-[0.98] transition-all"
                    onClick={openCreateOffer}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                      <rect x="4.85" y="1" width="2.3" height="10" rx="1.15" />
                      <rect x="1" y="4.85" width="10" height="2.3" rx="1.15" />
                    </svg>
                    Nouvelle offre
                  </button>
                )}
              </div>
            </div>

            {/* Formulaire d'offre */}
            {!showLibrary && showOfferForm && (
              <div className="bg-[rgba(0,0,0,0.28)] border border-[rgba(0,255,225,0.18)] rounded-[12px] p-[18px] flex flex-col gap-[14px]">
                <div className="flex items-center justify-between">
                  <p className="font-ui font-semibold text-[16px] text-white tracking-[-0.64px]">
                    {editingOfferId ? 'Modifier l\'offre' : 'Nouvelle offre'}
                  </p>
                  <button className="text-white/40 hover:text-white/70 transition-colors p-[4px]" onClick={cancelOfferForm}>
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor">
                      <rect x="5.3" y="-1" width="2.4" height="15" rx="1.2" transform="rotate(45 6.5 6.5)" />
                      <rect x="5.3" y="-1" width="2.4" height="15" rx="1.2" transform="rotate(-45 6.5 6.5)" />
                    </svg>
                  </button>
                </div>

                {/* Troc : on donne (entrée) → on reçoit (sortie) */}
                <div className="flex items-stretch gap-[10px]">
                  {/* Entrée */}
                  <div className="flex-1 flex flex-col gap-[8px] bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-[10px] p-[12px]">
                    <div className="flex items-center justify-between min-h-[24px]">
                      <p className="font-ui text-[13px] text-white/45 tracking-[-0.3px]">On donne</p>
                      {shopConfig.currencyItem && (
                        <button type="button" onClick={() => setOfferForm(f => ({ ...f, input: shopConfig.currencyItem }))}
                          className="flex items-center gap-[5px] font-ui text-[12px] text-[rgba(0,255,225,0.85)] hover:text-[rgba(0,255,225,1)] pl-[5px] pr-[9px] h-[24px] rounded-full border border-[rgba(0,255,225,0.3)] bg-[rgba(0,255,225,0.08)] hover:bg-[rgba(0,255,225,0.14)] transition-colors">
                          <ItemIcon desc={iconDescFor(shopConfig.currencyItem, offerIcons[shopConfig.currencyItem])} id={shopConfig.currencyItem} box={16} />
                          {shopConfig.currencyName || 'Monnaie'}
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-[8px]">
                      <ItemIcon desc={iconDescFor(offerForm.input, offerIcons[offerForm.input])} id={offerForm.input} box={34} />
                      <QtyInput value={offerForm.inputQty} onChange={n => setOfferForm(f => ({ ...f, inputQty: n }))} />
                    </div>
                    <ItemAutocomplete value={offerForm.input} onChange={v => setOfferForm(f => ({ ...f, input: v }))} catalog={itemCatalog} loading={itemCatalogLoading} placeholder="Cherche un item…" />
                  </div>

                  {/* Flèche */}
                  <div className="flex items-center text-white/40 self-center">
                    <svg width="22" height="14" viewBox="0 0 18 14" fill="none"><path d="M0.5 7H17.5M17.5 7L11.5 1M17.5 7L11.5 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  </div>

                  {/* Sortie */}
                  <div className="flex-1 flex flex-col gap-[8px] bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-[10px] p-[12px]">
                    <div className="flex items-center justify-between min-h-[24px]">
                      <p className="font-ui text-[13px] text-white/45 tracking-[-0.3px]">On reçoit</p>
                      {shopConfig.currencyItem && (
                        <button type="button" onClick={() => setOfferForm(f => ({ ...f, output: shopConfig.currencyItem }))}
                          className="flex items-center gap-[5px] font-ui text-[12px] text-[rgba(0,255,225,0.85)] hover:text-[rgba(0,255,225,1)] pl-[5px] pr-[9px] h-[24px] rounded-full border border-[rgba(0,255,225,0.3)] bg-[rgba(0,255,225,0.08)] hover:bg-[rgba(0,255,225,0.14)] transition-colors">
                          <ItemIcon desc={iconDescFor(shopConfig.currencyItem, offerIcons[shopConfig.currencyItem])} id={shopConfig.currencyItem} box={16} />
                          {shopConfig.currencyName || 'Monnaie'}
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-[8px]">
                      <ItemIcon desc={iconDescFor(offerForm.output, offerIcons[offerForm.output])} id={offerForm.output} box={34} />
                      <QtyInput value={offerForm.outputQty} onChange={n => setOfferForm(f => ({ ...f, outputQty: n }))} />
                    </div>
                    <ItemAutocomplete value={offerForm.output} onChange={v => setOfferForm(f => ({ ...f, output: v }))} catalog={itemCatalog} loading={itemCatalogLoading} placeholder="Cherche un item…" />
                  </div>
                </div>

                {/* Limite d'échanges par joueur (0 = illimité) */}
                <div className="flex items-center gap-[10px]">
                  <p className="font-ui text-[13px] text-white/60 tracking-[-0.3px] shrink-0">{shopCat === 'race' ? 'Limite (tous joueurs)' : 'Limite par joueur'}</p>
                  <div className="w-[116px]">
                    <QtyInput value={offerForm.maxUses} onChange={n => setOfferForm(f => ({ ...f, maxUses: n }))} min={0} />
                  </div>
                  <p className="font-ui text-[12px] text-white/35 tracking-[-0.3px]">
                    {offerForm.maxUses > 0
                      ? (shopCat === 'race'
                          ? `${offerForm.maxUses} fois au total (tous joueurs)`
                          : `${offerForm.maxUses} max par joueur${shopCat === 'store' ? '' : ' / jour'}`)
                      : '0 = illimité'}
                  </p>
                </div>

                <p className="font-ui text-[13px] text-white/35 tracking-[-0.3px] leading-snug">
                  Le joueur donne l'entrée au marchand et reçoit la sortie. Les icônes sont automatiques.
                </p>

                {offerMsg && <p className="font-ui text-[13px] text-[rgba(255,120,120,0.9)]">{offerMsg}</p>}

                <div className="flex gap-[8px] justify-end pt-[4px]">
                  <button
                    className="font-ui text-[14px] text-white/40 px-[14px] h-[34px] rounded-[12px] hover:bg-[rgba(255,255,255,0.05)] hover:text-white/70 transition-colors"
                    onClick={cancelOfferForm}
                  >
                    Annuler
                  </button>
                  <button
                    className="font-ui font-bold text-[14px] tracking-[-0.3px] bg-white text-[#0e0b16] px-[18px] h-[34px] rounded-[12px] hover:bg-white/90 disabled:opacity-30 disabled:hover:bg-white active:scale-[0.98] transition-all"
                    disabled={savingOffer || !offerForm.input.trim() || !offerForm.output.trim()}
                    onClick={saveOffer}
                  >
                    {savingOffer ? 'Enregistrement…' : editingOfferId ? 'Enregistrer' : 'Créer'}
                  </button>
                </div>
              </div>
            )}

            {/* Panneau bibliothèque, OU offres du jour sélectionné */}
            {showLibrary ? (
              <div className="flex flex-col gap-[8px]">
                <div className="flex items-center justify-between min-h-[20px]">
                  <p className="font-ui text-[14px] text-white/45 tracking-[-0.3px]">Bibliothèque · « Ajouter » la place {shopCat === 'store' ? 'dans la boutique' : `sur ${dayLabel(dayOffset).toLowerCase()}`}</p>
                  {libMsg && <p className="font-ui text-[13px] text-[rgba(0,255,225,0.8)] tracking-[-0.3px]">{libMsg}</p>}
                </div>
                {libraryLoading ? (
                  <p className="font-ui text-[14px] text-white/25 text-center py-[40px]">Chargement…</p>
                ) : libraryOffers.length === 0 ? (
                  <p className="font-ui text-[14px] text-white/30 text-center py-[50px] tracking-[-0.3px]">Bibliothèque vide — les offres que tu crées s'y ajoutent automatiquement.</p>
                ) : (
                  libraryOffers.map(o => (
                    <div key={o.id} className="flex items-center gap-[12px] bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] rounded-[8px] p-[10px] group hover:bg-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)] transition-colors">
                      <div className="flex-1 min-w-0 flex items-center gap-[10px]">
                        <div className="flex items-center gap-[7px] min-w-0">
                          <ItemIcon desc={iconDescFor(o.input, o.inputIcon)} id={o.input} box={30} />
                          <span className="font-ui font-semibold text-[14px] text-white tracking-[-0.3px] whitespace-nowrap">×{o.inputQty}</span>
                          <span className="font-ui text-[13px] text-white/35 truncate">{o.input.replace(/^minecraft:/, '')}</span>
                        </div>
                        <svg className="shrink-0 text-white/35" width="18" height="12" viewBox="0 0 18 14" fill="none"><path d="M0.5 7H17.5M17.5 7L11.5 1M17.5 7L11.5 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        <div className="flex items-center gap-[7px] min-w-0">
                          <ItemIcon desc={iconDescFor(o.output, o.outputIcon)} id={o.output} box={30} />
                          <span className="font-ui font-semibold text-[14px] text-white tracking-[-0.3px] whitespace-nowrap">×{o.outputQty}</span>
                          <span className="font-ui text-[13px] text-white/35 truncate">{o.output === shopConfig.currencyItem ? (shopConfig.currencyName || 'monnaie') : o.output.replace(/^minecraft:/, '')}</span>
                        </div>
                      </div>
                      <button
                        className="flex items-center gap-[6px] shrink-0 font-ui font-medium text-[13px] text-[#0e0b16] bg-white/90 hover:bg-white px-[12px] h-[30px] rounded-[9px] active:scale-[0.97] transition-all"
                        onClick={() => addFromLibrary(o)}
                      >
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor"><rect x="4.85" y="1" width="2.3" height="10" rx="1.15" /><rect x="1" y="4.85" width="10" height="2.3" rx="1.15" /></svg>
                        Ajouter
                      </button>
                      <button
                        className="opacity-0 group-hover:opacity-100 flex items-center justify-center size-[30px] rounded-[8px] text-white/40 hover:text-[rgba(255,120,120,0.95)] hover:bg-[rgba(255,60,60,0.12)] transition-all shrink-0"
                        onClick={() => deleteFromLibrary(o.id)}
                        title="Retirer de la bibliothèque"
                      >
                        <svg width="13" height="14" viewBox="0 0 11 12" fill="currentColor"><rect x="0.6" y="2.1" width="9.8" height="2.2" rx="1.1" /><rect x="3.6" y="0.4" width="3.8" height="2.1" rx="1" /><path d="M1.55 4.6h7.9l-.62 6.1a1.05 1.05 0 0 1-1.04.9H3.21a1.05 1.05 0 0 1-1.04-.9L1.55 4.6Z" /></svg>
                      </button>
                    </div>
                  ))
                )}
              </div>
            ) : shopLoading ? (
              <p className="font-ui text-[14px] text-white/25 text-center py-[40px]">Chargement…</p>
            ) : dayOffers.length === 0 ? (
              <div className="flex flex-col items-center gap-[14px] py-[60px]">
                <p className="font-ui text-[14px] text-white/30 tracking-[-0.3px]">{shopCat === 'race' ? 'Aucune course en cours' : shopCat === 'store' ? 'Aucune offre dans la boutique' : `Aucune offre pour ${dayOffset === 0 ? "aujourd'hui" : 'ce jour'}`}</p>
                {!showOfferForm && (
                  <button
                    className="flex items-center gap-[7px] bg-white text-[#0e0b16] font-ui font-bold text-[14px] tracking-[-0.3px] px-[16px] h-[34px] rounded-[12px] hover:bg-white/90 active:scale-[0.98] transition-all"
                    onClick={openCreateOffer}
                  >
                    Créer la première offre
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-[8px]">
                {dayOffers.map(o => (
                  <div
                    key={o.id}
                    className="flex items-center gap-[12px] bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] rounded-[8px] p-[10px] group hover:bg-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)] transition-colors"
                  >
                    {/* Échange : entrée → sortie */}
                    <div className="flex-1 min-w-0 flex items-center gap-[10px]">
                      <div className="flex items-center gap-[7px] min-w-0">
                        <ItemIcon desc={iconDescFor(o.input, o.inputIcon)} id={o.input} box={30} />
                        <span className="font-ui font-semibold text-[14px] text-white tracking-[-0.3px] whitespace-nowrap">×{o.inputQty}</span>
                        <span className="font-ui text-[13px] text-white/35 truncate">{o.input.replace(/^minecraft:/, '')}</span>
                      </div>
                      <svg className="shrink-0 text-white/35" width="18" height="12" viewBox="0 0 18 14" fill="none"><path d="M0.5 7H17.5M17.5 7L11.5 1M17.5 7L11.5 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      <div className="flex items-center gap-[7px] min-w-0">
                        <ItemIcon desc={iconDescFor(o.output, o.outputIcon)} id={o.output} box={30} />
                        <span className="font-ui font-semibold text-[14px] text-white tracking-[-0.3px] whitespace-nowrap">×{o.outputQty}</span>
                        <span className="font-ui text-[13px] text-white/35 truncate">{o.output === shopConfig.currencyItem ? (shopConfig.currencyName || 'monnaie') : o.output.replace(/^minecraft:/, '')}</span>
                      </div>
                    </div>

                    {(o.maxUses ?? 0) > 0 && (
                      <span className="shrink-0 font-ui text-[11px] font-medium text-[rgba(0,255,225,0.85)] tracking-[-0.2px] px-[8px] h-[22px] inline-flex items-center rounded-full border border-[rgba(0,255,225,0.25)] bg-[rgba(0,255,225,0.08)] whitespace-nowrap" title={shopCat === 'race' ? `Disponible ${o.maxUses} fois au total, tous joueurs confondus` : `Chaque joueur peut faire cet échange ${o.maxUses} fois${shopCat === 'store' ? '' : ' par jour'}`}>
                        {shopCat === 'race' ? `max ${o.maxUses} total` : `max ${o.maxUses}/joueur`}
                      </span>
                    )}

                    {confirmDeleteOffer === o.id ? (
                      <div className="flex gap-[6px] items-center shrink-0">
                        <span className="font-ui text-[14px] text-white/40">Supprimer ?</span>
                        <button
                          className="font-ui text-[14px] text-[rgba(255,100,100,0.8)] hover:text-[rgba(255,120,120,1)] px-[10px] py-[5px] rounded-[8px] bg-[rgba(255,60,60,0.1)] border border-[rgba(255,60,60,0.2)] transition-colors"
                          onClick={() => doDeleteOffer(o.id)}
                        >
                          Confirmer
                        </button>
                        <button
                          className="font-ui text-[14px] text-white/30 hover:text-white/60 px-[10px] py-[5px] rounded-[8px] hover:bg-[rgba(255,255,255,0.05)] transition-colors"
                          onClick={() => setConfirmDeleteOffer(null)}
                        >
                          Annuler
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-[6px] opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          className="flex items-center justify-center size-[38px] rounded-[10px] text-white/40 hover:text-white hover:bg-[rgba(255,255,255,0.08)] transition-colors"
                          onClick={() => openEditOffer(o)}
                          title="Modifier"
                        >
                          <svg width="16" height="16" viewBox="0 0 12 12" fill="currentColor">
                            <path d="M7.9 1.35 10.65 4.1 9.25 5.5 6.5 2.75 7.9 1.35Z" />
                            <path d="M5.85 3.4 8.6 6.15 3.35 11.4l-2.85.6.6-2.85L5.85 3.4Z" />
                          </svg>
                        </button>
                        <button
                          className="flex items-center justify-center size-[38px] rounded-[10px] text-white/40 hover:text-white hover:bg-[rgba(255,255,255,0.08)] transition-colors"
                          onClick={() => duplicateOffer(o)}
                          title="Dupliquer"
                        >
                          <svg width="16" height="16" viewBox="0 0 12 12" fill="none">
                            <rect x="3.7" y="0.7" width="7.6" height="7.6" rx="1.6" stroke="currentColor" strokeWidth="1.2" />
                            <rect x="0.7" y="3.7" width="7.6" height="7.6" rx="1.6" fill="currentColor" />
                          </svg>
                        </button>
                        <button
                          className="flex items-center justify-center size-[38px] rounded-[10px] text-white/40 hover:text-[rgba(255,120,120,0.95)] hover:bg-[rgba(255,60,60,0.12)] transition-colors"
                          onClick={() => setConfirmDeleteOffer(o.id)}
                          title="Supprimer"
                        >
                          <svg width="15" height="16" viewBox="0 0 11 12" fill="currentColor">
                            <rect x="0.6" y="2.1" width="9.8" height="2.2" rx="1.1" />
                            <rect x="3.6" y="0.4" width="3.8" height="2.1" rx="1" />
                            <path d="M1.55 4.6h7.9l-.62 6.1a1.05 1.05 0 0 1-1.04.9H3.21a1.05 1.05 0 0 1-1.04-.9L1.55 4.6Z" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ ONGLET QUÊTES ═══ */}
        {tab === 'quests' && (
          <div className="flex flex-col gap-[14px]">

            {/* Barre supérieure */}
            <div className="flex items-center justify-between h-[34px] shrink-0">
              <p className="font-ui text-[14px] text-white/40 tracking-[-0.3px]">
                {quests.length} quête{quests.length !== 1 ? 's' : ''} · tuer des mobs pour une récompense
              </p>
              {!showQuestForm && (
                <button
                  className="flex items-center gap-[7px] bg-white text-[#0e0b16] font-ui font-bold text-[14px] tracking-[-0.3px] px-[16px] h-[34px] rounded-[12px] hover:bg-white/90 active:scale-[0.98] transition-all"
                  onClick={openCreateQuest}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                    <rect x="4.85" y="1" width="2.3" height="10" rx="1.15" />
                    <rect x="1" y="4.85" width="10" height="2.3" rx="1.15" />
                  </svg>
                  Nouvelle quête
                </button>
              )}
            </div>

            {/* Formulaire de quête */}
            {showQuestForm && (
              <div className="bg-[rgba(0,0,0,0.28)] border border-[rgba(0,255,225,0.18)] rounded-[12px] p-[18px] flex flex-col gap-[14px]">
                <div className="flex items-center justify-between">
                  <p className="font-ui font-semibold text-[16px] text-white tracking-[-0.64px]">
                    {editingQuestId ? 'Modifier la quête' : 'Nouvelle quête'}
                  </p>
                  <button className="text-white/40 hover:text-white/70 transition-colors p-[4px]" onClick={cancelQuestForm}>
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor">
                      <rect x="5.3" y="-1" width="2.4" height="15" rx="1.2" transform="rotate(45 6.5 6.5)" />
                      <rect x="5.3" y="-1" width="2.4" height="15" rx="1.2" transform="rotate(-45 6.5 6.5)" />
                    </svg>
                  </button>
                </div>

                <div className="flex flex-col">
                  <p className={labelCls}>Titre <span className="text-white/30">*</span></p>
                  <input
                    className={inputCls} maxLength={80} placeholder="Ex : Chasseur de cochons"
                    value={questForm.title}
                    onChange={e => setQuestForm(f => ({ ...f, title: e.target.value }))}
                  />
                </div>

                <div className="flex flex-col">
                  <p className={labelCls}>Description</p>
                  <textarea
                    className={`${inputCls} resize-none`}
                    rows={3}
                    placeholder="Explique la quête au joueur…"
                    value={questForm.description}
                    onChange={e => setQuestForm(f => ({ ...f, description: e.target.value }))}
                  />
                </div>

                {/* Objectif : tuer N × cible (id d'entité, saisie libre) */}
                <div className="flex flex-col gap-[8px] bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-[10px] p-[12px]">
                  <p className="font-ui text-[13px] text-white/45 tracking-[-0.3px]">Objectif</p>
                  <div className="grid grid-cols-2 gap-[12px]">
                    <div className="flex flex-col">
                      <p className={labelCls}>Cible (mob) <span className="text-white/30">*</span></p>
                      <input
                        className={inputCls} maxLength={120} autoComplete="off" spellCheck={false}
                        placeholder="minecraft:pig"
                        value={questForm.target}
                        onChange={e => setQuestForm(f => ({ ...f, target: e.target.value }))}
                      />
                    </div>
                    <div className="flex flex-col">
                      <p className={labelCls}>Quantité à tuer</p>
                      <QtyInput value={questForm.amount} onChange={n => setQuestForm(f => ({ ...f, amount: n }))} min={1} />
                    </div>
                  </div>
                </div>

                {/* Récompense : item (autocomplete catalogue) + quantité + aperçu */}
                <div className="flex flex-col gap-[8px] bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-[10px] p-[12px]">
                  <p className="font-ui text-[13px] text-white/45 tracking-[-0.3px]">Récompense</p>
                  <div className="flex items-center gap-[8px]">
                    <ItemIcon desc={questRewardIcon[questForm.rewardItem]} id={questForm.rewardItem} box={34} />
                    <QtyInput value={questForm.rewardQty} onChange={n => setQuestForm(f => ({ ...f, rewardQty: n }))} min={1} />
                  </div>
                  <ItemAutocomplete
                    value={questForm.rewardItem}
                    onChange={v => setQuestForm(f => ({ ...f, rewardItem: v }))}
                    catalog={itemCatalog}
                    loading={itemCatalogLoading}
                    placeholder="Cherche un item de récompense…"
                  />
                </div>

                <p className="font-ui text-[13px] text-white/35 tracking-[-0.3px] leading-snug">
                  Le joueur doit tuer la quantité demandée du mob pour recevoir la récompense. La progression est suivie côté serveur.
                </p>

                {questMsg && <p className="font-ui text-[13px] text-[rgba(255,120,120,0.9)]">{questMsg}</p>}

                <div className="flex gap-[8px] justify-end pt-[4px]">
                  <button
                    className="font-ui text-[14px] text-white/40 px-[14px] h-[34px] rounded-[12px] hover:bg-[rgba(255,255,255,0.05)] hover:text-white/70 transition-colors"
                    onClick={cancelQuestForm}
                  >
                    Annuler
                  </button>
                  <button
                    className="font-ui font-bold text-[14px] tracking-[-0.3px] bg-white text-[#0e0b16] px-[18px] h-[34px] rounded-[12px] hover:bg-white/90 disabled:opacity-30 disabled:hover:bg-white active:scale-[0.98] transition-all"
                    disabled={savingQuest || !questForm.title.trim() || !questForm.target.trim() || !questForm.rewardItem.trim()}
                    onClick={saveQuest}
                  >
                    {savingQuest ? 'Enregistrement…' : editingQuestId ? 'Enregistrer' : 'Créer'}
                  </button>
                </div>
              </div>
            )}

            {/* Liste des quêtes */}
            {questLoading ? (
              <p className="font-ui text-[14px] text-white/25 text-center py-[40px]">Chargement…</p>
            ) : quests.length === 0 ? (
              <div className="flex flex-col items-center gap-[14px] py-[60px]">
                <p className="font-ui text-[14px] text-white/30 tracking-[-0.3px]">Aucune quête</p>
                {!showQuestForm && (
                  <button
                    className="flex items-center gap-[7px] bg-white text-[#0e0b16] font-ui font-bold text-[14px] tracking-[-0.3px] px-[16px] h-[34px] rounded-[12px] hover:bg-white/90 active:scale-[0.98] transition-all"
                    onClick={openCreateQuest}
                  >
                    Créer la première quête
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-[8px]">
                {quests.map(q => (
                  <div
                    key={q.id}
                    className="flex items-center gap-[12px] bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] rounded-[8px] p-[10px] group hover:bg-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)] transition-colors"
                  >
                    <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
                      <p className="font-ui font-semibold text-[14px] text-white tracking-[-0.3px] truncate">{q.title}</p>
                      <p className="font-ui text-[13px] text-white/40 tracking-[-0.3px] truncate">
                        Tuer {q.amount} × {q.target.replace(/^minecraft:/, '')}
                      </p>
                    </div>

                    <div className="flex items-center gap-[7px] shrink-0">
                      <ItemIcon desc={q.rewardIcon} id={q.rewardItem} box={28} />
                      <span className="font-ui font-semibold text-[14px] text-white tracking-[-0.3px] whitespace-nowrap">×{q.rewardQty}</span>
                      <span className="font-ui text-[13px] text-white/35 truncate max-w-[140px]">{q.rewardItem.replace(/^minecraft:/, '')}</span>
                    </div>

                    {confirmDeleteQuest === q.id ? (
                      <div className="flex gap-[6px] items-center shrink-0">
                        <span className="font-ui text-[14px] text-white/40">Supprimer ?</span>
                        <button
                          className="font-ui text-[14px] text-[rgba(255,100,100,0.8)] hover:text-[rgba(255,120,120,1)] px-[10px] py-[5px] rounded-[8px] bg-[rgba(255,60,60,0.1)] border border-[rgba(255,60,60,0.2)] transition-colors"
                          onClick={() => doDeleteQuest(q.id)}
                        >
                          Confirmer
                        </button>
                        <button
                          className="font-ui text-[14px] text-white/30 hover:text-white/60 px-[10px] py-[5px] rounded-[8px] hover:bg-[rgba(255,255,255,0.05)] transition-colors"
                          onClick={() => setConfirmDeleteQuest(null)}
                        >
                          Annuler
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-[6px] opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          className="flex items-center justify-center size-[38px] rounded-[10px] text-white/40 hover:text-white hover:bg-[rgba(255,255,255,0.08)] transition-colors"
                          onClick={() => openEditQuest(q)}
                          title="Modifier"
                        >
                          <svg width="16" height="16" viewBox="0 0 12 12" fill="currentColor">
                            <path d="M7.9 1.35 10.65 4.1 9.25 5.5 6.5 2.75 7.9 1.35Z" />
                            <path d="M5.85 3.4 8.6 6.15 3.35 11.4l-2.85.6.6-2.85L5.85 3.4Z" />
                          </svg>
                        </button>
                        <button
                          className="flex items-center justify-center size-[38px] rounded-[10px] text-white/40 hover:text-[rgba(255,120,120,0.95)] hover:bg-[rgba(255,60,60,0.12)] transition-colors"
                          onClick={() => setConfirmDeleteQuest(q.id)}
                          title="Supprimer"
                        >
                          <svg width="15" height="16" viewBox="0 0 11 12" fill="currentColor">
                            <rect x="0.6" y="2.1" width="9.8" height="2.2" rx="1.1" />
                            <rect x="3.6" y="0.4" width="3.8" height="2.1" rx="1" />
                            <path d="M1.55 4.6h7.9l-.62 6.1a1.05 1.05 0 0 1-1.04.9H3.21a1.05 1.05 0 0 1-1.04-.9L1.55 4.6Z" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ ONGLET FONDS D'ÉCRAN ═══ */}
        {tab === 'backgrounds' && (
          <div className="flex flex-col gap-[14px]">

            {/* Barre supérieure */}
            <div className="flex items-center min-h-[34px] shrink-0">
              <p className="font-ui text-[14px] text-white/40 tracking-[-0.3px]">
                {backgrounds.length} fond{backgrounds.length !== 1 ? 's' : ''} d'écran — un est tiré au hasard à chaque lancement du launcher
              </p>
            </div>

            {/* Zone de dépôt (upload immédiat) */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => bgFileInputRef.current?.click()}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); bgFileInputRef.current?.click() } }}
              onDragOver={e => { e.preventDefault(); setBgDragging(true) }}
              onDragLeave={() => setBgDragging(false)}
              onDrop={e => { e.preventDefault(); setBgDragging(false); uploadBackground(e.dataTransfer.files?.[0]) }}
              className={`flex flex-col items-center justify-center gap-[7px] rounded-[10px] border border-dashed px-[16px] py-[22px] cursor-pointer text-center outline-none transition-colors ${bgDragging ? 'border-[rgba(0,255,225,0.55)] bg-[rgba(0,255,225,0.07)]' : 'border-[rgba(255,255,255,0.2)] bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.06)]'}`}
            >
              {bgUploading ? (
                <p className="font-ui text-[14px] text-white/70">Envoi en cours…</p>
              ) : (
                <>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="text-white/45">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="m21 15-5-5L5 21" />
                  </svg>
                  <p className="font-ui text-[14px] text-white/70 tracking-[-0.3px]">
                    Glisse une image, colle (Ctrl+V) ou clique pour ajouter un fond
                  </p>
                  <p className="font-ui text-[13px] text-white/35">PNG, JPEG, GIF ou WebP — 4 Mo max · format paysage conseillé</p>
                </>
              )}
            </div>

            <input
              ref={bgFileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              className="hidden"
              onChange={e => { uploadBackground(e.target.files?.[0]); e.currentTarget.value = '' }}
            />

            {bgError && (
              <p className="font-ui text-[13px] text-[rgba(255,120,120,0.9)]">{bgError}</p>
            )}

            {/* Galerie */}
            {backgroundsLoading ? (
              <p className="font-ui text-[14px] text-white/25 text-center py-[40px]">Chargement…</p>
            ) : backgrounds.length === 0 ? (
              <p className="font-ui text-[14px] text-white/30 text-center py-[40px] tracking-[-0.3px]">
                Aucun fond d'écran — le fond par défaut du launcher est utilisé
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-[10px]">
                {backgrounds.map(bg => (
                  <div
                    key={bg.id}
                    className="relative aspect-[16/10] rounded-[10px] overflow-hidden border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.04)] group"
                  >
                    <RemoteNewsImage src={bg.url} className="size-full object-cover" fallback={null} />
                    {confirmDeleteBg === bg.id ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-[8px] bg-black/72 px-[10px] text-center">
                        <p className="font-ui text-[13px] text-white tracking-[-0.3px]">Supprimer ce fond ?</p>
                        <div className="flex gap-[6px]">
                          <button
                            onClick={() => setConfirmDeleteBg(null)}
                            className="font-ui text-[13px] text-white/70 px-[12px] h-[30px] rounded-[8px] border border-[rgba(255,255,255,0.18)] hover:bg-[rgba(255,255,255,0.08)] transition-colors"
                          >
                            Annuler
                          </button>
                          <button
                            onClick={() => deleteBackground(bg.id)}
                            className="font-ui font-bold text-[13px] text-white px-[12px] h-[30px] rounded-[8px] bg-[rgba(255,60,60,0.85)] hover:bg-[rgba(255,60,60,1)] transition-colors"
                          >
                            Supprimer
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteBg(bg.id)}
                        title="Supprimer"
                        className="absolute top-[6px] right-[6px] flex items-center justify-center size-[28px] rounded-[8px] text-white/85 bg-black/45 opacity-0 group-hover:opacity-100 hover:bg-[rgba(255,60,60,0.6)] transition-all"
                      >
                        <svg width="13" height="14" viewBox="0 0 11 12" fill="currentColor">
                          <rect x="0.6" y="2.1" width="9.8" height="2.2" rx="1.1" />
                          <rect x="3.6" y="0.4" width="3.8" height="2.1" rx="1" />
                          <path d="M1.55 4.6h7.9l-.62 6.1a1.05 1.05 0 0 1-1.04.9H3.21a1.05 1.05 0 0 1-1.04-.9L1.55 4.6Z" />
                        </svg>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
