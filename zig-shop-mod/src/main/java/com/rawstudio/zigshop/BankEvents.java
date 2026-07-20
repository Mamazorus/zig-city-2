package com.rawstudio.zigshop;

import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.event.entity.player.PlayerEvent;
import net.neoforged.neoforge.event.tick.PlayerTickEvent;

/**
 * Déclenche le job quotidien de la banque ({@link BankAccountData#applyDailyTick}) au changement
 * de jour civil ({@link ZigShopDate#today()}). Ce mod n'a pas de hook de tick SERVEUR global : on
 * se raccroche au tick d'UN joueur en ligne (throttlé à ~1×/minute — largement suffisant pour un
 * cycle journalier), complété par la connexion pour rattraper un changement de jour survenu
 * pendant que le serveur était vide. Le garde-fou d'idempotence RÉEL reste
 * {@code Account.lastProcessedDay} (par compte, dans {@link BankAccountData}) : {@link #lastTriggeredDay}
 * n'est qu'une optimisation pour éviter de re-interroger Firebase à chaque tick une fois le job
 * déjà lancé pour le jour courant — un redémarrage serveur la remet à zéro sans risque de double
 * traitement (le vrai garde-fou par compte s'applique quoi qu'il arrive).
 */
@EventBusSubscriber(modid = ZigShop.MODID)
public final class BankEvents {
    private BankEvents() {}

    private static final int CHECK_INTERVAL_TICKS = 1200; // ~1 minute (20 ticks/s)
    private static int tickCounter = 0;
    private static String lastTriggeredDay = "";

    @SubscribeEvent
    public static void onPlayerTick(PlayerTickEvent.Post event) {
        if (!(event.getEntity() instanceof ServerPlayer player) || player.level().isClientSide()) {
            return;
        }
        if (++tickCounter < CHECK_INTERVAL_TICKS) {
            return;
        }
        tickCounter = 0;
        maybeRunDailyTick(player.getServer());
    }

    @SubscribeEvent
    public static void onLogin(PlayerEvent.PlayerLoggedInEvent event) {
        if (event.getEntity() instanceof ServerPlayer player) {
            maybeRunDailyTick(player.getServer());
        }
    }

    private static void maybeRunDailyTick(MinecraftServer server) {
        if (server == null) {
            return;
        }
        String today = ZigShopDate.today();
        if (today.equals(lastTriggeredDay)) {
            return;
        }
        lastTriggeredDay = today;
        FirebaseClient.fetchBankConfig().whenComplete((cfg, err) -> server.execute(() -> {
            FirebaseClient.BankConfig c = (err != null || cfg == null) ? FirebaseClient.BankConfig.DEFAULT : cfg;
            BankAccountData.get(server).applyDailyTick(server, today, c);
        }));
    }
}
