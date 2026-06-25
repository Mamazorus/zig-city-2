Skins des PNJ marchands (zigshop)
=================================

Dépose ici les PNG de skins des PNJ, puis déclare leur nom dans la classe
  src/main/java/com/rawstudio/zigshop/MerchantSkins.java  (liste NAMES)

Contraintes des fichiers :
- Format : skin JOUEUR moderne, 64 x 64 pixels, PNG (transparence ok).
- Modèle : CLASSIQUE (bras de 4 px, comme Steve) — pas "slim"/Alex.
- Nom de fichier : minuscules, chiffres, _ - . uniquement. PAS d'espace,
  PAS de majuscule, PAS d'accent.
    OK : garde.png, marchand_robe.png, banquier2.png
    NON : Garde.png, marchand robe.png, épicier.png

Utilisation en jeu (opérateur, en mode créatif) :
  vise le PNJ puis  ->  /zigshop skin <nom>     (ex : /zigshop skin garde)
  le nom <nom> = le nom du fichier sans ".png".

Pour qu'un skin soit proposé/accepté, il faut LES DEUX :
  1) le fichier <nom>.png dans ce dossier
  2) "<nom>" ajouté à MerchantSkins.NAMES
(sinon le PNJ retombe sur le skin Steve par défaut.)

Ce fichier README n'est pas chargé par le jeu : il sert juste de pense-bête.
