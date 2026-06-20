#!/usr/bin/env node
'use strict'

// ─── Zig City 2 — Exporteur de statistiques ───────────────────────────────────
// Lit les fichiers de stats du serveur Minecraft (world/stats/<uuid>.json),
// calcule un classement et le publie dans Firebase Realtime Database sous /stats.
// Le launcher relit ce nœud pour afficher la page « Statistiques ».
//
// Pourquoi côté serveur ? Le protocole de ping du jeu ne renvoie QUE les pseudos
// en ligne — jamais les stats détaillées. Celles-ci ne vivent que dans les
// fichiers du serveur, d'où ce petit exporteur qui fait le pont vers Firebase.
//
// Deux modes de lecture (config.json → source.mode) :
//   • "local" : le script tourne sur la machine du serveur (ou un dossier qui
//               contient world/ et usercache.json).
//   • "sftp"  : le script tourne ailleurs (ton PC, un mini-serveur) et lit les
//               fichiers via le SFTP de ton panel (Pterodactyl & co.).
//
// Aucune dépendance pour le mode local ni pour l'écriture Firebase (modules Node
// natifs). Le mode SFTP nécessite : npm install ssh2-sftp-client

const fs = require('fs')
const path = require('path')
const https = require('https')

// ─── Chargement de la configuration ───────────────────────────────────────────
const CONFIG_PATH = path.join(__dirname, 'config.json')

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('[stats] config.json introuvable. Copie config.example.json → config.json et remplis-le.')
    process.exit(1)
  }
  let cfg
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
  } catch (e) {
    console.error('[stats] config.json illisible (JSON invalide) :', e.message)
    process.exit(1)
  }
  if (!cfg.firebaseDatabaseUrl || !cfg.firebaseSecret) {
    console.error('[stats] firebaseDatabaseUrl et firebaseSecret sont obligatoires dans config.json.')
    process.exit(1)
  }
  if (!cfg.source || !cfg.source.mode) {
    console.error('[stats] source.mode est obligatoire ("local" ou "sftp").')
    process.exit(1)
  }
  // Cadence : intervalSeconds prioritaire, sinon intervalMinutes, sinon 10 min.
  const sec = Number(cfg.intervalSeconds)
  const min = Number(cfg.intervalMinutes)
  cfg.intervalMs = sec > 0 ? sec * 1000 : (min > 0 ? min * 60000 : 10 * 60000)
  cfg.worldName = cfg.source.worldName || cfg.worldName || 'world'
  cfg.resolveNamesOnline = cfg.resolveNamesOnline !== false // par défaut : oui (filet de secours)
  return cfg
}

const log = (...a) => console.log(`[stats ${new Date().toISOString().slice(11, 19)}]`, ...a)

// ─── Validation des pseudos (cohérente avec le launcher) ──────────────────────
// Pseudos Minecraft : [A-Za-z0-9_], 1-16. On rejette les pseudos purement
// numériques : Realtime Database coerce un objet à clés entières en TABLEAU,
// ce qui casserait la lecture côté launcher.
const PLAYER_NAME_RE = /^[A-Za-z0-9_]{1,16}$/
function isValidPlayerName(n) {
  return typeof n === 'string' && PLAYER_NAME_RE.test(n) && !/^\d+$/.test(n)
}

// ─── Calcul des stats à partir d'un fichier world/stats/<uuid>.json ───────────
// Clés vanilla Minecraft 1.21.1. Toute clé absente vaut 0.
const SEED_ITEMS = [
  'minecraft:wheat_seeds', 'minecraft:beetroot_seeds', 'minecraft:melon_seeds',
  'minecraft:pumpkin_seeds', 'minecraft:torchflower_seeds', 'minecraft:pitcher_pod'
]

function computeStats(json) {
  const stats = (json && json.stats) || {}
  const custom = stats['minecraft:custom'] || {}
  const mined = stats['minecraft:mined'] || {}
  const used = stats['minecraft:used'] || {}

  const sumValues = (obj) => Object.values(obj).reduce((a, v) => a + (Number(v) || 0), 0)

  // Distance totale = somme de toutes les distances vanilla (marche, sprint,
  // nage, chute, escalade, vol, bateau, cheval, cochon, strider, elytra…).
  let distance = 0
  for (const [k, v] of Object.entries(custom)) {
    if (k.endsWith('_one_cm')) distance += Number(v) || 0
  }

  let seeds = 0
  for (const item of SEED_ITEMS) seeds += Number(used[item]) || 0

  return {
    play_time: Number(custom['minecraft:play_time'] || custom['minecraft:play_one_minute'] || 0),
    distance,
    mined: sumValues(mined),
    mob_kills: Number(custom['minecraft:mob_kills'] || 0),
    seeds,
    records: Number(custom['minecraft:play_record'] || 0),
    deaths: Number(custom['minecraft:deaths'] || 0),
  }
}

// Un joueur a-t-il une activité réelle ? (évite de publier des entrées vides)
function hasActivity(s) {
  return s.play_time > 0 || s.distance > 0 || s.mined > 0 || s.mob_kills > 0 ||
    s.seeds > 0 || s.records > 0 || s.deaths > 0
}

// ─── Résolution UUID → pseudo ─────────────────────────────────────────────────
// 1) usercache.json du serveur (instantané, hors-ligne) ; 2) repli API Mojang
// (mis en cache durablement dans name-cache.json pour ne jamais re-demander).
const NAME_CACHE_PATH = path.join(__dirname, 'name-cache.json')

// Le cache stocke les succès (names) ET les échecs (missing: uuid → horodatage)
// pour ne PAS re-solliciter Mojang à chaque cycle sur des UUID irrésolvables
// (serveur en mode hors-ligne, comptes supprimés…). Migration de l'ancien format
// plat { uuid: name } prise en charge.
function loadNameCache() {
  try {
    const raw = JSON.parse(fs.readFileSync(NAME_CACHE_PATH, 'utf8'))
    if (raw && typeof raw === 'object') {
      if (raw.names || raw.missing) return { names: raw.names || {}, missing: raw.missing || {} }
      return { names: raw, missing: {} } // ancien format plat
    }
  } catch {}
  return { names: {}, missing: {} }
}
function saveNameCache(cache) {
  try { fs.writeFileSync(NAME_CACHE_PATH, JSON.stringify(cache, null, 2)) } catch {}
}

function parseUsercache(text) {
  const map = {}
  try {
    const arr = JSON.parse(text)
    if (Array.isArray(arr)) {
      for (const e of arr) {
        if (e && e.uuid && e.name) map[String(e.uuid).toLowerCase()] = e.name
      }
    }
  } catch {}
  return map
}

// Renvoie { name, status } : status permet de distinguer un 429 (rate-limit,
// transitoire → backoff) d'un 200/404 (profil introuvable → cache négatif) et
// d'une erreur réseau (status 0 → ne rien mettre en cache).
function resolveNameOnline(uuid) {
  const undashed = uuid.replace(/-/g, '')
  return new Promise((resolve) => {
    const req = https.get(
      { hostname: 'sessionserver.mojang.com', path: `/session/minecraft/profile/${undashed}`, headers: { 'User-Agent': 'ZigStatsExporter' } },
      (res) => {
        const status = res.statusCode
        if (status !== 200) { res.resume(); return resolve({ name: null, status }) }
        let body = ''
        res.on('data', c => body += c)
        res.on('end', () => { try { resolve({ name: JSON.parse(body).name || null, status }) } catch { resolve({ name: null, status }) } })
      }
    )
    req.on('error', () => resolve({ name: null, status: 0 }))
    req.setTimeout(8000, () => { req.destroy(); resolve({ name: null, status: 0 }) })
  })
}

// ─── Écriture Firebase (PUT = remplace le nœud) ───────────────────────────────
function firebasePut(cfg, fbPath, data) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${cfg.firebaseDatabaseUrl}${fbPath}.json?auth=${encodeURIComponent(cfg.firebaseSecret)}`)
    const payload = JSON.stringify(data)
    const req = https.request({
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    }, (res) => {
      let body = ''
      res.on('data', c => body += c)
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(body)
        else reject(new Error(`Firebase HTTP ${res.statusCode} : ${body.slice(0, 200)}`))
      })
    })
    req.on('error', reject)
    // Sans timeout, un PUT figé (proxy/VPN/AV qui bloque Node) ne résout jamais
    // sa promesse → le cycle ne rend jamais la main. On borne donc l'attente.
    req.setTimeout(20000, () => req.destroy(new Error('Firebase : délai réseau dépassé (20s)')))
    req.write(payload)
    req.end()
  })
}

// ─── Lecteurs de fichiers : local & SFTP ──────────────────────────────────────
// Chaque lecteur expose : listStatsFiles(), readStatsFile(name), readUsercache(), close().

function makeLocalReader(cfg) {
  const root = cfg.source.serverRoot
  if (!root) throw new Error('source.serverRoot manquant (mode local).')
  const statsDir = path.join(root, cfg.worldName, 'stats')
  return {
    async listStatsFiles() {
      if (!fs.existsSync(statsDir)) throw new Error(`Dossier de stats introuvable : ${statsDir}`)
      return fs.readdirSync(statsDir).filter(f => f.toLowerCase().endsWith('.json'))
    },
    async readStatsFile(name) {
      return fs.readFileSync(path.join(statsDir, name), 'utf8')
    },
    async readUsercache() {
      const p = path.join(root, 'usercache.json')
      return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '[]'
    },
    async close() {},
  }
}

async function makeSftpReader(cfg) {
  let SftpClient
  try {
    SftpClient = require('ssh2-sftp-client')
  } catch {
    throw new Error('Mode SFTP : exécute d\'abord « npm install ssh2-sftp-client » dans ce dossier.')
  }
  const s = cfg.source.sftp || {}
  if (!s.host || !s.username) throw new Error('source.sftp.host et source.sftp.username sont requis (mode sftp).')
  const remoteRoot = (s.remoteRoot || '/').replace(/\/+$/, '') || ''
  const statsDir = `${remoteRoot}/${cfg.worldName}/stats`
  const sftp = new SftpClient()
  await sftp.connect({ host: s.host, port: s.port || 2022, username: s.username, password: s.password })
  return {
    async listStatsFiles() {
      let list
      try {
        list = await sftp.list(statsDir)
      } catch (e) {
        throw new Error(`Dossier de stats introuvable via SFTP : ${statsDir} — vérifie source.sftp.remoteRoot et source.worldName. (${e.message})`)
      }
      return list.filter(e => e.type === '-' && e.name.toLowerCase().endsWith('.json')).map(e => e.name)
    },
    async readStatsFile(name) {
      return (await sftp.get(`${statsDir}/${name}`)).toString('utf8')
    },
    async readUsercache() {
      try { return (await sftp.get(`${remoteRoot}/usercache.json`)).toString('utf8') } catch { return '[]' }
    },
    async close() { try { await sftp.end() } catch {} },
  }
}

// ─── Un cycle complet : lire → calculer → publier ─────────────────────────────
async function runOnce(cfg) {
  const reader = cfg.source.mode === 'sftp' ? await makeSftpReader(cfg) : makeLocalReader(cfg)
  try {
    const files = await reader.listStatsFiles()
    log(`${files.length} fichier(s) de stats trouvé(s).`)

    const usercache = parseUsercache(await reader.readUsercache())
    const cache = loadNameCache()
    let cacheDirty = false
    let rateLimited = false       // un 429 suspend les résolutions en ligne pour le cycle
    const NEG_TTL = 24 * 60 * 60 * 1000 // on ne re-demande pas un UUID introuvable avant 24h

    const out = {}
    let skippedNoName = 0, skippedInactive = 0, skippedBadName = 0

    for (const file of files) {
      const uuid = path.basename(file, path.extname(file)).toLowerCase()

      let raw
      try { raw = await reader.readStatsFile(file) } catch (e) { log(`Lecture impossible ${file} : ${e.message}`); continue }
      let json
      try { json = JSON.parse(raw) } catch { continue }

      const s = computeStats(json)
      if (!hasActivity(s)) { skippedInactive++; continue }

      // Pseudo : usercache → cache local → Mojang (avec cache positif ET négatif)
      let name = usercache[uuid] || cache.names[uuid]
      if (!name && cfg.resolveNamesOnline && !rateLimited) {
        const neg = cache.missing[uuid]
        if (!(neg && (Date.now() - neg) < NEG_TTL)) {
          const r = await resolveNameOnline(uuid)
          if (r.name) {
            name = r.name; cache.names[uuid] = r.name; cacheDirty = true
          } else if (r.status === 429) {
            rateLimited = true
            log('Mojang : rate-limit (429) — résolutions en ligne suspendues pour ce cycle.')
          } else if (r.status === 200 || r.status === 204 || r.status === 404) {
            cache.missing[uuid] = Date.now(); cacheDirty = true // introuvable → cache négatif
          }
          // status 0 (réseau/timeout) : transitoire, on ne met rien en cache
        }
      }
      if (!name) { skippedNoName++; continue }
      if (!isValidPlayerName(name)) { skippedBadName++; continue }

      s.updatedAt = Date.now()
      // En cas de doublon de pseudo (UUID multiples), on garde le plus actif.
      if (!out[name] || s.play_time > (out[name].play_time || 0)) out[name] = s
    }

    if (cacheDirty) saveNameCache(cache)

    // Garde-fou anti-écrasement : un PUT remplace TOUT /stats. Publier {} (ou un
    // sous-ensemble vide après une avarie : dossier vide, toutes lectures KO,
    // aucun pseudo résolu) effacerait le classement déjà publié. On ne publie
    // donc que s'il y a au moins un joueur ; sinon on log et on préserve l'existant.
    const count = Object.keys(out).length
    if (count === 0) {
      if (files.length === 0) log('Aucun fichier de stats trouvé (dossier vide ou chemin remoteRoot/worldName erroné ?) — publication ignorée pour préserver le classement.')
      else log(`0 joueur publiable sur ${files.length} fichier(s) — publication ignorée. Ignorés — inactifs:${skippedInactive} sans-pseudo:${skippedNoName} pseudo-invalide:${skippedBadName}.`)
      return
    }

    await firebasePut(cfg, '/stats', out)
    await firebasePut(cfg, '/statsMeta', { updatedAt: Date.now(), count })

    log(`Publié : ${count} joueur(s). Ignorés — inactifs:${skippedInactive} sans-pseudo:${skippedNoName} pseudo-invalide:${skippedBadName}.`)
  } finally {
    await reader.close()
  }
}

// ─── Boucle principale ────────────────────────────────────────────────────────
async function main() {
  const cfg = loadConfig()
  const once = process.argv.includes('--once')
  log(`Démarrage — mode ${cfg.source.mode}, intervalle ${Math.round(cfg.intervalMs / 1000)} s${once ? ' (passage unique)' : ''}.`)

  // Boucle auto-replanifiée : l'intervalle court à partir de la FIN du cycle
  // précédent, donc jamais deux cycles concurrents (pas de connexions SFTP ni de
  // PUT empilés, pas d'écriture concurrente du name-cache).
  const loop = async () => {
    try { await runOnce(cfg) }
    catch (e) { log('Erreur de cycle :', e.message) }
    if (!once) setTimeout(loop, cfg.intervalMs)
  }
  await loop()
}

main().catch(e => { console.error('[stats] Erreur fatale :', e); process.exit(1) })
