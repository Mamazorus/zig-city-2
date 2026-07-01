const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron')
const { autoUpdater } = require('electron-updater')
const { Client } = require('minecraft-launcher-core')
const path = require('path')
const fs = require('fs')
const https = require('https')
const http = require('http')
const net = require('net')
const os = require('os')
const crypto = require('crypto')
const { spawn } = require('child_process')
const AdmZip = require('adm-zip')

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const MODPACK = require('../../modpack.json')
const GAME_DIR = path.join(app.getPath('appData'), MODPACK.launcherName)
const SESSION_FILE = path.join(GAME_DIR, '.session')

const NEOFORGE_INSTALLER_URL =
  `https://maven.neoforged.net/releases/net/neoforged/neoforge/${MODPACK.loaderVersion}/neoforge-${MODPACK.loaderVersion}-installer.jar`
const NEOFORGE_INSTALLER_PATH =
  path.join(GAME_DIR, `neoforge-${MODPACK.loaderVersion}-installer.jar`)

const JAVA_MANIFEST_URL = 'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json'
const JAVA_RUNTIME_NAME = 'java-runtime-delta'
const JAVA_DIR = path.join(GAME_DIR, 'runtime', JAVA_RUNTIME_NAME)
// Java multi-plateforme. Clé(s) du manifeste Mojang à essayer selon l'OS
// (Apple Silicon → mac-os-arm64, repli mac-os/Intel via Rosetta par sécurité).
const JAVA_PLATFORM_KEYS =
  process.platform === 'win32'  ? ['windows-x64']
  : process.platform === 'darwin' ? (process.arch === 'arm64' ? ['mac-os-arm64', 'mac-os'] : ['mac-os'])
  : ['linux']
// Chemin de l'exécutable Java DANS le runtime, selon l'OS. macOS empaquette le JRE
// en bundle (jre.bundle/Contents/Home/bin/java) ≠ Windows (bin/javaw.exe).
function javaBinRels() {
  if (process.platform === 'win32')  return [path.join('bin', 'javaw.exe'), path.join('bin', 'java.exe')]
  if (process.platform === 'darwin') return [path.join('jre.bundle', 'Contents', 'Home', 'bin', 'java')]
  return [path.join('bin', 'java')]
}
const JAVA_EXE = path.join(JAVA_DIR, javaBinRels()[0])

let win = null
let currentToken = null

// ─── RÉGLAGES UTILISATEUR ─────────────────────────────────────────────────────
// Préférences propres à l'utilisateur, persistées HORS de modpack.json (lui est
// livré avec l'app et ÉCRASÉ à chaque mise à jour). On les range dans le dossier
// de jeu pour qu'elles survivent aux mises à jour du launcher.
const SETTINGS_FILE = path.join(GAME_DIR, 'launcher-settings.json')

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'))
  } catch (e) {}
  return {}
}

function saveSettings(settings) {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true })
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings))
  } catch (e) {}
}

// Mémoire (RAM) allouée à la JVM Minecraft, en Go entiers. Les bornes sont
// calculées d'après la RAM physique : le curseur peut monter jusqu'à la RAM
// totale, mais on dérive une valeur « recommandée » saine et un plancher.
const RAM_MIN_GB = 2

// Arrondit au demi-Go le plus proche (valeurs « rondes » pour la RAM conseillée).
const roundHalf = (x) => Math.round(x * 2) / 2
// Arrondit au dixième de Go (le curseur de mémoire avance par pas de 0,1 Go).
const roundTenth = (x) => Math.round(x * 10) / 10

function systemRamGb() {
  return Math.max(1, Math.floor(os.totalmem() / (1024 ** 3)))
}

// RAM conseillée par défaut : PROPORTIONNELLE à la mémoire physique (~75 %), pour
// suivre les grosses configs, bornée à un plancher (ce modpack est lourd, il lui
// faut au moins 4 Go) et à un plafond de 20 Go (au-delà, donner plus de heap à
// Minecraft n'apporte quasiment rien et peut allonger les pauses GC). Arrondie au demi-Go.
//   8 Go → 6 · 12 Go → 9 · 16 Go → 12 · 24 Go → 18 · 32 Go → 20 · 48 Go → 20
function recommendedRamGb(totalGb) {
  const proportional = roundHalf(totalGb * 0.75)
  return Math.max(4, Math.min(20, proportional))
}

// Synthèse de l'état mémoire : valeur effective + bornes + recommandation.
function ramInfo() {
  const totalGb = systemRamGb()
  const min = RAM_MIN_GB
  const max = Math.max(min, totalGb)                          // jamais > RAM physique
  const recommended = Math.min(max, Math.max(min, recommendedRamGb(totalGb)))
  // Défaut quand l'utilisateur n'a rien réglé = la valeur conseillée, proportionnelle
  // à la RAM de la machine (cf. recommendedRamGb). Remplace l'ancien défaut fixe de
  // 10 Go, qui empêchait la JVM de démarrer sur les machines plus modestes.
  const def = recommended
  const stored = Number(loadSettings().ramGb)
  const custom = Number.isFinite(stored) && stored > 0
  const ram = custom ? Math.min(max, Math.max(min, roundTenth(stored))) : def
  return { ram, def, min, max, recommended, totalGb, custom }
}

// RAM effective (Go) à passer à la JVM au lancement — toujours clampée aux bornes.
function resolveRamGb() {
  return ramInfo().ram
}

// ─── WINDOW ──────────────────────────────────────────────────────────────────
// Fenêtre à 1366×883 (ratio exact du frame Figma 1728/1117 = 1.547).
// Le scaling du design Figma est géré côté renderer via CSS transform.
// Icône appliquée à la fenêtre / barre des tâches en dev ; en production Windows
// utilise l'icône embarquée dans l'exe par electron-builder.
const APP_ICON = path.join(__dirname, '../../assets/logo_zig_city.png')

function createWindow() {
  win = new BrowserWindow({
    width: 1366,
    height: 883,
    resizable: false,
    frame: false,
    icon: APP_ICON,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  // Réinitialise le zoom persisté par Chromium, puis applique le facteur correct
  // après le chargement de la page (viewport CSS → 1728×1117, taille native Figma)
  win.webContents.setZoomFactor(1.0)
  win.webContents.on('did-finish-load', () => {
    win.webContents.setZoomFactor(1366 / 1728)
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  win.removeMenu()
}

// ─── MINECRAFT SLP PING ──────────────────────────────────────────────────────
const MC_SERVER_HOST = '109.239.153.124'
const MC_SERVER_PORT = 25965
const PLAYER_TIMES_FILE = path.join(GAME_DIR, 'player-times.json')
const PLAYERS_SEEN_FILE = path.join(GAME_DIR, 'players-seen.json')

function loadPlayerTimes() {
  try {
    if (fs.existsSync(PLAYER_TIMES_FILE)) return JSON.parse(fs.readFileSync(PLAYER_TIMES_FILE, 'utf8'))
  } catch (e) {}
  return {}
}

function savePlayerTimes(times) {
  try {
    fs.mkdirSync(path.dirname(PLAYER_TIMES_FILE), { recursive: true })
    fs.writeFileSync(PLAYER_TIMES_FILE, JSON.stringify(times))
  } catch (e) {}
}

function loadPlayersSeen() {
  try {
    if (fs.existsSync(PLAYERS_SEEN_FILE)) return JSON.parse(fs.readFileSync(PLAYERS_SEEN_FILE, 'utf8'))
  } catch (e) {}
  return {}
}

function savePlayersSeen(seen) {
  try {
    fs.mkdirSync(path.dirname(PLAYERS_SEEN_FILE), { recursive: true })
    fs.writeFileSync(PLAYERS_SEEN_FILE, JSON.stringify(seen))
  } catch (e) {}
}

function mcVarIntWrite(value) {
  const bytes = []
  value = value >>> 0
  do {
    let byte = value & 0x7F
    value >>>= 7
    if (value !== 0) byte |= 0x80
    bytes.push(byte)
  } while (value !== 0)
  return Buffer.from(bytes)
}

function mcVarIntRead(buf, offset) {
  let result = 0, shift = 0, pos = offset
  while (true) {
    if (pos >= buf.length) throw new Error('buf_short')
    const byte = buf[pos++]
    result |= (byte & 0x7F) << shift
    if ((byte & 0x80) === 0) break
    shift += 7
    if (shift >= 32) throw new Error('VarInt overflow')
  }
  return { value: result, newOffset: pos }
}

function mcStringWrite(str) {
  const encoded = Buffer.from(str, 'utf8')
  return Buffer.concat([mcVarIntWrite(encoded.length), encoded])
}

function pingMinecraftServer(host, port, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port })
    let resolved = false
    let buf = Buffer.alloc(0)

    const done = (result) => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      socket.destroy()
      resolve(result)
    }

    const fail = (err) => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      socket.destroy()
      reject(err)
    }

    const timer = setTimeout(() => fail(new Error('Timeout')), timeout)

    socket.once('connect', () => {
      const portBuf = Buffer.allocUnsafe(2)
      portBuf.writeUInt16BE(port)
      const handshakeData = Buffer.concat([
        mcVarIntWrite(0x00),
        mcVarIntWrite(47),
        mcStringWrite(host),
        portBuf,
        mcVarIntWrite(1)
      ])
      const handshake = Buffer.concat([mcVarIntWrite(handshakeData.length), handshakeData])
      const statusData = mcVarIntWrite(0x00)
      const statusReq = Buffer.concat([mcVarIntWrite(statusData.length), statusData])
      socket.write(Buffer.concat([handshake, statusReq]))
    })

    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk])
      try {
        const lenR = mcVarIntRead(buf, 0)
        if (buf.length < lenR.newOffset + lenR.value) return
        const idR = mcVarIntRead(buf, lenR.newOffset)
        if (idR.value !== 0x00) { fail(new Error(`Unexpected packet 0x${idR.value.toString(16)}`)); return }
        const strLenR = mcVarIntRead(buf, idR.newOffset)
        const strStart = strLenR.newOffset
        const strEnd = strStart + strLenR.value
        if (buf.length < strEnd) return
        done(JSON.parse(buf.slice(strStart, strEnd).toString('utf8')))
      } catch (e) {
        if (e.message === 'buf_short') return
        fail(e)
      }
    })

    socket.on('error', fail)
    socket.on('close', () => { if (!resolved) fail(new Error('Connexion fermée')) })
  })
}

ipcMain.handle('get-server-status', async () => {
  try {
    const status = await pingMinecraftServer(MC_SERVER_HOST, MC_SERVER_PORT)
    const sample = (status.players?.sample ?? []).filter(p => p?.name)
    const currentNames = sample.map(p => p.name)

    const times = loadPlayerTimes()
    const now = Date.now()

    // Retire les joueurs partis, enregistre les nouveaux arrivants
    for (const name of Object.keys(times)) {
      if (!currentNames.includes(name)) delete times[name]
    }
    for (const name of currentNames) {
      if (!times[name]) times[name] = now
    }
    savePlayerTimes(times)

    // Historique persistant des joueurs vus (cache local). On ne pousse vers
    // l'historique partagé que les joueurs encore inconnus de CE launcher : en
    // régime permanent (tous déjà en cache) aucun appel réseau n'est émis.
    const seen = loadPlayersSeen()
    const newcomers = currentNames.filter(name => !(name in seen))
    if (newcomers.length) {
      for (const name of newcomers) seen[name] = now
      savePlayersSeen(seen)
      pushPlayersSeen(newcomers).catch(() => {})
    }

    return {
      online: status.players?.online ?? 0,
      max: status.players?.max ?? 0,
      players: currentNames.map(name => ({ name, since: times[name] }))
    }
  } catch (e) {
    return { online: 0, max: 0, players: [], error: e.message }
  }
})

ipcMain.handle('get-players-seen', async () => {
  const local = loadPlayersSeen()
  if (!isFirebaseConfigured()) return Object.keys(local)
  try {
    const [remote, hidden] = await Promise.all([fetchSharedPlayersSeen(), fetchHiddenPlayers()])
    // Les pseudos Minecraft ont une identité INSENSIBLE à la casse. On compare,
    // déduplique et masque toujours en minuscules — sinon « WoxDfor » et « Woxdfor »
    // comptent comme 2 joueurs, et masquer « LYenBrrr » ne bloque pas « Lyenbrrr ».
    const hiddenLower = new Set(Object.keys(hidden).map(n => n.toLowerCase()))
    const remoteLower = new Set(Object.keys(remote).map(n => n.toLowerCase()))
    // Migre vers le partagé les joueurs vus uniquement en local (hors masqués / déjà connus)
    const localOnly = Object.keys(local).filter(n => !remoteLower.has(n.toLowerCase()) && !hiddenLower.has(n.toLowerCase()))
    if (localOnly.length) pushPlayersSeen(localOnly).catch(() => {})
    // Fusionne (partagé ∪ local), retire les masqués, déduplique par casse : une seule
    // entrée par joueur (1re casse rencontrée, le partagé primant sur le local).
    const byLower = new Map()
    for (const n of [...Object.keys(remote), ...Object.keys(local)]) {
      const key = n.toLowerCase()
      if (hiddenLower.has(key) || byLower.has(key)) continue
      byLower.set(key, n)
    }
    const names = [...byLower.values()]
    const merged = {}
    for (const n of names) merged[n] = remote[n] ?? local[n] ?? Date.now()
    savePlayersSeen(merged)
    return names
  } catch {
    // Hors-ligne : on retombe sur le cache local
    return Object.keys(local)
  }
})

// ─── PROXY D'IMAGES DISTANTES ─────────────────────────────────────────────────
// Le moteur de rendu (Chromium) emprunte le proxy / VPN / antivirus du système ;
// sur certaines machines cela bloque le chargement des <img> distantes (têtes
// mc-heads, visuels de news) alors que le reste fonctionne. On télécharge donc
// l'image ici, côté processus principal — Node emprunte le même chemin réseau
// direct que Firebase (qui, lui, marche) — et on la renvoie en data: URL au
// renderer. Cache mémoire pour éviter de re-télécharger pendant la session.
const imageCache = new Map()      // url -> data URL
const imageInflight = new Map()   // url -> Promise<data URL | null>
const IMAGE_CACHE_MAX = 250

// Bloque les cibles internes (anti-SSRF) : IP littérales loopback/privées/link-local/
// métadonnées cloud. Filtrage best-effort sur IP littérale ; les noms d'hôtes publics
// légitimes (mc-heads, firebasestorage, CDN des news) passent normalement.
function isBlockedImageHost(hostname) {
  const h = (hostname || '').toLowerCase().replace(/^\[|\]$/g, '')
  if (h === 'localhost' || h.endsWith('.localhost')) return true
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h)
  if (m) {
    const a = +m[1], b = +m[2]
    if (a === 0 || a === 127 || a === 10) return true
    if (a === 169 && b === 254) return true            // link-local + métadonnées cloud
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
  }
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true
  return false
}

function fetchImageDataUrl(url, redirects = 0) {
  if (redirects > 5) return Promise.reject(new Error('Trop de redirections'))
  return new Promise((resolve, reject) => {
    let urlObj
    try { urlObj = new URL(url) } catch { return reject(new Error('URL invalide')) }
    if (isBlockedImageHost(urlObj.hostname)) return reject(new Error('Hôte non autorisé'))
    const proto = urlObj.protocol === 'https:' ? https : http
    const req = proto.get({
      hostname: urlObj.hostname,
      port:     urlObj.port || undefined,
      path:     urlObj.pathname + urlObj.search,
      headers:  { 'User-Agent': 'Mozilla/5.0', 'Accept': 'image/*' }
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume()
        const next = new URL(res.headers.location, urlObj).toString()
        return fetchImageDataUrl(next, redirects + 1).then(resolve, reject)
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)) }
      const ct = (res.headers['content-type'] || 'image/png').split(';')[0].trim()
      if (!ct.startsWith('image/')) { res.resume(); return reject(new Error(`Type inattendu : ${ct}`)) }
      const chunks = []
      let size = 0
      res.on('data', (d) => {
        size += d.length
        if (size > 8 * 1024 * 1024) { req.destroy(); reject(new Error('Image trop volumineuse')) }
        else chunks.push(d)
      })
      res.on('end', () => resolve(`data:${ct};base64,${Buffer.concat(chunks).toString('base64')}`))
    })
    req.on('error', reject)
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')) })
  })
}

ipcMain.handle('fetch-image', (_e, url) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return null
  if (imageCache.has(url)) return imageCache.get(url)
  if (imageInflight.has(url)) return imageInflight.get(url)
  const p = fetchImageDataUrl(url)
    .then((dataUrl) => {
      if (imageCache.size >= IMAGE_CACHE_MAX) imageCache.delete(imageCache.keys().next().value)
      imageCache.set(url, dataUrl)
      return dataUrl
    })
    .catch(() => null)
    .finally(() => imageInflight.delete(url))
  imageInflight.set(url, p)
  return p
})

// ─── IPC : WINDOW CONTROLS ───────────────────────────────────────────────────
ipcMain.handle('window-minimize', () => win?.minimize())
ipcMain.handle('window-maximize', () => win?.isMaximized() ? win.unmaximize() : win.maximize())
ipcMain.handle('window-close', () => win?.close())
ipcMain.handle('open-external', (_, url) => {
  // Liste blanche de schéma : shell.openExternal accepte n'importe quoi (file://,
  // protocoles custom enregistrés). On n'ouvre que du http(s) (liens Discord, releases
  // GitHub) pour ne pas exécuter d'URL forgée si une source distante était compromise.
  try {
    const { protocol } = new URL(url)
    if (protocol === 'http:' || protocol === 'https:') return shell.openExternal(url)
  } catch { /* URL invalide → on ignore */ }
})

// ─── AUTO-UPDATE (electron-updater + GitHub Releases) ─────────────────────────
function sendUpdateStatus(payload) {
  if (win && !win.isDestroyed()) win.webContents.send('update-status', payload)
}

function setupAutoUpdater() {
  // N'accepter les pré-versions (-beta) QUE si l'app installée est elle-même une
  // pré-version. Ainsi un futur build stable (ex. 1.0.0) ne proposera pas de betas.
  autoUpdater.allowPrerelease = app.getVersion().includes('-')
  autoUpdater.autoDownload = true            // télécharge dès qu'une MAJ est trouvée
  autoUpdater.autoInstallOnAppQuit = true    // filet de sécurité : installe à la fermeture
  autoUpdater.logger = console

  autoUpdater.on('checking-for-update', () => sendUpdateStatus({ status: 'checking' }))
  autoUpdater.on('update-available',     (info) => sendUpdateStatus({ status: 'available', version: info?.version }))
  autoUpdater.on('update-not-available', () => sendUpdateStatus({ status: 'not-available' }))
  autoUpdater.on('download-progress',    (p) => sendUpdateStatus({
    status: 'progress',
    percent: p.percent,
    transferred: p.transferred,
    total: p.total,
    bytesPerSecond: p.bytesPerSecond
  }))
  autoUpdater.on('update-downloaded',    (info) => sendUpdateStatus({ status: 'downloaded', version: info?.version }))
  autoUpdater.on('error',                (err) => sendUpdateStatus({ status: 'error', message: String(err?.message || err) }))
}

// ── MAJ macOS : check manuel via l'API GitHub (PAS electron-updater) ──
// Le .dmg distribué n'est pas signé (pas de compte Apple Developer), donc
// electron-updater ne peut pas s'auto-installer sur Mac (Squirrel.Mac exige une
// app signée + notarisée). On se contente donc de DÉTECTER qu'une version plus
// récente existe et on propose au joueur de la télécharger à la main.
const GITHUB_OWNER = 'Mamazorus'
const GITHUB_REPO  = 'zig-city-2'

// GET JSON simple (l'API GitHub renvoie directement, sans redirection ici).
// User-Agent obligatoire sinon GitHub répond 403.
function httpGetJson(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers: { 'User-Agent': 'zig-city-2-launcher', 'Accept': 'application/vnd.github+json' },
    }, (res) => {
      let body = ''
      res.on('data', c => body += c)
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`HTTP ${res.statusCode}: ${String(body).slice(0, 200)}`))
        }
        try { resolve(JSON.parse(body)) } catch { reject(new Error('Réponse JSON invalide')) }
      })
    })
    req.on('error', reject)
    req.setTimeout(15000, () => req.destroy(new Error('Timeout API GitHub')))
    req.end()
  })
}

// Compare deux versions semver simples (MAJOR.MINOR.PATCH[-pre]). >0 si a>b.
// Règle semver : à cœur égal, une version stable (sans -pre) > une pré-version.
function compareSemver(a, b) {
  const parse = (v) => {
    const [core, pre = ''] = String(v).replace(/^v/, '').split('-')
    const [maj, min, pat] = core.split('.').map(n => parseInt(n, 10) || 0)
    return { nums: [maj || 0, min || 0, pat || 0], pre }
  }
  const pa = parse(a), pb = parse(b)
  for (let i = 0; i < 3; i++) {
    if (pa.nums[i] !== pb.nums[i]) return pa.nums[i] - pb.nums[i]
  }
  if (!pa.pre && pb.pre) return 1
  if (pa.pre && !pb.pre) return -1
  if (pa.pre === pb.pre) return 0
  return pa.pre > pb.pre ? 1 : -1   // ordre lexical (suffit pour 'beta' vs 'beta')
}

// Émet les mêmes events 'update-status' que le flux Windows, mais le statut
// final est 'mac-update' (→ le renderer affiche un écran « télécharge la MAJ »).
async function checkMacUpdate() {
  sendUpdateStatus({ status: 'checking' })
  try {
    const current = app.getVersion()
    const allowPrerelease = current.includes('-')   // même règle que Windows
    const releases = await httpGetJson(`https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases?per_page=30`)
    if (!Array.isArray(releases)) throw new Error('Format de réponse GitHub inattendu')

    let best = null
    for (const r of releases) {
      if (!r || r.draft) continue
      if (r.prerelease && !allowPrerelease) continue
      const version = String(r.tag_name || '').replace(/^v/, '')
      if (!version) continue
      if (compareSemver(version, current) <= 0) continue            // pas plus récente
      if (best && compareSemver(version, best.version) <= 0) continue // garde la plus haute
      const dmg = Array.isArray(r.assets) ? r.assets.find(a => /\.dmg$/i.test(a?.name || '')) : null
      best = { version, url: (dmg && dmg.browser_download_url) || r.html_url }
    }

    if (best) sendUpdateStatus({ status: 'mac-update', version: best.version, url: best.url })
    else sendUpdateStatus({ status: 'not-available' })
  } catch (e) {
    sendUpdateStatus({ status: 'error', message: String(e?.message || e) })
  }
}

// Déclenché par le renderer une fois qu'il écoute déjà 'update-status' : évite toute
// course entre l'émission des events et l'abonnement côté UI.
ipcMain.handle('check-for-updates', async () => {
  if (!app.isPackaged) return { status: 'disabled' }   // pas de MAJ en dev
  // macOS : app non signée → on ne touche PAS à electron-updater (il planterait à
  // l'install). On vérifie la dernière version via l'API GitHub (fire-and-forget,
  // les events 'update-status' pilotent l'UI comme sur Windows).
  if (process.platform === 'darwin') {
    checkMacUpdate()
    return { status: 'checking' }
  }
  try {
    await autoUpdater.checkForUpdates()
    return { status: 'checking' }
  } catch (e) {
    return { status: 'error', message: String(e?.message || e) }
  }
})

// Installe la MAJ déjà téléchargée : silencieux (/S) + relance automatique de l'app.
let updateInstalling = false
ipcMain.handle('quit-and-install', () => {
  if (process.platform === 'darwin') return  // Mac non signé : aucune install auto possible
  if (updateInstalling) return          // garde contre les appels multiples
  updateInstalling = true
  autoUpdater.quitAndInstall(true, true)
})

app.whenReady().then(() => {
  // Identité d'app Windows : indispensable pour que la barre des tâches affiche
  // l'icône/nom du launcher (sinon Windows regroupe sous « Electron »). No-op ailleurs.
  app.setAppUserModelId('com.rawstudio.launcher')
  const restoredUser = loadSession()   // restaure currentToken dès le démarrage (skin, lancement…)
  if (restoredUser) recordPlayerSeen(restoredUser)  // garde le joueur dans l'historique partagé
  initializeAdmins()
  initializeChannels()
  initializeShop()
  if (process.platform !== 'darwin') setupAutoUpdater()  // Mac : check maison via API GitHub
  createWindow()

  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

// ─── SESSION ─────────────────────────────────────────────────────────────────
function loadSession() {
  try {
    if (fs.existsSync(SESSION_FILE)) {
      const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'))
      currentToken = data.token
      return data.username
    }
  } catch (e) {}
  return null
}

function saveSession(token) {
  fs.mkdirSync(path.dirname(SESSION_FILE), { recursive: true })
  fs.writeFileSync(SESSION_FILE, JSON.stringify({ token, username: token.name }))
}

function clearSession() {
  currentToken = null
  if (fs.existsSync(SESSION_FILE)) fs.unlinkSync(SESSION_FILE)
}

// ─── IPC : AUTH ──────────────────────────────────────────────────────────────
ipcMain.handle('get-session', () => {
  const username = loadSession()
  if (!username) return { logged: false }
  return { logged: true, username, uuid: currentToken?.uuid ?? null, offline: currentToken?.offline ?? false }
})

ipcMain.handle('login', async () => {
  try {
    const code = await openMicrosoftLogin()
    const token = await exchangeCodeForMinecraftToken(code)
    currentToken = token
    saveSession(token)
    recordPlayerSeen(token.name)   // sa tête apparaît dans le carrousel partagé
    return { success: true, username: token.name, uuid: token.uuid }
  } catch (e) {
    return { success: false, error: String(e.message || e) }
  }
})

// ─── CONNEXION HORS-LIGNE (compte « cracké ») ─────────────────────────────────
// Le serveur tourne en online-mode=false : il accepte les comptes non-premium.
// On construit ici un profil local, sans passer par Microsoft. L'UUID est
// déterministe et IDENTIQUE à celui que le serveur calcule lui-même en offline
// (UUID v3 / MD5 de « OfflinePlayer:<pseudo> ») : le même pseudo retrouve donc
// toujours le même joueur (inventaire, position, permissions…).
const OFFLINE_NAME_RE = /^[A-Za-z0-9_]{3,16}$/

function offlineUuid(name) {
  const hash = crypto.createHash('md5').update(`OfflinePlayer:${name}`, 'utf8').digest()
  hash[6] = (hash[6] & 0x0f) | 0x30   // version 3 (name-based, MD5)
  hash[8] = (hash[8] & 0x3f) | 0x80   // variant RFC 4122
  const hex = hash.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

ipcMain.handle('login-offline', (_, rawName) => {
  try {
    const name = String(rawName ?? '').trim()
    if (!OFFLINE_NAME_RE.test(name)) {
      return { success: false, error: 'Pseudo invalide : 3 à 16 caractères (lettres, chiffres, _).' }
    }
    const token = {
      access_token:    '0',                // jeton factice : ignoré par un serveur en online-mode=false
      client_token:    crypto.randomUUID(),
      uuid:            offlineUuid(name),
      name,
      user_properties: '{}',
      offline:         true
    }
    currentToken = token
    saveSession(token)
    recordPlayerSeen(name)                 // sa tête apparaît dans le carrousel partagé
    return { success: true, username: name, uuid: token.uuid }
  } catch (e) {
    return { success: false, error: String(e.message || e) }
  }
})

// ─── MICROSOFT OAUTH ─────────────────────────────────────────────────────────
function openMicrosoftLogin() {
  return new Promise((resolve, reject) => {
    const CLIENT_ID  = '00000000402b5328'
    const REDIRECT   = 'https://login.live.com/oauth20_desktop.srf'
    const SCOPE      = 'service::user.auth.xboxlive.com::MBI_SSL'
    const AUTH_URL   =
      `https://login.live.com/oauth20_authorize.srf` +
      `?client_id=${CLIENT_ID}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(REDIRECT)}` +
      `&scope=${encodeURIComponent(SCOPE)}` +
      `&prompt=select_account`

    const authWin = new BrowserWindow({
      width: 500, height: 650,
      title: 'Connexion Microsoft',
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    })
    authWin.loadURL(AUTH_URL)
    authWin.removeMenu()

    let resolved = false

    const tryCapture = (url) => {
      if (!url.startsWith(REDIRECT) || resolved) return
      resolved = true
      authWin.destroy()
      const params = new URL(url).searchParams
      const err    = params.get('error')
      const code   = params.get('code')
      if (err)  reject(new Error(err))
      else if (code) resolve(code)
      else      reject(new Error('Pas de code dans la réponse'))
    }

    authWin.webContents.on('will-redirect', (_, url) => tryCapture(url))
    authWin.webContents.on('will-navigate',  (_, url) => tryCapture(url))
    authWin.on('closed', () => { if (!resolved) reject(new Error('Login annulé')) })
  })
}

function httpsPost(url, body, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const isJson   = typeof body === 'object'
    const payload  = isJson ? JSON.stringify(body) : body
    const urlObj   = new URL(url)
    const options  = {
      hostname: urlObj.hostname,
      path:     urlObj.pathname + urlObj.search,
      method:   'POST',
      headers:  {
        'Content-Type':   isJson ? 'application/json' : 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(payload),
        'Accept':         'application/json',
        ...extraHeaders
      }
    }
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', c => data += c)
      res.on('end', () => { try { resolve(JSON.parse(data)) } catch { resolve(data) } })
    })
    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    https.get(
      { hostname: urlObj.hostname, path: urlObj.pathname, headers },
      (res) => {
        let data = ''
        res.on('data', c => data += c)
        res.on('end', () => { try { resolve(JSON.parse(data)) } catch { resolve(data) } })
      }
    ).on('error', reject)
  })
}

async function exchangeCodeForMinecraftToken(code) {
  const CLIENT_ID = '00000000402b5328'
  const REDIRECT  = 'https://login.live.com/oauth20_desktop.srf'

  const ms = await httpsPost(
    'https://login.live.com/oauth20_token.srf',
    `client_id=${CLIENT_ID}&code=${code}&grant_type=authorization_code&redirect_uri=${encodeURIComponent(REDIRECT)}`
  )
  if (!ms.access_token) throw new Error('Échec token Microsoft : ' + JSON.stringify(ms))

  const xbl = await httpsPost('https://user.auth.xboxlive.com/user/authenticate', {
    Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: ms.access_token },
    RelyingParty: 'http://auth.xboxlive.com',
    TokenType: 'JWT'
  })

  const xsts = await httpsPost('https://xsts.auth.xboxlive.com/xsts/authorize', {
    Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.Token] },
    RelyingParty: 'rp://api.minecraftservices.com/',
    TokenType: 'JWT'
  })
  if (xsts.XErr) throw new Error(`Erreur XSTS ${xsts.XErr} — compte Xbox requis`)

  const uhs = xsts.DisplayClaims.xui[0].uhs
  const mc  = await httpsPost('https://api.minecraftservices.com/authentication/login_with_xbox', {
    identityToken: `XBL3.0 x=${uhs};${xsts.Token}`
  })
  if (!mc.access_token) throw new Error('Échec token Minecraft')

  const profile = await httpsGet(
    'https://api.minecraftservices.com/minecraft/profile',
    { Authorization: `Bearer ${mc.access_token}` }
  )
  if (!profile.name) throw new Error('Profil Minecraft introuvable — le compte a-t-il Minecraft ?')

  return {
    access_token:    mc.access_token,
    client_token:    crypto.randomUUID(),
    uuid:            profile.id,
    name:            profile.name,
    user_properties: '{}'
  }
}

ipcMain.handle('logout', () => {
  clearSession()
  return { success: true }
})

// ─── IPC : SKIN ──────────────────────────────────────────────────────────────
// Change de skin via l'API officielle Minecraft, exactement comme le vrai
// launcher : on lit le jeton Minecraft courant (Bearer) et on POST le PNG.
const MC_PROFILE_URL = 'https://api.minecraftservices.com/minecraft/profile'
const MC_SKINS_URL = 'https://api.minecraftservices.com/minecraft/profile/skins'

// Requête HTTPS authentifiée renvoyant { statusCode, json, text }
function mcAuthorizedRequest(method, url, { token, body, contentType } = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url)
    const headers = {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`
    }
    if (body) {
      headers['Content-Type'] = contentType
      headers['Content-Length'] = body.length
    }
    const req = https.request(
      { hostname: urlObj.hostname, path: urlObj.pathname + urlObj.search, method, headers },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          let json = null
          try { json = JSON.parse(text) } catch {}
          resolve({ statusCode: res.statusCode, json, text })
        })
      }
    )
    req.on('error', reject)
    // Évite un spinner infini côté UI si l'API Minecraft ne répond pas
    req.setTimeout(15000, () => req.destroy(new Error('Délai réseau dépassé — réessaie.')))
    if (body) req.write(body)
    req.end()
  })
}

// Construit un corps multipart/form-data { variant, file } pour l'upload de skin
function buildSkinMultipart(variant, pngBuffer, boundary) {
  const head =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="variant"\r\n\r\n` +
    `${variant}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="skin.png"\r\n` +
    `Content-Type: image/png\r\n\r\n`
  const tail = `\r\n--${boundary}--\r\n`
  return Buffer.concat([Buffer.from(head, 'utf8'), pngBuffer, Buffer.from(tail, 'utf8')])
}

// Lit largeur/hauteur depuis l'en-tête IHDR d'un PNG (null si signature invalide)
function pngDimensions(buf) {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (buf.length < 24) return null
  for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) return null
  // Le premier chunk d'un PNG est toujours IHDR (type aux octets 12-15)
  if (buf.toString('ascii', 12, 16) !== 'IHDR') return null
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

// Vrai si dimensions valides pour un skin Minecraft (64×64, ou 64×32 legacy)
function isValidSkinSize(dim) {
  return !!dim && dim.width === 64 && (dim.height === 64 || dim.height === 32)
}

// Normalise la variante renvoyée par l'API ("CLASSIC"/"SLIM") vers notre format
function normalizeVariant(v) {
  return String(v || 'classic').toLowerCase() === 'slim' ? 'slim' : 'classic'
}

function activeSkin(profileJson) {
  const skins = profileJson?.skins || []
  return skins.find((s) => s.state === 'ACTIVE') || skins[0] || null
}

// Télécharge le PNG du skin et le renvoie en data URL base64. Côté Node : pas de
// CORS, donc le renderer peut l'éditer (getImageData/toDataURL) sans canvas "tainted".
function fetchSkinDataUrl(skinUrl) {
  if (!skinUrl) return Promise.resolve(null)
  return new Promise((resolve) => {
    try {
      const urlObj = new URL(skinUrl)
      const req = https.get(
        { hostname: urlObj.hostname, path: urlObj.pathname + urlObj.search, headers: { 'User-Agent': 'Mozilla/5.0' } },
        (res) => {
          if (res.statusCode !== 200) { res.resume(); return resolve(null) }
          const chunks = []
          res.on('data', (c) => chunks.push(c))
          res.on('end', () => resolve(`data:image/png;base64,${Buffer.concat(chunks).toString('base64')}`))
        }
      )
      req.on('error', () => resolve(null))
      req.setTimeout(10000, () => req.destroy())
    } catch {
      resolve(null)
    }
  })
}

ipcMain.handle('get-skin-info', async () => {
  // Compte hors-ligne : aucun skin distant (pas de compte Mojang) → repli sur la
  // tête distante côté renderer, sans appel réseau inutile qui échouerait.
  if (currentToken?.offline) return { success: false, offline: true }
  if (!currentToken?.access_token) return { success: false, error: 'Non connecté', loggedOut: true }
  try {
    const res = await mcAuthorizedRequest('GET', MC_PROFILE_URL, { token: currentToken.access_token })
    if (res.statusCode === 401) return { success: false, error: 'Session expirée', expired: true }
    if (res.statusCode !== 200 || !res.json) return { success: false, error: `Erreur API (HTTP ${res.statusCode})` }
    const skin = activeSkin(res.json)
    return {
      success: true,
      variant: normalizeVariant(skin?.variant),
      skinUrl: skin?.url || null,
      skinDataUrl: await fetchSkinDataUrl(skin?.url),
      name: res.json.name,
      uuid: res.json.id
    }
  } catch (e) {
    return { success: false, error: String(e.message || e) }
  }
})

// ── Têtes des autres joueurs, TOUJOURS à jour (sans minotar/mc-heads) ──────────
// minotar/mc-heads cachent les têtes côté serveur (périmées des heures après un
// changement de skin). On résout donc le skin directement via l'API publique Mojang :
// pseudo → UUID → URL de texture (content-addressed : change à chaque nouveau skin).
// Cache + TTL (re-vérifie le profil régulièrement) + limite de concurrence (pas de
// rafale qui ferait rate-limiter Mojang). Le renderer compose la tête depuis ce skin.
const playerSkinCache = new Map()              // nameLower -> { uuid, skinUrl, dataUrl, checkedAt }
const PLAYER_SKIN_TTL = 5 * 60 * 1000          // re-vérifie le profil toutes les 5 min
let mojangActive = 0
const mojangQueue = []
async function withMojangLimit(fn) {
  if (mojangActive >= 6) await new Promise((r) => mojangQueue.push(r))
  mojangActive++
  try { return await fn() }
  finally { mojangActive--; const next = mojangQueue.shift(); if (next) next() }
}

async function resolvePlayerSkinDataUrl(name) {
  const key = (name || '').toLowerCase()
  if (!/^[a-z0-9_]{1,16}$/.test(key)) return null
  const cached = playerSkinCache.get(key)
  if (cached && Date.now() - cached.checkedAt < PLAYER_SKIN_TTL) return cached.dataUrl
  return withMojangLimit(async () => {
    try {
      let uuid = cached?.uuid
      if (!uuid) {
        const idRes = await httpsGet(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`)
        uuid = idRes && idRes.id ? idRes.id : null
        if (!uuid) return cached?.dataUrl ?? null            // pseudo inconnu / rate-limit → repli
      }
      const profile = await httpsGet(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`)
      const prop = (profile?.properties || []).find((p) => p.name === 'textures')
      let skinUrl = null
      if (prop?.value) {
        try {
          const decoded = JSON.parse(Buffer.from(prop.value, 'base64').toString('utf8'))
          skinUrl = decoded?.textures?.SKIN?.url ?? null
        } catch { /* base64/JSON invalide → repli */ }
      }
      if (!skinUrl) return cached?.dataUrl ?? null
      let dataUrl = cached?.dataUrl ?? null
      if (skinUrl !== cached?.skinUrl || !dataUrl) {
        dataUrl = await fetchSkinDataUrl(skinUrl)            // skin changé (URL ≠) → re-télécharge
      }
      if (dataUrl) playerSkinCache.set(key, { uuid, skinUrl, dataUrl, checkedAt: Date.now() })
      return dataUrl
    } catch {
      return cached?.dataUrl ?? null                          // réseau KO → on garde l'ancien
    }
  })
}

// Renvoie le PNG de skin (data URL) d'un joueur quelconque, pour rendre sa tête à jour.
ipcMain.handle('fetch-player-skin', async (_e, name) => {
  try { return await resolvePlayerSkinDataUrl(name) } catch { return null }
})

ipcMain.handle('pick-skin-file', async () => {
  const result = await dialog.showOpenDialog(win, {
    title: 'Choisir un skin Minecraft',
    properties: ['openFile'],
    filters: [{ name: 'Skin Minecraft (PNG)', extensions: ['png'] }]
  })
  if (result.canceled || !result.filePaths?.length) return { canceled: true }

  const filePath = result.filePaths[0]
  try {
    const buf = fs.readFileSync(filePath)
    const dim = pngDimensions(buf)
    if (!dim) return { canceled: false, error: 'Ce fichier n\'est pas un PNG valide.' }
    if (!isValidSkinSize(dim)) {
      return {
        canceled: false,
        error: `Un skin doit faire 64×64 px (ou 64×32). Détecté : ${dim.width}×${dim.height}.`
      }
    }
    return {
      canceled: false,
      path: filePath,
      name: path.basename(filePath),
      dataUrl: `data:image/png;base64,${buf.toString('base64')}`,
      width: dim.width,
      height: dim.height
    }
  } catch (e) {
    return { canceled: false, error: 'Lecture du fichier impossible : ' + e.message }
  }
})

ipcMain.handle('upload-skin', async (_, { variant, path: filePath, dataUrl } = {}) => {
  if (currentToken?.offline) return { success: false, error: 'Le changement de skin nécessite un compte Microsoft. En hors-ligne, le skin est géré côté serveur.', offline: true }
  if (!currentToken?.access_token) return { success: false, error: 'Non connecté', loggedOut: true }
  const v = normalizeVariant(variant)

  let buf
  if (dataUrl) {
    // Skin dessiné dans l'éditeur intégré (data:image/png;base64,...)
    try {
      buf = Buffer.from(String(dataUrl).split(',')[1] || '', 'base64')
    } catch {
      return { success: false, error: 'Image du skin invalide.' }
    }
  } else {
    try {
      buf = fs.readFileSync(filePath)
    } catch {
      return { success: false, error: 'Impossible de lire le fichier (déplacé ou supprimé ?).' }
    }
  }
  if (!isValidSkinSize(pngDimensions(buf))) {
    return { success: false, error: 'Le skin doit être un PNG de 64×64 pixels.' }
  }

  const boundary = '----RawLauncherSkin' + crypto.randomUUID().replace(/-/g, '')
  const body = buildSkinMultipart(v, buf, boundary)

  try {
    const res = await mcAuthorizedRequest('POST', MC_SKINS_URL, {
      token: currentToken.access_token,
      body,
      contentType: `multipart/form-data; boundary=${boundary}`
    })
    if (res.statusCode === 401) return { success: false, error: 'Session Minecraft expirée — reconnecte-toi.', expired: true }
    if (res.statusCode !== 200) {
      return { success: false, error: `Échec de l'envoi (HTTP ${res.statusCode}). ${(res.text || '').slice(0, 160)}` }
    }
    const skin = activeSkin(res.json)
    return { success: true, variant: normalizeVariant(skin?.variant) || v, skinUrl: skin?.url || null }
  } catch (e) {
    return { success: false, error: String(e.message || e) }
  }
})

ipcMain.handle('reset-skin', async () => {
  if (currentToken?.offline) return { success: false, error: 'Indisponible avec un compte hors-ligne.', offline: true }
  if (!currentToken?.access_token) return { success: false, error: 'Non connecté', loggedOut: true }
  try {
    const res = await mcAuthorizedRequest('DELETE', `${MC_SKINS_URL}/active`, { token: currentToken.access_token })
    if (res.statusCode === 401) return { success: false, error: 'Session Minecraft expirée — reconnecte-toi.', expired: true }
    if (res.statusCode !== 200) return { success: false, error: `Échec de la réinitialisation (HTTP ${res.statusCode}).` }
    const skin = activeSkin(res.json)
    return { success: true, variant: normalizeVariant(skin?.variant), skinUrl: skin?.url || null, skinDataUrl: await fetchSkinDataUrl(skin?.url) }
  } catch (e) {
    return { success: false, error: String(e.message || e) }
  }
})

// ─── IPC : BIBLIOTHÈQUE DE SKINS + EXPORT ─────────────────────────────────────
const SKINS_DIR = path.join(GAME_DIR, 'skins')
const LIBRARY_INDEX = path.join(SKINS_DIR, 'index.json')

function loadLibraryIndex() {
  try {
    if (fs.existsSync(LIBRARY_INDEX)) return JSON.parse(fs.readFileSync(LIBRARY_INDEX, 'utf8'))
  } catch {}
  return []
}

function saveLibraryIndex(list) {
  fs.mkdirSync(SKINS_DIR, { recursive: true })
  fs.writeFileSync(LIBRARY_INDEX, JSON.stringify(list))
}

function dataUrlToBuffer(dataUrl) {
  return Buffer.from(String(dataUrl).split(',')[1] || '', 'base64')
}

ipcMain.handle('library-list', () => {
  const out = []
  for (const e of loadLibraryIndex()) {
    try {
      const buf = fs.readFileSync(path.join(SKINS_DIR, `${e.id}.png`))
      out.push({
        id: e.id,
        name: e.name,
        variant: normalizeVariant(e.variant),
        createdAt: e.createdAt || 0,
        dataUrl: `data:image/png;base64,${buf.toString('base64')}`
      })
    } catch {}
  }
  out.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
  return out
})

ipcMain.handle('library-save', (_, { name, dataUrl, variant } = {}) => {
  try {
    const buf = dataUrlToBuffer(dataUrl)
    if (!isValidSkinSize(pngDimensions(buf))) return { success: false, error: 'Skin invalide (PNG 64×64 attendu).' }
    fs.mkdirSync(SKINS_DIR, { recursive: true })
    const id = crypto.randomUUID()
    fs.writeFileSync(path.join(SKINS_DIR, `${id}.png`), buf)
    const list = loadLibraryIndex()
    list.push({ id, name: String(name || 'Skin').slice(0, 60), variant: normalizeVariant(variant), createdAt: Date.now() })
    saveLibraryIndex(list)
    return { success: true, id }
  } catch (e) {
    return { success: false, error: String(e.message || e) }
  }
})

ipcMain.handle('library-delete', (_, id) => {
  try {
    saveLibraryIndex(loadLibraryIndex().filter((e) => e.id !== id))
    const f = path.join(SKINS_DIR, `${id}.png`)
    if (fs.existsSync(f)) fs.unlinkSync(f)
    return { success: true }
  } catch (e) {
    return { success: false, error: String(e.message || e) }
  }
})

ipcMain.handle('library-rename', (_, { id, name } = {}) => {
  try {
    const list = loadLibraryIndex()
    const entry = list.find((x) => x.id === id)
    if (entry) { entry.name = String(name || 'Skin').slice(0, 60); saveLibraryIndex(list) }
    return { success: true }
  } catch (e) {
    return { success: false, error: String(e.message || e) }
  }
})

ipcMain.handle('export-skin', async (_, { dataUrl, name } = {}) => {
  try {
    const buf = dataUrlToBuffer(dataUrl)
    if (!isValidSkinSize(pngDimensions(buf))) return { success: false, error: 'Skin invalide.' }
    const safe = (String(name || 'mon-skin').replace(/[^a-z0-9_-]+/gi, '_').slice(0, 40)) || 'mon-skin'
    const result = await dialog.showSaveDialog(win, {
      title: 'Exporter le skin en PNG',
      defaultPath: `${safe}.png`,
      filters: [{ name: 'Image PNG', extensions: ['png'] }]
    })
    if (result.canceled || !result.filePath) return { success: false, canceled: true }
    fs.writeFileSync(result.filePath, buf)
    return { success: true, path: result.filePath }
  } catch (e) {
    return { success: false, error: String(e.message || e) }
  }
})

// ─── IPC : MODPACK ───────────────────────────────────────────────────────────
// Vérifie qu'un .jar est un ZIP complet : présence de la signature de fin d'archive
// (EOCD « PK\x05\x06 ») dans les derniers octets. Un téléchargement tronqué (coupure
// réseau) ne l'a pas -> on considère le jar corrompu. Lecture de la seule fin du
// fichier : rapide et sans charger le jar en mémoire.
function isJarIntact(filePath) {
  let fd
  try {
    fd = fs.openSync(filePath, 'r')
    const size = fs.fstatSync(fd).size
    if (size < 22) return false
    const readLen = Math.min(size, 65557) // 22 (EOCD) + 65535 (commentaire ZIP max)
    const buf = Buffer.alloc(readLen)
    fs.readSync(fd, buf, 0, readLen, size - readLen)
    for (let i = buf.length - 22; i >= 0; i--) {
      if (buf[i] === 0x50 && buf[i + 1] === 0x4b && buf[i + 2] === 0x05 && buf[i + 3] === 0x06) return true
    }
    return false
  } catch (e) {
    return false
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd) } catch (e) { /* rien */ } }
  }
}

ipcMain.handle('check-modpack', async () => {
  const modsDir = path.join(GAME_DIR, 'mods')
  fs.mkdirSync(modsDir, { recursive: true })

  const knownMods = new Set(MODPACK.mods.map(m => m.name))
  for (const file of fs.readdirSync(modsDir)) {
    if (knownMods.has(file)) continue
    if (file.startsWith('.')) continue
    const fullPath = path.join(modsDir, file)
    try {
      const stat = fs.statSync(fullPath)
      if (stat.isDirectory()) continue
      fs.unlinkSync(fullPath)
    } catch (e) {
      console.log(`[RawLauncher] Impossible de supprimer ${file} :`, e.message)
    }
  }

  // Intégrité : un mod attendu mais corrompu/tronqué (ex. téléchargement coupé sur une
  // install antérieure au correctif downloadFile) est supprimé ici -> il repasse en
  // « manquant » et sera re-téléchargé proprement, sans aucune manip du joueur.
  for (const mod of MODPACK.mods) {
    const p = path.join(modsDir, mod.name)
    if (fs.existsSync(p) && !isJarIntact(p)) {
      try {
        fs.unlinkSync(p)
        console.log(`[RawLauncher] Mod corrompu supprimé (re-téléchargement) : ${mod.name}`)
      } catch (e) { /* rien */ }
    }
  }

  const missingMods = MODPACK.mods.filter(mod =>
    !fs.existsSync(path.join(modsDir, mod.name))
  )
  const needsNeoForge = !isNeoForgeInstalled()
  const missingShaders = missingShaderList().length

  return {
    total: MODPACK.mods.length,
    missingMods: missingMods.length,
    missingShaders,
    needsNeoForge
  }
})

ipcMain.handle('install-modpack', async () => {
  const modsDir = path.join(GAME_DIR, 'mods')
  fs.mkdirSync(modsDir, { recursive: true })

  try {
    const javaExe = await ensureJava21()

    if (!isNeoForgeInstalled()) {
      win?.webContents.send('install-progress', {
        step: 'neoforge',
        name: `Téléchargement NeoForge ${MODPACK.loaderVersion}...`,
        percent: 10
      })

      if (!fs.existsSync(NEOFORGE_INSTALLER_PATH)) {
        await downloadWithRetry(NEOFORGE_INSTALLER_URL, NEOFORGE_INSTALLER_PATH)
      }

      const profilesPath = path.join(GAME_DIR, 'launcher_profiles.json')
      if (!fs.existsSync(profilesPath)) {
        fs.mkdirSync(GAME_DIR, { recursive: true })
        fs.writeFileSync(profilesPath, JSON.stringify({
          profiles: {},
          selectedProfile: '(Default)',
          clientToken: crypto.randomUUID(),
          authenticationDatabase: {},
          launcherVersion: { name: '1.0.0', format: 21 }
        }, null, 2))
      }

      win?.webContents.send('install-progress', {
        step: 'neoforge',
        name: `Installation NeoForge (peut prendre 2-5 min)...`,
        percent: 30
      })

      await new Promise((resolve, reject) => {
        const proc = spawn(javaExe, [
          '-jar', NEOFORGE_INSTALLER_PATH,
          '--installClient', GAME_DIR
        ])

        let output = ''
        proc.stdout?.on('data', d => { output += d.toString() })
        proc.stderr?.on('data', d => { output += d.toString() })

        let pct = 30
        const tick = setInterval(() => {
          if (pct < 90) {
            pct += 2
            win?.webContents.send('install-progress', {
              step: 'neoforge',
              name: `Installation NeoForge (peut prendre 2-5 min)...`,
              percent: pct
            })
          }
        }, 3000)

        proc.on('close', (code) => {
          clearInterval(tick)
          if (code === 0) resolve()
          else reject(new Error(`Échec NeoForge (code ${code}).\n${output.slice(-400)}`))
        })
        proc.on('error', (err) => {
          clearInterval(tick)
          if (err.code === 'ENOENT') {
            reject(new Error(`Java non trouvé (essayé : ${javaExe})`))
          } else {
            reject(err)
          }
        })
      })
    }

    const missing = MODPACK.mods.filter(mod =>
      !fs.existsSync(path.join(modsDir, mod.name))
    )

    // Parallélisé (pool borné à 8). La plupart des mods sont sur Google Drive, qui bride
    // par fichier et peut renvoyer 429 si on l'inonde — 8 est un bon compromis (les
    // navigateurs ouvrent ~6 connexions/hôte), la robustesse venant de downloadWithRetry.
    // La progression compte les téléchargements TERMINÉS (ordre non garanti en parallèle).
    let done = 0
    await runPool(missing, 8, async (mod) => {
      await downloadWithRetry(mod.url, path.join(modsDir, mod.name))
      done++
      win?.webContents.send('install-progress', {
        step: 'mods',
        current: done,
        total: missing.length,
        name: mod.name,
        percent: Math.round((done / missing.length) * 100)
      })
    })

    // Shaderpacks (Iris) : déposés après les mods, disponibles dès le 1er lancement.
    await deployShaders()

    win?.webContents.send('install-progress', { done: true })
    return { success: true }

  } catch (e) {
    win?.webContents.send('install-progress', { error: true, message: e.message })
    return { success: false, error: e.message }
  }
})

function isNeoForgeInstalled() {
  const versionId = `neoforge-${MODPACK.loaderVersion}`
  const versionDir = path.join(GAME_DIR, 'versions', versionId)
  return fs.existsSync(versionDir)
}

function findJavaExecutable() {
  const baseDirs = [
    path.join(app.getPath('appData'), '.minecraft', 'runtime'),
    path.join(GAME_DIR, 'runtime')
  ]
  const binRels = javaBinRels()
  for (const base of baseDirs) {
    if (!fs.existsSync(base)) continue
    const entries = fs.readdirSync(base).sort().reverse()
    for (const name of entries) {
      for (const binRel of binRels) {
        // layout .minecraft : <base>/<comp>/<os>/<comp>/<binRel>
        for (const os of JAVA_PLATFORM_KEYS) {
          const c1 = path.join(base, name, os, name, binRel)
          if (fs.existsSync(c1)) return c1
        }
        // layout plat (notre propre téléchargement) : <base>/<comp>/<binRel>
        const c2 = path.join(base, name, binRel)
        if (fs.existsSync(c2)) return c2
      }
    }
  }
  return 'java'
}

async function ensureJava21() {
  if (fs.existsSync(JAVA_EXE)) return JAVA_EXE

  const existing = findJavaExecutable()
  if (existing !== 'java') return existing

  win?.webContents.send('install-progress', {
    step: 'java',
    name: 'Préparation : téléchargement de Java 21...',
    percent: 2
  })

  const allManifest = await httpsGet(JAVA_MANIFEST_URL)
  // Première clé OS réellement présente dans le manifeste (Apple Silicon → repli Intel).
  let entries = null
  for (const key of JAVA_PLATFORM_KEYS) {
    const e = allManifest?.[key]?.[JAVA_RUNTIME_NAME]
    if (e && e[0]) { entries = e; break }
  }
  if (!entries) throw new Error('Runtime Java 21 introuvable (manifest Mojang)')

  const manifest = await httpsGet(entries[0].manifest.url)
  const allEntries = Object.entries(manifest.files)
  const files = allEntries.filter(([_, f]) => f.type === 'file')

  // Le JRE Mojang = des centaines de petits fichiers : c'est la latence par requête qui
  // domine, pas le débit. Un pool large (16) + keep-alive masque cette latence et réduit
  // drastiquement la durée de cette phase.
  let done = 0
  await runPool(files, 16, async ([relPath, info]) => {
    const dest = path.join(JAVA_DIR, relPath)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    await downloadWithRetry(info.downloads.raw.url, dest)
    // macOS/Linux : rétablir le bit exécutable, sinon `spawn ... EACCES` au lancement.
    if (info.executable && process.platform !== 'win32') {
      try { fs.chmodSync(dest, 0o755) } catch { /* best-effort */ }
    }
    done++
    if (done % 5 === 0 || done === files.length) {
      win?.webContents.send('install-progress', {
        step: 'java',
        name: `Téléchargement de Java 21... (${done}/${files.length})`,
        percent: 2 + Math.round((done / files.length) * 28)
      })
    }
  })

  // macOS : recréer les liens symboliques du bundle JRE (≈200 liens, indispensables
  // au démarrage de Java). Le code ne les téléchargeait pas → bundle cassé sur Mac.
  for (const [relPath, info] of allEntries) {
    if (info.type !== 'link') continue
    const dest = path.join(JAVA_DIR, relPath)
    try {
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      try { fs.unlinkSync(dest) } catch { /* rien à retirer */ }
      fs.symlinkSync(info.target, dest)
    } catch (e) { console.warn('[java] lien non recréé :', relPath, e.message) }
  }

  return JAVA_EXE
}

// ─── NEOFORGE JVM ARGS ───────────────────────────────────────────────────────
// Nom d'OS au format manifeste Mojang (windows/osx/linux), pour évaluer les règles
// de librairies selon la plateforme RÉELLE (était codé en dur 'windows' → sur Mac,
// les libs OS-spécifiques étaient mal filtrées).
const MOJANG_OS = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'osx' : 'linux'

function libRuleAllows(rules) {
  if (!rules || rules.length === 0) return true
  let result = false
  for (const rule of rules) {
    let applies = true
    if (rule.os && rule.os.name && rule.os.name !== MOJANG_OS) applies = false
    if (applies) result = rule.action === 'allow'
  }
  return result
}

function libNameToPath(name) {
  const parts = name.split(':')
  if (parts.length < 3) return null
  const [group, artifact, version, classifier] = parts
  const file = `${artifact}-${version}${classifier ? '-' + classifier : ''}.jar`
  return path.join(group.replace(/\./g, '/'), artifact, version, file)
}

function collectLibraryPaths(libraries) {
  const out = []
  for (const lib of libraries || []) {
    if (!lib.name) continue
    if (!libRuleAllows(lib.rules)) continue
    if (lib.name.includes(':natives')) continue
    const rel = libNameToPath(lib.name)
    if (!rel) continue
    out.push(path.join(GAME_DIR, 'libraries', rel))
  }
  return out
}

function buildNeoForgeJvmArgs() {
  try {
    const vanillaJsonPath = path.join(GAME_DIR, 'versions', MODPACK.minecraft, `${MODPACK.minecraft}.json`)
    const neoVersionId = `neoforge-${MODPACK.loaderVersion}`
    const neoJsonPath = path.join(GAME_DIR, 'versions', neoVersionId, `${neoVersionId}.json`)

    if (!fs.existsSync(vanillaJsonPath) || !fs.existsSync(neoJsonPath)) return null

    const vanillaJson = JSON.parse(fs.readFileSync(vanillaJsonPath, 'utf8'))
    const neoJson = JSON.parse(fs.readFileSync(neoJsonPath, 'utf8'))

    if (!Array.isArray(neoJson?.arguments?.jvm)) return null

    const libraryDir = path.join(GAME_DIR, 'libraries')
    const clientJar = path.join(GAME_DIR, 'versions', MODPACK.minecraft, `${MODPACK.minecraft}.jar`)

    const cpEntries = []
    for (const p of collectLibraryPaths(vanillaJson.libraries)) {
      if (!cpEntries.includes(p)) cpEntries.push(p)
    }
    for (const p of collectLibraryPaths(neoJson.libraries)) {
      if (!cpEntries.includes(p)) cpEntries.push(p)
    }
    if (fs.existsSync(clientJar)) cpEntries.push(clientJar)

    // Séparateur de chemin natif : ';' sur Windows, ':' sur macOS/Linux. Était codé
    // en dur ';' → sur Mac le module-path NeoForge (-p) devenait un seul chemin invalide
    // → BootstrapLauncher ne trouvait plus ses modules → crash au lancement (code 1).
    const classpath = cpEntries.join(path.delimiter)

    const vars = {
      '${library_directory}': libraryDir,
      '${classpath_separator}': path.delimiter,
      '${version_name}': neoVersionId,
      '${classpath}': classpath
    }

    const substitute = (str) => {
      let out = str
      for (const [k, v] of Object.entries(vars)) out = out.split(k).join(v)
      return out
    }

    const jvmArgs = []
    for (const entry of neoJson.arguments.jvm) {
      if (typeof entry === 'string') {
        jvmArgs.push(substitute(entry))
      } else if (entry && typeof entry === 'object') {
        if (!libRuleAllows(entry.rules)) continue
        const values = Array.isArray(entry.value) ? entry.value : [entry.value]
        for (const v of values) jvmArgs.push(substitute(v))
      }
    }

    return jvmArgs.length ? jvmArgs : null
  } catch (e) {
    console.log('[RawLauncher] Impossible de reconstruire les args JVM NeoForge :', e.message)
    return null
  }
}

// ─── IPC : LAUNCH ────────────────────────────────────────────────────────────
// ─── CONFIGS ─────────────────────────────────────────────────────────────────
// Beaucoup de mods (owo-lib : simplehats, walkers, craftedcore… qui sérialisent
// en JSON5 via jankson) rangent leurs options dans des structures IMBRIQUÉES.
// Écraser bêtement le fichier casse la config : ex. simplehats range
// "allowHatInHelmetSlot" sous "COMMON". Si la valeur client ne correspond pas à
// celle du serveur au moment de la connexion, owo affiche
// "unrecoverable config mismatch" (l'option est synchronisée mais exige un
// redémarrage client). On force donc la bonne valeur AVANT chaque lancement.
//
// Deux modes par entrée de MODPACK.configs :
//   • { path, content }      → écrit le fichier tel quel (fichier complet)
//   • { path, merge: {...} } → fusionne EN PROFONDEUR le patch dans le fichier
//                              existant (JSON5 toléré), en ne touchant QUE les
//                              clés indiquées. Préserve le reste (préférences
//                              client, poids de loot, autres valeurs synchronisées).

// Retire les commentaires // et /* */ d'un JSON5 (en respectant les chaînes),
// puis les éventuelles virgules traînantes. Suffisant pour les fichiers jankson
// produits par owo-lib (clés entre guillemets).
function stripJson5(src) {
  src = src.replace(/^﻿/, '')
  let out = ''
  let inStr = false, inLine = false, inBlock = false, esc = false
  for (let i = 0; i < src.length; i++) {
    const c = src[i], n = src[i + 1]
    if (inLine) { if (c === '\n') { inLine = false; out += c } continue }
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i++ } continue }
    if (inStr) {
      out += c
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') { inStr = true; out += c; continue }
    if (c === '/' && n === '/') { inLine = true; i++; continue }
    if (c === '/' && n === '*') { inBlock = true; i++; continue }
    out += c
  }
  return out.replace(/,(\s*[}\]])/g, '$1')
}

// Fusion profonde de `patch` dans `base` (objets simples ; tableaux et scalaires
// du patch remplacent ceux de la base).
function deepMerge(base, patch) {
  if (base === null || typeof base !== 'object' || Array.isArray(base)) return patch
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch
  const out = { ...base }
  for (const k of Object.keys(patch)) {
    out[k] = (k in base) ? deepMerge(base[k], patch[k]) : patch[k]
  }
  return out
}

// Patch « ligne par ligne » pour les configs texte à plat de type FancyMenu / Konkrete
// (config/fancymenu/options.txt). Format strict : des sections « ##[nom] » puis des lignes
// « T:clé = 'valeur'; » (T = préfixe de type B/S/I/L/D/F). Le parseur Konkrete IGNORE
// silencieusement toute clé hors d'une section, exige le préfixe de type, les quotes
// simples, le « ; » final, et lit en UTF-8 SANS BOM — d'où le format reproduit à
// l'identique. On REMPLACE uniquement les lignes ciblées : les ~90 autres options
// écrites par FancyMenu sont préservées. Si une clé manque, on l'insère sous sa section
// (créée au besoin). Au tout premier lancement le fichier n'existe pas encore : on le
// crée, et FancyMenu le complète ensuite avec ses défauts SANS écraser nos valeurs
// (registerValue ne réécrit jamais une clé déjà présente dans le fichier).
function setConfigLines(filePath, section, setLines) {
  const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  let content = ''
  if (fs.existsSync(filePath)) {
    try { content = fs.readFileSync(filePath, 'utf8') } catch (e) { content = '' }
  }

  const pending = []
  for (const [key, line] of Object.entries(setLines)) {
    // Tolère CRLF/LF, l'indentation (que le parseur refuserait) et n'importe quel préfixe
    // de type déjà en place ; on réécrit toujours la ligne canonique fournie.
    const re = new RegExp(`^[ \\t]*(?:[A-Za-z]:)?${esc(key)}[ \\t]*=[^\\r\\n]*$`, 'm')
    if (re.test(content)) content = content.replace(re, line)
    else pending.push(line)
  }

  if (pending.length) {
    const block = pending.join('\n')
    let secHeaderEnd = -1
    if (section) {
      const m = content.match(new RegExp(`^##\\[${esc(section)}\\][ \\t]*$`, 'm'))
      if (m) secHeaderEnd = m.index + m[0].length
    }
    if (secHeaderEnd >= 0) {
      // Insère juste sous l'en-tête de section existant
      content = content.slice(0, secHeaderEnd) + '\n' + block + content.slice(secHeaderEnd)
    } else {
      // Section absente (ou fichier vide / 1er lancement) : on (re)crée la section
      const header = section ? `##[${section}]\n\n` : ''
      content = content.trim() === ''
        ? `${header}${block}\n`
        : content.replace(/\s*$/, '') + `\n\n${header}${block}\n`
    }
  }

  fs.writeFileSync(filePath, content, 'utf8')
}

function deployConfigs() {
  if (!MODPACK.configs || !MODPACK.configs.length) return
  for (const cfg of MODPACK.configs) {
    const dest = path.join(GAME_DIR, cfg.path)
    fs.mkdirSync(path.dirname(dest), { recursive: true })

    if (cfg.merge) {
      let base = {}
      if (fs.existsSync(dest)) {
        try {
          base = JSON.parse(stripJson5(fs.readFileSync(dest, 'utf8')))
        } catch (e) {
          console.log('[RawLauncher] Config illisible, réécriture minimale :', cfg.path, e.message)
          base = {}
        }
      }
      const merged = deepMerge(base, cfg.merge)
      fs.writeFileSync(dest, JSON.stringify(merged, null, '\t') + '\n', 'utf8')
      console.log('[RawLauncher] Config fusionnée :', cfg.path)
    } else if (typeof cfg.content === 'string') {
      fs.writeFileSync(dest, cfg.content, 'utf8')
      console.log('[RawLauncher] Config déployée :', cfg.path)
    } else if (cfg.setLines && typeof cfg.setLines === 'object') {
      setConfigLines(dest, cfg.section || null, cfg.setLines)
      console.log('[RawLauncher] Config patchée (lignes) :', cfg.path)
    }
  }
}

// ─── SHADERS (Iris) ───────────────────────────────────────────────────────────
// Iris lit les shaderpacks depuis GAME_DIR/shaderpacks/ (≠ 'shaders/', qui est le
// dossier d'OptiFine, absent de ce pack). On y dépose les packs listés dans
// MODPACK.shaders pour qu'ils soient disponibles « de base » dans le menu vidéo
// (aucun n'est activé d'office). Contrairement aux mods, on NE SUPPRIME PAS les
// fichiers inconnus : le joueur peut ajouter ses propres shaderpacks.
const SHADERPACKS_DIR = path.join(GAME_DIR, 'shaderpacks')

// Liste des shaderpacks attendus mais absents. Au passage, supprime un pack ATTENDU
// mais corrompu (.zip tronqué d'un téléchargement coupé) pour qu'il soit
// re-téléchargé proprement (isJarIntact vérifie l'EOCD ZIP, valable pour un .zip).
function missingShaderList() {
  const shaders = MODPACK.shaders || []
  if (!shaders.length) return []
  fs.mkdirSync(SHADERPACKS_DIR, { recursive: true })
  for (const s of shaders) {
    const p = path.join(SHADERPACKS_DIR, s.name)
    if (fs.existsSync(p) && !isJarIntact(p)) {
      try {
        fs.unlinkSync(p)
        console.log(`[RawLauncher] Shader corrompu supprimé (re-téléchargement) : ${s.name}`)
      } catch (e) { /* rien */ }
    }
  }
  return shaders.filter(s => !fs.existsSync(path.join(SHADERPACKS_DIR, s.name)))
}

// Télécharge les shaderpacks manquants dans GAME_DIR/shaderpacks/ (progression UI
// via 'install-progress' step 'shaders', rendu comme les mods côté renderer).
async function deployShaders() {
  const missing = missingShaderList()
  if (!missing.length) return
  let done = 0
  await runPool(missing, 4, async (s) => {
    await downloadWithRetry(s.url, path.join(SHADERPACKS_DIR, s.name))
    done++
    win?.webContents.send('install-progress', {
      step: 'shaders',
      current: done,
      total: missing.length,
      name: s.name,
      percent: Math.round((done / missing.length) * 100)
    })
  })
}

// ─── IPC : RÉGLAGES ──────────────────────────────────────────────────────────
ipcMain.handle('get-settings', () => {
  const info = ramInfo()
  return {
    ram: info.ram,
    defaultRam: info.def,
    minRam: info.min,
    maxRam: info.max,
    recommendedRam: info.recommended,
    totalGb: info.totalGb,
    custom: info.custom,
    version: app.getVersion(),
  }
})

ipcMain.handle('set-settings', (_e, payload) => {
  try {
    const info = ramInfo()
    const settings = loadSettings()
    const raw = Number(payload && payload.ram)
    if (Number.isFinite(raw) && raw > 0) {
      settings.ramGb = Math.min(info.max, Math.max(info.min, roundTenth(raw)))
    } else {
      delete settings.ramGb            // réinitialisation → retour au défaut automatique
    }
    saveSettings(settings)
    return { success: true, ram: settings.ramGb ?? info.def }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('launch', async () => {
  if (!currentToken) return { success: false, error: 'Non connecté' }

  // Applique les configs requises par le serveur à chaque lancement
  // (corrige aussi les installations existantes sans réinstallation complète)
  deployConfigs()

  const javaExe = await ensureJava21()
  const launcher = new Client()

  const neoForgeJvmArgs = buildNeoForgeJvmArgs()

  const AIKAR_GC_FLAGS = [
    '-XX:+UseG1GC',
    '-XX:+ParallelRefProcEnabled',
    '-XX:MaxGCPauseMillis=200',
    '-XX:+UnlockExperimentalVMOptions',
    '-XX:+DisableExplicitGC',
    '-XX:+AlwaysPreTouch',
    '-XX:G1NewSizePercent=30',
    '-XX:G1MaxNewSizePercent=40',
    '-XX:G1HeapRegionSize=8M',
    '-XX:G1ReservePercent=20',
    '-XX:G1HeapWastePercent=5',
    '-XX:G1MixedGCCountTarget=4',
    '-XX:InitiatingHeapOccupancyPercent=15',
    '-XX:G1MixedGCLiveThresholdPercent=90',
    '-XX:G1RSetUpdatingPauseTimePercent=5',
    '-XX:SurvivorRatio=32',
    '-XX:+PerfDisableSharedMem',
    '-XX:MaxTenuringThreshold=1'
  ]

  // RAM allouée : réglage utilisateur (ou défaut), clampé à la RAM physique.
  // On dérive Xms du Xmx pour garantir Xms ≤ Xmx (sinon la JVM refuse de démarrer).
  const ramMaxGb = resolveRamGb()
  const ramMinGb = Math.min(MODPACK.minRam ?? 2, ramMaxGb)
  // La JVM n'accepte pas de décimale dans -Xmx/-Xms : on convertit en Mo entiers
  // (ex. 6,5 Go → 6656 Mo ; vrai aussi pour les entiers : 8 Go = 8192 Mo).
  const ramMaxMb = Math.round(ramMaxGb * 1024)
  const ramMinMb = Math.round(ramMinGb * 1024)
  console.log(`[RawLauncher] RAM allouée : ${ramMaxGb}G / ${ramMaxMb}M (min ${ramMinGb}G)`)

  const opts = {
    authorization: currentToken,
    root: GAME_DIR,
    version: {
      number: MODPACK.minecraft,
      type: 'release',
      custom: `neoforge-${MODPACK.loaderVersion}`
    },
    memory: {
      max: `${ramMaxMb}M`,
      min: `${ramMinMb}M`
    },
    javaPath: javaExe,
    customArgs: [
      ...AIKAR_GC_FLAGS,
      ...(neoForgeJvmArgs || [
        '--add-opens', 'java.base/java.util.jar=cpw.mods.securejarhandler',
        '--add-opens', 'java.base/java.lang.invoke=cpw.mods.securejarhandler',
        '--add-opens', 'java.base/java.lang.invoke=ALL-UNNAMED',
        '--add-exports', 'java.base/sun.security.util=cpw.mods.securejarhandler',
        '--add-exports', 'jdk.naming.dns/com.sun.jndi.dns=java.naming'
      ])
    ]
  }

  let logBuffer = []
  // Buffer porté à 400 lignes : une stacktrace de crash NeoForge/mod dépasse 60 lignes.
  const pushLog = (line) => { logBuffer.push(line); if (logBuffer.length > 400) logBuffer.shift() }
  launcher.on('data', (e) => {
    const line = e.toString()
    pushLog(line)
    win?.webContents.send('game-log', line)
  })
  launcher.on('progress', (e) => win?.webContents.send('launch-progress', e))
  // On capture aussi les messages 'debug' de MCLC (ligne de commande JVM, étapes) :
  // précieux pour diagnostiquer un échec de lancement.
  launcher.on('debug', (e) => { pushLog('[MCLC] ' + e); console.log('[MCLC debug]', e) })
  launcher.on('close', (code) => {
    win?.show()
    const log = logBuffer.join('\n')
    if (code && code !== 0) {                       // crash : on persiste le log sur disque
      try {
        const logDir = path.join(GAME_DIR, 'logs')
        fs.mkdirSync(logDir, { recursive: true })
        fs.writeFileSync(path.join(logDir, 'last-crash.log'), log)
      } catch { /* best-effort */ }
    }
    win?.webContents.send('game-closed', { code, log })
  })

  try {
    const proc = await launcher.launch(opts)
    if (!proc || !proc.pid) return { success: false, error: 'Minecraft n\'a pas démarré (pas de PID)' }
    win?.hide()
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// ─── FIREBASE ────────────────────────────────────────────────────────────────
// Remplissez ces valeurs après avoir créé un projet Firebase :
// 1. https://console.firebase.google.com → Nouveau projet
// 2. Build → Realtime Database → Créer une base de données (mode test puis sécurisé)
// 3. URL de la base : onglet "Données" → l'URL en haut (ex: https://mon-projet-default-rtdb.firebaseio.com)
// 4. Secret : Paramètres du projet → Comptes de service → Secrets de base de données (section "Legacy")
const FIREBASE_DATABASE_URL = 'https://zig-base-default-rtdb.europe-west1.firebasedatabase.app'
const FIREBASE_SECRET = 'kC9FjebZUTe2rh6RPkjWWjx0YP6NIvXnbMmrOEgm'
// Bucket Firebase Storage (médias du chat). À CONFIRMER dans la console Firebase →
// Storage (l'URL gs:// affichée en haut). Les projets récents utilisent
// `zig-base.firebasestorage.app` ; les anciens `zig-base.appspot.com`. Si l'upload
// renvoie un 404, basculer sur l'autre valeur.
const FIREBASE_STORAGE_BUCKET = 'zig-base.firebasestorage.app'

function isFirebaseConfigured() {
  return (
    typeof FIREBASE_DATABASE_URL === 'string' &&
    FIREBASE_DATABASE_URL.startsWith('https://') &&
    !FIREBASE_DATABASE_URL.includes('YOUR-PROJECT-ID') &&
    typeof FIREBASE_SECRET === 'string' &&
    FIREBASE_SECRET.length > 10 &&
    !FIREBASE_SECRET.includes('YOUR-DATABASE-SECRET')
  )
}

function firebaseRequest(method, fbPath, data, useAuth) {
  return new Promise((resolve, reject) => {
    let urlStr = `${FIREBASE_DATABASE_URL}${fbPath}.json`
    if (useAuth) urlStr += `?auth=${encodeURIComponent(FIREBASE_SECRET)}`

    const urlObj = new URL(urlStr)
    const payload = (data !== null && data !== undefined) ? JSON.stringify(data) : null

    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        'Accept': 'application/json',
        ...(payload !== null ? {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        } : {})
      }
    }

    const req = https.request(options, (res) => {
      let body = ''
      res.on('data', c => body += c)
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error(`Firebase HTTP ${res.statusCode}: ${String(body).slice(0, 200)}`))
        }
        try { resolve(JSON.parse(body)) }
        catch { resolve(body || null) }
      })
    })

    req.on('error', reject)
    if (payload !== null) req.write(payload)
    req.end()
  })
}

// ─── HISTORIQUE PARTAGÉ DES JOUEURS VUS (carrousel d'accueil) ─────────────────
// Le carrousel affiche les têtes des joueurs qui se sont déjà connectés au
// serveur. Le ping SLP ne donne que les joueurs EN LIGNE à l'instant T, et le
// fichier players-seen.json est purement local → un nouvel install n'a aucune
// tête (que des Steve). On centralise donc l'historique dans Firebase
// (/playersSeen = { pseudo: premièreVue }) : chaque launcher y pousse les joueurs
// vus en ligne + son propre pseudo, et tout le monde lit la liste complète.
// Les pseudos Minecraft ([A-Za-z0-9_], 1-16) sont des clés Firebase valides. On
// rejette en plus les pseudos purement numériques : Realtime Database coerce un
// objet à clés entières en TABLEAU au GET, ce qui polluerait la liste.
const PLAYER_NAME_RE = /^[A-Za-z0-9_]{1,16}$/
function isValidPlayerName(n) { return PLAYER_NAME_RE.test(n) && !/^\d+$/.test(n) }

function sanitizePlayerNames(input) {
  const arr = Array.isArray(input) ? input : String(input ?? '').split(/[\s,;]+/)
  const seen = new Set()
  const out = []
  for (const raw of arr) {
    const n = String(raw ?? '').trim()
    if (isValidPlayerName(n) && !seen.has(n)) { seen.add(n); out.push(n) }
  }
  return out
}

// Normalise une réponse Firebase en objet { clé: valeur } : rejette les non-objets
// et reconvertit les tableaux (coercition Realtime DB) en filtrant les trous null.
function normalizeFbMap(data) {
  if (!data || typeof data !== 'object') return {}
  if (Array.isArray(data)) {
    const out = {}
    data.forEach((v, i) => { if (v != null) out[String(i)] = v })
    return out
  }
  return data
}

// Historique partagé + liste des pseudos masqués (lecture publique). Lèvent en
// cas d'erreur réseau (le caller décide du repli hors-ligne).
async function fetchSharedPlayersSeen() {
  return normalizeFbMap(await firebaseRequest('GET', '/playersSeen', null, false))
}
async function fetchHiddenPlayers() {
  return normalizeFbMap(await firebaseRequest('GET', '/playersHidden', null, false))
}

// Pousse les pseudos non encore présents (et non masqués) dans l'historique
// partagé, en préservant les horodatages existants. Met à jour le cache local.
// Renvoie { added, skipped }.
async function pushPlayersSeen(rawNames) {
  if (!isFirebaseConfigured()) return { added: [], skipped: [] }
  const names = sanitizePlayerNames(rawNames)
  if (!names.length) return { added: [], skipped: [] }

  let remote = {}, hidden = {}
  try { [remote, hidden] = await Promise.all([fetchSharedPlayersSeen(), fetchHiddenPlayers()]) }
  catch { remote = {}; hidden = {} }

  // Comparaison insensible à la casse (identité Minecraft) : ne pas créer « Woxdfor »
  // à côté de « WoxDfor », ni ré-ajouter un pseudo masqué sous une autre casse.
  const remoteLower = new Set(Object.keys(remote).map(s => s.toLowerCase()))
  const hiddenLower = new Set(Object.keys(hidden).map(s => s.toLowerCase()))
  const now = Date.now()
  const patch = {}
  const added = []
  for (const n of names) {
    const key = n.toLowerCase()
    if (!remoteLower.has(key) && !hiddenLower.has(key)) {
      patch[n] = now; added.push(n); remoteLower.add(key)
    }
  }

  if (added.length) {
    await firebaseRequest('PATCH', '/playersSeen', patch, true)
    const local = loadPlayersSeen()
    for (const n of added) if (!local[n]) local[n] = now
    savePlayersSeen(local)
  }
  return { added, skipped: names.filter(n => !added.includes(n)) }
}

// Enregistre un joueur : cache local IMMÉDIAT (sa tête apparaît dès le prochain
// chargement même avant la synchro réseau) puis push partagé non bloquant.
function recordPlayerSeen(name) {
  if (!name || !isValidPlayerName(name)) return
  const local = loadPlayersSeen()
  if (!(name in local)) { local[name] = Date.now(); savePlayersSeen(local) }
  Promise.resolve().then(() => pushPlayersSeen([name])).catch(() => {})
}

async function initializeAdmins() {
  if (!isFirebaseConfigured()) return
  try {
    const existing = await firebaseRequest('GET', '/admins', null, false)
    if (!existing || existing === 'null') {
      await firebaseRequest('PUT', '/admins', { Mamazorus: true }, true)
      console.log('[Admin] Base admins initialisée avec Mamazorus')
    }
  } catch (e) {
    console.log('[Admin] Impossible d\'initialiser les admins :', e.message)
  }
}

// ─── IPC : FIREBASE / ADMIN ───────────────────────────────────────────────────
ipcMain.handle('get-firebase-status', () => ({ configured: isFirebaseConfigured() }))

ipcMain.handle('check-admin', async () => {
  if (!isFirebaseConfigured()) return { isAdmin: false }
  // Un compte hors-ligne (cracké) ne peut jamais être admin : le pseudo n'est pas
  // vérifié par Mojang, donc n'importe qui pourrait usurper celui d'un admin.
  if (currentToken?.offline) return { isAdmin: false }
  const username = loadSession()
  if (!username) return { isAdmin: false }
  try {
    const value = await firebaseRequest('GET', `/admins/${username}`, null, false)
    return { isAdmin: value === true }
  } catch {
    return { isAdmin: false }
  }
})

ipcMain.handle('get-news', async () => {
  if (!isFirebaseConfigured()) return { success: false, news: [] }
  try {
    const data = await firebaseRequest('GET', '/news', null, false)
    if (!data || data === 'null') return { success: true, news: [] }
    const news = Object.entries(data).map(([id, item]) => ({ id, ...item }))
    // Ordre manuel prioritaire (champ `order`, croissant = du haut vers le bas) ;
    // les actus jamais réordonnées (sans `order`) retombent sur le chronologique
    // inverse (la plus récente d'abord). Renvoie tout, y compris les masquées :
    // le dashboard admin les gère, le launcher filtre `hidden` à l'affichage.
    news.sort((a, b) => {
      const ao = typeof a.order === 'number' ? a.order : Infinity
      const bo = typeof b.order === 'number' ? b.order : Infinity
      if (ao !== bo) return ao - bo
      return (b.createdAt || 0) - (a.createdAt || 0)
    })
    return { success: true, news }
  } catch (e) {
    return { success: false, news: [], error: e.message }
  }
})

// ─── IPC : STATISTIQUES (classement) ─────────────────────────────────────────
// Les stats détaillées ne sont PAS accessibles par le ping du jeu (SLP ne donne
// que les pseudos en ligne). Un exporteur tourne côté serveur (tools/zig-stats-
// exporter) : il lit les fichiers world/stats/*.json et publie un classement dans
// Firebase /stats = { pseudo: { play_time, distance, mined, ... } }. Le launcher
// se contente de relire ce nœud (lecture publique, pas d'auth requise).
ipcMain.handle('get-stats', async () => {
  if (!isFirebaseConfigured()) return { success: false, players: [], updatedAt: null, error: 'Firebase non configuré' }
  try {
    const [data, meta] = await Promise.all([
      firebaseRequest('GET', '/stats', null, false),
      firebaseRequest('GET', '/statsMeta', null, false)
    ])
    const map = normalizeFbMap(data)
    const players = Object.entries(map)
      .filter(([, stats]) => stats && typeof stats === 'object')
      .map(([name, stats]) => ({ name, stats }))
    const updatedAt = (meta && typeof meta === 'object' && typeof meta.updatedAt === 'number') ? meta.updatedAt : null
    return { success: true, players, updatedAt }
  } catch (e) {
    return { success: false, players: [], updatedAt: null, error: e.message }
  }
})

ipcMain.handle('create-news', async (_, newsData) => {
  if (!isFirebaseConfigured()) return { success: false, error: 'Firebase non configuré' }
  const gate = await requireAdminSession()
  if (!gate.ok) return { success: false, error: gate.error }
  try {
    const result = await firebaseRequest('POST', '/news', { ...newsData, createdAt: Date.now() }, true)
    return { success: true, id: result?.name }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('update-news', async (_, { id, ...newsData }) => {
  if (!isFirebaseConfigured()) return { success: false, error: 'Firebase non configuré' }
  const gate = await requireAdminSession()
  if (!gate.ok) return { success: false, error: gate.error }
  try {
    await firebaseRequest('PATCH', `/news/${id}`, newsData, true)
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('delete-news', async (_, id) => {
  if (!isFirebaseConfigured()) return { success: false, error: 'Firebase non configuré' }
  const gate = await requireAdminSession()
  if (!gate.ok) return { success: false, error: gate.error }
  try {
    await firebaseRequest('DELETE', `/news/${id}`, null, true)
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// ─── IPC : FONDS D'ÉCRAN ──────────────────────────────────────────────────────
// Bibliothèque d'images de fond gérée par les admins. Le launcher en tire une au
// hasard à chaque lancement (côté renderer). /backgrounds = { id: { url,
// fileName?, uploadedAt } }. Lecture publique (tout joueur), écriture admin.
ipcMain.handle('get-backgrounds', async () => {
  if (!isFirebaseConfigured()) return { success: false, backgrounds: [] }
  try {
    const data = await firebaseRequest('GET', '/backgrounds', null, false)
    if (!data || data === 'null') return { success: true, backgrounds: [] }
    const backgrounds = Object.entries(normalizeFbMap(data))
      .filter(([, b]) => b && typeof b === 'object' && b.url)
      .map(([id, b]) => ({ id, ...b }))
    backgrounds.sort((a, b) => (b.uploadedAt || 0) - (a.uploadedAt || 0))
    return { success: true, backgrounds }
  } catch (e) {
    return { success: false, backgrounds: [], error: e.message }
  }
})

ipcMain.handle('create-background', async (_, data) => {
  if (!isFirebaseConfigured()) return { success: false, error: 'Firebase non configuré' }
  const gate = await requireAdminSession()
  if (!gate.ok) return { success: false, error: gate.error }
  const url = String(data?.url ?? '').trim()
  if (!/^https?:\/\//i.test(url)) return { success: false, error: 'URL invalide.' }
  try {
    const result = await firebaseRequest('POST', '/backgrounds', {
      url: url.slice(0, 1024),
      fileName: String(data?.fileName ?? '').slice(0, 120),
      uploadedAt: Date.now(),
    }, true)
    return { success: true, id: result?.name }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('delete-background', async (_, id) => {
  if (!isFirebaseConfigured()) return { success: false, error: 'Firebase non configuré' }
  const gate = await requireAdminSession()
  if (!gate.ok) return { success: false, error: gate.error }
  try {
    await firebaseRequest('DELETE', `/backgrounds/${id}`, null, true)
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('get-admins', async () => {
  if (!isFirebaseConfigured()) return { success: false, admins: {} }
  try {
    const data = await firebaseRequest('GET', '/admins', null, false)
    return { success: true, admins: data || {} }
  } catch (e) {
    return { success: false, admins: {}, error: e.message }
  }
})

ipcMain.handle('add-admin', async (_, username) => {
  if (!isFirebaseConfigured()) return { success: false, error: 'Firebase non configuré' }
  const gate = await requireAdminSession()
  if (!gate.ok) return { success: false, error: gate.error }
  try {
    await firebaseRequest('PUT', `/admins/${username}`, true, true)
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('remove-admin', async (_, username) => {
  if (!isFirebaseConfigured()) return { success: false, error: 'Firebase non configuré' }
  const gate = await requireAdminSession()
  if (!gate.ok) return { success: false, error: gate.error }
  if (username === 'Mamazorus') return { success: false, error: 'L\'administrateur principal ne peut pas être retiré.' }
  try {
    await firebaseRequest('DELETE', `/admins/${username}`, null, true)
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// ─── IPC : HISTORIQUE PARTAGÉ DES JOUEURS (carrousel) ─────────────────────────
// Ajout manuel par un admin (un ou plusieurs pseudos collés, séparés par
// espaces / virgules / retours à la ligne) pour amorcer l'historique du serveur.
ipcMain.handle('add-players-seen', async (_, names) => {
  if (!isFirebaseConfigured()) return { success: false, error: 'Firebase non configuré', added: [], skipped: [], invalid: 0 }
  try {
    const valid = sanitizePlayerNames(names)
    const rawTokens = (Array.isArray(names) ? names : String(names ?? '').split(/[\s,;]+/))
      .map(s => String(s ?? '').trim()).filter(Boolean)
    const invalid = rawTokens.filter(t => !valid.includes(t)).length
    // Un ajout admin explicite lève un éventuel masquage (annule le tombstone), quelle
    // que soit la casse sous laquelle il a été posé (comparaison insensible à la casse).
    if (valid.length) {
      const hidden = await fetchHiddenPlayers().catch(() => ({}))
      const validLower = new Set(valid.map(s => s.toLowerCase()))
      const unhide = {}
      for (const k of Object.keys(hidden)) if (validLower.has(k.toLowerCase())) unhide[k] = null
      if (Object.keys(unhide).length) await firebaseRequest('PATCH', '/playersHidden', unhide, true)
    }
    const res = await pushPlayersSeen(valid)
    return { success: true, added: res.added, skipped: res.skipped, invalid }
  } catch (e) {
    return { success: false, error: e.message, added: [], skipped: [], invalid: 0 }
  }
})

ipcMain.handle('remove-player-seen', async (_, name) => {
  if (!isFirebaseConfigured()) return { success: false, error: 'Firebase non configuré' }
  const n = String(name ?? '').trim()
  if (!n) return { success: false, error: 'Nom vide' }
  const key = n.toLowerCase()
  try {
    // Tombstone sous la casse canonique (minuscule) : la lecture et le push comparent
    // en minuscule, donc « woxdfor » masque toutes les variantes de casse. Empêche un
    // pseudo supprimé de revenir via une autre casse (cache local, joueur en ligne…).
    await firebaseRequest('PUT', `/playersHidden/${encodeURIComponent(key)}`, true, true)
    // Supprime TOUTES les variantes de casse du pseudo dans le partagé (ex. WoxDfor + Woxdfor).
    const remote = await fetchSharedPlayersSeen().catch(() => ({}))
    const variants = Object.keys(remote).filter(k => k.toLowerCase() === key)
    for (const v of (variants.length ? variants : [n])) {
      await firebaseRequest('DELETE', `/playersSeen/${encodeURIComponent(v)}`, null, true)
    }
    const local = loadPlayersSeen()
    let changed = false
    for (const k of Object.keys(local)) if (k.toLowerCase() === key) { delete local[k]; changed = true }
    if (changed) savePlayersSeen(local)
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// ─── SHOP DU JOUR ─────────────────────────────────────────────────────────────
// Page d'accueil du launcher : un « shop du jour » dont l'admin compose les offres
// JOUR PAR JOUR (calendrier), préparables à l'avance. Bascule à minuit LOCAL : le
// shop actif = les offres de la date locale courante ; aucun tirage, aucun cron.
// (Phase 2 : un PNJ en jeu proposera les mêmes échanges.)
// Source de vérité Firebase :
//   /shop/config                 = { currencyName, currencyItem, currencyIcon }
//   /shop/days/{YYYY-MM-DD}/{id}  = { input, inputQty, output, outputQty, createdAt }
// Un échange : donner `inputQty × input` au marchand -> recevoir `outputQty × output`
// (souvent output = currencyItem, la monnaie). input/output = identifiants d'item.
const SHOP_DEFAULT_CONFIG = { currencyName: 'Z-Coin', currencyItem: '', currencyIcon: '' }

async function initializeShop() {
  if (!isFirebaseConfigured()) return
  try {
    const existing = await firebaseRequest('GET', '/shop/config', null, false)
    if (!existing || existing === 'null') {
      await firebaseRequest('PUT', '/shop/config', SHOP_DEFAULT_CONFIG, true)
      console.log('[Shop] Config par défaut initialisée')
    }
  } catch (e) {
    console.log('[Shop] Impossible d\'initialiser la config :', e.message)
  }
}

// Clé du jour (YYYY-MM-DD) en heure LOCALE, décalable de `offsetDays` (0 = aujourd'hui,
// 1 = demain…). La bascule se fait donc à minuit local.
function shopDayKey(offsetDays = 0) {
  const d = new Date()
  d.setDate(d.getDate() + (Number(offsetDays) || 0))
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function isDayKey(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) }

function readShopConfig(raw) {
  return (raw && typeof raw === 'object' && !Array.isArray(raw))
    ? { ...SHOP_DEFAULT_CONFIG, ...raw }
    : { ...SHOP_DEFAULT_CONFIG }
}

// Normalise une entrée Firebase {pushId: {…}} en ligne d'offre. `maxUses` = limite
// d'échanges par joueur (0 = illimité).
function normalizeShopRow([id, o]) {
  return {
    id,
    input: String(o.input ?? ''),
    inputQty: Number(o.inputQty) > 0 ? Math.floor(Number(o.inputQty)) : 1,
    output: String(o.output ?? ''),
    outputQty: Number(o.outputQty) > 0 ? Math.floor(Number(o.outputQty)) : 1,
    maxUses: Number(o.maxUses) > 0 ? Math.floor(Number(o.maxUses)) : 0,
    createdAt: o.createdAt || 0,
  }
}

// Offres d'un jour donné (triées par date de création).
async function fetchShopDay(dayKey) {
  const map = normalizeFbMap(await firebaseRequest('GET', `/shop/days/${dayKey}`, null, false))
  return Object.entries(map)
    .filter(([, o]) => o && typeof o === 'object')
    .map(normalizeShopRow)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
}

// Offres de la BOUTIQUE (2e marchand) : fixes, hors calendrier — modifiées
// seulement par l'admin (on y dépense les coins). Même structure qu'une offre.
async function fetchShopStore() {
  const map = normalizeFbMap(await firebaseRequest('GET', '/shop/store', null, false))
  return Object.entries(map)
    .filter(([, o]) => o && typeof o === 'object')
    .map(normalizeShopRow)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
}

// Offres « COURSE » (/shop/race) : trades PARTAGÉS entre tous (maxUses = limite GLOBALE ;
// le compteur partagé est tenu côté serveur de jeu). Même structure qu'une offre.
async function fetchShopRace() {
  const map = normalizeFbMap(await firebaseRequest('GET', '/shop/race', null, false))
  return Object.entries(map)
    .filter(([, o]) => o && typeof o === 'object')
    .map(normalizeShopRow)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
}

// Migration best-effort (one-shot) : si aucun jour n'existe encore mais qu'un
// ancien /shop/pool est présent, convertit ses offres (achat « product pour
// price ») en échanges d'aujourd'hui (donner price×monnaie -> recevoir productQty×product).
let shopMigrationDone = false
async function migrateLegacyPoolIfNeeded(config) {
  if (shopMigrationDone) return
  shopMigrationDone = true
  try {
    const days = await firebaseRequest('GET', '/shop/days', null, false)
    if (days && days !== 'null') return
    if (!config.currencyItem) return
    const poolRaw = normalizeFbMap(await firebaseRequest('GET', '/shop/pool', null, false))
    const pool = Object.values(poolRaw).filter(o => o && typeof o === 'object' && o.product)
    if (!pool.length) return
    const today = shopDayKey(0)
    for (const o of pool) {
      const offer = {
        input: config.currencyItem, inputQty: Math.max(1, Math.floor(Number(o.price)) || 1),
        output: String(o.product), outputQty: Math.max(1, Math.floor(Number(o.productQty)) || 1),
        createdAt: Date.now(),
      }
      try { await firebaseRequest('POST', `/shop/days/${today}`, offer, true) } catch { /* */ }
    }
    console.log(`[Shop] Migration de ${pool.length} ancienne(s) offre(s) vers ${today}`)
  } catch (e) { console.log('[Shop] Migration ignorée :', e.message) }
}

// Attache les descripteurs d'icône (input/output) à des offres, via le même
// résolveur que get-item-icons (cache partagé). Échec -> pas d'icône (null).
async function attachShopIcons(offers) {
  const ids = [...new Set(offers.flatMap(o => [o.input, o.output]).filter(Boolean))]
  let icons = {}
  try { icons = await getItemIcons(ids) } catch { icons = {} }
  return offers.map(o => ({ ...o, inputIcon: icons[o.input] || null, outputIcon: icons[o.output] || null }))
}

// Attache à chaque offre le nombre d'échanges déjà faits (`used`) par le joueur
// connecté — compteurs publiés par le serveur de jeu sous /shop/trades/{pseudo}/{offerId}.
// Best-effort : si pas connecté ou lecture impossible, `used` = 0.
async function attachPlayerUsage(offers) {
  const player = currentToken?.name
  if (!player || !offers.length) return offers.map(o => ({ ...o, used: 0 }))
  let map = {}
  try { map = normalizeFbMap(await firebaseRequest('GET', `/shop/trades/${player}`, null, false)) } catch { map = {} }
  return offers.map(o => {
    const n = Number(map?.[o.id])
    return { ...o, used: Number.isFinite(n) && n > 0 ? Math.floor(n) : 0 }
  })
}

// Bibliothèque d'offres réutilisables (/shop/library) : toute offre créée y est
// ajoutée (dédupliquée), pour pouvoir la replacer ensuite sur n'importe quel jour.
function shopOfferKey(o) { return `${o.input}|${o.inputQty}|${o.output}|${o.outputQty}` }
async function fetchShopLibrary() {
  const map = normalizeFbMap(await firebaseRequest('GET', '/shop/library', null, false))
  return Object.entries(map)
    .filter(([, o]) => o && typeof o === 'object')
    .map(normalizeShopRow)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
}
async function addToLibraryDedup(offer) {
  try {
    const lib = await fetchShopLibrary()
    if (lib.some(o => shopOfferKey(o) === shopOfferKey(offer))) return
    await firebaseRequest('POST', '/shop/library', { ...offer, createdAt: Date.now() }, true)
  } catch { /* best-effort */ }
}

// Normalise/borne une offre (troc) venue du renderer.
function sanitizeShopOffer(input) {
  const o = (input && typeof input === 'object') ? input : {}
  const qty = v => Number.isFinite(+v) && +v > 0 ? Math.min(Math.floor(+v), 9999) : 1
  return {
    input: String(o.input ?? '').trim().slice(0, 120),
    inputQty: qty(o.inputQty),
    output: String(o.output ?? '').trim().slice(0, 120),
    outputQty: qty(o.outputQty),
    // Limite d'échanges par joueur (0 = illimité). Shop du jour : repart à zéro chaque
    // jour (les offres changent d'identifiant) ; boutique : limite à vie de l'offre.
    maxUses: Number.isFinite(+o.maxUses) && +o.maxUses > 0 ? Math.min(Math.floor(+o.maxUses), 9999) : 0,
  }
}

// ── IPC : lecture publique (accueil) — offres du jour courant, icônes incluses ──
ipcMain.handle('get-shop', async () => {
  if (!isFirebaseConfigured()) return { success: false, offers: [], config: { ...SHOP_DEFAULT_CONFIG } }
  try {
    const config = readShopConfig(await firebaseRequest('GET', '/shop/config', null, false))
    await migrateLegacyPoolIfNeeded(config)
    const date = shopDayKey(0)
    const offers = await attachPlayerUsage(await attachShopIcons(await fetchShopDay(date)))
    return { success: true, offers, config, date }
  } catch (e) {
    return { success: false, offers: [], config: { ...SHOP_DEFAULT_CONFIG }, error: e.message }
  }
})

// ── IPC : offres d'un jour précis (éditeur admin) ──
ipcMain.handle('get-shop-day', async (_, dayKey) => {
  if (!isFirebaseConfigured()) return { success: false, offers: [], config: { ...SHOP_DEFAULT_CONFIG } }
  const date = isDayKey(dayKey) ? dayKey : shopDayKey(0)
  try {
    const config = readShopConfig(await firebaseRequest('GET', '/shop/config', null, false))
    await migrateLegacyPoolIfNeeded(config)
    const offers = await attachShopIcons(await fetchShopDay(date))
    return { success: true, offers, config, date }
  } catch (e) {
    return { success: false, offers: [], config: { ...SHOP_DEFAULT_CONFIG }, error: e.message }
  }
})

// ── IPC : édition des offres d'un jour (admin, vérifié côté main) ──
ipcMain.handle('create-shop-offer', async (_, { date, ...data } = {}) => {
  if (!isFirebaseConfigured()) return { success: false, error: 'Firebase non configuré' }
  const gate = await requireAdminSession()
  if (!gate.ok) return { success: false, error: gate.error }
  if (!isDayKey(date)) return { success: false, error: 'Jour invalide.' }
  const offer = sanitizeShopOffer(data)
  if (!offer.input || !offer.output) return { success: false, error: 'Indique un item d\'entrée et un item de sortie.' }
  try {
    const result = await firebaseRequest('POST', `/shop/days/${date}`, { ...offer, createdAt: Date.now() }, true)
    await addToLibraryDedup(offer) // réutilisable plus tard via la bibliothèque
    return { success: true, id: result?.name }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('update-shop-offer', async (_, { date, id, ...data } = {}) => {
  if (!isFirebaseConfigured()) return { success: false, error: 'Firebase non configuré' }
  const gate = await requireAdminSession()
  if (!gate.ok) return { success: false, error: gate.error }
  if (!isDayKey(date) || !isValidPushId(id)) return { success: false, error: 'Offre introuvable.' }
  try {
    await firebaseRequest('PATCH', `/shop/days/${date}/${id}`, sanitizeShopOffer(data), true)
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('delete-shop-offer', async (_, { date, id } = {}) => {
  if (!isFirebaseConfigured()) return { success: false, error: 'Firebase non configuré' }
  const gate = await requireAdminSession()
  if (!gate.ok) return { success: false, error: gate.error }
  if (!isDayKey(date) || !isValidPushId(id)) return { success: false, error: 'Offre introuvable.' }
  try {
    await firebaseRequest('DELETE', `/shop/days/${date}/${id}`, null, true)
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// ── IPC : BOUTIQUE (2e marchand, offres fixes — on y dépense les coins) ──
ipcMain.handle('get-shop-store', async () => {
  if (!isFirebaseConfigured()) return { success: false, offers: [], config: { ...SHOP_DEFAULT_CONFIG } }
  try {
    const config = readShopConfig(await firebaseRequest('GET', '/shop/config', null, false))
    const offers = await attachShopIcons(await fetchShopStore())
    return { success: true, offers, config }
  } catch (e) {
    return { success: false, offers: [], config: { ...SHOP_DEFAULT_CONFIG }, error: e.message }
  }
})

ipcMain.handle('create-shop-store-offer', async (_, data = {}) => {
  if (!isFirebaseConfigured()) return { success: false, error: 'Firebase non configuré' }
  const gate = await requireAdminSession()
  if (!gate.ok) return { success: false, error: gate.error }
  const offer = sanitizeShopOffer(data)
  if (!offer.input || !offer.output) return { success: false, error: 'Indique un item d\'entrée et un item de sortie.' }
  try {
    const result = await firebaseRequest('POST', '/shop/store', { ...offer, createdAt: Date.now() }, true)
    await addToLibraryDedup(offer) // partage la bibliothèque avec le shop du jour
    return { success: true, id: result?.name }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('update-shop-store-offer', async (_, { id, ...data } = {}) => {
  if (!isFirebaseConfigured()) return { success: false, error: 'Firebase non configuré' }
  const gate = await requireAdminSession()
  if (!gate.ok) return { success: false, error: gate.error }
  if (!isValidPushId(id)) return { success: false, error: 'Offre introuvable.' }
  try {
    await firebaseRequest('PATCH', `/shop/store/${id}`, sanitizeShopOffer(data), true)
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('delete-shop-store-offer', async (_, { id } = {}) => {
  if (!isFirebaseConfigured()) return { success: false, error: 'Firebase non configuré' }
  const gate = await requireAdminSession()
  if (!gate.ok) return { success: false, error: gate.error }
  if (!isValidPushId(id)) return { success: false, error: 'Offre introuvable.' }
  try {
    await firebaseRequest('DELETE', `/shop/store/${id}`, null, true)
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// ── IPC : COURSE (3e marchand, trades partagés — maxUses = limite GLOBALE, 1er arrivé) ──
ipcMain.handle('get-shop-race', async () => {
  if (!isFirebaseConfigured()) return { success: false, offers: [], config: { ...SHOP_DEFAULT_CONFIG } }
  try {
    const config = readShopConfig(await firebaseRequest('GET', '/shop/config', null, false))
    const offers = await attachShopIcons(await fetchShopRace())
    return { success: true, offers, config }
  } catch (e) {
    return { success: false, offers: [], config: { ...SHOP_DEFAULT_CONFIG }, error: e.message }
  }
})

ipcMain.handle('create-shop-race-offer', async (_, data = {}) => {
  if (!isFirebaseConfigured()) return { success: false, error: 'Firebase non configuré' }
  const gate = await requireAdminSession()
  if (!gate.ok) return { success: false, error: gate.error }
  const offer = sanitizeShopOffer(data)
  if (!offer.input || !offer.output) return { success: false, error: 'Indique un item d\'entrée et un item de sortie.' }
  try {
    const result = await firebaseRequest('POST', '/shop/race', { ...offer, createdAt: Date.now() }, true)
    await addToLibraryDedup(offer)
    return { success: true, id: result?.name }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('update-shop-race-offer', async (_, { id, ...data } = {}) => {
  if (!isFirebaseConfigured()) return { success: false, error: 'Firebase non configuré' }
  const gate = await requireAdminSession()
  if (!gate.ok) return { success: false, error: gate.error }
  if (!isValidPushId(id)) return { success: false, error: 'Offre introuvable.' }
  try {
    await firebaseRequest('PATCH', `/shop/race/${id}`, sanitizeShopOffer(data), true)
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('delete-shop-race-offer', async (_, { id } = {}) => {
  if (!isFirebaseConfigured()) return { success: false, error: 'Firebase non configuré' }
  const gate = await requireAdminSession()
  if (!gate.ok) return { success: false, error: gate.error }
  if (!isValidPushId(id)) return { success: false, error: 'Offre introuvable.' }
  try {
    await firebaseRequest('DELETE', `/shop/race/${id}`, null, true)
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('set-shop-config', async (_, data) => {
  if (!isFirebaseConfigured()) return { success: false, error: 'Firebase non configuré' }
  const gate = await requireAdminSession()
  if (!gate.ok) return { success: false, error: gate.error }
  const patch = {}
  if (data && typeof data === 'object') {
    if (data.currencyName != null) patch.currencyName = String(data.currencyName).trim().slice(0, 40)
    if (data.currencyItem != null) patch.currencyItem = String(data.currencyItem).trim().slice(0, 120)
    if (data.currencyIcon != null) patch.currencyIcon = String(data.currencyIcon).trim().slice(0, 1024)
  }
  try {
    await firebaseRequest('PATCH', '/shop/config', patch, true)
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// ── IPC : bibliothèque d'offres réutilisables (modèles à replacer sur un jour) ──
ipcMain.handle('get-shop-library', async () => {
  if (!isFirebaseConfigured()) return { success: false, offers: [], config: { ...SHOP_DEFAULT_CONFIG } }
  try {
    const config = readShopConfig(await firebaseRequest('GET', '/shop/config', null, false))
    const offers = await attachShopIcons(await fetchShopLibrary())
    return { success: true, offers, config }
  } catch (e) {
    return { success: false, offers: [], config: { ...SHOP_DEFAULT_CONFIG }, error: e.message }
  }
})

ipcMain.handle('delete-shop-library-offer', async (_, id) => {
  if (!isFirebaseConfigured()) return { success: false, error: 'Firebase non configuré' }
  const gate = await requireAdminSession()
  if (!gate.ok) return { success: false, error: gate.error }
  if (!isValidPushId(id)) return { success: false, error: 'Modèle introuvable.' }
  try {
    await firebaseRequest('DELETE', `/shop/library/${id}`, null, true)
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// ─── QUÊTES (PNJ de quêtes : tuer N d'une cible → récompense, 1×/joueur) ───────
// Définition d'une quête (/quests/{id}) : titre, description, cible (id d'entité,
// ex. minecraft:pig), quantité à tuer, récompense (item + qté). La progression et
// l'état par joueur sont tenus côté serveur de jeu (mod), pas dans le launcher.
function sanitizeQuest(input) {
  const o = (input && typeof input === 'object') ? input : {}
  const num = (v, max) => Number.isFinite(+v) && +v > 0 ? Math.min(Math.floor(+v), max) : 1
  return {
    title: String(o.title ?? '').trim().slice(0, 80),
    description: String(o.description ?? '').trim().slice(0, 300),
    target: String(o.target ?? '').trim().slice(0, 120),
    amount: num(o.amount, 9999),
    rewardItem: String(o.rewardItem ?? '').trim().slice(0, 120),
    rewardQty: num(o.rewardQty, 9999),
  }
}
function normalizeQuestRow([id, o]) {
  return {
    id,
    title: String(o.title ?? ''),
    description: String(o.description ?? ''),
    target: String(o.target ?? ''),
    amount: Number(o.amount) > 0 ? Math.floor(Number(o.amount)) : 1,
    rewardItem: String(o.rewardItem ?? ''),
    rewardQty: Number(o.rewardQty) > 0 ? Math.floor(Number(o.rewardQty)) : 1,
    createdAt: o.createdAt || 0,
  }
}
async function fetchQuests() {
  const map = normalizeFbMap(await firebaseRequest('GET', '/quests', null, false))
  return Object.entries(map)
    .filter(([, o]) => o && typeof o === 'object')
    .map(normalizeQuestRow)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
}
// Icône de la récompense (item) pour l'aperçu admin ; la cible est une entité (id seul).
async function attachQuestIcons(quests) {
  const ids = [...new Set(quests.map(q => q.rewardItem).filter(Boolean))]
  let icons = {}
  try { icons = await getItemIcons(ids) } catch { icons = {} }
  return quests.map(q => ({ ...q, rewardIcon: icons[q.rewardItem] || null }))
}

ipcMain.handle('get-quests', async () => {
  if (!isFirebaseConfigured()) return { success: false, quests: [] }
  try {
    return { success: true, quests: await attachQuestIcons(await fetchQuests()) }
  } catch (e) {
    return { success: false, quests: [], error: e.message }
  }
})

ipcMain.handle('create-quest', async (_, data = {}) => {
  if (!isFirebaseConfigured()) return { success: false, error: 'Firebase non configuré' }
  const gate = await requireAdminSession()
  if (!gate.ok) return { success: false, error: gate.error }
  const quest = sanitizeQuest(data)
  if (!quest.title || !quest.target || !quest.rewardItem) return { success: false, error: 'Titre, cible et récompense requis.' }
  try {
    const result = await firebaseRequest('POST', '/quests', { ...quest, createdAt: Date.now() }, true)
    return { success: true, id: result?.name }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('update-quest', async (_, { id, ...data } = {}) => {
  if (!isFirebaseConfigured()) return { success: false, error: 'Firebase non configuré' }
  const gate = await requireAdminSession()
  if (!gate.ok) return { success: false, error: gate.error }
  if (!isValidPushId(id)) return { success: false, error: 'Quête introuvable.' }
  try {
    await firebaseRequest('PATCH', `/quests/${id}`, sanitizeQuest(data), true)
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('delete-quest', async (_, id) => {
  if (!isFirebaseConfigured()) return { success: false, error: 'Firebase non configuré' }
  const gate = await requireAdminSession()
  if (!gate.ok) return { success: false, error: gate.error }
  if (!isValidPushId(id)) return { success: false, error: 'Quête introuvable.' }
  try {
    await firebaseRequest('DELETE', `/quests/${id}`, null, true)
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// ─── CATALOGUE D'ITEMS (autocomplétion admin) ─────────────────────────────────
// Pour aider l'admin à saisir l'identifiant d'un item (souvent un id moddé
// imprononçable), on extrait la liste réelle des items du modpack INSTALLÉ en
// local : on lit les fichiers de langue `assets/<ns>/lang/en_us.json` du client
// vanilla (versions/<mc>/<mc>.jar) et de chaque mod (mods/*.jar), et on en tire
// les paires { id, name } via les clés `item.<ns>.<nom>` / `block.<ns>.<nom>`.
// C'est une heuristique (≠ registre runtime) mais elle couvre la quasi-totalité
// des items et donne le nom anglais lisible. Le scan (~5 s, des milliers d'items)
// est mis en cache disque, signé par le contenu du dossier mods → instantané
// tant que le pack ne change pas.
const ITEM_CATALOG_CACHE = path.join(GAME_DIR, '.item-catalog.json')
const ITEM_LANG_RE = /^assets\/([a-z0-9_.-]+)\/lang\/en_us\.json$/
// Capture le type (item|block). Un id n'est gardé que s'il est un vrai item
// donnable : clé `item.*` OU présence d'un modèle d'item (cas des block-items).
const ITEM_KEY_RE = /^(item|block)\.([a-z0-9_]+)\.([a-z0-9_]+)$/
const ITEM_MODEL_RE = /^assets\/([a-z0-9_.-]+)\/models\/item\/([a-z0-9_]+)\.json$/
const ITEM_CATALOG_V = 3 // bump → invalide le cache disque quand la logique de scan change
let itemCatalogMem = null // { sig, items, nsJars }

// Chemins des jars du modpack + résolution d'un marqueur de jar (« @client » =
// client vanilla, sinon nom de fichier dans mods/). nsJars associe un namespace
// au marqueur du jar où vit son lang (≈ où vivent ses textures) → sert aux icônes.
function itemClientJar() { return path.join(GAME_DIR, 'versions', MODPACK.minecraft, `${MODPACK.minecraft}.jar`) }
function itemModsDir() { return path.join(GAME_DIR, 'mods') }
function markerToPath(marker) { return marker === '@client' ? itemClientJar() : path.join(itemModsDir(), marker) }

// Signature du pack installé : nom+taille du client jar et de chaque mod. Change
// dès qu'un mod est ajouté/retiré/mis à jour → invalide le cache.
function itemCatalogSignature() {
  const parts = []
  try {
    const clientJar = path.join(GAME_DIR, 'versions', MODPACK.minecraft, `${MODPACK.minecraft}.jar`)
    parts.push(`mc:${fs.statSync(clientJar).size}`)
  } catch { /* pas encore installé */ }
  try {
    const modsDir = path.join(GAME_DIR, 'mods')
    for (const f of fs.readdirSync(modsDir).sort()) {
      if (!f.endsWith('.jar')) continue
      parts.push(`${f}:${fs.statSync(path.join(modsDir, f)).size}`)
    }
  } catch { /* dossier mods absent */ }
  return crypto.createHash('sha1').update(parts.join('|')).digest('hex')
}

// Extrait d'un seul jar : les paires { id, name } (lang), le jar du namespace,
// les ids déclarés `item.*` (itemKeys) et les ids ayant un modèle d'item
// (itemModels). Silencieux si illisible.
function scanJarForItems(jarPath, marker, into, nsJars, itemKeys, itemModels) {
  let zip
  try { zip = new AdmZip(jarPath) } catch { return }
  for (const entry of zip.getEntries()) {
    // Modèle d'item -> id réellement rendu dans l'inventaire (donnable).
    const mm = ITEM_MODEL_RE.exec(entry.entryName)
    if (mm) { if (itemModels) itemModels.add(`${mm[1]}:${mm[2]}`); continue }
    const lm = ITEM_LANG_RE.exec(entry.entryName)
    if (!lm) continue
    if (nsJars && !nsJars[lm[1]]) nsJars[lm[1]] = marker
    let json
    try { json = JSON.parse(entry.getData().toString('utf8')) } catch { continue }
    for (const key of Object.keys(json)) {
      const m = ITEM_KEY_RE.exec(key)
      if (!m) continue
      const id = `${m[2]}:${m[3]}`
      if (m[1] === 'item' && itemKeys) itemKeys.add(id)
      if (!into.has(id)) into.set(id, String(json[key]).slice(0, 80))
    }
  }
}

// Reconstruit le catalogue depuis les jars (asynchrone : cède la main entre les
// jars pour ne pas figer le process principal pendant les ~5 s de scan).
async function buildItemCatalog() {
  const items = new Map()
  const nsJars = {}
  const itemKeys = new Set()   // ids déclarés via une clé lang `item.*`
  const itemModels = new Set() // ids ayant un modèle d'item (rendus dans l'inventaire)
  try { scanJarForItems(itemClientJar(), '@client', items, nsJars, itemKeys, itemModels) } catch { /* */ }
  try {
    const jars = fs.readdirSync(itemModsDir()).filter(f => f.endsWith('.jar'))
    for (let i = 0; i < jars.length; i++) {
      scanJarForItems(path.join(itemModsDir(), jars[i]), jars[i], items, nsJars, itemKeys, itemModels)
      if (i % 8 === 7) await new Promise(r => setImmediate(r))
    }
  } catch { /* dossier mods absent */ }
  // On ne garde que les vrais items donnables/inventoriables : déclarés `item.*`
  // OU possédant un modèle d'item (block-items). On écarte ainsi les blocs sans
  // item (panneaux muraux, tiges de plantes, états de blocs…), non donnables.
  const list = [...items.entries()]
    .filter(([id]) => itemKeys.has(id) || itemModels.has(id))
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en') || a.id.localeCompare(b.id))
  return { items: list, nsJars }
}

async function getItemCatalog() {
  const sig = itemCatalogSignature()
  if (itemCatalogMem && itemCatalogMem.sig === sig) return itemCatalogMem
  try {
    const cached = JSON.parse(fs.readFileSync(ITEM_CATALOG_CACHE, 'utf8'))
    if (cached && cached.v === ITEM_CATALOG_V && cached.sig === sig && Array.isArray(cached.items) && cached.nsJars) {
      itemCatalogMem = { sig, items: cached.items, nsJars: cached.nsJars }
      return itemCatalogMem
    }
  } catch { /* pas de cache valide */ }
  const { items, nsJars } = await buildItemCatalog()
  itemCatalogMem = { sig, items, nsJars }
  itemIconCache.clear() // pack changé → icônes potentiellement obsolètes
  try { fs.writeFileSync(ITEM_CATALOG_CACHE, JSON.stringify({ v: ITEM_CATALOG_V, sig, items, nsJars })) } catch { /* best-effort */ }
  return itemCatalogMem
}

// Lecture locale uniquement (noms d'items publics) → pas de garde admin.
ipcMain.handle('get-item-catalog', async () => {
  try {
    return { success: true, items: (await getItemCatalog()).items }
  } catch (e) {
    return { success: false, items: [], error: e.message }
  }
})

// ── Icônes d'items : descripteur de rendu, comme l'inventaire du jeu.
// Pour un id, on aplatit la chaîne du modèle d'item (assets/<ns>/models/item/<n>.json) :
//   • elements présents -> { kind:'block', elements, textures:{ref:{dataUrl,w,h}}, gui, flatFallback }
//     le renderer le dessine en isométrie 3D (rotation 30/225, ombrage par face), comme l'inventaire ;
//   • sinon            -> { kind:'flat', src } (layer0 ; sprite plat, comme en jeu pour les objets) ;
//   • builtin/entity sans modèle (coffre, lit, bannière, tête…) -> null (carré vide ; import manuel possible).
// Règle de classification : la présence d'`elements` (héritée ou non) fait le bloc ; on NE se fie PAS au
// parent racine (item/generated ET item/handheld descendent tous deux de builtin/generated).
// Résolu à la demande (lot visible), mis en cache mémoire ; jars ouverts gardés dans un petit LRU.
const ITEM_JAR_LRU_MAX = 6
const itemJarLru = new Map()       // jarPath -> AdmZip | null
const itemIconCache = new Map()    // id -> descriptor | null

function openJarCached(jarPath) {
  if (!jarPath) return null
  if (itemJarLru.has(jarPath)) {
    const z = itemJarLru.get(jarPath)
    itemJarLru.delete(jarPath); itemJarLru.set(jarPath, z) // rafraîchit l'ordre LRU
    return z
  }
  let zip = null
  try { zip = new AdmZip(jarPath) } catch { zip = null }
  itemJarLru.set(jarPath, zip)
  while (itemJarLru.size > ITEM_JAR_LRU_MAX) itemJarLru.delete(itemJarLru.keys().next().value)
  return zip
}
function jarForNs(ns, nsJars) { return nsJars && nsJars[ns] ? markerToPath(nsJars[ns]) : null }
function zipJson(zip, name) {
  if (!zip) return null
  const e = zip.getEntry(name); if (!e) return null
  try { return JSON.parse(e.getData().toString('utf8')) } catch { return null }
}
function zipPng(zip, name) {
  if (!zip) return null
  const e = zip.getEntry(name); if (!e) return null
  try { return e.getData() } catch { return null }
}
function splitNsPath(ref) {
  const ci = ref.indexOf(':')
  return ci >= 0 ? { ns: ref.slice(0, ci), p: ref.slice(ci + 1) } : { ns: 'minecraft', p: ref }
}
// Dimensions d'un PNG depuis l'en-tête IHDR (16e/20e octets).
function pngSize(buf) { return (buf && buf.length >= 24) ? { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) } : { w: 16, h: 16 } }
// Référence de texture 'ns:block/x' -> { dataUrl, w, h } | null
function texRefToTex(ref, nsJars) {
  if (typeof ref !== 'string' || !ref || ref.startsWith('#')) return null
  const { ns, p } = splitNsPath(ref)
  const buf = zipPng(openJarCached(jarForNs(ns, nsJars)), `assets/${ns}/textures/${p}.png`)
  if (!buf) return null
  const { w, h } = pngSize(buf)
  return { dataUrl: `data:image/png;base64,${buf.toString('base64')}`, w, h }
}
// Résout une variable de texture (#all → valeur réelle).
function resolveTexVar(v, textures, guard = 0) {
  if (typeof v !== 'string') return null
  if (v.startsWith('#') && guard < 6) return resolveTexVar(textures[v.slice(1)], textures, guard + 1)
  return v
}
// Aplatit la chaîne de parents d'un modèle d'item : textures (l'enfant prime),
// 1er `elements` rencontré (l'enfant prime), display fusionné. S'arrête aux
// modèles builtin/* (pas de géométrie JSON) et aux parents introuvables.
function flattenItemModel(rootRef, nsJars) {
  const textures = {}; let elements = null; const display = {}
  let ref = rootRef, depth = 0; const seen = new Set()
  while (ref && depth < 16 && !seen.has(ref)) {
    seen.add(ref)
    const { ns, p } = splitNsPath(ref)
    if (p.startsWith('builtin/')) break
    const model = zipJson(openJarCached(jarForNs(ns, nsJars)), `assets/${ns}/models/${p}.json`)
    if (!model) break
    if (model.textures) for (const [k, v] of Object.entries(model.textures)) if (!(k in textures)) textures[k] = v
    if (!elements && Array.isArray(model.elements)) elements = model.elements
    if (model.display) for (const [k, v] of Object.entries(model.display)) if (!(k in display)) display[k] = v
    ref = model.parent
    depth++
  }
  return { textures, elements, display }
}

// Têtes/skulls vanilla : parent builtin/entity (rendu par code Java), donc aucun
// modèle JSON exploitable -> on synthétise un cube de tête 8×8×8 texturé depuis
// l'atlas d'entité, aux UV du skin standard, rendu en 3D comme dans l'inventaire.
// (Les têtes de mods utilisent des textures hardcodées côté Java, inconnues ici ;
// le dragon a un modèle spécial non cubique -> laissé sans icône.)
const SKULL_ENTITY_TEX = {
  'minecraft:skeleton_skull': 'minecraft:entity/skeleton/skeleton',
  'minecraft:wither_skeleton_skull': 'minecraft:entity/skeleton/wither_skeleton',
  'minecraft:zombie_head': 'minecraft:entity/zombie/zombie',
  'minecraft:creeper_head': 'minecraft:entity/creeper/creeper',
  'minecraft:piglin_head': 'minecraft:entity/piglin/piglin',
  'minecraft:player_head': 'minecraft:entity/player/wide/steve',
}
// UV (convention 0-16, k = texW/16) de la tête dans l'atlas skin (coin haut-gauche).
const SKULL_FACE_UV = { up: [2, 0, 4, 2], down: [4, 0, 6, 2], north: [2, 2, 4, 4], south: [6, 2, 8, 4], west: [0, 2, 2, 4], east: [4, 2, 6, 4] }
const SKULL_GUI = { rotation: [30, 45, 0], translation: [0, 0, 0], scale: [1, 1, 1] }
function buildSkullDescriptor(id, nsJars) {
  const texRef = SKULL_ENTITY_TEX[id]
  if (!texRef) return null
  const tex = texRefToTex(texRef, nsJars)
  if (!tex) return null
  const faces = {}
  for (const [dir, uv] of Object.entries(SKULL_FACE_UV)) faces[dir] = { texture: texRef, uv }
  return { kind: 'block', elements: [{ from: [4, 4, 4], to: [12, 12, 12], faces }], textures: { [texRef]: tex }, gui: SKULL_GUI }
}

// id 'ns:name' -> descripteur de rendu | null (cf. en-tête de section).
function buildItemDescriptor(id, nsJars) {
  const skull = buildSkullDescriptor(id, nsJars)
  if (skull) return skull
  const { ns, p: name } = splitNsPath(id)
  const flat = flattenItemModel(`${ns}:item/${name}`, nsJars)

  // 1) Bloc géométrique : elements + textures de faces résolues + display.gui
  if (flat.elements && flat.elements.length) {
    const usedRefs = new Set()
    const elements = flat.elements.map(el => {
      const faces = {}
      for (const [dir, face] of Object.entries(el.faces || {})) {
        const resolved = resolveTexVar(face.texture, flat.textures)
        if (!resolved || resolved.startsWith('#')) continue
        usedRefs.add(resolved)
        faces[dir] = {
          texture: resolved,
          uv: face.uv,
          rotation: face.rotation || 0,
          tintindex: typeof face.tintindex === 'number' ? face.tintindex : undefined,
        }
      }
      return { from: el.from, to: el.to, rotation: el.rotation, faces }
    }).filter(el => Object.keys(el.faces).length > 0)

    const textures = {}
    for (const ref of usedRefs) { const t = texRefToTex(ref, nsJars); if (t) textures[ref] = t }

    if (elements.length && Object.keys(textures).length) {
      const gui = flat.display.gui || { rotation: [30, 225, 0], translation: [0, 0, 0], scale: [0.625, 0.625, 0.625] }
      const fbRef = resolveTexVar(flat.textures.all, flat.textures) || resolveTexVar(flat.textures.side, flat.textures) || [...usedRefs][0]
      const flatFallback = (fbRef && textures[fbRef]) ? textures[fbRef].dataUrl : undefined
      return { kind: 'block', elements, textures, gui, flatFallback }
    }
    // bloc non résoluble -> on retombe sur le sprite plat ci-dessous
  }

  // 2) Sprite plat : layer0 (ou '0'), puis repli texture directe item/ puis block/
  const l0 = resolveTexVar(flat.textures.layer0, flat.textures) || resolveTexVar(flat.textures['0'], flat.textures)
  if (l0 && !l0.startsWith('#')) { const t = texRefToTex(l0, nsJars); if (t) return { kind: 'flat', src: t.dataUrl } }
  for (const cand of [`${ns}:item/${name}`, `${ns}:block/${name}`]) { const t = texRefToTex(cand, nsJars); if (t) return { kind: 'flat', src: t.dataUrl } }

  // 3) builtin/entity & co : pas de modèle exploitable
  return null
}

async function getItemIcons(ids) {
  const nsJars = (await getItemCatalog()).nsJars || {}
  const out = {}
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]
    if (typeof id !== 'string') continue
    if (!itemIconCache.has(id)) {
      let desc = null
      try { desc = buildItemDescriptor(id, nsJars) } catch { desc = null }
      itemIconCache.set(id, desc)
    }
    const desc = itemIconCache.get(id)
    if (desc) out[id] = desc
    if (i % 24 === 23) await new Promise(r => setImmediate(r)) // cède la main
  }
  return out
}

ipcMain.handle('get-item-icons', async (_, ids) => {
  try {
    if (!Array.isArray(ids)) return { success: false, icons: {} }
    return { success: true, icons: await getItemIcons(ids.slice(0, 120)) }
  } catch (e) {
    return { success: false, icons: {}, error: e.message }
  }
})

// ─── CHAT (salons type Discord) ───────────────────────────────────────────────
// Espace communautaire : plusieurs salons, messages en temps réel (streaming SSE
// de Realtime Database), médias (Firebase Storage + liens). Comme pour /news et
// /admins, TOUTES les écritures passent par le main (secret legacy) ; l'auteur
// d'un message vient de la SESSION (currentToken), jamais du renderer (anti-spoof).
//
// Modèle de données :
//   /chat/channels/{id}        = { name, description, type:'open'|'announce', order, createdAt, createdBy }
//   /chat/messages/{id}/{push} = { author, uuid, text, media?, ts }
//       media = { kind:'upload'|'link', url, mime?, w?, h? }

const CHAT_MEDIA_MAX = 4 * 1024 * 1024
const CHAT_ALLOWED_MIME = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
const CHAT_TEXT_MAX = 2000

// Salons semés au premier démarrage si /chat/channels est vide.
const DEFAULT_CHANNELS = [
  { id: 'annonces', name: 'annonces', description: 'Annonces officielles du serveur',     type: 'announce' },
  { id: 'general',  name: 'général',  description: 'Discussion générale',                  type: 'open' },
  { id: 'entraide', name: 'entraide', description: 'Questions & entraide entre joueurs',   type: 'open' },
  { id: 'medias',   name: 'médias',   description: 'Partagez vos screenshots et vos builds', type: 'open' },
]

// Clé Firebase valide : pas de . # $ [ ] / — on dérive un slug court et lisible.
function sanitizeChannelId(raw) {
  return String(raw ?? '').trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // retire les accents (é→e)
    .replace(/[^a-z0-9_-]+/g, '-')                       // tout le reste → tiret
    .replace(/^-+|-+$/g, '').slice(0, 40)
}

// Push ID Firebase (clé de message) : pas de . # $ [ ] /
function isValidPushId(id) {
  return typeof id === 'string' && id.length > 0 && id.length < 64 && !/[.#$/[\]]/.test(id)
}

async function initializeChannels() {
  if (!isFirebaseConfigured()) return
  try {
    const existing = await firebaseRequest('GET', '/chat/channels', null, false)
    if (!existing || existing === 'null' || (typeof existing === 'object' && Object.keys(existing).length === 0)) {
      const now = Date.now()
      const seed = {}
      DEFAULT_CHANNELS.forEach((c, i) => {
        seed[c.id] = { name: c.name, description: c.description, type: c.type, order: i, createdAt: now, createdBy: 'system' }
      })
      await firebaseRequest('PUT', '/chat/channels', seed, true)
      console.log('[Chat] Salons par défaut initialisés')
    }
  } catch (e) {
    console.log('[Chat] Impossible d\'initialiser les salons :', e.message)
  }
}

// Identité authentifiée (depuis la session locale), source de vérité de l'auteur.
function chatSessionUser() {
  const username = loadSession()           // (re)charge currentToken + renvoie le pseudo
  if (!username) return null
  return { username, uuid: currentToken?.uuid ?? null }
}

async function chatIsAdmin(username) {
  if (!username) return false
  try {
    const v = await firebaseRequest('GET', `/admins/${username}`, null, false)
    return v === true
  } catch { return false }
}

// Garde admin réutilisable : exige une session authentifiée ET un compte admin.
// Vérifiée CÔTÉ MAIN — l'unique rempart, puisque le secret legacy bypass les règles.
async function requireAdminSession() {
  const u = chatSessionUser()
  if (!u) return { ok: false, error: 'Reconnecte-toi.' }
  if (!(await chatIsAdmin(u.username))) return { ok: false, error: 'Réservé aux administrateurs.' }
  return { ok: true, user: u }
}

// Détecte le vrai type d'image d'après les magic bytes (anti-usurpation du MIME).
function detectImageMime(buf) {
  if (!buf || buf.length < 12) return null
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png'
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg'
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) return 'image/gif'
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp'
  return null
}

// Normalise/valide un objet média venant du renderer (lien collé ou upload déjà fait).
function chatSanitizeMedia(m) {
  if (!m || typeof m !== 'object') return null
  const url = String(m.url ?? '').trim()
  if (!/^https?:\/\//i.test(url)) return null
  // Le badge 'upload' n'est honoré que si l'URL pointe vraiment vers notre bucket
  // (sinon on rétrograde en 'link' : un renderer ne peut pas usurper un média « hébergé »).
  const isBucketUrl = url.startsWith(`https://firebasestorage.googleapis.com/v0/b/${FIREBASE_STORAGE_BUCKET}/o/`)
  const out = { kind: (m.kind === 'upload' && isBucketUrl) ? 'upload' : 'link', url: url.slice(0, 1024) }
  if (typeof m.mime === 'string') out.mime = m.mime.slice(0, 40)
  if (Number.isFinite(m.w) && m.w > 0) out.w = Math.round(m.w)
  if (Number.isFinite(m.h) && m.h > 0) out.h = Math.round(m.h)
  return out
}

// ── Gestion des salons (admin uniquement, vérifié côté main) ──
ipcMain.handle('chat-get-channels', async () => {
  if (!isFirebaseConfigured()) return { success: false, channels: [] }
  try {
    const map = normalizeFbMap(await firebaseRequest('GET', '/chat/channels', null, false))
    const channels = Object.entries(map)
      .filter(([, c]) => c && typeof c === 'object')
      .map(([id, c]) => ({ id, ...c }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt || 0) - (b.createdAt || 0))
    return { success: true, channels }
  } catch (e) {
    return { success: false, channels: [], error: e.message }
  }
})

ipcMain.handle('chat-create-channel', async (_, payload) => {
  if (!isFirebaseConfigured()) return { success: false, error: 'Firebase non configuré' }
  const u = chatSessionUser()
  if (!u) return { success: false, error: 'Reconnecte-toi pour gérer les salons.' }
  if (!(await chatIsAdmin(u.username))) return { success: false, error: 'Réservé aux administrateurs.' }
  const name = String(payload?.name ?? '').trim().slice(0, 40)
  if (!name) return { success: false, error: 'Nom de salon requis.' }
  let id = sanitizeChannelId(payload?.id || name)
  if (!id) return { success: false, error: 'Nom de salon invalide.' }
  const type = payload?.type === 'announce' ? 'announce' : 'open'
  const description = String(payload?.description ?? '').trim().slice(0, 200)
  try {
    const existing = normalizeFbMap(await firebaseRequest('GET', '/chat/channels', null, false))
    if (existing[id]) {                       // évite d'écraser un salon : suffixe -2, -3…
      let n = 2
      while (existing[`${id}-${n}`]) n++
      id = `${id}-${n}`
    }
    const order = Object.keys(existing).length
    await firebaseRequest('PUT', `/chat/channels/${id}`, {
      name, description, type, order, createdAt: Date.now(), createdBy: u.username
    }, true)
    return { success: true, id }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('chat-update-channel', async (_, payload) => {
  if (!isFirebaseConfigured()) return { success: false, error: 'Firebase non configuré' }
  const u = chatSessionUser()
  if (!u) return { success: false, error: 'Reconnecte-toi pour gérer les salons.' }
  if (!(await chatIsAdmin(u.username))) return { success: false, error: 'Réservé aux administrateurs.' }
  const id = sanitizeChannelId(payload?.id)
  if (!id) return { success: false, error: 'Salon introuvable.' }
  const patch = {}
  if (typeof payload.name === 'string' && payload.name.trim()) patch.name = payload.name.trim().slice(0, 40)
  if (typeof payload.description === 'string') patch.description = payload.description.trim().slice(0, 200)
  if (payload.type === 'open' || payload.type === 'announce') patch.type = payload.type
  if (Number.isFinite(payload.order)) patch.order = Math.round(payload.order)
  if (!Object.keys(patch).length) return { success: true }
  try {
    await firebaseRequest('PATCH', `/chat/channels/${id}`, patch, true)
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('chat-delete-channel', async (_, id) => {
  if (!isFirebaseConfigured()) return { success: false, error: 'Firebase non configuré' }
  const u = chatSessionUser()
  if (!u) return { success: false, error: 'Reconnecte-toi pour gérer les salons.' }
  if (!(await chatIsAdmin(u.username))) return { success: false, error: 'Réservé aux administrateurs.' }
  const cid = sanitizeChannelId(id)
  if (!cid) return { success: false, error: 'Salon introuvable.' }
  try {
    await firebaseRequest('DELETE', `/chat/channels/${cid}`, null, true)
    await firebaseRequest('DELETE', `/chat/messages/${cid}`, null, true)   // purge les messages
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// ── Messages ──
ipcMain.handle('chat-send-message', async (_, payload) => {
  if (!isFirebaseConfigured()) return { success: false, error: 'Firebase non configuré' }
  const u = chatSessionUser()
  if (!u) return { success: false, error: 'Reconnecte-toi pour écrire.' }
  const cid = sanitizeChannelId(payload?.channelId)
  if (!cid) return { success: false, error: 'Salon invalide.' }
  let channel
  try { channel = await firebaseRequest('GET', `/chat/channels/${cid}`, null, false) } catch {}
  if (!channel || typeof channel !== 'object') return { success: false, error: 'Salon introuvable.' }
  if (channel.type === 'announce' && !(await chatIsAdmin(u.username))) {
    return { success: false, error: 'Ce salon est en lecture seule.' }
  }
  const text = String(payload?.text ?? '').trim().slice(0, CHAT_TEXT_MAX)
  const media = chatSanitizeMedia(payload?.media)
  if (!text && !media) return { success: false, error: 'Message vide.' }
  const msg = { author: u.username, uuid: u.uuid || null, text, ts: Date.now() }
  if (media) msg.media = media
  try {
    const res = await firebaseRequest('POST', `/chat/messages/${cid}`, msg, true)   // → { name: pushId }
    return { success: true, id: res?.name }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('chat-delete-message', async (_, payload) => {
  if (!isFirebaseConfigured()) return { success: false, error: 'Firebase non configuré' }
  const u = chatSessionUser()
  if (!u) return { success: false, error: 'Reconnecte-toi.' }
  const cid = sanitizeChannelId(payload?.channelId)
  const mid = String(payload?.messageId ?? '').trim()
  if (!cid || !isValidPushId(mid)) return { success: false, error: 'Message introuvable.' }
  try {
    const msg = await firebaseRequest('GET', `/chat/messages/${cid}/${mid}`, null, false)
    if (!msg || typeof msg !== 'object') return { success: true }   // déjà supprimé
    const admin = await chatIsAdmin(u.username)
    if (!admin && msg.author !== u.username) return { success: false, error: 'Action non autorisée.' }
    await firebaseRequest('DELETE', `/chat/messages/${cid}/${mid}`, null, true)
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// ── Médias : sélection (dialog) + upload Firebase Storage ──
ipcMain.handle('chat-pick-media', async () => {
  try {
    const r = await dialog.showOpenDialog(win, {
      title: 'Choisir une image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
    })
    if (r.canceled || !r.filePaths?.length) return { canceled: true }
    const fp = r.filePaths[0]
    const buf = fs.readFileSync(fp)
    if (buf.length > CHAT_MEDIA_MAX) return { canceled: false, error: 'Image trop lourde (max 4 Mo).' }
    let ext = path.extname(fp).slice(1).toLowerCase()
    const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
    if (!CHAT_ALLOWED_MIME.includes(mime)) return { canceled: false, error: 'Format non supporté (PNG, JPEG, GIF, WebP).' }
    return { canceled: false, dataUrl: `data:${mime};base64,${buf.toString('base64')}`, mime, name: path.basename(fp), size: buf.length }
  } catch (e) {
    return { canceled: false, error: e.message }
  }
})

// Upload binaire vers Firebase Storage (REST, non authentifié — autorisé par les
// règles Storage scopées /chat-media). Suit les redirects comme downloadFile.
function chatStorageUpload(urlString, buffer, contentType, redirects = 0) {
  if (redirects > 5) return Promise.reject(new Error('Trop de redirections (Storage)'))
  return new Promise((resolve, reject) => {
    let urlObj
    try { urlObj = new URL(urlString) } catch { return reject(new Error('URL Storage invalide')) }
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: { 'Content-Type': contentType, 'Content-Length': buffer.length }
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume()
        return chatStorageUpload(new URL(res.headers.location, urlObj).toString(), buffer, contentType, redirects + 1).then(resolve, reject)
      }
      let body = ''
      res.on('data', c => body += c)
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error(`Storage HTTP ${res.statusCode}`))
        try { resolve(JSON.parse(body)) } catch { reject(new Error('Réponse Storage invalide')) }
      })
    })
    req.on('error', reject)
    req.setTimeout(30000, () => { req.destroy(); reject(new Error('Délai dépassé (upload)')) })
    req.write(buffer)
    req.end()
  })
}

// Décode + valide une image envoyée par le renderer : data URL → buffer dont le
// type réel est vérifié par les magic bytes (anti-usurpation du MIME annoncé).
// Renvoie soit { buffer, realMime, ext }, soit { error }. Partagé chat + news.
function decodeUploadedImage(payload) {
  const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(String(payload?.dataUrl ?? ''))
  if (!m) return { error: 'Image invalide.' }
  const mime = (payload?.mime || m[1] || '').toLowerCase()
  if (!CHAT_ALLOWED_MIME.includes(mime)) return { error: 'Format non supporté (PNG, JPEG, GIF, WebP).' }
  let buffer
  try { buffer = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3])) }
  catch { return { error: 'Image illisible.' } }
  if (!buffer.length) return { error: 'Image vide.' }
  if (buffer.length > CHAT_MEDIA_MAX) return { error: 'Image trop lourde (max 4 Mo).' }
  const realMime = detectImageMime(buffer)
  if (!realMime || !CHAT_ALLOWED_MIME.includes(realMime)) {
    return { error: 'Fichier image non reconnu (PNG, JPEG, GIF, WebP).' }
  }
  return { buffer, realMime, ext: realMime === 'image/jpeg' ? 'jpg' : realMime.split('/')[1] }
}

// Envoie un buffer image vers Firebase Storage et renvoie son URL de
// téléchargement permanente (avec token). Partagé chat + news.
async function uploadImageToStorage(objectPath, buffer, contentType) {
  try {
    const res = await chatStorageUpload(
      `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_STORAGE_BUCKET}/o?name=${encodeURIComponent(objectPath)}`,
      buffer, contentType
    )
    const token = String(res?.downloadTokens ?? '').split(',')[0]
    if (!token) return { success: false, error: 'Upload sans jeton de téléchargement.' }
    const url = `https://firebasestorage.googleapis.com/v0/b/${FIREBASE_STORAGE_BUCKET}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`
    return { success: true, url, mime: contentType }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

ipcMain.handle('chat-upload-media', async (_, payload) => {
  if (!isFirebaseConfigured()) return { success: false, error: 'Firebase non configuré' }
  if (!FIREBASE_STORAGE_BUCKET || FIREBASE_STORAGE_BUCKET.includes('YOUR-')) {
    return { success: false, error: 'Bucket Storage non configuré.' }
  }
  const u = chatSessionUser()
  if (!u) return { success: false, error: 'Reconnecte-toi pour envoyer un média.' }
  const cid = sanitizeChannelId(payload?.channelId)
  if (!cid) return { success: false, error: 'Salon invalide.' }
  const dec = decodeUploadedImage(payload)
  if (dec.error) return { success: false, error: dec.error }
  const objectPath = `chat-media/${cid}/${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${dec.ext}`
  return uploadImageToStorage(objectPath, dec.buffer, dec.realMime)
})

// ── Image de news : upload Firebase Storage (réservé aux admins) ──
// Réhéberge durablement l'image sur notre bucket au lieu de dépendre d'un lien
// Discord (dont les pièces jointes expirent en ~24 h via le paramètre signé `ex`,
// d'où des visuels de news qui « disparaissent »). Même infra que le chat, mais
// scopée /news-media et gardée par la session admin.
// ⚠️ Nécessite une règle Storage autorisant l'écriture sous /news-media.
ipcMain.handle('news-upload-media', async (_, payload) => {
  if (!isFirebaseConfigured()) return { success: false, error: 'Firebase non configuré' }
  if (!FIREBASE_STORAGE_BUCKET || FIREBASE_STORAGE_BUCKET.includes('YOUR-')) {
    return { success: false, error: 'Bucket Storage non configuré.' }
  }
  const gate = await requireAdminSession()
  if (!gate.ok) return { success: false, error: gate.error }
  const dec = decodeUploadedImage(payload)
  if (dec.error) return { success: false, error: dec.error }
  const objectPath = `news-media/${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${dec.ext}`
  return uploadImageToStorage(objectPath, dec.buffer, dec.realMime)
})

// ── Image de fond d'écran : upload Firebase Storage (réservé aux admins) ──
// Même infra que les news (validation magic bytes, 4 Mo max, garde admin),
// scopée /background-media. L'URL renvoyée est ensuite enregistrée dans
// /backgrounds via create-background.
// ⚠️ Nécessite une règle Storage autorisant l'écriture sous /background-media.
ipcMain.handle('background-upload-media', async (_, payload) => {
  if (!isFirebaseConfigured()) return { success: false, error: 'Firebase non configuré' }
  if (!FIREBASE_STORAGE_BUCKET || FIREBASE_STORAGE_BUCKET.includes('YOUR-')) {
    return { success: false, error: 'Bucket Storage non configuré.' }
  }
  const gate = await requireAdminSession()
  if (!gate.ok) return { success: false, error: gate.error }
  const dec = decodeUploadedImage(payload)
  if (dec.error) return { success: false, error: dec.error }
  const objectPath = `background-media/${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${dec.ext}`
  return uploadImageToStorage(objectPath, dec.buffer, dec.realMime)
})

// ── Temps réel : client SSE de Realtime Database REST ──
// On n'utilise PAS firebaseRequest (qui bufferise tout et parse à la fin) : un flux
// SSE ne se termine jamais. Ce client maintient une map en mémoire, applique les
// évènements put/patch, et ré-émet la map complète (debouncée) au renderer.
function startRtdbStream(fbPath, query, onMap) {
  let map = {}
  let req = null
  let closed = false
  let buffer = ''
  let retry = 0
  let reconnectTimer = null
  let idleTimer = null
  let emitTimer = null

  const scheduleEmit = () => {
    if (emitTimer || closed) return
    emitTimer = setTimeout(() => { emitTimer = null; if (!closed) onMap(map) }, 50)
  }

  const armIdle = () => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => { if (req) try { req.destroy() } catch {} }, 65000)
  }

  const applyEvent = (event, payload) => {
    if (event === 'put') {
      const p = String(payload?.path ?? '/')
      if (p === '/' || p === '') {
        map = normalizeFbMap(payload?.data)
      } else {
        const key = p.replace(/^\//, '').split('/')[0]
        if (!key) return
        if (payload?.data === null || payload?.data === undefined) delete map[key]
        else map[key] = payload.data
      }
      scheduleEmit()
    } else if (event === 'patch') {
      const p = String(payload?.path ?? '/').replace(/^\//, '')
      const key = p.split('/')[0]
      if (key) map[key] = Object.assign({}, map[key], payload?.data || {})
      else map = Object.assign({}, map, payload?.data || {})
      scheduleEmit()
    } else if (event === 'cancel' || event === 'auth_revoked') {
      if (req) try { req.destroy() } catch {}
    }
    // keep-alive : ignoré (sert seulement à réarmer le timer d'inactivité)
  }

  const processBlock = (block) => {
    let event = null
    const datas = []
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      else if (line.startsWith('data:')) datas.push(line.slice(5).replace(/^ /, ''))
    }
    if (!event) return
    const raw = datas.join('\n')
    let payload = null
    if (raw && raw !== 'null') { try { payload = JSON.parse(raw) } catch { payload = null } }
    applyEvent(event, payload || {})
  }

  const scheduleReconnect = () => {
    if (closed || reconnectTimer) return
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null }
    const delay = Math.min(30000, 1000 * Math.pow(2, retry))
    retry++
    reconnectTimer = setTimeout(() => { reconnectTimer = null; buffer = ''; connect() }, delay)
  }

  const connect = (urlString) => {
    if (closed) return
    let urlObj
    try { urlObj = new URL(urlString || `${FIREBASE_DATABASE_URL}${fbPath}.json${query}`) }
    catch { return }
    req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: { 'Accept': 'text/event-stream' }
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume()
        return connect(new URL(res.headers.location, urlObj).toString())
      }
      if (res.statusCode !== 200) { res.resume(); scheduleReconnect(); return }
      req.setTimeout(0)        // flux long établi : on relâche le garde-temps de connexion
      retry = 0
      armIdle()
      res.setEncoding('utf8')
      res.on('data', (chunk) => {
        armIdle()
        buffer += chunk.replace(/\r\n/g, '\n')
        let idx
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
          const block = buffer.slice(0, idx)
          buffer = buffer.slice(idx + 2)
          if (block.trim()) processBlock(block)
        }
      })
      res.on('end', scheduleReconnect)
      res.on('error', scheduleReconnect)
    })
    req.on('error', scheduleReconnect)
    req.setTimeout(30000, () => { try { req.destroy() } catch {}; scheduleReconnect() })   // garde-temps avant établissement
    req.end()
  }

  connect()

  return {
    close() {
      closed = true
      if (req) { try { req.destroy() } catch {} req = null }
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (idleTimer) clearTimeout(idleTimer)
      if (emitTimer) clearTimeout(emitTimer)
    }
  }
}

let chatChannelsStream = null
let chatMsgStream = null
let chatActiveChannelId = null

function sendToRenderer(channel, data) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data)
}

ipcMain.handle('chat-subscribe-channels', () => {
  if (!isFirebaseConfigured()) return { success: false }
  if (chatChannelsStream) return { success: true }     // déjà actif (idempotent)
  chatChannelsStream = startRtdbStream('/chat/channels', `?auth=${encodeURIComponent(FIREBASE_SECRET)}`, (map) => {
    const channels = Object.entries(map)
      .filter(([, c]) => c && typeof c === 'object')
      .map(([id, c]) => ({ id, ...c }))
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.createdAt || 0) - (b.createdAt || 0))
    sendToRenderer('chat:channels', channels)
  })
  return { success: true }
})

ipcMain.handle('chat-unsubscribe-channels', () => {
  if (chatChannelsStream) { chatChannelsStream.close(); chatChannelsStream = null }
  return { success: true }
})

ipcMain.handle('chat-subscribe', (_, channelId) => {
  if (!isFirebaseConfigured()) return { success: false }
  const cid = sanitizeChannelId(channelId)
  if (!cid) return { success: false, error: 'Salon invalide.' }
  if (chatMsgStream) { chatMsgStream.close(); chatMsgStream = null }   // exclusif : un seul salon écouté
  chatActiveChannelId = cid
  const q = `?orderBy=${encodeURIComponent('"$key"')}&limitToLast=200&auth=${encodeURIComponent(FIREBASE_SECRET)}`
  chatMsgStream = startRtdbStream(`/chat/messages/${cid}`, q, (map) => {
    const messages = Object.entries(map)
      .filter(([, m]) => m && typeof m === 'object')
      .map(([id, m]) => ({ id, ...m }))
      .sort((a, b) => (a.ts || 0) - (b.ts || 0) || (a.id < b.id ? -1 : 1))
    sendToRenderer('chat:messages', { channelId: cid, messages })
  })
  return { success: true }
})

ipcMain.handle('chat-unsubscribe', (_, channelId) => {
  const cid = sanitizeChannelId(channelId)
  if (cid && chatActiveChannelId && cid !== chatActiveChannelId) return { success: true }  // unsubscribe obsolète (StrictMode)
  if (chatMsgStream) { chatMsgStream.close(); chatMsgStream = null }
  chatActiveChannelId = null
  return { success: true }
})

// ─── DOWNLOAD ────────────────────────────────────────────────────────────────
// Agents keep-alive partagés : sans eux, Node rouvre une connexion TCP + un handshake
// TLS complet pour CHAQUE fichier (222 mods + des centaines de fichiers Java au 1er
// lancement). Réutiliser les sockets supprime cet overhead, qui domine le temps perdu
// sur les petits fichiers. maxSockets borne la charge ; le vrai parallélisme est piloté
// par runPool() ci-dessous.
const keepAliveHttps = new https.Agent({ keepAlive: true, maxSockets: 64, maxFreeSockets: 16 })
const keepAliveHttp  = new http.Agent({ keepAlive: true, maxSockets: 64, maxFreeSockets: 16 })

function downloadFile(url, dest, redirects = 0) {
  if (redirects > 10) return Promise.reject(new Error('Trop de redirections'))

  return new Promise((resolve, reject) => {
    const proto   = url.startsWith('https') ? https : http
    const urlObj  = new URL(url)
    const options = {
      hostname: urlObj.hostname,
      path:     urlObj.pathname + urlObj.search,
      headers:  { 'User-Agent': 'Mozilla/5.0' },
      agent:    proto === https ? keepAliveHttps : keepAliveHttp
    }
    const file = fs.createWriteStream(dest)
    let settled = false
    const fail = (err) => {
      if (settled) return
      settled = true
      file.close()
      // unlink best-effort : sur Windows le fd peut être encore en fermeture (EBUSY).
      if (fs.existsSync(dest)) { try { fs.unlinkSync(dest) } catch { /* rien */ } }
      reject(err)
    }

    const req = proto.get(options, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        if (settled) return
        settled = true
        file.close()
        if (fs.existsSync(dest)) { try { fs.unlinkSync(dest) } catch { /* rien */ } }
        return downloadFile(res.headers.location, dest, redirects + 1).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) {
        return fail(new Error(`HTTP ${res.statusCode} — ${url}`))
      }
      const ct = res.headers['content-type'] || ''
      if (ct.includes('text/html')) {
        return fail(new Error(`Réponse HTML inattendue pour ${path.basename(dest)} — lien Drive expiré ?`))
      }
      const expected = parseInt(res.headers['content-length'] || '0', 10)
      let received = 0
      res.on('data', (chunk) => { received += chunk.length })
      res.pipe(file)
      file.on('finish', () => {
        file.close(() => {
          if (settled) return
          // Téléchargement tronqué (coupure réseau) : sans ce contrôle, un .jar
          // partiel est conservé, passe ensuite pour « corrompu » (installeur) ou
          // crashe au chargement (mod), et n'est JAMAIS re-téléchargé car le fichier
          // existe déjà. On le supprime pour que la prochaine tentative recommence.
          if (expected && received < expected) {
            return fail(new Error(`Téléchargement incomplet (${received}/${expected} octets) — ${path.basename(dest)}`))
          }
          settled = true
          resolve()
        })
      })
    })

    req.on('error', fail)
    file.on('error', fail)
    // Garde-temps d'INACTIVITÉ (pas une durée maximale) : il se réarme tant que des
    // octets arrivent, et ne saute donc que si la connexion se fige — fréquent avec
    // Google Drive, qui peut « pendre » une socket. En séquentiel, un seul mod figé
    // bloquait tout le launcher sans fin ; ici on coupe, et downloadWithRetry réessaie.
    req.setTimeout(30000, () => req.destroy(new Error(`Délai dépassé (30 s sans données) — ${path.basename(dest)}`)))
  })
}

// Pool de concurrence borné : applique worker(item, i) à `items` avec au plus
// `concurrency` tâches simultanées. Remplace les boucles « for … await » (un fichier à
// la fois) du 1er lancement. Une tâche qui échoue (après reprises) stoppe l'enfournement
// et l'erreur est propagée une fois les tâches en vol terminées — un modpack incomplet
// crashe en jeu, donc on ne masque jamais l'échec.
async function runPool(items, concurrency, worker) {
  const results = new Array(items.length)
  let next = 0
  let firstErr = null
  async function runner() {
    while (next < items.length && !firstErr) {
      const i = next++
      try { results[i] = await worker(items[i], i) }
      catch (e) { if (!firstErr) firstErr = e }
    }
  }
  const n = Math.max(1, Math.min(concurrency, items.length))
  await Promise.all(Array.from({ length: n }, () => runner()))
  if (firstErr) throw firstErr
  return results
}

// downloadFile + reprises : un échec ponctuel (socket keep-alive fermée par le serveur,
// 429/throttle Google Drive, micro-coupure) est réessayé avec un délai croissant plutôt
// que de faire échouer toute l'installation.
async function downloadWithRetry(url, dest, attempts = 3) {
  let lastErr
  for (let a = 1; a <= attempts; a++) {
    try { return await downloadFile(url, dest) }
    catch (e) {
      lastErr = e
      if (a < attempts) await new Promise(r => setTimeout(r, 600 * a * a))
    }
  }
  throw lastErr
}
