const { app, BrowserWindow, ipcMain } = require('electron')
const { autoUpdater } = require('electron-updater')
const { Client } = require('minecraft-launcher-core')
const path = require('path')
const fs = require('fs')
const https = require('https')
const http = require('http')
const crypto = require('crypto')
const { spawn } = require('child_process')

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const MODPACK = require('./modpack.json')
const GAME_DIR = path.join(app.getPath('appData'), MODPACK.launcherName)
const SESSION_FILE = path.join(GAME_DIR, '.session')

// URL officielle de l'installeur NeoForge
const NEOFORGE_INSTALLER_URL =
  `https://maven.neoforged.net/releases/net/neoforged/neoforge/${MODPACK.loaderVersion}/neoforge-${MODPACK.loaderVersion}-installer.jar`
const NEOFORGE_INSTALLER_PATH =
  path.join(GAME_DIR, `neoforge-${MODPACK.loaderVersion}-installer.jar`)

// Java 21 (requis pour MC 1.20.5+) — téléchargé depuis Mojang si absent
const JAVA_MANIFEST_URL = 'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json'
const JAVA_RUNTIME_NAME = 'java-runtime-delta'
const JAVA_DIR = path.join(GAME_DIR, 'runtime', JAVA_RUNTIME_NAME)
const JAVA_EXE = path.join(JAVA_DIR, 'bin', 'javaw.exe')

let win = null
let currentToken = null

// ─── WINDOW ──────────────────────────────────────────────────────────────────
function createWindow() {
  win = new BrowserWindow({
    width: 860,
    height: 520,
    resizable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })
  win.loadFile('index.html')
  win.removeMenu()
  win.webContents.openDevTools({ mode: 'detach' })
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })

  // Vérifie les mises à jour au démarrage (silencieux si à jour)
  autoUpdater.checkForUpdatesAndNotify()
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

// ─── AUTO UPDATE ─────────────────────────────────────────────────────────────
// Le launcher se met à jour tout seul via les Releases GitHub (electron-builder
// publie l'installeur + latest.yml, electron-updater compare les versions).
autoUpdater.on('checking-for-update', () => {
  console.log('[AutoUpdate] Recherche de mises à jour...')
})
autoUpdater.on('update-available', (info) => {
  console.log('[AutoUpdate] Mise à jour disponible :', info.version)
  win?.webContents.send('update-status', { status: 'available', version: info.version })
})
autoUpdater.on('update-not-available', () => {
  console.log('[AutoUpdate] Launcher à jour.')
})
autoUpdater.on('error', (err) => {
  console.log('[AutoUpdate] Erreur :', err.message)
})
autoUpdater.on('download-progress', (progress) => {
  win?.webContents.send('update-status', {
    status: 'downloading',
    percent: Math.round(progress.percent)
  })
})
autoUpdater.on('update-downloaded', (info) => {
  console.log('[AutoUpdate] Mise à jour téléchargée :', info.version)
  win?.webContents.send('update-status', { status: 'ready', version: info.version })
  // Installe au prochain redémarrage de l'app (pas pendant que le jeu tourne)
})

// Permet à l'UI de déclencher l'installation immédiate de la mise à jour téléchargée
ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall()
})

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
  return username ? { logged: true, username } : { logged: false }
})

ipcMain.handle('login', async () => {
  try {
    const code = await openMicrosoftLogin()
    const token = await exchangeCodeForMinecraftToken(code)
    currentToken = token
    saveSession(token)
    return { success: true, username: token.name }
  } catch (e) {
    return { success: false, error: String(e.message || e) }
  }
})

// ─── MICROSOFT OAUTH — implémentation directe ────────────────────────────────
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

  // 1. Code → token Microsoft
  const ms = await httpsPost(
    'https://login.live.com/oauth20_token.srf',
    `client_id=${CLIENT_ID}&code=${code}&grant_type=authorization_code&redirect_uri=${encodeURIComponent(REDIRECT)}`
  )
  if (!ms.access_token) throw new Error('Échec token Microsoft : ' + JSON.stringify(ms))

  // 2. Token MS → token Xbox Live
  const xbl = await httpsPost('https://user.auth.xboxlive.com/user/authenticate', {
    Properties: { AuthMethod: 'RPS', SiteName: 'user.auth.xboxlive.com', RpsTicket: ms.access_token },
    RelyingParty: 'http://auth.xboxlive.com',
    TokenType: 'JWT'
  })

  // 3. Token Xbox → XSTS
  const xsts = await httpsPost('https://xsts.auth.xboxlive.com/xsts/authorize', {
    Properties: { SandboxId: 'RETAIL', UserTokens: [xbl.Token] },
    RelyingParty: 'rp://api.minecraftservices.com/',
    TokenType: 'JWT'
  })
  if (xsts.XErr) throw new Error(`Erreur XSTS ${xsts.XErr} — compte Xbox requis`)

  // 4. XSTS → token Minecraft
  const uhs = xsts.DisplayClaims.xui[0].uhs
  const mc  = await httpsPost('https://api.minecraftservices.com/authentication/login_with_xbox', {
    identityToken: `XBL3.0 x=${uhs};${xsts.Token}`
  })
  if (!mc.access_token) throw new Error('Échec token Minecraft')

  // 5. Récupère le profil (pseudo + UUID)
  const profile = await httpsGet(
    'https://api.minecraftservices.com/minecraft/profile',
    { Authorization: `Bearer ${mc.access_token}` }
  )
  if (!profile.name) throw new Error('Profil Minecraft introuvable — le compte a-t-il Minecraft ?')

  // Format compatible MCLC
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

// ─── IPC : MODPACK ───────────────────────────────────────────────────────────
ipcMain.handle('check-modpack', async () => {
  const modsDir = path.join(GAME_DIR, 'mods')
  fs.mkdirSync(modsDir, { recursive: true })

  // Supprime les mods qui ne sont plus dans le manifest (mise à jour propre)
  // On ignore les dossiers (ex: ".connector" créé par le mod Connector) et
  // les fichiers cachés/techniques, et on ne plante pas si un fichier est
  // verrouillé (EPERM/EBUSY).
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
    // 0. S'assure que Java 21 est disponible (télécharge si besoin)
    const javaExe = await ensureJava21()

    // 1. Télécharge et installe NeoForge si besoin
    if (!isNeoForgeInstalled()) {
      win?.webContents.send('install-progress', {
        step: 'neoforge',
        name: `Téléchargement NeoForge ${MODPACK.loaderVersion}...`,
        percent: 10
      })

      if (!fs.existsSync(NEOFORGE_INSTALLER_PATH)) {
        await downloadFile(NEOFORGE_INSTALLER_URL, NEOFORGE_INSTALLER_PATH)
      }

      // Le NeoForge installer exige launcher_profiles.json dans le répertoire cible
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

      // Lance l'installeur en async (ne bloque plus l'UI)
      await new Promise((resolve, reject) => {
        const proc = spawn(javaExe, [
          '-jar', NEOFORGE_INSTALLER_PATH,
          '--installClient', GAME_DIR
        ])

        let output = ''
        proc.stdout?.on('data', d => { output += d.toString() })
        proc.stderr?.on('data', d => { output += d.toString() })

        // Simule la progression pendant l'installation
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
            reject(new Error(`Java non trouvé (essayé : ${javaExe}) — lance Minecraft officiel une fois puis réessaie`))
          } else {
            reject(err)
          }
        })
      })
    }

    // 2. Télécharge les mods manquants
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

// Vérifie si NeoForge est déjà installé dans le dossier versions
function isNeoForgeInstalled() {
  const versionId = `neoforge-${MODPACK.loaderVersion}`
  const versionDir = path.join(GAME_DIR, 'versions', versionId)
  return fs.existsSync(versionDir)
}

// Cherche Java 21 — scanne les runtimes du launcher MC officiel
function findJavaExecutable() {
  const baseDirs = [
    path.join(app.getPath('appData'), '.minecraft', 'runtime'),
    path.join(GAME_DIR, 'runtime')
  ]
  for (const base of baseDirs) {
    if (!fs.existsSync(base)) continue
    // Trie inverse : "delta" avant "gamma" (on veut Java 21 en priorité)
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
  return 'java' // fallback PATH système
}

// Garantit la présence de Java 21 : cherche localement, sinon télécharge
// le runtime officiel Mojang (même source que le launcher Minecraft officiel)
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

// ─── NEOFORGE : RECONSTRUCTION DES ARGS JVM (module path) ───────────────────
// MCLC ne reprend pas les arguments JVM spéciaux du JSON de version NeoForge
// (-p <module-path>, --add-modules ALL-MODULE-PATH, -DlegacyClassPath=...,
// -DignoreList=..., -DlibraryDirectory=...). Sans ces arguments, le module
// "org.spongepowered.mixin" (sponge-mixin) est placé sur le module-path JPMS
// mais les modules dont il dépend (org.objectweb.asm.commons, asm.util, ...)
// ne le sont pas : Java lève "Module ... not found, required by
// org.spongepowered.mixin". On relit donc le JSON de version NeoForge et on
// reconstruit ces arguments nous-mêmes.

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

// Lit versions/neoforge-X.X.X/neoforge-X.X.X.json et reconstruit ses
// arguments.jvm avec substitution des variables ${...}. Retourne null si
// le JSON est introuvable ou ne contient pas d'arguments.jvm exploitables.
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

  // Args JVM requis par le module securejarhandler / sponge-mixin de NeoForge
  // sur Java 17+ (module path, ALL-MODULE-PATH, legacy classpath...).
  // Reconstruits depuis le JSON de version si possible, sinon repli minimal.
  const neoForgeJvmArgs = buildNeoForgeJvmArgs()
  console.log('[RawLauncher] Args JVM NeoForge :', neoForgeJvmArgs ? 'reconstruits depuis le JSON de version' : 'repli (fallback) minimal')

  // Flags GC "Aikar" : réduit les freezes/lags sur les gros modpacks
  // (recommandés par Aikar/PaperMC, adaptés ici pour le client)
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

  // NeoForge crée une version custom dans versions/neoforge-X.X.X
  const opts = {
    authorization: currentToken,
    root: GAME_DIR,
    version: {
      number: MODPACK.minecraft,
      type: 'release',
      custom: `neoforge-${MODPACK.loaderVersion}`   // dossier dans /versions/
    },
    memory: {
      max: `${MODPACK.maxRam ?? 4}G`,
      min: `${MODPACK.minRam ?? 2}G`
    },
    javaPath: javaExe,   // Java 21 requis pour MC 1.21.1
    customArgs: [
      ...AIKAR_GC_FLAGS,
      ...(neoForgeJvmArgs || [
        '--add-opens', 'java.base/java.util.jar=cpw.mods.securejarhandler',
        '--add-opens', 'java.base/java.lang.invoke=cpw.mods.securejarhandler',
        '--add-opens', 'java.base/java.lang.invoke=ALL-UNNAMED',
        '--add-exports', 'java.base/sun.security.util=cpw.mods.securejarhandler',
        '--add-exports', 'jdk.naming.dns/com.sun.jndi.dns=java.naming'
      ])
    ],
    // Décommente pour auto-connecter au serveur au lancement :
    // server: { host: MODPACK.server, port: MODPACK.port ?? 25565 }
  }

  console.log('[RawLauncher] Java utilisé pour le lancement :', javaExe)

  let logBuffer = []
  launcher.on('data', (e) => {
    const line = e.toString()
    logBuffer.push(line)
    if (logBuffer.length > 60) logBuffer.shift()
    console.log('[MC]', line)
    win?.webContents.send('game-log', line)
  })
  launcher.on('progress', (e) => win?.webContents.send('launch-progress', e))
  launcher.on('debug', (e) => console.log('[MCLC debug]', e))
  launcher.on('close', (code) => {
    console.log('[RawLauncher] Minecraft fermé, code =', code)
    win?.show()
    win?.webContents.send('game-closed', { code, log: logBuffer.join('\n') })
  })

  try {
    const proc = await launcher.launch(opts)
    if (!proc || !proc.pid) return { success: false, error: 'Minecraft n\'a pas démarré (pas de PID)' }
    console.log('[RawLauncher] Minecraft PID:', proc.pid)
    win?.hide()
    return { success: true }
  } catch (e) {
    console.log('[RawLauncher] Erreur launch:', e)
    return { success: false, error: e.message }
  }
})

// ─── UTILITAIRE : DOWNLOAD ────────────────────────────────────────────────────
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
      // Suit toutes les redirections
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
      // Vérifie que c'est pas une page HTML (ex: page de confirmation Google Drive)
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
