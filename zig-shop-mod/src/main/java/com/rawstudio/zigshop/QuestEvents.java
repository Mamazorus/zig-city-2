package com.rawstudio.zigshop;

import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.block.state.BlockState;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.event.entity.living.BabyEntitySpawnEvent;
import net.neoforged.neoforge.event.entity.living.LivingDeathEvent;
import net.neoforged.neoforge.event.entity.player.ItemFishedEvent;
import net.neoforged.neoforge.event.entity.player.PlayerEvent;
import net.neoforged.neoforge.event.level.BlockEvent;
import net.neoforged.neoforge.event.server.ServerStartedEvent;

import java.util.Map;

/**
 * Suivi des objectifs de quête. À chaque action pertinente d'un joueur — tuer une entité,
 * casser / poser un bloc, fabriquer / cuire / pêcher un objet, élever un animal — on
 * incrémente la progression des quêtes ACCEPTÉES de ce joueur dont le type ET la cible
 * correspondent (cf. {@link QuestState#addProgress}). On se contente de LIRE les événements
 * (jamais {@code setCanceled}). Bus de JEU, côté serveur uniquement ({@link ServerPlayer}).
 */
@EventBusSubscriber(modid = ZigShop.MODID)
public final class QuestEvents {
    private QuestEvents() {}

    // ─── Tuer une entité ──────────────────────────────────────────────────────
    @SubscribeEvent
    public static void onKill(LivingDeathEvent event) {
        if (!(event.getSource().getEntity() instanceof ServerPlayer player)) {
            return; // pas tué par un joueur
        }
        QuestState.addProgress(player, "kill", entityId(event.getEntity().getType()), 1);
    }

    // ─── Casser un bloc ───────────────────────────────────────────────────────
    @SubscribeEvent
    public static void onBreak(BlockEvent.BreakEvent event) {
        if (!(event.getPlayer() instanceof ServerPlayer player)) {
            return;
        }
        QuestState.addProgress(player, "break", blockId(event.getState()), 1);
    }

    // ─── Poser un bloc ────────────────────────────────────────────────────────
    @SubscribeEvent
    public static void onPlace(BlockEvent.EntityPlaceEvent event) {
        if (!(event.getEntity() instanceof ServerPlayer player)) {
            return; // posé par un piston / autre entité → ignoré
        }
        QuestState.addProgress(player, "place", blockId(event.getPlacedBlock()), 1);
    }

    // ─── Fabriquer un objet (compte TOUTE la pile produite : 64 planches = +64) ─
    @SubscribeEvent
    public static void onCraft(PlayerEvent.ItemCraftedEvent event) {
        if (!(event.getEntity() instanceof ServerPlayer player)) {
            return;
        }
        ItemStack stack = event.getCrafting();
        QuestState.addProgress(player, "craft", itemId(stack), Math.max(1, stack.getCount()));
    }

    // ─── Cuire au four (compte toute la pile produite) ────────────────────────
    @SubscribeEvent
    public static void onSmelt(PlayerEvent.ItemSmeltedEvent event) {
        if (!(event.getEntity() instanceof ServerPlayer player)) {
            return;
        }
        ItemStack stack = event.getSmelting();
        QuestState.addProgress(player, "smelt", itemId(stack), Math.max(1, stack.getCount()));
    }

    // ─── Pêcher (une prise = +1 ; cible = objet pêché, ou joker) ──────────────
    @SubscribeEvent
    public static void onFish(ItemFishedEvent event) {
        if (!(event.getEntity() instanceof ServerPlayer player)) {
            return;
        }
        String target = event.getDrops().isEmpty() ? "" : itemId(event.getDrops().get(0));
        QuestState.addProgress(player, "fish", target, 1);
    }

    // ─── Élever des animaux (reproduction déclenchée par un joueur) ───────────
    @SubscribeEvent
    public static void onBreed(BabyEntitySpawnEvent event) {
        Mob parent = event.getParentA();
        if (!(event.getCausedByPlayer() instanceof ServerPlayer player) || parent == null) {
            return; // reproduction naturelle (sans joueur) → ignorée
        }
        QuestState.addProgress(player, "breed", entityId(parent.getType()), 1);
    }

    // ─── Démarrage serveur : ré-importe les gagnants « unique » depuis Firebase ─
    // (robustesse si le monde a été réinitialisé alors que Firebase garde la trace).
    @SubscribeEvent
    public static void onServerStarted(ServerStartedEvent event) {
        MinecraftServer server = event.getServer();
        QuestWinnersData data = QuestWinnersData.get(server);
        FirebaseClient.fetchQuestWinners().whenComplete((map, err) -> server.execute(() -> {
            if (err != null || map == null) {
                return;
            }
            for (Map.Entry<String, QuestWinnersData.Winner> e : map.entrySet()) {
                QuestWinnersData.Winner w = e.getValue();
                data.mergeIfAbsent(e.getKey(), w.name(), w.uuid(), w.ts());
            }
        }));
    }

    // ─── Helpers d'identifiants (namespace:path) ──────────────────────────────
    private static String entityId(EntityType<?> type) {
        ResourceLocation key = BuiltInRegistries.ENTITY_TYPE.getKey(type);
        return key != null ? key.toString() : "";
    }

    private static String blockId(BlockState state) {
        ResourceLocation key = BuiltInRegistries.BLOCK.getKey(state.getBlock());
        return key != null ? key.toString() : "";
    }

    private static String itemId(ItemStack stack) {
        ResourceLocation key = BuiltInRegistries.ITEM.getKey(stack.getItem());
        return key != null ? key.toString() : "";
    }
}
