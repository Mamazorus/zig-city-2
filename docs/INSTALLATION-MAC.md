# 🍎 Installer Zig City 2 sur Mac

Le launcher Mac (`.dmg`) **n'est pas signé par Apple** (ça coûte 99 $/an, on ne l'a pas pris).
macOS va donc afficher un avertissement à la **première ouverture**. C'est normal, l'app
n'est pas dangereuse — il faut juste autoriser son ouverture **une seule fois**.

> ⚠️ Le fichier `.exe` est réservé à **Windows** : il ne s'ouvre pas sur Mac.
> Sur Mac, télécharge toujours le fichier **`.dmg`**.

---

## 1. Installer le launcher

1. Va sur la page des téléchargements :
   👉 **https://github.com/Mamazorus/zig-city-2/releases**
2. Sous la dernière version, télécharge le fichier qui finit par **`.dmg`**
   (ex. `Zig City 2-0.1.8-beta-universal.dmg`).
3. Ouvre le `.dmg` téléchargé.
4. **Glisse l'icône « Zig City 2 » sur le dossier « Applications »**.
5. Éjecte le `.dmg` (clic droit → Éjecter), tu n'en as plus besoin.

---

## 2. Première ouverture (autoriser l'app)

> À faire **une seule fois**. Ensuite l'app s'ouvre normalement d'un double-clic.

### Méthode simple (recommandée)

1. Ouvre le dossier **Applications**.
2. **Clic droit** (ou Ctrl + clic) sur **Zig City 2** → **Ouvrir**.
3. Une fenêtre s'ouvre avec un bouton **Ouvrir** → clique dessus.

### Si macOS bloque quand même (macOS Sonoma 14 / Sequoia 15 et +)

Sur les Mac récents, le clic droit ne suffit plus toujours. Fais alors :

1. Double-clique sur **Zig City 2** (un message d'avertissement apparaît, ferme-le).
2. Ouvre **Réglages Système** → **Confidentialité et sécurité**.
3. Descends en bas : tu vois *« Zig City 2 a été bloqué… »* → clique sur **Ouvrir quand même**.
4. Confirme avec **Ouvrir** (mot de passe Mac ou Touch ID si demandé).

### Si tu vois « L'application est endommagée et ne peut pas être ouverte »

Ce message trompeur arrive sur certains Mac Apple Silicon (M1/M2/M3…). L'app **n'est pas
endommagée** : macOS l'a juste mise en quarantaine. Pour la débloquer :

1. Ouvre l'app **Terminal** (Spotlight → tape « Terminal »).
2. Copie-colle cette commande puis appuie sur **Entrée** :
   ```bash
   xattr -cr "/Applications/Zig City 2.app"
   ```
3. Relance Zig City 2 normalement.

---

## 3. Mettre à jour le launcher

Sur Windows la mise à jour est automatique. **Sur Mac elle est manuelle** (toujours à
cause de la signature). Quand une nouvelle version sort, le launcher te l'indiquera au
démarrage avec un écran **« Mise à jour requise »** et un bouton **Télécharger la mise à jour**.

Pour mettre à jour :

1. Clique sur **Télécharger la mise à jour** (ça ouvre la page des téléchargements).
2. Récupère le nouveau **`.dmg`** et ouvre-le.
3. Glisse « Zig City 2 » dans **Applications** → **Remplacer** quand c'est demandé.
4. Relance le launcher.

> 💡 Pas besoin de refaire l'étape « première ouverture » : une fois l'app autorisée,
> les mises à jour s'ouvrent directement.

---

## Besoin d'aide ?

Demande sur le **Discord** : https://discord.gg/MsVcTAcNGB
