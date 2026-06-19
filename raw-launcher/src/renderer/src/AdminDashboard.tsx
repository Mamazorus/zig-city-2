import { useState, useEffect } from 'react'
import { NEWS_CATEGORIES, CATEGORY_ORDER, resolveCategory, CategoryBadge, NewsFallback, type NewsCategory } from './news'
import { Avatar, RemoteNewsImage } from './remote-image'

type AdminTab = 'news' | 'admins'

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

const inputCls =
  'w-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[12px] py-[8px] text-white font-ui text-[14px] tracking-[-0.3px] focus:outline-none focus:border-[rgba(0,255,225,0.4)] placeholder:text-white/25 transition-colors'

const labelCls = 'font-ui text-[12px] text-white/40 tracking-[-0.3px] mb-[6px]'

function todayLabel() {
  const d = new Date()
  const months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre']
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
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
  const [newAdminName, setNewAdminName] = useState('')
  const [addingAdmin, setAddingAdmin] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [confirmRemoveAdmin, setConfirmRemoveAdmin] = useState<string | null>(null)

  const fetchAll = async () => {
    setLoading(true)
    try {
      const [nr, ar] = await Promise.all([
        window.launcher.getNews(),
        window.launcher.getAdmins(),
      ])
      if (nr.success) setNews(nr.news)
      if (ar.success) setAdmins(Object.keys(ar.admins).filter(k => ar.admins[k]))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchAll() }, [])

  const openCreate = () => {
    setForm({ ...EMPTY_FORM, date: todayLabel() })
    setEditingId(null)
    setShowForm(true)
    setConfirmDeleteId(null)
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
  }

  const cancelForm = () => {
    setShowForm(false)
    setEditingId(null)
  }

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

  return (
    <div className="backdrop-blur-[5.95px] bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-[16px] shadow-[2px_2px_8px_0px_rgba(0,0,0,0.1)] flex flex-col h-full overflow-hidden">

      {/* ── EN-TÊTE ── */}
      <div className="flex items-center justify-between px-[24px] py-[16px] shrink-0">
        {/* Titre de panneau + sous-titre contextuel (le pseudo est déjà dans la barre de nav) */}
        <div className="flex flex-col gap-[2px]">
          <p className="font-ui font-semibold text-[16px] text-white tracking-[-0.64px] leading-none">Administration</p>
          <p className="font-ui text-[12px] text-white/40 tracking-[-0.3px]">
            {tab === 'news' ? 'Gestion du contenu' : 'Gestion des accès'}
          </p>
        </div>

        <div className="flex gap-[3px] bg-[rgba(0,0,0,0.22)] border border-[rgba(255,255,255,0.06)] rounded-full p-[3px]">
          {(['news', 'admins'] as AdminTab[]).map(t => (
            <button
              key={t}
              className={`font-ui text-[12px] tracking-[-0.3px] px-[14px] h-[28px] rounded-full transition-colors ${
                tab === t
                  ? 'bg-[rgba(255,255,255,0.12)] text-white font-semibold'
                  : 'text-white/40 hover:text-white/70'
              }`}
              onClick={() => { setTab(t); setShowForm(false); setConfirmDeleteId(null); setConfirmRemoveAdmin(null) }}
            >
              {t === 'news' ? 'Actualités' : 'Administrateurs'}
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
              <p className="font-ui text-[12px] text-white/40 tracking-[-0.3px]">
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
                          className="flex items-center gap-[7px] rounded-[8px] px-[11px] py-[6px] font-ui text-[12px] font-medium tracking-[-0.2px] transition-all active:scale-[0.97]"
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
                  <p className={labelCls}>URL de l'image (optionnel — imgur, discord CDN…)</p>
                  <div className="flex gap-[8px] items-center">
                    <input
                      className={inputCls}
                      placeholder="https://i.imgur.com/…"
                      value={form.imageUrl}
                      onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))}
                    />
                    {form.imageUrl && (
                      <div className="size-[36px] rounded-[8px] overflow-hidden shrink-0 border border-[rgba(255,255,255,0.12)]">
                        <RemoteNewsImage src={form.imageUrl} className="size-full object-cover" fallback={null} />
                      </div>
                    )}
                  </div>
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
              <p className="font-ui text-[13px] text-white/25 text-center py-[40px]">Chargement…</p>
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
                        <p className="font-ui text-[12px] text-white/40 truncate tracking-[-0.3px]">{item.date}{item.author ? ` · ${item.author}` : ''}</p>
                      </div>
                    </div>

                    {/* Actions */}
                    {confirmDeleteId === item.id ? (
                      <div className="flex gap-[6px] items-center shrink-0">
                        <span className="font-ui text-[12px] text-white/40">Supprimer ?</span>
                        <button
                          className="font-ui text-[12px] text-[rgba(255,100,100,0.8)] hover:text-[rgba(255,120,120,1)] px-[10px] py-[5px] rounded-[8px] bg-[rgba(255,60,60,0.1)] border border-[rgba(255,60,60,0.2)] transition-colors"
                          onClick={() => doDeleteNews(item.id)}
                        >
                          Confirmer
                        </button>
                        <button
                          className="font-ui text-[12px] text-white/30 hover:text-white/60 px-[10px] py-[5px] rounded-[8px] hover:bg-[rgba(255,255,255,0.05)] transition-colors"
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
              <p className="font-ui text-[12px] text-white/40 tracking-[-0.3px]">
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
              <p className="font-ui text-[13px] text-white/25 text-center py-[40px]">Chargement…</p>
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
                        <span className="font-normal text-[12px] text-white/30 ml-[8px]">(vous)</span>
                      )}
                    </p>

                    {name === username ? (
                      <span className="font-ui text-[12px] text-white/30 px-[10px] h-[26px] inline-flex items-center rounded-full border border-[rgba(255,255,255,0.08)]">
                        Protégé
                      </span>
                    ) : confirmRemoveAdmin === name ? (
                      <div className="flex gap-[6px] items-center shrink-0">
                        <span className="font-ui text-[12px] text-white/40">Retirer ?</span>
                        <button
                          className="font-ui text-[12px] text-[rgba(255,100,100,0.8)] px-[10px] py-[5px] rounded-[8px] bg-[rgba(255,60,60,0.1)] border border-[rgba(255,60,60,0.2)] hover:text-[rgba(255,120,120,1)] transition-colors"
                          onClick={() => doRemoveAdmin(name)}
                        >
                          Confirmer
                        </button>
                        <button
                          className="font-ui text-[12px] text-white/30 hover:text-white/60 px-[10px] py-[5px] rounded-[8px] hover:bg-[rgba(255,255,255,0.05)] transition-colors"
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

      </div>
    </div>
  )
}
