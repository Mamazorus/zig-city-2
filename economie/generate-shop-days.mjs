// Génère/complète le shop du jour ROTATIF pour 6 marchands et l'ajoute dans Firebase :
//   - Bazar      (npc=bazar)      : NB_RACHATS/jour    (le joueur DONNE des items d'effort, REÇOIT des coins)
//   - Échoppe    (npc=echoppe)    : NB_VENTES/jour      (le joueur DONNE des coins,           REÇOIT l'item)
//   - Receleur   (npc=receleur)   : NB_RECEL/jour       (butin RARE de donjon/boss ; quota PAR JOUEUR/jour)
//   - Antiquaire (npc=antiquaire) : NB_ANTIQUAIRE/jour  (rachat : archéologie/curiosités de grottes)
//   - Disquaire  (npc=disquaire)  : NB_DISQUAIRE/jour   (rachat : disques musicaux trouvés en exploration)
//   - Troc       (npc=troc)       : NB_TROC/jour        (rachat façon Bazar : loot de combat/exploration)
// Antiquaire/Disquaire/Troc sont TOUS des RACHATS (comme Bazar/Receleur) : le joueur DONNE, REÇOIT des coins.
// Tirage ALÉATOIRE DÉTERMINISTE par jour (seeded) → chaque jour est bien distinct, mais reproductible.
// Couvre DAYS jours depuis START.
//   node economie/generate-shop-days.mjs          (écrit dans Firebase)
//   node economie/generate-shop-days.mjs --dry    (aperçu, n'écrit RIEN)
//
// ⚠️ ÉCRITURE NON DESTRUCTIVE : on fait un PATCH /shop/days/{date} par jour (fusion au niveau des
// clés d'offre) → ça PRÉSERVE les autres marchands déjà posés sur ces jours (ex. « alcool »).
// On NE touche PAS à /npcs (rôles déjà bons), ni à /shop/store (marchand « arme »), ni à /shop/race.
// Les clés d'offre sont déterministes (b-/e-/r-/an-/di-/tr- + id) → rejouable sans doublon.
//
// NB : le mod ne résout que des IDS D'ITEMS SIMPLES (BuiltInRegistries.ITEM), AUCUN composant NBT
// → pas de potions à effet, pas de livres enchantés précis, pas d'équipement pré-enchanté.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const START = '2026-07-17'
const DAYS = 14
const NB_RACHATS = 9
const NB_VENTES = 10
const NB_RECEL = 6 // rachats « premium » du Receleur tirés par jour
const NB_ANTIQUAIRE = 7
const NB_DISQUAIRE = 6
const NB_TROC = 6
const END_FROM = 0 // l'End est déjà accessible (mi-saison) → tous les items dès le 1er jour
const COIN = 'crazythings:crazy_coin'
const DRY = process.argv.includes('--dry') // aperçu sans écrire dans Firebase

// ── RACHATS Bazar (gagner des coins) : que du « vert » d'EFFORT (mobs/pêche/exploration), ──
// non-automatisable en masse, quota bas → robinet borné. Aucun matériau d'usine (anti-inflation).
const RACHATS = [
  { item: 'minecraft:cod', qty: 32, coins: 3, max: 3 },
  { item: 'minecraft:salmon', qty: 24, coins: 3, max: 3 },
  { item: 'minecraft:pufferfish', qty: 12, coins: 3, max: 3 },
  { item: 'minecraft:tropical_fish', qty: 12, coins: 3, max: 3 },
  { item: 'minecraft:ghast_tear', qty: 2, coins: 6, max: 3 },
  { item: 'minecraft:blaze_rod', qty: 8, coins: 4, max: 4 },
  { item: 'minecraft:magma_cream', qty: 8, coins: 3, max: 3 },
  { item: 'minecraft:honeycomb', qty: 16, coins: 2, max: 3 },
  { item: 'minecraft:amethyst_shard', qty: 16, coins: 2, max: 3 },
  { item: 'minecraft:prismarine_crystals', qty: 8, coins: 3, max: 3 },
  { item: 'minecraft:prismarine_shard', qty: 16, coins: 2, max: 3 },
  { item: 'minecraft:glowstone_dust', qty: 32, coins: 2, max: 3 },
  { item: 'minecraft:rabbit_foot', qty: 1, coins: 3, max: 3 },
  { item: 'minecraft:spider_eye', qty: 16, coins: 1, max: 3 },
  { item: 'minecraft:slime_ball', qty: 16, coins: 2, max: 3 },
  { item: 'minecraft:turtle_scute', qty: 1, coins: 4, max: 3 }, // pas de phantom_membrane (spawns bloqués)
  { item: 'minecraft:ink_sac', qty: 32, coins: 1, max: 3 },
  { item: 'minecraft:glow_ink_sac', qty: 8, coins: 2, max: 3 },
  { item: 'minecraft:ancient_debris', qty: 1, coins: 8, max: 2 },
  { item: 'minecraft:shulker_shell', qty: 1, coins: 6, max: 3, from: END_FROM }, // End
  { item: 'minecraft:chorus_fruit', qty: 16, coins: 2, max: 3, from: END_FROM }, // End
  { item: 'minecraft:popped_chorus_fruit', qty: 16, coins: 2, max: 3, from: END_FROM } // End
]

// ── VENTES Échoppe (dépenser des coins) : UTILE, pas de déco (la déco est donnée aux joueurs). ──
// Le mod ne gère pas le NBT → « enchantements » = matériel pour enchanter SOI-MÊME ; « équipement »
// = vanilla NON-enchanté. On ne double PAS le marchand « arme » (armes à feu Point Blank).
const VENTES = [
  // Équipement — armure diamant
  { item: 'minecraft:diamond_helmet', qty: 1, price: 12 },
  { item: 'minecraft:diamond_chestplate', qty: 1, price: 20 },
  { item: 'minecraft:diamond_leggings', qty: 1, price: 18 },
  { item: 'minecraft:diamond_boots', qty: 1, price: 12 },
  // Équipement — outils diamant
  { item: 'minecraft:diamond_sword', qty: 1, price: 12 },
  { item: 'minecraft:diamond_pickaxe', qty: 1, price: 12 },
  { item: 'minecraft:diamond_axe', qty: 1, price: 12 },
  { item: 'minecraft:diamond_shovel', qty: 1, price: 8 },
  { item: 'minecraft:diamond_hoe', qty: 1, price: 6 },
  // Équipement — tir / défense
  { item: 'minecraft:bow', qty: 1, price: 6 },
  { item: 'minecraft:crossbow', qty: 1, price: 8 },
  { item: 'minecraft:arrow', qty: 64, price: 4 },
  { item: 'minecraft:shield', qty: 1, price: 6 },
  // Équipement — netherite (rare, cher) & monture
  { item: 'minecraft:netherite_ingot', qty: 1, price: 40 },
  { item: 'minecraft:netherite_scrap', qty: 1, price: 10 },
  { item: 'minecraft:diamond_horse_armor', qty: 1, price: 10 },
  { item: 'minecraft:iron_horse_armor', qty: 1, price: 5 },
  // Enchantement — de quoi enchanter soi-même (pas de livres NBT possibles)
  { item: 'minecraft:enchanting_table', qty: 1, price: 10 },
  { item: 'minecraft:bookshelf', qty: 8, price: 6 },
  { item: 'minecraft:lapis_lazuli', qty: 64, price: 4 },
  { item: 'minecraft:book', qty: 16, price: 3 },
  { item: 'minecraft:anvil', qty: 1, price: 8 },
  { item: 'minecraft:grindstone', qty: 1, price: 3 },
  { item: 'minecraft:experience_bottle', qty: 8, price: 4 },
  // Consommables — nourriture premium & survie (pas de potions NBT)
  { item: 'minecraft:golden_apple', qty: 2, price: 6 },
  { item: 'minecraft:enchanted_golden_apple', qty: 1, price: 16 },
  { item: 'minecraft:golden_carrot', qty: 16, price: 4 },
  { item: 'minecraft:ender_pearl', qty: 4, price: 4 },
  { item: 'minecraft:milk_bucket', qty: 3, price: 2 },
  { item: 'minecraft:honey_bottle', qty: 4, price: 2 },
  { item: 'minecraft:cake', qty: 1, price: 2 },
  { item: 'minecraft:glowstone', qty: 8, price: 3 }
]

// ── RECELEUR (gagner des coins) : butin RARE de donjon/boss/exploration, « recel » premium. ──
// Quota PAR JOUEUR/JOUR volontairement bas : ce sont des drops rares, non farmables en masse.
const RECELEUR = [
  { item: 'minecraft:nether_star', qty: 1, coins: 32, max: 1 },        // Wither (end-game)
  { item: 'minecraft:heavy_core', qty: 1, coins: 24, max: 1 },         // coffre-fort augural (très rare)
  { item: 'minecraft:dragon_head', qty: 1, coins: 20, max: 1 },        // vaisseau de l'End
  { item: 'minecraft:totem_of_undying', qty: 1, coins: 12, max: 2 },   // raids
  { item: 'minecraft:heart_of_the_sea', qty: 1, coins: 10, max: 1 },   // trésor englouti
  { item: 'minecraft:trident', qty: 1, coins: 8, max: 2 },             // noyés
  { item: 'minecraft:ominous_trial_key', qty: 1, coins: 8, max: 2 },   // salles d'épreuve funestes
  { item: 'minecraft:sniffer_egg', qty: 1, coins: 6, max: 1 },         // ruines englouties
  { item: 'minecraft:trial_key', qty: 1, coins: 5, max: 4 },           // salles d'épreuve
  { item: 'minecraft:wither_skeleton_skull', qty: 1, coins: 4, max: 3 }, // forteresse du Nether
  { item: 'minecraft:breeze_rod', qty: 1, coins: 4, max: 6 },          // salles d'épreuve
  { item: 'minecraft:nautilus_shell', qty: 1, coins: 2, max: 8 },      // noyés / pêche
  { item: 'minecraft:echo_shard', qty: 1, coins: 1, max: 16 }          // cité antique
]

// ── ANTIQUAIRE (gagner des coins) : archéologie (tessons de poterie des ruines/puits en ──
// désert/marais) + curiosités de grottes trouvées à la brosse ou en silk touch. Rien de farmable.
const ANTIQUAIRE = [
  { item: 'minecraft:angler_pottery_sherd', qty: 1, coins: 2, max: 4 },
  { item: 'minecraft:archer_pottery_sherd', qty: 1, coins: 2, max: 4 },
  { item: 'minecraft:arms_up_pottery_sherd', qty: 1, coins: 2, max: 4 },
  { item: 'minecraft:blade_pottery_sherd', qty: 1, coins: 2, max: 4 },
  { item: 'minecraft:brewer_pottery_sherd', qty: 1, coins: 2, max: 4 },
  { item: 'minecraft:burn_pottery_sherd', qty: 1, coins: 2, max: 4 },
  { item: 'minecraft:danger_pottery_sherd', qty: 1, coins: 2, max: 4 },
  { item: 'minecraft:explorer_pottery_sherd', qty: 1, coins: 2, max: 4 },
  { item: 'minecraft:friend_pottery_sherd', qty: 1, coins: 2, max: 4 },
  { item: 'minecraft:heart_pottery_sherd', qty: 1, coins: 2, max: 4 },
  { item: 'minecraft:heartbreak_pottery_sherd', qty: 1, coins: 2, max: 4 },
  { item: 'minecraft:howl_pottery_sherd', qty: 1, coins: 2, max: 4 },
  { item: 'minecraft:miner_pottery_sherd', qty: 1, coins: 2, max: 4 },
  { item: 'minecraft:mourner_pottery_sherd', qty: 1, coins: 2, max: 4 },
  { item: 'minecraft:plenty_pottery_sherd', qty: 1, coins: 2, max: 4 },
  { item: 'minecraft:prize_pottery_sherd', qty: 1, coins: 2, max: 4 },
  { item: 'minecraft:sheaf_pottery_sherd', qty: 1, coins: 2, max: 4 },
  { item: 'minecraft:shelter_pottery_sherd', qty: 1, coins: 2, max: 4 },
  { item: 'minecraft:skull_pottery_sherd', qty: 1, coins: 2, max: 4 },
  { item: 'minecraft:snort_pottery_sherd', qty: 1, coins: 2, max: 4 },
  { item: 'minecraft:disc_fragment_5', qty: 1, coins: 3, max: 6 },     // cité antique
  { item: 'minecraft:spore_blossom', qty: 1, coins: 3, max: 3 },       // grotte luxuriante, silk touch
  { item: 'minecraft:pointed_dripstone', qty: 2, coins: 2, max: 3 },   // grotte à goutte-à-goutte
  { item: 'minecraft:glow_lichen', qty: 4, coins: 1, max: 3 }          // grottes, silk touch
]

// ── DISQUAIRE (gagner des coins) : disques musicaux trouvés en exploration (donjons, ──
// bastions, cité antique, salles d'épreuve). Aucun n'est craftable ni farmable.
const DISQUAIRE = [
  { item: 'minecraft:music_disc_13', qty: 1, coins: 5, max: 2 },
  { item: 'minecraft:music_disc_cat', qty: 1, coins: 5, max: 2 },
  { item: 'minecraft:music_disc_blocks', qty: 1, coins: 5, max: 2 },
  { item: 'minecraft:music_disc_chirp', qty: 1, coins: 5, max: 2 },
  { item: 'minecraft:music_disc_far', qty: 1, coins: 5, max: 2 },
  { item: 'minecraft:music_disc_mall', qty: 1, coins: 5, max: 2 },
  { item: 'minecraft:music_disc_mellohi', qty: 1, coins: 5, max: 2 },
  { item: 'minecraft:music_disc_stal', qty: 1, coins: 5, max: 2 },
  { item: 'minecraft:music_disc_strad', qty: 1, coins: 5, max: 2 },
  { item: 'minecraft:music_disc_ward', qty: 1, coins: 5, max: 2 },
  { item: 'minecraft:music_disc_11', qty: 1, coins: 5, max: 2 },
  { item: 'minecraft:music_disc_wait', qty: 1, coins: 5, max: 2 },
  { item: 'minecraft:music_disc_pigstep', qty: 1, coins: 8, max: 1 },           // bastion
  { item: 'minecraft:music_disc_otherside', qty: 1, coins: 10, max: 1 },       // cité antique
  { item: 'minecraft:music_disc_5', qty: 1, coins: 8, max: 1 },                // cité antique (fragments)
  { item: 'minecraft:music_disc_relic', qty: 1, coins: 12, max: 1 },           // salle d'épreuve, coffre funeste
  { item: 'minecraft:music_disc_creator', qty: 1, coins: 12, max: 1 },         // salle d'épreuve, coffre funeste
  { item: 'minecraft:music_disc_creator_music_box', qty: 1, coins: 14, max: 1 }, // salle d'épreuve, coffre funeste
  { item: 'minecraft:music_disc_precipice', qty: 1, coins: 12, max: 1 }        // salle d'épreuve, coffre funeste
]

// ── TROC (gagner des coins) : dans l'esprit du Bazar — loot de combat/exploration « vert », ──
// pas de nourriture/animaux, pas de matériau d'usine. Complète le Bazar sans le dupliquer.
const TROC = [
  { item: 'minecraft:gunpowder', qty: 16, coins: 2, max: 3 },
  { item: 'minecraft:string', qty: 24, coins: 1, max: 3 },
  { item: 'minecraft:bone', qty: 24, coins: 1, max: 3 },
  { item: 'minecraft:wither_rose', qty: 1, coins: 5, max: 2 },
  { item: 'minecraft:sponge', qty: 1, coins: 8, max: 2 },              // monument océanique
  { item: 'minecraft:sea_lantern', qty: 2, coins: 4, max: 3 },         // monument océanique
  { item: 'minecraft:tube_coral_block', qty: 2, coins: 2, max: 3 },
  { item: 'minecraft:fire_coral_block', qty: 2, coins: 2, max: 3 },
  { item: 'minecraft:horn_coral_block', qty: 2, coins: 2, max: 3 },
  { item: 'minecraft:brain_coral_block', qty: 2, coins: 2, max: 3 },
  { item: 'minecraft:bubble_coral_block', qty: 2, coins: 2, max: 3 }
]

// PRNG déterministe (mulberry32) + tirage sans remise, seedé par jour
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
function pick(pool, n, seed) {
  const a = pool.slice()
  const r = rng(seed)
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a.slice(0, n)
}

const key = (id) => id.replace(/[:.]/g, '-')
const pad = (n) => String(n).padStart(2, '0')
function dayKey(offset) {
  const [y, m, d] = START.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d) + offset * 86400000)
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

const days = {}
for (let i = 0; i < DAYS; i++) {
  const offers = {}
  pick(RACHATS.filter((r) => (r.from ?? 0) <= i), NB_RACHATS, 1000 + i).forEach((r, k) => {
    offers[`b-${key(r.item)}`] = {
      input: r.item, inputQty: r.qty, output: COIN, outputQty: r.coins,
      maxUses: r.max, npc: 'bazar', createdAt: 1751700000000 + i * 100000 + k * 100
    }
  })
  pick(VENTES, NB_VENTES, 9000 + i).forEach((v, k) => {
    offers[`e-${key(v.item)}`] = {
      input: COIN, inputQty: v.price, output: v.item, outputQty: v.qty,
      maxUses: 0, npc: 'echoppe', createdAt: 1751700000000 + i * 100000 + 50000 + k * 100
    }
  })
  pick(RECELEUR, NB_RECEL, 5000 + i).forEach((r, k) => {
    offers[`r-${key(r.item)}`] = {
      input: r.item, inputQty: r.qty, output: COIN, outputQty: r.coins,
      maxUses: r.max, npc: 'receleur', createdAt: 1751700000000 + i * 100000 + 70000 + k * 100
    }
  })
  pick(ANTIQUAIRE, NB_ANTIQUAIRE, 2000 + i).forEach((r, k) => {
    offers[`an-${key(r.item)}`] = {
      input: r.item, inputQty: r.qty, output: COIN, outputQty: r.coins,
      maxUses: r.max, npc: 'antiquaire', createdAt: 1751700000000 + i * 100000 + 90000 + k * 100
    }
  })
  pick(DISQUAIRE, NB_DISQUAIRE, 3000 + i).forEach((r, k) => {
    offers[`di-${key(r.item)}`] = {
      input: r.item, inputQty: r.qty, output: COIN, outputQty: r.coins,
      maxUses: r.max, npc: 'disquaire', createdAt: 1751700000000 + i * 100000 + 110000 + k * 100
    }
  })
  pick(TROC, NB_TROC, 4000 + i).forEach((r, k) => {
    offers[`tr-${key(r.item)}`] = {
      input: r.item, inputQty: r.qty, output: COIN, outputQty: r.coins,
      maxUses: r.max, npc: 'troc', createdAt: 1751700000000 + i * 100000 + 130000 + k * 100
    }
  })
  days[dayKey(i)] = offers
}

// ── Firebase (URL + secret lus depuis le launcher) ──
const here = dirname(fileURLToPath(import.meta.url))
const src = await readFile(join(here, '..', 'raw-launcher', 'src', 'main', 'index.js'), 'utf8')
const url = src.match(/FIREBASE_DATABASE_URL\s*=\s*['"]([^'"]+)['"]/)[1]
const secret = src.match(/FIREBASE_SECRET\s*=\s*['"]([^'"]+)['"]/)[1]
const auth = `?auth=${encodeURIComponent(secret)}`

async function send(method, path, body) {
  if (DRY) {
    const n = body && typeof body === 'object' ? ` (${Object.keys(body).length} clés)` : ''
    console.log(`DRY    ${method.padEnd(6)} ${path}${n}`)
    return
  }
  const res = await fetch(`${url}${path}.json${auth}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  console.log(`${method.padEnd(6)} ${path} -> ${res.status}`)
}

// PATCH PAR JOUR (fusion) → ajoute bazar/echoppe/receleur/antiquaire/disquaire/troc SANS toucher
// aux offres déjà présentes (alcool, etc.). AUCUN PUT global, AUCUN DELETE, AUCUN PATCH /npcs.
for (let i = 0; i < DAYS; i++) {
  const d = dayKey(i)
  await send('PATCH', `/shop/days/${d}`, days[d])
}

const nb = Object.values(days).reduce((s, o) => s + Object.keys(o).length, 0)
console.log(`\n${DRY ? '[DRY] ' : ''}Généré : ${DAYS} jours (${dayKey(0)} → ${dayKey(DAYS - 1)}), ${nb} offres (PATCH par jour, non destructif).`)
console.log(`Pools : ${RACHATS.length} rachats Bazar, ${VENTES.length} ventes Échoppe, ${RECELEUR.length} rachats Receleur, ${ANTIQUAIRE.length} rachats Antiquaire, ${DISQUAIRE.length} rachats Disquaire, ${TROC.length} rachats Troc (tirage seedé, ${NB_RACHATS}+${NB_VENTES}+${NB_RECEL}+${NB_ANTIQUAIRE}+${NB_DISQUAIRE}+${NB_TROC}/jour).`)
if (DRY) {
  const sample = dayKey(0)
  console.log(`\nExemple ${sample} :`)
  for (const [id, o] of Object.entries(days[sample])) {
    console.log(`  ${id.padEnd(34)} ${o.input} x${o.inputQty}  →  ${o.output} x${o.outputQty}  (max ${o.maxUses}, ${o.npc})`)
  }
}
