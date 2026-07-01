package com.rawstudio.zigshop;

/**
 * Définition d'une quête telle que stockée dans Firebase ({@code /quests/{id}}).
 *
 * <p>Objectif : réaliser {@code amount} fois une action de {@code type}
 * (kill/break/place/craft/smelt/fish/breed) sur la cible {@code target} (id d'entité,
 * de bloc ou d'item selon le type, ex. "minecraft:pig" ; VIDE = n'importe laquelle) →
 * recevoir {@code rewardQty} × {@code rewardItem}.
 *
 * <p>{@code mode} pilote la répétabilité (once/limited/daily/unique) ; {@code maxClaims}
 * n'est utilisé qu'en mode {@code limited}. Ces deux champs sont RÉTROCOMPATIBLES : une
 * quête Firebase sans {@code type}/{@code mode} vaut « kill » / « once » (cf.
 * {@link FirebaseClient#fetchQuests()}). La progression et l'état (acceptée, complétée,
 * réclamée) sont propres à CHAQUE joueur (cf. {@link QuestState}).
 *
 * <p>{@code npc} = identifiant du PNJ propriétaire de la quête (vide = quête « globale »,
 * affichée par les PNJ génériques historiques). Rétrocompat : absent → "".
 */
public record QuestDef(String id, String title, String description,
                       String type, String target, int amount,
                       String rewardItem, int rewardQty,
                       String mode, int maxClaims, String npc) {}
