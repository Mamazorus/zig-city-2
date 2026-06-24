# Zig Shop — mod NeoForge 1.21.1

Marchand en jeu connecté au « shop du jour » du launcher Zig City 2 (Firebase).

## État (phase 1 — fondation)

- ✅ Projet NeoForge 1.21.1 (ModDevGradle), modid `zigshop`.
- ✅ Lecture du shop du jour depuis Firebase (publique, sans secret).
- ✅ Commande de test `/zigshop today` (opérateur) → affiche les offres du jour dans le chat.

À venir : entité marchande (spawn + clic), GUI d'échange (donner l'entrée → recevoir la sortie), création d'offres in-game en créatif (réécrites dans Firebase → visibles dans le launcher).

## Compilation

Aucun outil à installer en local : à chaque push touchant `zig-shop-mod/**`, le workflow
GitHub Actions **« Build Zig Shop mod »** compile le `.jar` et le publie en **artefact**
(`zigshop-jar`) téléchargeable depuis l'onglet *Actions* de GitHub.

Build local optionnel (Java 21 requis) : `gradle build` dans ce dossier → `build/libs/zigshop-0.1.0.jar`.

## Sécurité — secret Firebase

Le `.jar` est distribué à tous les joueurs : il ne contient **jamais** le secret Firebase.
- **Lecture** du shop : publique (le mod lit `/shop/days/{date}` sans auth).
- **Écriture** (création in-game, phase ultérieure) : côté **serveur uniquement**, avec un
  secret lu depuis un fichier présent seulement sur le serveur — jamais embarqué dans le jar.

## Données Firebase (partagées avec le launcher)

- `/shop/config` = `{ currencyName, currencyItem, currencyIcon }`
- `/shop/days/{YYYY-MM-DD}/{id}` = `{ input, inputQty, output, outputQty, createdAt }`
- `/shop/library/{id}` = modèles d'offres réutilisables

La clé de jour est la **date civile locale** (bascule à minuit), identique au calcul du launcher.
