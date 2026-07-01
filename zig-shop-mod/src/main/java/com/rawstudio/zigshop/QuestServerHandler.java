package com.rawstudio.zigshop;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.rawstudio.zigshop.net.OpenQuestsPayload;

import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.neoforged.neoforge.network.PacketDistributor;
import net.neoforged.neoforge.network.handling.IPayloadContext;

import javax.annotation.Nullable;
import java.util.List;

/**
 * Logique SERVEUR des quêtes : construit le JSON (définitions + état du joueur) envoyé à
 * l'écran, et traite l'acceptation / la réclamation (re-lecture Firebase pour la définition
 * à jour + remise de la récompense).
 *
 * <p>Deux PNJ partagent ce code : le PNJ « quest » affiche les quêtes non-uniques
 * (once/limited/daily), le PNJ « questspecial » n'affiche que les quêtes {@code unique}
 * (verrou global « 1 seul gagnant », cf. {@link QuestWinnersData}). Le filtre est piloté par
 * {@code uniqueOnly}, déduit du mode de la quête concernée lors des allers-retours réseau.
 */
public final class QuestServerHandler {
    private QuestServerHandler() {}

    /** Envoie l'écran de quêtes NON-uniques (PNJ « quest » générique). */
    public static void openFor(ServerPlayer player, List<QuestDef> quests) {
        openFor(player, quests, false, null);
    }

    /** Envoie l'écran d'un PNJ générique (quêtes globales, filtre uniqueOnly). */
    public static void openFor(ServerPlayer player, List<QuestDef> quests, boolean uniqueOnly) {
        openFor(player, quests, uniqueOnly, null);
    }

    /**
     * Envoie l'écran, filtré par PNJ : {@code npcId} défini → uniquement SES quêtes (tous
     * modes) ; {@code npcId} null → quêtes globales (sans {@code npc}) filtrées par
     * {@code uniqueOnly} (comportement historique des PNJ « quest » / « questspecial »).
     */
    public static void openFor(ServerPlayer player, List<QuestDef> quests, boolean uniqueOnly, @Nullable String npcId) {
        PacketDistributor.sendToPlayer(player, new OpenQuestsPayload(buildJson(player, quests, uniqueOnly, npcId)));
    }

    /** Sérialise les quêtes (filtrées par PNJ + mode) + l'état du joueur en JSON pour l'écran. */
    public static String buildJson(ServerPlayer player, List<QuestDef> quests, boolean uniqueOnly, @Nullable String npcId) {
        long now = System.currentTimeMillis();
        MinecraftServer server = player.getServer();
        QuestWinnersData winners = server != null ? QuestWinnersData.get(server) : null;

        JsonArray arr = new JsonArray();
        if (quests != null) {
            for (QuestDef q : quests) {
                String qNpc = (q.npc() == null) ? "" : q.npc();
                if (npcId != null) {
                    if (!npcId.equals(qNpc)) {
                        continue; // PNJ nommé : uniquement SES quêtes (tous modes confondus)
                    }
                } else {
                    if (!qNpc.isBlank()) {
                        continue; // PNJ générique : ignore les quêtes rattachées à un PNJ nommé
                    }
                    if ("unique".equals(q.mode()) != uniqueOnly) {
                        continue; // générique : sépare quêtes unique / non-unique (PNJ dédié)
                    }
                }
                QuestState.refreshDaily(player, q.id(), now);
                boolean isUnique = "unique".equals(q.mode()); // ré-arme les daily arrivées à échéance
                JsonObject o = new JsonObject();
                o.addProperty("id", q.id());
                o.addProperty("title", q.title());
                o.addProperty("description", q.description());
                o.addProperty("type", q.type());
                o.addProperty("target", q.target());
                o.addProperty("amount", q.amount());
                o.addProperty("rewardItem", q.rewardItem());
                o.addProperty("rewardQty", q.rewardQty());
                o.addProperty("mode", q.mode());
                o.addProperty("maxClaims", q.maxClaims());
                o.addProperty("status", QuestState.status(player, q.id()));
                o.addProperty("progress", QuestState.progress(player, q.id()));
                o.addProperty("claims", QuestState.claims(player, q.id()));
                o.addProperty("cooldownMs", QuestState.dailyCooldownRemaining(player, q.id(), now));
                if (isUnique && winners != null) {
                    QuestWinnersData.Winner w = winners.winner(q.id());
                    o.addProperty("winner", w != null ? w.name() : "");
                }
                arr.add(o);
            }
        }
        JsonObject root = new JsonObject();
        root.add("quests", arr);
        return root.toString();
    }

    /** C→S : accepte une quête, puis renvoie l'écran à jour (du bon PNJ). */
    public static void accept(IPayloadContext context, String questId) {
        if (!(context.player() instanceof ServerPlayer player)) {
            return;
        }
        FirebaseClient.fetchQuests().whenComplete((list, err) -> player.getServer().execute(() -> {
            if (err != null || list == null) {
                return;
            }
            QuestDef q = find(list, questId);
            if (q != null) {
                QuestState.accept(player, q);
            }
            // Renvoie l'écran filtré comme le PNJ d'origine : le npc de la quête indique son PNJ.
            openFor(player, list, q != null && "unique".equals(q.mode()), npcOf(q));
        }));
    }

    /** C→S : réclame la récompense d'une quête complétée, puis renvoie l'écran. */
    public static void claim(IPayloadContext context, String questId) {
        if (!(context.player() instanceof ServerPlayer player)) {
            return;
        }
        FirebaseClient.fetchQuests().whenComplete((list, err) -> player.getServer().execute(() -> {
            if (err != null || list == null) {
                return;
            }
            QuestDef q = find(list, questId);
            if (q == null) {
                openFor(player, list, false, null);
                return;
            }
            long now = System.currentTimeMillis();
            boolean unique = "unique".equals(q.mode());
            if (unique) {
                claimUnique(player, q, now);
            } else if (QuestState.claim(player, questId, now) == QuestState.ClaimResult.OK) {
                giveReward(player, q);
            }
            openFor(player, list, unique, npcOf(q));
        }));
    }

    /**
     * Réclamation d'une quête {@code unique} : le premier joueur à AVOIR COMPLÉTÉ puis cliqué
     * la remporte pour tout le serveur. La séquence tourne sur le thread serveur (atomique).
     */
    private static void claimUnique(ServerPlayer player, QuestDef q, long now) {
        if (!QuestState.COMPLETED.equals(QuestState.status(player, q.id()))) {
            return; // ce joueur n'a pas (encore) rempli l'objectif → aucun verrouillage
        }
        MinecraftServer server = player.getServer();
        if (server == null) {
            return;
        }
        QuestWinnersData winners = QuestWinnersData.get(server);
        QuestWinnersData.Winner existing = winners.winner(q.id());
        if (existing != null) {
            player.sendSystemMessage(Component.literal("§c[Zig Shop] Quete deja reussie par " + existing.name() + "."));
            return;
        }
        String name = player.getGameProfile().getName();
        String uuid = player.getUUID().toString();
        if (winners.tryClaim(q.id(), name, uuid, now)) {
            QuestState.claim(player, q.id(), now); // COMPLETED → CLAIMED (résultat OK garanti)
            giveReward(player, q);
            String secret = ServerConfig.firebaseSecret();
            if (secret != null) {
                FirebaseClient.putQuestWinner(secret, q.id(), name, uuid, now); // miroir launcher
            }
        }
    }

    /** Remet la récompense au joueur (drop au sol si l'inventaire est plein). */
    private static void giveReward(ServerPlayer player, QuestDef q) {
        Item item = resolveItem(q.rewardItem());
        if (item != null) {
            ItemStack reward = new ItemStack(item, Math.max(1, q.rewardQty()));
            if (!player.getInventory().add(reward)) {
                player.drop(reward, false);
            }
        }
    }

    /** npc d'une quête, normalisé : null si absente/globale (→ écran générique). */
    @Nullable
    private static String npcOf(@Nullable QuestDef q) {
        if (q == null) {
            return null;
        }
        String n = q.npc();
        return (n == null || n.isBlank()) ? null : n;
    }

    @Nullable
    private static QuestDef find(List<QuestDef> list, String questId) {
        for (QuestDef q : list) {
            if (q.id().equals(questId)) {
                return q;
            }
        }
        return null;
    }

    @Nullable
    private static Item resolveItem(String id) {
        if (id == null || id.isBlank()) {
            return null;
        }
        ResourceLocation rl = ResourceLocation.tryParse(id);
        if (rl == null) {
            return null;
        }
        Item item = BuiltInRegistries.ITEM.get(rl);
        return (item == Items.AIR && !"minecraft:air".equals(id)) ? null : item;
    }
}
