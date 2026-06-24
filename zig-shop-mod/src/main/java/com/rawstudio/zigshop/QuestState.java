package com.rawstudio.zigshop;

import net.minecraft.nbt.CompoundTag;
import net.minecraft.server.level.ServerPlayer;

/**
 * État des quêtes PAR JOUEUR, persisté dans les données du joueur
 * ({@code ServerPlayer.getPersistentData()} → sous-tag {@code ZigShopQuests}).
 *
 * <p>Pour chaque quête acceptée, on mémorise sa cible et sa quantité (copiées au moment
 * de l'acceptation) + la progression + le statut. Ainsi le suivi des kills n'a besoin que
 * de l'état du joueur (pas du catalogue Firebase). Une quête réclamée ({@code CLAIMED})
 * ne peut plus l'être : 1 fois par joueur.
 */
public final class QuestState {
    private QuestState() {}

    private static final String ROOT = "ZigShopQuests";
    public static final String AVAILABLE = "available";
    public static final String ACCEPTED = "accepted";
    public static final String COMPLETED = "completed";
    public static final String CLAIMED = "claimed";

    private static CompoundTag root(ServerPlayer player) {
        CompoundTag data = player.getPersistentData();
        if (!data.contains(ROOT)) {
            data.put(ROOT, new CompoundTag());
        }
        return data.getCompound(ROOT);
    }

    /** Statut d'une quête pour ce joueur (AVAILABLE si jamais acceptée). */
    public static String status(ServerPlayer player, String questId) {
        CompoundTag r = root(player);
        return r.contains(questId) ? r.getCompound(questId).getString("status") : AVAILABLE;
    }

    /** Progression (nombre de cibles tuées) pour ce joueur. */
    public static int progress(ServerPlayer player, String questId) {
        CompoundTag r = root(player);
        return r.contains(questId) ? r.getCompound(questId).getInt("progress") : 0;
    }

    /** Accepte une quête (no-op si déjà prise). Copie cible+quantité pour le suivi. */
    public static void accept(ServerPlayer player, QuestDef quest) {
        CompoundTag r = root(player);
        if (r.contains(quest.id())) {
            return;
        }
        CompoundTag t = new CompoundTag();
        t.putString("target", quest.target());
        t.putInt("amount", Math.max(1, quest.amount()));
        t.putInt("progress", 0);
        t.putString("status", ACCEPTED);
        r.put(quest.id(), t);
        player.getPersistentData().put(ROOT, r);
    }

    /** Incrémente la progression de toutes les quêtes ACCEPTÉES ciblant {@code entityType}. */
    public static void addKill(ServerPlayer player, String entityType) {
        CompoundTag r = root(player);
        boolean changed = false;
        for (String id : r.getAllKeys()) {
            CompoundTag t = r.getCompound(id);
            if (!ACCEPTED.equals(t.getString("status")) || !entityType.equals(t.getString("target"))) {
                continue;
            }
            int amount = Math.max(1, t.getInt("amount"));
            int prog = Math.min(t.getInt("progress") + 1, amount);
            t.putInt("progress", prog);
            if (prog >= amount) {
                t.putString("status", COMPLETED);
            }
            changed = true;
        }
        if (changed) {
            player.getPersistentData().put(ROOT, r);
        }
    }

    /** Marque une quête COMPLETED comme CLAIMED. Retourne true si la récompense doit être donnée. */
    public static boolean claim(ServerPlayer player, String questId) {
        CompoundTag r = root(player);
        if (!r.contains(questId) || !COMPLETED.equals(r.getCompound(questId).getString("status"))) {
            return false;
        }
        r.getCompound(questId).putString("status", CLAIMED);
        player.getPersistentData().put(ROOT, r);
        return true;
    }
}
