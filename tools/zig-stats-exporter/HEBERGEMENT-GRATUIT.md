# Faire tourner l'exporteur 24/7 — gratuitement

## ✅ Option recommandée — GitHub Actions (aucune machine à gérer)

Comme le dépôt **`zig-city-2` est public**, GitHub exécute l'exporteur **gratuitement
et sans limite** dans son cloud, sur une planification (toutes les 5 min). C'est en
place via **`.github/workflows/zig-stats.yml`**. Rien à allumer ni à maintenir.

Mise en route :
1. Sur GitHub → dépôt → **Settings → Secrets and variables → Actions → New repository
   secret** → nom **`STATS_CONFIG`**, valeur = le contenu de ton `config.json`.
2. Pousser le workflow + le dossier `tools/zig-stats-exporter` sur la branche `main`.
3. Onglet **Actions → « Zig stats exporter » → Run workflow** pour un test immédiat.

> La cadence est de 5 min (minimum GitHub), ce qui est largement suffisant : Minecraft
> n'écrit les fichiers de stats que périodiquement. Les pistes VM ci-dessous ne sont
> utiles que si tu veux un intervalle plus court — c'est rarement nécessaire.

---

Les sections suivantes (VM/PC) ne sont utiles que si tu ne veux PAS passer par GitHub
Actions. NitroServ ne permet pas d'héberger l'exporteur (pas de VPS, pas de tâche
planifiée). Deux pistes gratuites, de la plus simple à la moins simple :

---

## Piste A — une machine que tu laisses allumée (la plus simple)

Si tu as **un vieux PC, un portable ou un Raspberry Pi** que tu peux laisser
branché, c'est l'option la plus simple et 100 % gratuite.

### Sur Windows (vieux PC / portable)
1. Copie le dossier `zig-stats-exporter` sur cette machine (avec ton `config.json`).
2. Installe [Node.js](https://nodejs.org) (v18+).
3. Pour un lancement **au démarrage** sans y penser : ouvre le **Planificateur de
   tâches** → « Créer une tâche… » :
   - Déclencheur : **À l'ouverture de session** (ou « Au démarrage »).
   - Action : Démarrer un programme → Programme = `node`, Argument = `exporter.js`,
     « Commencer dans » = le chemin du dossier `zig-stats-exporter`.
   - Coche « Exécuter même si l'utilisateur n'est pas connecté » si tu veux.
4. La tâche relance l'exporteur, qui tourne en boucle (toutes les 30 s).

### Sur un Raspberry Pi / Linux
Suis directement la section **« Installer et lancer »** ci-dessous (étapes C→E).

---

## Piste B — une VM gratuite dans le cloud (sans matériel à toi)

**Oracle Cloud « Always Free »** offre une petite machine Linux gratuite **à vie**,
allumée 24/7. C'est la meilleure option si tu n'as pas de machine à laisser tourner.

> ⚠️ Honnêtement : l'inscription demande une **carte bancaire de vérification**
> (non débitée — le palier Always Free reste gratuit), et les VM « ARM » sont
> souvent « out of capacity ». On prend donc une VM **AMD Micro**, toujours dispo.

### A. Créer la VM
1. Va sur **oracle.com/cloud/free** → « Start for free » → crée ton compte.
2. Console Oracle → menu ☰ → **Compute → Instances → Create instance**.
3. **Image** : Canonical **Ubuntu** (22.04 ou plus).
4. **Shape** → « Change shape » → onglet **Always Free eligible** →
   **VM.Standard.E2.1.Micro** (AMD, 1 Go RAM). Évite l'ARM Ampere.
5. **Add SSH keys** → « Generate a key pair for me » → **télécharge la clé privée**
   (garde-la, tu en as besoin pour te connecter).
6. **Create**. Attends « Running », puis note l'**IP publique** de la VM.
7. Rien à ouvrir au pare-feu : l'exporteur ne fait que des connexions **sortantes**.

### B. Se connecter (depuis ton PC Windows, dans PowerShell)
```powershell
ssh -i C:\chemin\vers\ta-cle.key ubuntu@IP_DE_LA_VM
```
(Utilisateur `ubuntu`. Accepte l'empreinte la première fois.)

---

## Installer et lancer (Pi, Linux ou VM Oracle)

### C. Installer Node
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs git
```

### D. Récupérer l'exporteur
Le plus propre via git (si ton dépôt est accessible) :
```bash
git clone https://github.com/Mamazorus/zig-city-2.git
cd zig-city-2/tools/zig-stats-exporter
npm install
```
Puis **recrée `config.json`** (il n'est pas dans git car il contient ton mot de
passe SFTP) — colle exactement le même contenu que sur ton PC :
```bash
nano config.json   # colle le contenu, Ctrl+O pour enregistrer, Ctrl+X pour quitter
```
> Pas de git ? Copie le dossier via `scp` depuis ton PC (sans `node_modules`,
> refais `npm install` sur la machine).

### E. Lancer en continu avec PM2 (redémarre tout seul après un reboot)
```bash
sudo npm install -g pm2
pm2 start exporter.js --name zig-stats
pm2 save
pm2 startup        # affiche une commande "sudo env PATH=… pm2 startup …" → copie-la et exécute-la
```
Vérifie :
```bash
pm2 logs zig-stats   # tu dois voir "Publié : N joueur(s)" toutes les 30 s
```

C'est tout : la VM/machine tourne 24/7, l'exporteur aussi, et le classement reste
à jour même PC éteint.
