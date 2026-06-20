# Exporteur de statistiques — Zig City 2

Ce petit script lit les statistiques du serveur Minecraft (les fichiers
`world/stats/<uuid>.json`) et les publie dans Firebase. Le launcher lit ensuite
ces données pour afficher la page **Statistiques** (le classement).

> **Pourquoi un script à part ?** Le ping du serveur (protocole Minecraft) ne
> renvoie que les pseudos en ligne, jamais les stats. Celles-ci n'existent que
> dans les fichiers du serveur. Cet exporteur fait donc le pont serveur → Firebase.

## Ce qui est mesuré (vanilla 1.21.1)

| Colonne du classement | Source dans le fichier de stats |
|---|---|
| Temps de jeu | `minecraft:custom` → `minecraft:play_time` |
| Distance parcourue | somme de toutes les distances `*_one_cm` (marche, sprint, monture, elytra…) |
| Blocs minés | somme de `minecraft:mined` |
| Mobs tués | `minecraft:custom` → `minecraft:mob_kills` |
| Graines plantées | `minecraft:used` → graines (blé, betterave, melon, citrouille…) |
| Disques joués | `minecraft:custom` → `minecraft:play_record` |
| Morts | `minecraft:custom` → `minecraft:deaths` |

Les stats « custom » (temps dans le Nether, temps en voice chat, coffres de
donjon, disques **uniques**) ne sont pas suivies par Minecraft par défaut : elles
arriveront via un datapack dédié dans un second temps.

## Installation

1. Installe [Node.js](https://nodejs.org) (v18+) sur la machine qui fera tourner le script.
2. Dans ce dossier : copie `config.example.json` en `config.json`.
3. Remplis `config.json` (voir ci-dessous). Les identifiants Firebase sont déjà pré-remplis.

```bash
cd tools/zig-stats-exporter
cp config.example.json config.json   # (Windows : copy config.example.json config.json)
```

## Choisir le mode de lecture

### Mode `sftp` — recommandé pour un panel (Pterodactyl, etc.)

Le script tourne sur **ta machine** (ou un mini-serveur toujours allumé) et lit
les fichiers du serveur via le SFTP fourni par le panel.

1. Dans le panel, ouvre ton serveur → onglet **SFTP** (ou « Détails de connexion »).
   Tu y trouveras l'hôte, le port (souvent **2022**) et l'identifiant
   (de la forme `compte.idserveur`). Le mot de passe = celui de ton compte panel.
2. Renseigne le bloc `source.sftp` de `config.json` et mets `"mode": "sftp"`.
3. Installe la dépendance SFTP puis lance :

```bash
npm install            # installe ssh2-sftp-client
npm start              # boucle : met à jour toutes les intervalMinutes
# ou un seul passage de test :
npm run once
```

### Mode `local` — si le script tourne SUR la machine du serveur

Mets `"mode": "local"` et renseigne `source.serverRoot` = le dossier qui contient
`world/` et `usercache.json`. Aucune dépendance à installer :

```bash
npm run once           # test
npm start              # boucle
```

## Garder le script allumé en continu

Le classement n'est à jour que tant que le script tourne. Quelques options :

- **PM2** (simple, multiplateforme) :
  ```bash
  npm install -g pm2
  pm2 start exporter.js --name zig-stats
  pm2 save
  ```
- **Tâche planifiée** (Windows) ou **cron** (Linux) qui lance `node exporter.js --once`
  toutes les X minutes — pas besoin de processus permanent.
- Sur certains panels Pterodactyl tu peux aussi lancer le script en mode `local`
  directement dans le conteneur si l'image dispose de Node.

## Notes

- `config.json` et `name-cache.json` sont ignorés par git (le SFTP contient ton
  mot de passe de panel — ne le commit jamais).
- Le script **remplace** entièrement le nœud Firebase `/stats` à chaque cycle :
  les joueurs qui n'ont plus de fichier de stats disparaissent proprement.
- Les pseudos sont résolus via `usercache.json` du serveur, puis (filet de
  secours) via l'API Mojang, avec mise en cache durable dans `name-cache.json`.
