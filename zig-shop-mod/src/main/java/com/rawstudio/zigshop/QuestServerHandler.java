package com.rawstudio.zigshop;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.rawstudio.zigshop.net.OpenQuestsPayload;

import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.neoforged.neoforge.network.PacketDistributor;
import net.neoforged.neoforge.network.handling.IPayloadContext;

import javax.annotation.Nullable;
import java.util.List;

/**
 * Logique SERVEUR des quêtes : construit le JSON (définitions + état du joueur) envoyé à
 * l'écran, et traite l'acceptation / la réclamation (avec re-lecture Firebase pour
 * retrouver la définition à jour, et remise de la récompense).
 */
public final class QuestServerHandler {
    private QuestServerHandler() {}

    /** Envoie au client l'écran de quêtes avec l'état courant du joueur. */
    public static void openFor(ServerPlayer player, List<QuestDef> quests) {
        PacketDistributor.sendToPlayer(player, new OpenQuestsPayload(buildJson(player, quests)));
    }

    /** Sérialise les quêtes + l'état du joueur en JSON pour l'écran. */
    public static String buildJson(ServerPlayer player, List<QuestDef> quests) {
        JsonArray arr = new JsonArray();
        if (quests != null) {
            for (QuestDef q : quests) {
                JsonObject o = new JsonObject();
                o.addProperty("id", q.id());
                o.addProperty("title", q.title());
                o.addProperty("description", q.description());
                o.addProperty("target", q.target());
                o.addProperty("amount", q.amount());
                o.addProperty("rewardItem", q.rewardItem());
                o.addProperty("rewardQty", q.rewardQty());
                o.addProperty("status", QuestState.status(player, q.id()));
                o.addProperty("progress", QuestState.progress(player, q.id()));
                arr.add(o);
            }
        }
        JsonObject root = new JsonObject();
        root.add("quests", arr);
        return root.toString();
    }

    /** C→S : accepte une quête, puis renvoie l'écran à jour. */
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
            openFor(player, list);
        }));
    }

    /** C→S : réclame la récompense d'une quête complétée (1×/joueur), puis renvoie l'écran. */
    public static void claim(IPayloadContext context, String questId) {
        if (!(context.player() instanceof ServerPlayer player)) {
            return;
        }
        FirebaseClient.fetchQuests().whenComplete((list, err) -> player.getServer().execute(() -> {
            if (err != null || list == null) {
                return;
            }
            QuestDef q = find(list, questId);
            if (q != null && QuestState.claim(player, questId)) {
                Item item = resolveItem(q.rewardItem());
                if (item != null) {
                    ItemStack reward = new ItemStack(item, Math.max(1, q.rewardQty()));
                    if (!player.getInventory().add(reward)) {
                        player.drop(reward, false);
                    }
                }
            }
            openFor(player, list);
        }));
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
