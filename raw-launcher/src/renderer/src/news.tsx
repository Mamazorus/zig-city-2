// ── Catégories d'actualités — source unique partagée (cartes, modale, dashboard) ──

export type NewsCategory = 'update' | 'event' | 'shop' | 'infra' | 'info'

export interface CategoryMeta {
  key: NewsCategory
  label: string
  /** Teinte d'accent au format "r,g,b" — composée à la volée en rgba(...). */
  rgb: string
}

export const NEWS_CATEGORIES: Record<NewsCategory, CategoryMeta> = {
  update: { key: 'update', label: 'Mise à jour',    rgb: '0,255,225' },
  event:  { key: 'event',  label: 'Événement',      rgb: '255,176,72' },
  shop:   { key: 'shop',   label: 'Shop',           rgb: '188,142,255' },
  infra:  { key: 'infra',  label: 'Infrastructure', rgb: '142,166,196' },
  info:   { key: 'info',   label: 'Actualité',      rgb: '208,210,224' },
}

/** Ordre d'affichage dans le sélecteur du dashboard. */
export const CATEGORY_ORDER: NewsCategory[] = ['update', 'event', 'shop', 'infra', 'info']

const KEYWORD_RULES: { cat: NewsCategory; re: RegExp }[] = [
  { cat: 'update', re: /(mise\s*à\s*jour|update|\bmaj\b|version|patch|\b\d+\.\d+\b|nouvelle dimension)/i },
  { cat: 'event',  re: /(événement|evenement|\bevent\b|tournoi|concours|chasse|défi|defi|saison)/i },
  { cat: 'shop',   re: /(\bshop\b|boutique|vente|solde|promo|ressource|coffre|zigcoin)/i },
  { cat: 'infra',  re: /(infra|serveur|maintenance|migration|backup|sauvegarde|\btps\b|latence|performance)/i },
]

/**
 * Résout la catégorie d'une actu : champ explicite prioritaire, sinon
 * inférence par mots-clés du titre, sinon "Actualité" par défaut.
 */
export function resolveCategory(raw?: { category?: string; title?: string } | null): CategoryMeta {
  const explicit = raw?.category as NewsCategory | undefined
  if (explicit && NEWS_CATEGORIES[explicit]) return NEWS_CATEGORIES[explicit]

  const title = raw?.title ?? ''
  for (const { cat, re } of KEYWORD_RULES) {
    if (re.test(title)) return NEWS_CATEGORIES[cat]
  }
  return NEWS_CATEGORIES.info
}

// ── Badge de catégorie : pastille teintée + libellé en petites capitales ──

export function CategoryBadge({
  category,
  size = 'sm',
}: {
  category: NewsCategory
  size?: 'sm' | 'md'
}) {
  const meta = NEWS_CATEGORIES[category] ?? NEWS_CATEGORIES.info
  const md = size === 'md'
  return (
    <span
      className={`inline-flex items-center self-start whitespace-nowrap rounded-full font-ui font-semibold uppercase ${
        md ? 'gap-[7px] text-[13px] px-[11px] py-[5px] tracking-[0.7px]' : 'gap-[6px] text-[12px] px-[9px] py-[3px] tracking-[0.6px]'
      }`}
      style={{
        color: `rgb(${meta.rgb})`,
        background: `rgba(${meta.rgb},0.10)`,
        border: `1px solid rgba(${meta.rgb},0.24)`,
      }}
    >
      <span
        className="rounded-full shrink-0"
        style={{
          width: md ? 6 : 5,
          height: md ? 6 : 5,
          background: `rgb(${meta.rgb})`,
          boxShadow: `0 0 7px rgba(${meta.rgb},0.8)`,
        }}
      />
      {meta.label}
    </span>
  )
}

// ── Visuel de repli (aucune image) : aplat sombre teinté, sans dégradé multicolore ──

export function NewsFallback({ category }: { category: NewsCategory }) {
  const meta = NEWS_CATEGORIES[category] ?? NEWS_CATEGORIES.info
  return (
    <div className="absolute inset-0 flex items-center justify-center" style={{ background: '#16161b' }}>
      {/* Lueur monochrome très discrète, ancrée sur la teinte de la catégorie */}
      <div
        className="absolute inset-0"
        style={{ background: `radial-gradient(ellipse 70% 60% at 50% 42%, rgba(${meta.rgb},0.14), transparent 72%)` }}
      />
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" style={{ color: `rgba(${meta.rgb},0.45)` }}>
        <rect x="3" y="4.5" width="18" height="15" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="8.5" cy="9.5" r="1.6" fill="currentColor" />
        <path d="M4 17l4.5-4.5 3.5 3.5 3-3L20 16.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}
