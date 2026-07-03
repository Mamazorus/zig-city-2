# slotsmachine-patch

Patch maison du mod tiers **Slots Machine** (`slotsmachine` 1.1.8, par Mica) pour Zig City 2.

## Pourquoi

Le mod plante le client à l'ouverture d'un de ses menus quand le `BlockEntity` n'est pas encore
synchronisé côté client (course réseau : bloc fraîchement posé, latence). Les trois menus font
`level.getBlockEntity(pos)` puis déréférencent directement le résultat, sans gérer le `null` :

```
Failed to open a screen with advanced data: java.lang.NullPointerException:
Cannot read field "inventory" because "…SlotsMachineMenu.blockEntity" is null
```

Aucune version corrigée n'existe pour 1.21.1 (1.1.8 est la dernière ; la 1.2.0 est réservée à 1.20.1).

## Ce que fait le patch

On recompile **uniquement** les trois classes de menu concernées, rendues « null-safe » : si le
`BlockEntity` n'est pas là côté client, on fournit une instance de secours (inventaire vide) au lieu
de planter. Le protocole de conteneur synchronise ensuite le contenu réel des slots.

- `net.micaxs.slotsmachine.screen.SlotsMachineMenu`
- `net.micaxs.slotsmachine.screen.SlotsMachineOwnerMenu`
- `net.micaxs.slotsmachine.screen.PlayerShopMenu`

Aucune signature publique n'est modifiée → binairement compatible avec le reste du jar (Screen,
paquets, BlockEntity, ModMenuTypes). Le champ `static blockEntity` d'origine est conservé (défaut de
conception de l'auteur, mais sans incidence pratique avec peu de machines).

## Comment (CI)

Le workflow `.github/workflows/slotsmachine-patch.yml` :
1. télécharge le jar original depuis la branche `mod-jars` dans `libs/` ;
2. compile les 3 classes contre NeoForge 21.1.143 (mojmap) ;
3. réinjecte les `.class` recompilés dans une copie du jar via `jar uf` (manifest/assets/lang
   d'origine préservés) → `slotsmachine1.21.1-1.1.8-zigcity2.jar` ;
4. dépose ce jar sur la branche `mod-jars`.

`raw-launcher/modpack.json` pointe vers le jar `-zigcity2`. Le launcher remplace l'ancien jar chez
le joueur (repérage par nom de fichier).

## ⚠️ En cas de mise à jour du mod

Re-décompiler les 3 menus de la nouvelle version, y reporter le repli null-safe, et bumper le suffixe
(`-zigcity3`…). Ne jamais renommer les identifiants (modid, blocs, menus, items) : le mod est en
`side=BOTH`, le serveur et les autres joueurs doivent rester compatibles.
