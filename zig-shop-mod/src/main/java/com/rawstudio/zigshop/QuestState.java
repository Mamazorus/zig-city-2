package com.rawstudio.zigshop;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;

import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Player;

/**
 * État des quêtes PAR JOUEUR, persisté dans les données du joueur
 * ({@code ServerPlayer.getPersistentData()} → sous-tag {@code ZigShopQuests}).
 *
 * <p>Pour chaque quête acceptée, on mémorise un INSTANTANÉ de sa définition (type, cible,
 * quantité, mode, maxClaims — copiés au moment de l'acceptation) + la progression, le
 * statut, le nombre de réclamations et l'horodatage de la dernière. Ainsi le suivi des
 * objectifs n'a besoin que de l'état du joueur (le catalogue Firebase est indisponible
 * dans les événements de jeu).
 *
 * <p>Répétabilité selon {@code mode} :
 * <ul>
 *   <li>{@code once} : une seule réclamation, puis {@code CLAIMED} définitif.</li>
 *   <li>{@code limited} : réclamable {@code maxClaims} fois ; entre deux, la quête
 *       redevient {@code AVAILABLE}.</li>
 *   <li>{@code daily} : réclamable une fois par tranche de 24 h glissantes.</li>
 *   <li>{@code unique} : traité comme {@code once} ici ; le verrou « 1 seul gagnant sur
 *       tout le serveur » est géré à part (cf. {@link QuestWinnersData}).</li>
 * </ul>
 * Une quête sans {@code type}/{@code mode} dans le NBT (acceptée avant cette mise à jour)
 * vaut « kill » / « once » — rétrocompat.
 */
public final class QuestState {
    private QuestState() {}

    private static final String ROOT = "ZigShopQuests";
    public static final String AVAILABLE = "available";
    public static final String ACCEPTED = "accepted";
    public static final String COMPLETED = "completed";
    public static final String CLAIMED = "claimed";

    /** 24 h en millisecondes (fenêtre glissante du mode daily). */
    private static final long DAY_MS = 86_400_000L;

    /** Issue d'une tentative de réclamation. */
    public enum ClaimResult { OK, NOT_READY, DAILY_COOLDOWN, MAXED }

    private static CompoundTag root(ServerPlayer player) {
        CompoundTag data = player.getPersistentData();
        if (!data.contains(ROOT)) {
            data.put(ROOT, new CompoundTag());
        }
        return data.getCompound(ROOT);
    }

    /** Normalise un type (vide/absent = "kill" : rétrocompat des NBT existants). */
    private static String normType(String type) {
        return (type == null || type.isBlank()) ? "kill" : type;
    }

    /** Normalise un mode (vide/absent = "once"). */
    private static String normMode(String mode) {
        return (mode == null || mode.isBlank()) ? "once" : mode;
    }

    /** Statut d'une quête pour ce joueur (AVAILABLE si jamais acceptée). */
    public static String status(ServerPlayer player, String questId) {
        CompoundTag r = root(player);
        return r.contains(questId) ? r.getCompound(questId).getString("status") : AVAILABLE;
    }

    /** Progression (nombre d'actions réalisées) pour ce joueur. */
    public static int progress(ServerPlayer player, String questId) {
        CompoundTag r = root(player);
        return r.contains(questId) ? r.getCompound(questId).getInt("progress") : 0;
    }

    /** Nombre de fois où le joueur a déjà réclamé cette quête (mode limited). */
    public static int claims(ServerPlayer player, String questId) {
        CompoundTag r = root(player);
        return r.contains(questId) ? r.getCompound(questId).getInt("claims") : 0;
    }

    /**
     * Nombre de quêtes actuellement ACCEPTÉES (en cours de réalisation) par ce joueur, tous
     * PNJ confondus. Sert à plafonner le nombre de quêtes activables simultanément (cf.
     * {@link QuestServerHandler#accept}). Les quêtes complétées/réclamées/disponibles ne
     * comptent pas : seul un objectif en cours occupe un « emplacement ».
     */
    public static int countActive(ServerPlayer player) {
        CompoundTag r = root(player);
        int n = 0;
        for (String id : r.getAllKeys()) {
            if (ACCEPTED.equals(r.getCompound(id).getString("status"))) {
                n++;
            }
        }
        return n;
    }

    /**
     * Temps restant (ms) avant qu'une quête daily réclamée redevienne disponible, sinon 0.
     * Basé sur l'instantané NBT (mode + lastClaim).
     */
    public static long dailyCooldownRemaining(ServerPlayer player, String questId, long now) {
        CompoundTag r = root(player);
        if (!r.contains(questId)) return 0L;
        CompoundTag t = r.getCompound(questId);
        if (!"daily".equals(normMode(t.getString("mode"))) || !CLAIMED.equals(t.getString("status"))) {
            return 0L;
        }
        long elapsed = now - t.getLong("lastClaim");
        return elapsed >= DAY_MS ? 0L : (DAY_MS - elapsed);
    }

    /**
     * Accepte une quête (ou la ré-arme si elle était redevenue AVAILABLE — limited/daily).
     * Copie/rafraîchit l'instantané de définition ; préserve {@code claims}/{@code lastClaim}.
     * No-op si la quête est déjà en cours / à réclamer / terminée.
     */
    public static void accept(ServerPlayer player, QuestDef quest) {
        CompoundTag r = root(player);
        boolean existed = r.contains(quest.id());
        CompoundTag t = existed ? r.getCompound(quest.id()) : new CompoundTag();
        if (existed && !AVAILABLE.equals(t.getString("status"))) {
            return; // on ne ré-arme que depuis AVAILABLE (ou une entrée neuve)
        }
        t.putString("type", normType(quest.type()));
        t.putString("target", quest.target());
        // Titre mémorisé dans l'instantané : permet au journal client d'afficher un libellé lisible
        // sans re-lire Firebase (rétrocompat : une quête acceptée avant cette MAJ n'a pas de titre →
        // le client se rabat sur l'objectif « verbe + cible »).
        t.putString("title", quest.title() == null ? "" : quest.title());
        t.putInt("amount", Math.max(1, quest.amount()));
        t.putString("mode", normMode(quest.mode()));
        t.putInt("maxClaims", Math.max(1, quest.maxClaims()));
        t.putInt("progress", 0);
        t.putString("status", ACCEPTED);
        if (!t.contains("claims")) t.putInt("claims", 0);
        if (!t.contains("lastClaim")) t.putLong("lastClaim", 0L);
        r.put(quest.id(), t);
        player.getPersistentData().put(ROOT, r);
    }

    /**
     * Annule une quête ACCEPTÉE (en cours) : la remet {@code AVAILABLE} avec la progression
     * remise à zéro, ce qui libère un emplacement (cf. {@link #countActive}) et la rend de
     * nouveau acceptable plus tard. Préserve {@code claims}/{@code lastClaim} (l'historique de
     * répétabilité limited/daily n'est pas touché). No-op si la quête n'est pas en cours
     * (disponible / complétée / réclamée).
     *
     * @return true si une quête en cours a bien été annulée.
     */
    public static boolean cancel(ServerPlayer player, String questId) {
        CompoundTag r = root(player);
        if (!r.contains(questId)) {
            return false;
        }
        CompoundTag t = r.getCompound(questId);
        if (!ACCEPTED.equals(t.getString("status"))) {
            return false; // seule une quête réellement en cours occupe un emplacement
        }
        t.putString("status", AVAILABLE);
        t.putInt("progress", 0);
        player.getPersistentData().put(ROOT, r);
        return true;
    }

    /**
     * Incrémente de {@code count} la progression de toutes les quêtes ACCEPTÉES du joueur
     * dont le {@code type} correspond ET dont la cible correspond (ou est un joker : cible
     * vide/"*"). Passe en COMPLETED quand la quantité est atteinte. Idempotent (ne dépasse
     * jamais {@code amount} — un craft de 64 sur une quête « 10 » plafonne à 10).
     */
    public static boolean addProgress(ServerPlayer player, String type, String targetId, int count) {
        if (count <= 0) return false;
        CompoundTag r = root(player);
        boolean changed = false;
        for (String id : r.getAllKeys()) {
            CompoundTag t = r.getCompound(id);
            if (!ACCEPTED.equals(t.getString("status"))) continue;
            if (!normType(t.getString("type")).equals(type)) continue;
            String qTarget = t.getString("target");
            boolean wildcard = qTarget.isBlank() || "*".equals(qTarget);
            if (!wildcard && !qTarget.equals(targetId)) continue;
            int amount = Math.max(1, t.getInt("amount"));
            int cur = t.getInt("progress");
            if (cur >= amount) continue;
            int prog = Math.min(cur + count, amount);
            t.putInt("progress", prog);
            if (prog >= amount) {
                t.putString("status", COMPLETED);
                notifyCompleted(player, t.getString("title"));
            }
            changed = true;
        }
        if (changed) {
            player.getPersistentData().put(ROOT, r);
        }
        return changed;
    }

    /** Message chat à la complétion (transition unique) : le joueur sait qu'il peut aller réclamer. */
    private static void notifyCompleted(ServerPlayer player, String title) {
        String label = (title == null || title.isBlank()) ? "Ta quete" : title;
        player.sendSystemMessage(Component.literal("§aQuete terminee : §f" + label
                + " §a- retourne voir le marchand !"));
    }

    /**
     * Recalcul PARESSEUX de la disponibilité d'une quête daily : réclamée il y a ≥ 24 h,
     * elle redevient AVAILABLE (progression remise à zéro). À appeler avant de lire le
     * statut (p. ex. à l'ouverture de l'écran).
     */
    public static void refreshDaily(ServerPlayer player, String questId, long now) {
        CompoundTag r = root(player);
        if (!r.contains(questId)) return;
        CompoundTag t = r.getCompound(questId);
        if (!"daily".equals(normMode(t.getString("mode"))) || !CLAIMED.equals(t.getString("status"))) {
            return;
        }
        if (now - t.getLong("lastClaim") >= DAY_MS) {
            t.putString("status", AVAILABLE);
            t.putInt("progress", 0);
            player.getPersistentData().put(ROOT, r);
        }
    }

    /**
     * Réclame une quête COMPLETED : applique la règle de répétabilité du mode (instantané
     * NBT) et renvoie {@link ClaimResult#OK} si la récompense doit être remise. Le verrou
     * global du mode {@code unique} est vérifié EN AMONT (cf. {@link QuestServerHandler}).
     */
    public static ClaimResult claim(ServerPlayer player, String questId, long now) {
        CompoundTag r = root(player);
        if (!r.contains(questId)) return ClaimResult.NOT_READY;
        CompoundTag t = r.getCompound(questId);
        if (!COMPLETED.equals(t.getString("status"))) return ClaimResult.NOT_READY;

        switch (normMode(t.getString("mode"))) {
            case "limited" -> {
                int claims = t.getInt("claims") + 1;
                int max = Math.max(1, t.getInt("maxClaims"));
                t.putInt("claims", claims);
                if (claims >= max) {
                    t.putString("status", CLAIMED);     // quota atteint : terminé
                } else {
                    t.putString("status", AVAILABLE);   // encore des essais : ré-armable
                    t.putInt("progress", 0);
                }
            }
            case "daily" -> {
                t.putInt("claims", t.getInt("claims") + 1);
                t.putLong("lastClaim", now);
                t.putString("status", CLAIMED);         // cooldown 24 h géré par refreshDaily
                t.putInt("progress", 0);
            }
            default -> {                                 // once / unique
                t.putInt("claims", t.getInt("claims") + 1);
                t.putString("status", CLAIMED);
            }
        }
        player.getPersistentData().put(ROOT, r);
        return ClaimResult.OK;
    }

    /**
     * JSON des quêtes ACTIVES (acceptées + complétées) du joueur, pour l'affichage client (journal
     * d'inventaire / suivi). Construit UNIQUEMENT depuis l'instantané NBT — aucun accès Firebase,
     * donc envoyable à tout instant. Forme : {@code {"quests":[{id,title,type,target,amount,progress,
     * status,mode}, ...]}} (même conteneur « quests » que l'écran du PNJ).
     */
    public static String activeQuestsJson(ServerPlayer player) {
        CompoundTag r = root(player);
        JsonArray arr = new JsonArray();
        for (String id : r.getAllKeys()) {
            CompoundTag t = r.getCompound(id);
            String status = t.getString("status");
            if (!ACCEPTED.equals(status) && !COMPLETED.equals(status)) {
                continue; // seules les quêtes en cours / à réclamer sont « actives »
            }
            JsonObject o = new JsonObject();
            o.addProperty("id", id);
            o.addProperty("title", t.getString("title"));
            o.addProperty("type", normType(t.getString("type")));
            o.addProperty("target", t.getString("target"));
            o.addProperty("amount", Math.max(1, t.getInt("amount")));
            o.addProperty("progress", t.getInt("progress"));
            o.addProperty("status", status);
            o.addProperty("mode", normMode(t.getString("mode")));
            arr.add(o);
        }
        JsonObject rootObj = new JsonObject();
        rootObj.add("quests", arr);
        return rootObj.toString();
    }

    /**
     * Copie l'état des quêtes de l'ANCIENNE instance de joueur vers la NOUVELLE lors d'un
     * clonage (respawn après la mort, retour de l'End). INDISPENSABLE : le vanilla ne
     * conserve PAS le {@code getPersistentData()} racine à travers un respawn (seul le
     * sous-tag {@code PlayerPersisted} survit), donc sans cette recopie toutes les quêtes
     * acceptées — et leur progression — seraient réinitialisées à chaque mort. Appelé depuis
     * {@code QuestEvents.onPlayerClone} ({@code PlayerEvent.Clone}).
     */
    public static void copyForRespawn(Player original, Player fresh) {
        CompoundTag oldData = original.getPersistentData();
        if (oldData.contains(ROOT)) {
            fresh.getPersistentData().put(ROOT, oldData.getCompound(ROOT).copy());
        }
    }
}
