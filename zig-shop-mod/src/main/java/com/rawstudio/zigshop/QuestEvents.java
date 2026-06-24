package com.rawstudio.zigshop;

import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.EntityType;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.event.entity.living.LivingDeathEvent;

/**
 * Suivi des objectifs de quête : à chaque mort d'entité causée par un joueur, incrémente
 * la progression des quêtes acceptées de ce joueur qui ciblent ce type d'entité.
 * Bus de jeu, côté serveur (l'événement n'est traité que sur {@link ServerPlayer}).
 */
@EventBusSubscriber(modid = ZigShop.MODID)
public final class QuestEvents {
    private QuestEvents() {}

    @SubscribeEvent
    public static void onLivingDeath(LivingDeathEvent event) {
        if (!(event.getSource().getEntity() instanceof ServerPlayer player)) {
            return; // pas tué par un joueur
        }
        EntityType<?> type = event.getEntity().getType();
        ResourceLocation key = BuiltInRegistries.ENTITY_TYPE.getKey(type);
        if (key != null) {
            QuestState.addKill(player, key.toString());
        }
    }
}
