import { useState, useEffect } from 'react'
import playerImage from './assets/player.png'

type AdminTab = 'news' | 'admins'

interface NewsItem {
  id: string
  title: string
  date: string
  body: string
  imageUrl?: string
  author?: string
  createdAt?: number
}

interface NewsForm {
  title: string
  date: string
  body: string
  imageUrl: string
}

const EMPTY_FORM: NewsForm = { title: '', date: '', body: '', imageUrl: '' }

const inputCls =
  'w-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-[8px] px-[12px] py-[8px] text-white font-ui text-[14px] tracking-[-0.3px] focus:outline-none focus:border-[rgba(0,255,225,0.4)] placeholder:text-white/25 transition-colors'

const labelCls = 'font-ui text-[12px] text-white/45 tracking-[-0.2px] mb-[5px]'

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
    setForm({ title: item.title, date: item.date, body: item.body, imageUrl: item.imageUrl ?? '' })
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
      const payload = { title: form.title.trim(), date: form.date.trim(), body: form.body.trim(), imageUrl: form.imageUrl.trim(), author: username }
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
      <div className="flex items-center justify-between px-[24px] py-[18px] border-b border-[rgba(255,255,255,0.08)] shrink-0">
        <div className="flex items-center gap-[12px]">
          <svg width="18" height="16" viewBox="0 0 18 16" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M9 1.5L11.5 7.5L17 5L15 13H3L1 5L6.5 7.5L9 1.5Z" fill="rgba(255,255,255,0.6)"/>
            <rect x="2" y="14" width="14" height="1.5" rx="0.75" fill="rgba(255,255,255,0.6)"/>
          </svg>
          <p className="font-ui font-bold text-[18px] text-white tracking-[-0.7px]">Administration</p>
          <span className="font-ui text-[12px] text-white/30 tracking-[-0.3px]">{username}</span>
        </div>

        <div className="flex gap-[3px] bg-[rgba(0,0,0,0.25)] rounded-[10px] p-[3px]">
          {(['news', 'admins'] as AdminTab[]).map(t => (
            <button
              key={t}
              className={`font-ui text-[13px] px-[14px] py-[6px] rounded-[7px] transition-colors ${
                tab === t
                  ? 'bg-[rgba(255,255,255,0.12)] text-white font-semibold'
                  : 'text-white/35 hover:text-white/55'
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
            <div className="flex items-center justify-between shrink-0">
              <p className="font-ui text-[12px] text-white/35">
                {news.length} actualité{news.length !== 1 ? 's' : ''} publiée{news.length !== 1 ? 's' : ''}
              </p>
              {!showForm && (
                <button
                  className="flex items-center gap-[7px] bg-[rgba(0,255,225,0.08)] border border-[rgba(0,255,225,0.22)] text-[rgba(0,255,225,0.8)] font-ui font-semibold text-[13px] px-[14px] py-[7px] rounded-[9px] hover:bg-[rgba(0,255,225,0.14)] active:scale-[0.97] transition-all"
                  onClick={openCreate}
                >
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                    <path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                  </svg>
                  Nouvelle actualité
                </button>
              )}
            </div>

            {/* ── Formulaire ── */}
            {showForm && (
              <div className="bg-[rgba(0,0,0,0.28)] border border-[rgba(255,255,255,0.1)] rounded-[12px] p-[18px] flex flex-col gap-[12px]">
                <div className="flex items-center justify-between">
                  <p className="font-ui font-semibold text-[14px] text-white tracking-[-0.5px]">
                    {editingId ? 'Modifier l\'actualité' : 'Nouvelle actualité'}
                  </p>
                  <button
                    className="text-white/35 hover:text-white/65 transition-colors p-[4px]"
                    onClick={cancelForm}
                  >
                    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                      <path d="M1 1l11 11M12 1L1 12" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                    </svg>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-[12px]">
                  <div className="flex flex-col">
                    <p className={labelCls}>Titre *</p>
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
                  <p className={labelCls}>URL de l'image (optionnel — imgur, discord CDN…)</p>
                  <div className="flex gap-[8px] items-center">
                    <input
                      className={inputCls}
                      placeholder="https://i.imgur.com/…"
                      value={form.imageUrl}
                      onChange={e => setForm(f => ({ ...f, imageUrl: e.target.value }))}
                    />
                    {form.imageUrl && (
                      <div className="size-[36px] rounded-[6px] overflow-hidden shrink-0 border border-[rgba(255,255,255,0.12)]">
                        <img
                          src={form.imageUrl}
                          alt=""
                          className="size-full object-cover"
                          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
                        />
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex flex-col">
                  <p className={labelCls}>Contenu *</p>
                  <textarea
                    className={`${inputCls} resize-none`}
                    rows={4}
                    placeholder="Décrivez la nouveauté…"
                    value={form.body}
                    onChange={e => setForm(f => ({ ...f, body: e.target.value }))}
                  />
                </div>

                <div className="flex gap-[8px] justify-end pt-[2px]">
                  <button
                    className="font-ui text-[13px] text-white/35 px-[14px] py-[7px] rounded-[8px] hover:bg-[rgba(255,255,255,0.05)] transition-colors"
                    onClick={cancelForm}
                  >
                    Annuler
                  </button>
                  <button
                    className="font-ui font-semibold text-[13px] bg-[rgba(0,255,225,0.1)] border border-[rgba(0,255,225,0.25)] text-[rgba(0,255,225,0.85)] px-[16px] py-[7px] rounded-[8px] hover:bg-[rgba(0,255,225,0.17)] disabled:opacity-35 active:scale-[0.97] transition-all"
                    disabled={saving || !form.title.trim() || !form.body.trim()}
                    onClick={saveNews}
                  >
                    {saving ? 'Enregistrement…' : editingId ? 'Enregistrer' : 'Publier →'}
                  </button>
                </div>
              </div>
            )}

            {/* ── Liste des actualités ── */}
            {loading ? (
              <p className="font-ui text-[13px] text-white/25 text-center py-[40px]">Chargement…</p>
            ) : news.length === 0 ? (
              <div className="flex flex-col items-center gap-[10px] py-[56px]">
                <p className="font-ui text-[15px] text-white/20">Aucune actualité publiée</p>
                {!showForm && (
                  <button
                    className="font-ui text-[13px] text-[rgba(0,255,225,0.5)] hover:text-[rgba(0,255,225,0.8)] transition-colors"
                    onClick={openCreate}
                  >
                    Créer la première →
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-[7px]">
                {news.map(item => (
                  <div
                    key={item.id}
                    className="flex items-center gap-[12px] bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] rounded-[10px] p-[11px] group hover:border-[rgba(255,255,255,0.13)] transition-colors"
                  >
                    {/* Miniature */}
                    <div className="size-[50px] rounded-[6px] overflow-hidden shrink-0 bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)]">
                      {item.imageUrl ? (
                        <img src={item.imageUrl} alt="" className="size-full object-cover" />
                      ) : (
                        <div
                          className="size-full"
                          style={{ background: 'linear-gradient(135deg, rgba(0,255,225,0.18), rgba(255,200,0,0.18))' }}
                        />
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="font-ui font-semibold text-[13px] text-white tracking-[-0.4px] truncate">{item.title}</p>
                      <p className="font-ui text-[11px] text-white/30 mt-[2px]">{item.date}{item.author ? ` · ${item.author}` : ''}</p>
                    </div>

                    {/* Actions */}
                    {confirmDeleteId === item.id ? (
                      <div className="flex gap-[6px] items-center shrink-0">
                        <span className="font-ui text-[12px] text-white/40">Supprimer ?</span>
                        <button
                          className="font-ui text-[12px] text-[rgba(255,100,100,0.8)] hover:text-[rgba(255,120,120,1)] px-[10px] py-[5px] rounded-[6px] bg-[rgba(255,60,60,0.1)] border border-[rgba(255,60,60,0.2)] transition-colors"
                          onClick={() => doDeleteNews(item.id)}
                        >
                          Confirmer
                        </button>
                        <button
                          className="font-ui text-[12px] text-white/30 hover:text-white/60 px-[10px] py-[5px] rounded-[6px] hover:bg-[rgba(255,255,255,0.05)] transition-colors"
                          onClick={() => setConfirmDeleteId(null)}
                        >
                          Annuler
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-[5px] opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          className="flex items-center justify-center size-[30px] rounded-[6px] bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.09)] text-white/50 hover:text-white hover:bg-[rgba(255,255,255,0.1)] transition-colors"
                          onClick={() => openEdit(item)}
                          title="Modifier"
                        >
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M8.5 1.5L10.5 3.5L3.5 10.5H1.5V8.5L8.5 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                        <button
                          className="flex items-center justify-center size-[30px] rounded-[6px] bg-[rgba(0,255,225,0.05)] border border-[rgba(0,255,225,0.14)] text-[rgba(0,255,225,0.65)] hover:text-[rgba(0,255,225,0.95)] hover:bg-[rgba(0,255,225,0.14)] transition-colors"
                          onClick={() => duplicateNews(item)}
                          disabled={saving}
                          title="Dupliquer"
                        >
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                            <path d="M4 1H1.5C1.22 1 1 1.22 1 1.5v8C1 9.78 1.22 10 1.5 10h6c.28 0 .5-.22.5-.5V7M8 1H4.5C4.22 1 4 1.22 4 1.5V7h3.5C7.78 7 8 6.78 8 6.5V1.5C8 1.22 7.78 1 7.5 1Z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </button>
                        <button
                          className="flex items-center justify-center size-[30px] rounded-[6px] bg-[rgba(255,60,60,0.07)] border border-[rgba(255,60,60,0.14)] text-[rgba(255,100,100,0.65)] hover:text-[rgba(255,120,120,0.95)] hover:bg-[rgba(255,60,60,0.14)] transition-colors"
                          onClick={() => setConfirmDeleteId(item.id)}
                          title="Supprimer"
                        >
                          <svg width="11" height="12" viewBox="0 0 11 12" fill="none">
                            <path d="M.5 3h10M3.5 3V2h4V3M4 5.5v4M7 5.5v4M1.5 3l.7 6.5a1 1 0 001 .9h4.6a1 1 0 001-.9L9.5 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
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

        {/* ═══ ONGLET ADMINISTRATEURS ═══ */}
        {tab === 'admins' && (
          <div className="flex flex-col gap-[14px]">

            <div className="flex items-center justify-between shrink-0">
              <p className="font-ui text-[12px] text-white/35">
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
                className="shrink-0 font-ui font-semibold text-[13px] bg-[rgba(0,255,225,0.08)] border border-[rgba(0,255,225,0.22)] text-[rgba(0,255,225,0.8)] px-[16px] py-[8px] rounded-[9px] hover:bg-[rgba(0,255,225,0.14)] disabled:opacity-35 active:scale-[0.97] transition-all"
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
              <div className="flex flex-col gap-[7px]">
                {admins.map(name => (
                  <div
                    key={name}
                    className="flex items-center gap-[12px] bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] rounded-[10px] p-[11px]"
                  >
                    <div className="size-[40px] rounded-[6px] overflow-hidden shrink-0">
                      <img
                        src={`https://mc-heads.net/avatar/${encodeURIComponent(name)}/64`}
                        alt=""
                        className="size-full object-cover"
                        onError={e => { (e.currentTarget as HTMLImageElement).src = playerImage }}
                      />
                    </div>
                    <p className="font-ui font-semibold text-[14px] text-white tracking-[-0.4px] flex-1">
                      {name}
                      {name === username && (
                        <span className="font-normal text-[11px] text-white/30 ml-[8px]">(vous)</span>
                      )}
                    </p>

                    {name === username ? (
                      <span className="font-ui text-[11px] text-white/20 px-[10px] py-[5px] rounded-[6px] border border-[rgba(255,255,255,0.06)]">
                        Protégé
                      </span>
                    ) : confirmRemoveAdmin === name ? (
                      <div className="flex gap-[6px] items-center shrink-0">
                        <span className="font-ui text-[12px] text-white/40">Retirer ?</span>
                        <button
                          className="font-ui text-[12px] text-[rgba(255,100,100,0.8)] px-[10px] py-[5px] rounded-[6px] bg-[rgba(255,60,60,0.1)] border border-[rgba(255,60,60,0.2)] hover:text-[rgba(255,120,120,1)] transition-colors"
                          onClick={() => doRemoveAdmin(name)}
                        >
                          Confirmer
                        </button>
                        <button
                          className="font-ui text-[12px] text-white/30 hover:text-white/60 px-[10px] py-[5px] rounded-[6px] hover:bg-[rgba(255,255,255,0.05)] transition-colors"
                          onClick={() => setConfirmRemoveAdmin(null)}
                        >
                          Annuler
                        </button>
                      </div>
                    ) : (
                      <button
                        className="flex items-center justify-center size-[30px] rounded-[6px] bg-[rgba(255,60,60,0.07)] border border-[rgba(255,60,60,0.14)] text-[rgba(255,100,100,0.65)] hover:text-[rgba(255,120,120,0.95)] hover:bg-[rgba(255,60,60,0.14)] transition-colors"
                        onClick={() => setConfirmRemoveAdmin(name)}
                        title="Retirer les droits admin"
                      >
                        <svg width="11" height="12" viewBox="0 0 11 12" fill="none">
                          <path d="M.5 3h10M3.5 3V2h4V3M4 5.5v4M7 5.5v4M1.5 3l.7 6.5a1 1 0 001 .9h4.6a1 1 0 001-.9L9.5 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
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
