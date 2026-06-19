const { app, BrowserWindow, ipcMain, shell, dialog } = require('electron')
const { autoUpdater } = require('electron-updater')
const { Client } = require('minecraft-launcher-core')
const path = require('path')
const fs = require('fs')
const https = require('https')
const http = require('http')
const net = require('net')
const crypto = require('crypto')
const { spawn } = require('child_process')

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
const JAVA_EXE = path.join(JAVA_DIR, 'bin', 'javaw.exe')

let win = null
let currentToken = null

// ─── WINDOW ──────────────────────────────────────────────────────────────────
// Fenêtre à 1366×883 (ratio exact du frame Figma 1728/1117 = 1.547).
// Le scaling du design Figma est géré côté renderer via CSS transform.
function createWindow() {
  win = new BrowserWindow({
    width: 1366,
    height: 883,
    resizable: false,
    frame: false,
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

    // Historique persistant de tous les joueurs vus
    const seen = loadPlayersSeen()
    for (const name of currentNames) {
      if (!seen[name]) seen[name] = now
    }
    savePlayersSeen(seen)

    return {
      online: status.players?.online ?? 0,
      max: status.players?.max ?? 0,
      players: currentNames.map(name => ({ name, since: times[name] }))
    }
  } catch (e) {
    return { online: 0, max: 0, players: [], error: e.message }
  }
})

ipcMain.handle('get-players-seen', () => {
  return Object.keys(loadPlayersSeen())
})

// ─── IPC : WINDOW CONTROLS ───────────────────────────────────────────────────
ipcMain.handle('window-minimize', () => win?.minimize())
ipcMain.handle('window-maximize', () => win?.isMaximized() ? win.unmaximize() : win.maximize())
ipcMain.handle('window-close', () => win?.close())
ipcMain.handle('open-external', (_, url) => shell.openExternal(url))

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

// Déclenché par le renderer une fois qu'il écoute déjà 'update-status' : évite toute
// course entre l'émission des events et l'abonnement côté UI.
ipcMain.handle('check-for-updates', async () => {
  if (!app.isPackaged) return { status: 'disabled' }   // pas de MAJ en dev
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
  if (updateInstalling) return          // garde contre les appels multiples
  updateInstalling = true
  autoUpdater.quitAndInstall(true, true)
})

app.whenReady().then(() => {
  loadSession()          // restaure currentToken dès le démarrage (skin, lancement…)
  initializeAdmins()
  setupAutoUpdater()
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
  return { logged: true, username, uuid: currentToken?.uuid ?? null }
})

ipcMain.handle('login', async () => {
  try {
    const code = await openMicrosoftLogin()
    const token = await exchangeCodeForMinecraftToken(code)
    currentToken = token
    saveSession(token)
    return { success: true, username: token.name, uuid: token.uuid }
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

ipcMain.handle('get-skin-info', async () => {
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
      name: res.json.name,
      uuid: res.json.id
    }
  } catch (e) {
    return { success: false, error: String(e.message || e) }
  }
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

ipcMain.handle('upload-skin', async (_, { variant, path: filePath } = {}) => {
  if (!currentToken?.access_token) return { success: false, error: 'Non connecté', loggedOut: true }
  const v = normalizeVariant(variant)

  let buf
  try {
    buf = fs.readFileSync(filePath)
  } catch {
    return { success: false, error: 'Impossible de lire le fichier (déplacé ou supprimé ?).' }
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
  if (!currentToken?.access_token) return { success: false, error: 'Non connecté', loggedOut: true }
  try {
    const res = await mcAuthorizedRequest('DELETE', `${MC_SKINS_URL}/active`, { token: currentToken.access_token })
    if (res.statusCode === 401) return { success: false, error: 'Session Minecraft expirée — reconnecte-toi.', expired: true }
    if (res.statusCode !== 200) return { success: false, error: `Échec de la réinitialisation (HTTP ${res.statusCode}).` }
    const skin = activeSkin(res.json)
    return { success: true, variant: normalizeVariant(skin?.variant), skinUrl: skin?.url || null }
  } catch (e) {
    return { success: false, error: String(e.message || e) }
  }
})

// ─── IPC : MODPACK ───────────────────────────────────────────────────────────
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

  const missingMods = MODPACK.mods.filter(mod =>
    !fs.existsSync(path.join(modsDir, mod.name))
  )
  const needsNeoForge = !isNeoForgeInstalled()

  return {
    total: MODPACK.mods.length,
    missingMods: missingMods.length,
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
        await downloadFile(NEOFORGE_INSTALLER_URL, NEOFORGE_INSTALLER_PATH)
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

    for (let i = 0; i < missing.length; i++) {
      const mod = missing[i]
      win?.webContents.send('install-progress', {
        step: 'mods',
        current: i + 1,
        total: missing.length,
        name: mod.name,
        percent: Math.round((i / missing.length) * 100)
      })
      await downloadFile(mod.url, path.join(modsDir, mod.name))
    }

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
  for (const base of baseDirs) {
    if (!fs.existsSync(base)) continue
    const entries = fs.readdirSync(base).sort().reverse()
    for (const name of entries) {
      for (const exe of ['javaw.exe', 'java.exe']) {
        const c1 = path.join(base, name, 'windows-x64', name, 'bin', exe)
        if (fs.existsSync(c1)) return c1
        const c2 = path.join(base, name, 'bin', exe)
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
  const entries = allManifest?.['windows-x64']?.[JAVA_RUNTIME_NAME]
  if (!entries || !entries[0]) throw new Error('Runtime Java 21 introuvable (manifest Mojang)')

  const manifest = await httpsGet(entries[0].manifest.url)
  const files = Object.entries(manifest.files).filter(([_, f]) => f.type === 'file')

  let done = 0
  for (const [relPath, info] of files) {
    const dest = path.join(JAVA_DIR, relPath)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    await downloadFile(info.downloads.raw.url, dest)
    done++
    if (done % 5 === 0 || done === files.length) {
      win?.webContents.send('install-progress', {
        step: 'java',
        name: `Téléchargement de Java 21... (${done}/${files.length})`,
        percent: 2 + Math.round((done / files.length) * 28)
      })
    }
  }

  return JAVA_EXE
}

// ─── NEOFORGE JVM ARGS ───────────────────────────────────────────────────────
function libRuleAllows(rules) {
  if (!rules || rules.length === 0) return true
  let result = false
  for (const rule of rules) {
    let applies = true
    if (rule.os && rule.os.name && rule.os.name !== 'windows') applies = false
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

    const classpath = cpEntries.join(';')

    const vars = {
      '${library_directory}': libraryDir,
      '${classpath_separator}': ';',
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
ipcMain.handle('launch', async () => {
  if (!currentToken) return { success: false, error: 'Non connecté' }

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

  const opts = {
    authorization: currentToken,
    root: GAME_DIR,
    version: {
      number: MODPACK.minecraft,
      type: 'release',
      custom: `neoforge-${MODPACK.loaderVersion}`
    },
    memory: {
      max: `${MODPACK.maxRam ?? 4}G`,
      min: `${MODPACK.minRam ?? 2}G`
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
  launcher.on('data', (e) => {
    const line = e.toString()
    logBuffer.push(line)
    if (logBuffer.length > 60) logBuffer.shift()
    win?.webContents.send('game-log', line)
  })
  launcher.on('progress', (e) => win?.webContents.send('launch-progress', e))
  launcher.on('debug', (e) => console.log('[MCLC debug]', e))
  launcher.on('close', (code) => {
    win?.show()
    win?.webContents.send('game-closed', { code, log: logBuffer.join('\n') })
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
        try { resolve(JSON.parse(body)) }
        catch { resolve(body || null) }
      })
    })

    req.on('error', reject)
    if (payload !== null) req.write(payload)
    req.end()
  })
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
    news.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    return { success: true, news }
  } catch (e) {
    return { success: false, news: [], error: e.message }
  }
})

ipcMain.handle('create-news', async (_, newsData) => {
  if (!isFirebaseConfigured()) return { success: false, error: 'Firebase non configuré' }
  try {
    const result = await firebaseRequest('POST', '/news', { ...newsData, createdAt: Date.now() }, true)
    return { success: true, id: result?.name }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('update-news', async (_, { id, ...newsData }) => {
  if (!isFirebaseConfigured()) return { success: false, error: 'Firebase non configuré' }
  try {
    await firebaseRequest('PATCH', `/news/${id}`, newsData, true)
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('delete-news', async (_, id) => {
  if (!isFirebaseConfigured()) return { success: false, error: 'Firebase non configuré' }
  try {
    await firebaseRequest('DELETE', `/news/${id}`, null, true)
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
  try {
    await firebaseRequest('PUT', `/admins/${username}`, true, true)
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

ipcMain.handle('remove-admin', async (_, username) => {
  if (!isFirebaseConfigured()) return { success: false, error: 'Firebase non configuré' }
  try {
    await firebaseRequest('DELETE', `/admins/${username}`, null, true)
    return { success: true }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// ─── DOWNLOAD ────────────────────────────────────────────────────────────────
function downloadFile(url, dest, redirects = 0) {
  if (redirects > 10) return Promise.reject(new Error('Trop de redirections'))

  return new Promise((resolve, reject) => {
    const proto   = url.startsWith('https') ? https : http
    const urlObj  = new URL(url)
    const options = {
      hostname: urlObj.hostname,
      path:     urlObj.pathname + urlObj.search,
      headers:  { 'User-Agent': 'Mozilla/5.0' }
    }
    const file = fs.createWriteStream(dest)

    proto.get(options, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        file.close()
        if (fs.existsSync(dest)) fs.unlinkSync(dest)
        return downloadFile(res.headers.location, dest, redirects + 1).then(resolve).catch(reject)
      }
      if (res.statusCode !== 200) {
        file.close()
        if (fs.existsSync(dest)) fs.unlinkSync(dest)
        return reject(new Error(`HTTP ${res.statusCode} — ${url}`))
      }
      const ct = res.headers['content-type'] || ''
      if (ct.includes('text/html')) {
        file.close()
        if (fs.existsSync(dest)) fs.unlinkSync(dest)
        return reject(new Error(`Réponse HTML inattendue pour ${path.basename(dest)} — lien Drive expiré ?`))
      }
      res.pipe(file)
      file.on('finish', () => { file.close(); resolve() })
    }).on('error', (err) => {
      file.close()
      if (fs.existsSync(dest)) fs.unlinkSync(dest)
      reject(err)
    })
  })
}
