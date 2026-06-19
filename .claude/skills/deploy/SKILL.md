---
name: deploy
description: Déploie une nouvelle version du launcher Zig City en une seule commande — bump de version, commit, tag, push, déclenchement du CI GitHub Actions, suivi du build, et vérification que la release est publiée avec ses fichiers d'auto-update. À utiliser quand l'utilisateur veut publier / déployer / sortir une nouvelle version du launcher. Argument optionnel : la version exacte (ex. "0.2.0-beta") ; sans argument, le numéro de patch est incrémenté automatiquement.
disable-model-invocation: true
---

# Déployer une nouvelle version du launcher

Publie une nouvelle version du launcher (dossier `raw-launcher/`) sur **GitHub Releases**, ce qui déclenche la **mise à jour automatique** chez tous les joueurs (≥ 0.1.2-beta) à leur prochaine ouverture.

Exécute les étapes **dans l'ordre** et **arrête-toi immédiatement** si une étape échoue (ne jamais publier du code cassé). Travaille depuis la racine du dépôt git ; le projet Electron est dans `raw-launcher/`. Le dépôt GitHub est `Mamazorus/zig-city-2`.

`$ARGUMENTS` = version cible optionnelle (ex. `0.2.0-beta`).

> **Prérequis déjà en place** (ne pas refaire) : `.github/workflows/release.yml` (build+publish sur tag `v*`), `raw-launcher/.npmrc` (`legacy-peer-deps=true`), `build.publish` GitHub + `releaseType: prerelease` dans `package.json`.

## 1 — Déterminer la nouvelle version
- Version actuelle : `node -p "require('./raw-launcher/package.json').version"`.
- **Si `$ARGUMENTS` est non vide** → c'est la version cible (retire un éventuel préfixe `v`).
- **Sinon** → incrémente le patch en gardant le suffixe (`0.1.3-beta` → `0.1.4-beta`) :
  ```bash
  node -e "const v=require('./raw-launcher/package.json').version;const m=v.match(/^(\d+)\.(\d+)\.(\d+)(-.+)?$/);if(!m){console.error('version illisible: '+v);process.exit(1)}console.log(m[1]+'.'+m[2]+'.'+(+m[3]+1)+(m[4]||''))"
  ```
- La version retenue est `<VERSION>` ; le tag sera `v<VERSION>`. Vérifie qu'elle est **strictement supérieure** à l'actuelle (sinon l'auto-update ne se déclenche pas → préviens l'utilisateur et arrête).

## 2 — Pré-vol : vérifier que ça compile
Dans `raw-launcher/`, lance les deux :
```bash
npx tsc --noEmit -p tsconfig.web.json
npm run build
```
Si l'un échoue → **arrête tout**, ne bumpe rien, montre l'erreur à l'utilisateur pour qu'il corrige. *(Le build ne touche pas `node_modules`, il fonctionne même si l'app Electron est ouverte.)*

## 3 — Bump de version
⚠️ `npm version` dans un sous-dossier **ne crée pas** le commit/tag git — on bumpe juste le fichier, puis on commit/tag à la main.
```bash
cd raw-launcher && npm version <VERSION> --no-git-tag-version && cd ..
```

## 4 — Commit + tag + push (depuis la racine)
```bash
git add -A
git commit -m "release v<VERSION>"   # termine le message par la ligne Co-Authored-By habituelle
git tag -a v<VERSION> -m "v<VERSION>"
git push origin <branche-courante>   # généralement main
git push origin v<VERSION>
```
Le tag **sans le `v`** DOIT être égal à la version de `package.json` — un garde-fou du workflow CI le vérifie et fait échouer le build sinon.

## 5 — Suivre le build CI jusqu'au bout
Lance la surveillance **en arrière-plan** (`run_in_background: true`) puis attends la notification de fin avant de continuer :
```bash
REPO="Mamazorus/zig-city-2"; sleep 12
for i in $(seq 1 40); do
  J=$(curl -s "https://api.github.com/repos/$REPO/actions/runs?per_page=1&_=$i")
  ST=$(echo "$J" | grep -o '"status":[^,]*' | head -1)
  CONC=$(echo "$J" | grep -o '"conclusion":[^,]*' | head -1)
  TITLE=$(echo "$J" | grep -o '"display_title": *"[^"]*"' | head -1)
  echo "poll $i: $ST | $CONC | $TITLE"
  echo "$ST" | grep -q completed && { echo "=== FIN: $CONC ==="; break; }
  sleep 20
done
```
- Confirme que `display_title` correspond bien à `release v<VERSION>` (le run que tu viens de déclencher, pas un ancien).
- **conclusion = success** → étape 6.
- **conclusion = failure** → récupère l'étape en échec via `https://api.github.com/repos/$REPO/actions/runs/<RUN_ID>/jobs` (utilise WebFetch), montre-la à l'utilisateur et arrête. *(Cause déjà connue/corrigée : `npm ci` ERESOLVE vite 8 / electron-vite 5 → géré par `.npmrc`.)*

## 6 — Vérifier la release publiée
Via WebFetch sur `https://api.github.com/repos/Mamazorus/zig-city-2/releases?per_page=1`, confirme :
- `tag_name` = `v<VERSION>` et `draft` = `false`
- les assets contiennent **`latest.yml`**, **`Raw-Launcher-Setup-<VERSION>.exe`** et **`.exe.blockmap`**

## 7 — Rapport final
Annonce à l'utilisateur :
- ✅ Version `<VERSION>` déployée et **publiée**.
- Le lien de la release : `https://github.com/Mamazorus/zig-city-2/releases`.
- Rappel : les joueurs (sur une version ≥ 0.1.2-beta) reçoivent la MAJ à leur prochaine ouverture du launcher.
