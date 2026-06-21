// Signature AD-HOC de l'app macOS (codesign --sign -).
//
// Pourquoi : on n'a pas de compte Apple Developer, donc `mac.identity: null` →
// electron-builder NE SIGNE PAS l'app du tout. Or sur Apple Silicon (arm64), un
// exécutable SANS aucune signature est tué par le kernel / affiché « L'app est
// endommagée » — un blocage NON contournable par le joueur. Une signature ad-hoc
// (sans certificat, gratuite) suffit à rendre l'app lançable : macOS la marquera
// alors seulement « développeur non identifié », contournable via clic droit →
// Ouvrir (cf docs/INSTALLATION-MAC.md).
//
// Quand : ce hook tourne après CHAQUE pack. Pour une cible `universal`, le merge
// lipo de @electron/universal efface les signatures par-arch ; on ne signe donc
// QUE l'app finale fusionnée (on ignore les paquets temporaires …-x64-temp /
// …-arm64-temp), juste avant la création du .dmg.
const { execFileSync } = require('child_process')
const path = require('path')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return        // no-op sur Windows
  if (context.appOutDir.endsWith('-temp')) return              // pack par-arch intermédiaire : ignoré

  const appName = context.packager.appInfo.productFilename     // « Zig City 2 »
  const appPath = path.join(context.appOutDir, `${appName}.app`)

  console.log(`[afterPack] Signature ad-hoc de ${appPath}`)
  // execFileSync (et non shell) : le chemin contient un espace, pas de quoting à gérer.
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' })
}
