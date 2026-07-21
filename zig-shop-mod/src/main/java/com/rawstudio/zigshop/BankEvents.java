package com.rawstudio.zigshop;

import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.event.entity.player.PlayerEvent;
import net.neoforged.neoforge.event.server.ServerStartedEvent;
import net.neoforged.neoforge.event.tick.PlayerTickEvent;

/**
 * Déclenche le job périodique de la banque ({@link BankAccountData#applyPeriodTick}). Ce mod n'a
 * pas de hook de tick SERVEUR global : on se raccroche au tick d'UN joueur en ligne (throttlé à
 * ~1×/minute — largement suffisant même pour un cycle configuré en heures, cf.
 * {@code FirebaseClient.BankConfig#savingsPeriodHours}/{@code riskyPeriodHours}), complété par la
 * connexion pour rattraper un cycle écoulé pendant que le serveur était vide. Le garde-fou
 * d'idempotence RÉEL reste {@code Account.lastSavingsPeriod}/{@code lastRiskyPeriod} (par compte,
 * dans {@link BankAccountData}) : la config est refetchée à CHAQUE vérification throttlée (simple
 * requête GET Firebase, ~1×/minute — pas besoin d'un throttle applicatif supplémentaire ici).
 */
@EventBusSubscriber(modid = ZigShop.MODID)
public final class BankEvents {
    private BankEvents() {}

    private static final int CHECK_INTERVAL_TICKS = 1200; // ~1 minute (20 ticks/s)
    private static int tickCounter = 0;

    @SubscribeEvent
    public static void onPlayerTick(PlayerTickEvent.Post event) {
        if (!(event.getEntity() instanceof ServerPlayer player) || player.level().isClientSide()) {
            return;
        }
        if (++tickCounter < CHECK_INTERVAL_TICKS) {
            return;
        }
        tickCounter = 0;
        runPeriodTick(player.getServer());
    }

    @SubscribeEvent
    public static void onLogin(PlayerEvent.PlayerLoggedInEvent event) {
        if (event.getEntity() instanceof ServerPlayer player) {
            runPeriodTick(player.getServer());
            // Snapshot immédiat pour les écrans muraux (cf. MarketScreenEntity) : sinon ce joueur
            // ne verrait rien tant qu'aucun nouveau cycle ne s'écoule après sa connexion.
            MinecraftServer server = player.getServer();
            if (server != null) {
                com.rawstudio.zigshop.net.MarketScreenNetwork.sendTo(player, BankAccountData.get(server));
            }
        }
    }

    /**
     * Republie le miroir Firebase de tous les comptes existants dès que le serveur démarre — sans
     * ça, le dashboard resterait aveugle aux comptes créés avant le dernier redémarrage tant
     * qu'aucun joueur ne se reconnecte ou qu'aucun cycle ne s'écoule (cf.
     * {@link BankAccountData#publishAllMirrors}). Ne touche à aucun solde, purement informatif.
     */
    @SubscribeEvent
    public static void onServerStarted(ServerStartedEvent event) {
        BankAccountData.get(event.getServer()).publishAllMirrors();
    }

    private static void runPeriodTick(MinecraftServer server) {
        if (server == null) {
            return;
        }
        FirebaseClient.fetchBankConfig().whenComplete((cfg, err) -> server.execute(() -> {
            FirebaseClient.BankConfig c = (err != null || cfg == null) ? FirebaseClient.BankConfig.DEFAULT : cfg;
            BankAccountData.get(server).applyPeriodTick(server, c);
        }));
    }
}
