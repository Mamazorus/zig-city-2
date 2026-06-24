// Affichage d'une icône d'item, partagé par le dashboard admin et l'accueil.
// S'appuie sur le descripteur fourni par le main (get-item-icons / get-shop) :
// sprite plat 2D (item-objet) ou modèle de bloc rendu en 3D isométrique.
import { useBlockIcon, type ItemIconDesc } from './block-renderer'

// Résout le dataURL d'affichage d'un descripteur : src direct (plat) ou bloc
// rendu en 3D (via useBlockIcon, mis en cache). Le hook est TOUJOURS appelé
// (model=null pour un plat → ne rend rien) pour respecter l'ordre des hooks.
// undefined tant que rien n'est prêt / pas d'icône.
export function useItemIconSrc(id: string | undefined, desc: ItemIconDesc | '' | null | undefined): string | undefined {
  const model = desc && typeof desc === 'object' && desc.kind === 'block' ? desc : null
  const blockUrl = useBlockIcon(id ?? '', model, 56)
  if (model) return blockUrl ?? undefined
  return desc && typeof desc === 'object' && desc.kind === 'flat' ? desc.src : undefined
}

// Icône d'item dans une boîte carrée (dashboard admin). Boîte tenue à ≥ 22 px
// (zoom 0,79 de la fenêtre) pour ne pas réduire sous 16 px réels et rester nette.
export function ItemIcon({ desc, id, box = 22 }: { desc?: ItemIconDesc | '' | null; id?: string; box?: number }) {
  const src = useItemIconSrc(id, desc)
  return (
    <span
      className="shrink-0 inline-block overflow-hidden rounded-[4px] bg-[rgba(255,255,255,0.05)]"
      style={{ width: box, height: box }}
    >
      {src && (
        <img src={src} alt="" draggable={false} className="block w-full h-auto select-none [image-rendering:pixelated]" />
      )}
    </span>
  )
}
