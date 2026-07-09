package com.rawstudio.zigaddiction;

import com.rawstudio.zigaddiction.command.AddictionCommand;

import net.minecraft.server.level.ServerPlayer;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.common.util.FakePlayer;
import net.neoforged.neoforge.event.RegisterCommandsEvent;
import net.neoforged.neoforge.event.entity.living.LivingEntityUseItemEvent;
import net.neoforged.neoforge.event.entity.player.PlayerEvent;
import net.neoforged.neoforge.event.server.ServerStartedEvent;
import net.neoforged.neoforge.event.tick.PlayerTickEvent;

/**
 * Branche la logique d'addiction sur les événements du JEU. On se contente de LIRE les
 * événements (jamais {@code setCanceled}). Bus de jeu ; toute action est filtrée côté
 * serveur ({@link ServerPlayer}), donc rien ne s'exécute côté client.
 */
@EventBusSubscriber(modid = ZigAddiction.MODID)
public final class AddictionEvents {
    private AddictionEvents() {}

    // ─── Fin de consommation : si c'est le joint, (re)démarre le cycle ────────
    @SubscribeEvent
    public static void onFinishUsing(LivingEntityUseItemEvent.Finish event) {
        if (!(event.getEntity() instanceof ServerPlayer player) || player instanceof FakePlayer) {
            return; // vrais joueurs serveur uniquement (exclut distributeur / fake player)
        }
        if (AddictionManager.isConfiguredJoint(event.getItem())) {
            AddictionManager.onSmoke(player);
        }
    }

    // ─── Tick joueur : fait avancer le temps de JEU et applique le manque ─────
    @SubscribeEvent
    public static void onPlayerTick(PlayerTickEvent.Post event) {
        if (event.getEntity() instanceof ServerPlayer player && !player.level().isClientSide()) {
            AddictionManager.onServerPlayerTick(player);
        }
    }

    // ─── (Re)connexion : rappel si le joueur était déjà en manque ─────────────
    @SubscribeEvent
    public static void onLogin(PlayerEvent.PlayerLoggedInEvent event) {
        if (event.getEntity() instanceof ServerPlayer player) {
            AddictionManager.onLogin(player);
        }
    }

    // ─── Démarrage serveur : charge la config (crée le fichier au besoin) ─────
    @SubscribeEvent
    public static void onServerStarted(ServerStartedEvent event) {
        AddictionConfig.preload();
    }

    // ─── Enregistrement de la commande d'admin /zigaddiction ──────────────────
    @SubscribeEvent
    public static void onRegisterCommands(RegisterCommandsEvent event) {
        AddictionCommand.register(event.getDispatcher());
    }
}
