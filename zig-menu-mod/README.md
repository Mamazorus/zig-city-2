# Zig City Menu (`zigmenu`)

Mod **client-only** NeoForge 1.21.1 qui remplace l'ecran-titre de Minecraft par le
menu personnalise Zig City 2 (design Figma).

## Ce que fait le mod

- Remplace `TitleScreen` par `ZigCityMenuScreen` (via `ScreenEvent.Opening`).
- Fond = screenshot du serveur + degrade vignette ; logo ZIG CITY 2 ; splash text jaune incline.
- Boutons plats stylises : **Solo :(**, **ZIG CITY !**, **Options**, **Quitter**.
- **ZIG CITY !** = connexion directe au serveur `109.239.153.124:25965`.
- Carrousel de tetes de joueurs autour du bouton ZIG CITY : liste live tiree de
  Firebase `/playersSeen` (lecture publique, sans secret), tetes via `minotar.net/helm`.
  Tout echec reseau est silencieux (pas de carrousel, jamais de crash).

## Build

Compile en CI (`.github/workflows/zigmenu.yml`) : push sur `main` touchant `zig-menu-mod/**`.
Le jar versionne (`zigmenu-x.y.z.jar`) est depose sur la branche `mod-jars`, d'ou le
launcher le telecharge (`raw-launcher/modpack.json`).

> Bumper `mod_version` dans `gradle.properties` a chaque changement : le launcher
> repere les mods par nom de fichier.

Client-only : a exclure du set de mods serveur.
