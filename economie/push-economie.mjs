// Pousse le kit d'économie (economie/*.json) vers la Realtime Database.
//
//   node economie/push-economie.mjs
//
// - Ne contient aucun secret : lit l'URL + le secret directement depuis le launcher
//   (raw-launcher/src/main/index.js), la source de vérité unique.
// - /shop/config n'est PAS poussé (déjà réglé dans le dashboard, on évite d'écraser
//   l'icône de la monnaie). Le shop du jour ROTATIF (/shop/days) est géré par
//   generate-shop-days.mjs.
// - ⚠️ /npcs est poussé PAR SLUG (PATCH /npcs/{slug}) et NON sur le nœud parent :
//   un PATCH sur /npcs remplacerait chaque PNJ EN ENTIER et effacerait les champs
//   posés depuis le dashboard (skinUrl/skinVariant/skinUpdatedAt). Le PATCH par slug,
//   lui, FUSIONNE → il met à jour name/role/createdAt et PRÉSERVE les skins.

import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const launcherMain = join(here, '..', 'raw-launcher', 'src', 'main', 'index.js')

const src = await readFile(launcherMain, 'utf8')
const url = src.match(/FIREBASE_DATABASE_URL\s*=\s*['"]([^'"]+)['"]/)?.[1]
const secret = src.match(/FIREBASE_SECRET\s*=\s*['"]([^'"]+)['"]/)?.[1]

if (!url || !secret) {
  console.error('❌ Impossible de lire FIREBASE_DATABASE_URL / FIREBASE_SECRET depuis le launcher.')
  process.exit(1)
}
if (typeof fetch !== 'function') {
  console.error('❌ Node 18+ requis (fetch indisponible).')
  process.exit(1)
}

const authQ = `?auth=${encodeURIComponent(secret)}`
async function patch(node, bodyStr) {
  const res = await fetch(`${url}${node}.json${authQ}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: bodyStr,
  })
  return res.ok ? null : `HTTP ${res.status} ${res.statusText}`
}

let ok = 0
let fail = 0

// ── /npcs : PATCH PAR SLUG (préserve skinUrl/skinVariant/skinUpdatedAt du dashboard) ──
try {
  const npcs = JSON.parse(await readFile(join(here, 'npcs.json'), 'utf8'))
  for (const [slug, data] of Object.entries(npcs)) {
    const err = await patch(`/npcs/${slug}`, JSON.stringify(data))
    if (err) { console.error(`✖  /npcs/${slug}  (${err})`); fail++ }
    else { console.log(`✔  /npcs/${slug.padEnd(10)} ←  npcs.json (skin préservé)`); ok++ }
  }
} catch (e) {
  console.error(`✖  npcs.json illisible ou JSON invalide : ${e.message}`)
  fail++
}

// ── autres nœuds : PATCH plat du fichier entier (fusion au niveau des clés) ──
const MAP = [
  ['quests.json', '/quests'],
  ['shop-race.json', '/shop/race'],
  ['bank-config.json', '/bank/config'],
]
for (const [file, node] of MAP) {
  let body
  try {
    body = await readFile(join(here, file), 'utf8')
    JSON.parse(body) // validation
  } catch (e) {
    console.error(`✖  ${file} illisible ou JSON invalide : ${e.message}`)
    fail++
    continue
  }
  const err = await patch(node, body)
  if (err) { console.error(`✖  ${node}  (${err})`); fail++ }
  else { console.log(`✔  ${node.padEnd(14)} ←  ${file}`); ok++ }
}

console.log(`\nTerminé : ${ok} nœud(s) mis à jour, ${fail} erreur(s).`)
process.exit(fail ? 1 : 0)
