package com.rawstudio.zigshop;

import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.event.entity.player.PlayerEvent;
import net.neoforged.neoforge.event.tick.PlayerTickEvent;

/**
 * Déclenche le job périodique de la banque ({@link BankAccountData#applyPeriodTick}). Ce mod n'a
 * pas de hook de tick SERVEUR global : on se raccroche au tick d'UN joueur en ligne (throttlé à
 * ~1×/minute — largement suffisant même pour un cycle configuré en heures, cf.
 * {@code FirebaseClient.BankConfig#periodHours}), complété par la connexion pour rattraper un
 * cycle écoulé pendant que le serveur était vide. Le garde-fou d'idempotence RÉEL reste
 * {@code Account.lastProcessedPeriod} (par compte, dans {@link BankAccountData}) : la config est
 * refetchée à CHAQUE vérification throttlée (simple requête GET Firebase, ~1×/minute — pas besoin
 * d'un throttle applicatif supplémentaire ici, contrairement à l'ancien système en jours civils où
 * la période n'était connue qu'après coup).
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
        }
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
