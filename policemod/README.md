# Police Mod — NeoForge 1.21.1

## Installation rapide

1. Copier `policemod-1.0.0.jar` dans le dossier `mods/` du serveur **ET** du client
2. NeoForge 21.1.x doit être installé

## En jeu

Obtenir le badge :
```
/give @s policemod:badge_policier
```

**Clic droit** avec le badge → ouvre l'inventaire du joueur le plus proche (4 blocs)
- La cible reçoit un message qu'elle est fouillée
- Le policier peut prendre des items directement

## Compilation (pour développeurs)

### Prérequis
- Java 21 JDK
- IntelliJ IDEA

### Étapes
```
1. Ouvrir le dossier dans IntelliJ
2. Attendre que Gradle se configure (10-20 min, 1ère fois)
3. Dans le terminal IntelliJ :
   gradlew build
4. Le .jar est dans : build/libs/policemod-1.0.0.jar
```
