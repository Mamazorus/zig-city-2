package com.rawstudio.zigshop;

/**
 * Définition d'une quête telle que stockée dans Firebase ({@code /quests/{id}}) :
 * tuer {@code amount} fois l'entité {@code target} (id, ex. "minecraft:pig") →
 * recevoir {@code rewardQty} × {@code rewardItem}. La progression et l'état (acceptée,
 * complétée, réclamée) sont propres à CHAQUE joueur (cf. {@link QuestState}).
 */
public record QuestDef(String id, String title, String description, String target, int amount,
                       String rewardItem, int rewardQty) {}
