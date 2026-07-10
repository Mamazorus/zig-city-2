# Zig Addiction — NeoForge 1.21.1

Système d'**addiction RP** au joint du mod [Nirvana](https://modrinth.com/mod/nirvana-mod)
pour le serveur Zig City 2. Fumer entretient une dépendance : le manque frappe, s'aggrave,
et pour le calmer il faut **refumer** — ce qui crée une vraie demande pour les vendeurs.
Pour en sortir *vraiment*, un objet dédié — la **Cure de sevrage** — met fin à la
dépendance (cf. [Le remède](#le-remède)).

## Le cycle

1. Le joueur finit de fumer un **`nirvana:joint`** → un compteur démarre (remis à zéro à chaque taffe).
2. Après **1 h de temps de jeu connecté** (le compteur n'avance qu'en ligne) → message de manque
   dans le chat : *« Vous ne vous sentez pas très bien... »*
3. S'il ne refume pas, **15 min plus tard** → **poison léger**, qui **s'aggrave d'un cran toutes
   les 15 min** (escalade) :

   | Palier | Délai (jeu) | Effets |
   |:------:|:-----------:|--------|
   | 1 | 60 min | Message de manque (pas d'effet) |
   | 2 | 75 min | Poison I |
   | 3 | 90 min | Poison I + Faim I |
   | 4 | 105 min | Poison II + Faim I + Nausée (par vagues) |
   | 5 | 120 min | Poison II + Faim II + Faiblesse I + Nausée |
   | ☠ | **150 min (2 h 30)** | **Mort par overdose de manque** (avertissement 2 min avant) |

   Avant 2 h 30, le manque **ne tue jamais** (le poison plafonne à 1 cœur, la famine est
   bloquée) : la seule mort est le palier terminal à 2 h 30. Après cette mort, le joueur
   ressuscite en manque critique (pas de boucle de morts, et mourir ne « soigne » pas).
4. Refumer un joint → **soulagement immédiat**, compteur remis à zéro — mais le joueur
   **reste dépendant** (le manque reviendra). Pour rompre la dépendance, voir *Le remède*.

> Un joueur n'est suivi qu'**après sa première taffe**. Les non-fumeurs ne subissent rien.
> L'état survit à la mort, à la déconnexion et au redémarrage (persisté par UUID dans les
> données du monde).

## Le remède

Refumer ne fait que repousser le manque : le joueur reste accro à vie. Le seul moyen d'en
**sortir définitivement** est la **Cure de sevrage** (`zigaddiction:detox`), un objet
consommable : clic droit → la dépendance est retirée (effets de manque dissipés, joueur
« propre » jusqu'à sa prochaine taffe). Sans effet — et non consommé — si le joueur n'est
pas dépendant. Équivaut, côté joueur, à `/zigaddiction reset`.

**Non craftable** : l'objet s'obtient par le canal choisi côté contenu — vente à l'Échoppe
(puits économique), don par un PNJ, ou `/give @p zigaddiction:detox`. Sa clé de traduction
le rend automatiquement visible dans le sélecteur d'items de l'admin du shop.

## Configuration

Fichier `config/zigaddiction-server.properties` (créé au premier démarrage, éditable **sans
recompiler**) :

```properties
enabled=true
joint_item_id=nirvana:joint
craving_minutes=60
poison_delay_minutes=15
escalation_step_minutes=15
death_minutes=150          # mort par overdose (0 = jamais létal)
```

## Commandes d'admin (opérateur) — pour tester sans attendre

```
/zigaddiction status  [joueur]            état courant (minutes, palier…)
/zigaddiction smoke   [joueur]            simule une taffe (reset + soulagement)
/zigaddiction advance <minutes> [joueur]  avance le compteur de jeu (déclenche le manque)
/zigaddiction cure    [joueur]            dissipe les effets de manque (sans reset)
/zigaddiction reset   [joueur]            le joueur n'est plus accro
```

Test rapide : `/zigaddiction advance 60` (→ message de manque), puis `/zigaddiction advance 15`
(→ poison), etc.

## Architecture

Mod **autonome** : un seul item custom (la Cure de sevrage), aucune dépendance de
compilation à Nirvana — le joint est repéré par son **identifiant** (`nirvana:joint`,
configurable). Nirvana est déclaré en dépendance *optionnelle* : absent, le mod ne fait
rien (pas de crash). Toute la logique de gameplay est **serveur** ; le jar reste `BOTH` (la
Cure ajoute un objet au registre, qui doit être présent des deux côtés).

- `ZigAddiction` — point d'entrée (enregistre l'item sur le bus du mod).
- `AddictionEvents` — écoute (fin de consommation, tick joueur, connexion, commandes).
- `AddictionManager` — cœur : détection, compteur, escalade, effets, messages, `cure`.
- `AddictionData` — persistance (SavedData indexée par UUID).
- `AddictionConfig` — `config/zigaddiction-server.properties`.
- `item.ModItems` / `item.DetoxItem` — la Cure de sevrage (remède anti-dépendance).

## Compilation

Build en CI (`.github/workflows/zig-addiction.yml`) : le `.jar` est déposé sur la branche
`mod-jars` puis référencé par `raw-launcher/modpack.json`. Déployer le jar **côté serveur ET
côté client** (via le modpack / la release du launcher). Le nom du fichier fait foi côté
launcher : **bumper `mod_version`** (`gradle.properties`) à chaque mise à jour.
