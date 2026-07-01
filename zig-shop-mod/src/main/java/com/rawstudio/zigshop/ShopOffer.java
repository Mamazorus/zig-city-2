package com.rawstudio.zigshop;

/**
 * Une offre de troc telle que stockée dans Firebase (/shop/days/{date}/{id} et
 * /shop/library/{id}) : donner {@code inputQty} × {@code input} au marchand,
 * recevoir {@code outputQty} × {@code output}. input/output = identifiants d'item
 * (ex. "minecraft:diamond"). {@code maxUses} = limite d'échanges PAR JOUEUR
 * (0 = illimité ; shop du jour → repart à zéro chaque jour car les identifiants
 * d'offre changent, boutique → limite à vie de l'offre).
 *
 * <p>{@code npc} = identifiant du PNJ propriétaire de l'offre (vide = offre « globale »,
 * affichée par les PNJ génériques historiques). Rétrocompat : absent → "".
 */
public record ShopOffer(String id, String input, int inputQty, String output, int outputQty, int maxUses, String npc) {}
