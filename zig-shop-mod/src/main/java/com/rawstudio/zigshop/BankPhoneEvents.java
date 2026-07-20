package com.rawstudio.zigshop;

import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.ItemStack;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.event.entity.player.PlayerInteractEvent;

/**
 * Raccourci Zig Phone (phase 1, cf. design du 19/07) : SHIFT + clic-droit avec le téléphone
 * ({@code crazythings:crazy_phone}) en main principale ouvre directement l'écran de banque, SANS
 * passer par un PNJ. L'event est annulé pour empêcher le comportement normal du téléphone (menu
 * MCreator natif du mod {@code crazythings}, hors de notre contrôle) de s'ouvrir EN PLUS — un
 * clic-droit SANS shift garde ce comportement natif intact (annulation conditionnelle).
 *
 * <p>Phase 2 (différée, cf. design) : une vraie icône sur l'écran d'accueil du téléphone, par
 * patch bytecode du jar {@code crazythings} — {@code crazythings} n'a pas de système de plugin
 * (mod MCreator), même situation que les patches déjà faits sur coastercart/sable/requins.
 */
@EventBusSubscriber(modid = ZigShop.MODID)
public final class BankPhoneEvents {
    private BankPhoneEvents() {}

    @SubscribeEvent
    public static void onRightClickItem(PlayerInteractEvent.RightClickItem event) {
        Player player = event.getEntity();
        if (event.getHand() != InteractionHand.MAIN_HAND || !player.isShiftKeyDown() || !isZigPhone(event.getItemStack())) {
            return;
        }
        event.setCanceled(true); // empêche le menu natif du téléphone de s'ouvrir en plus (2 sides)
        if (!(player instanceof ServerPlayer sp)) {
            return; // la logique d'ouverture ne s'exécute que côté serveur (cf. QuestEvents/MerchantEntity)
        }
        MinecraftServer server = sp.getServer();
        if (server == null) {
            return;
        }
        FirebaseClient.fetchBankConfig().whenComplete((cfg, err) -> server.execute(() -> {
            if (!sp.isAlive()) {
                return;
            }
            FirebaseClient.BankConfig c = (err != null || cfg == null) ? FirebaseClient.BankConfig.DEFAULT : cfg;
            BankServerHandler.open(sp, -1, c);
        }));
    }

    private static boolean isZigPhone(ItemStack stack) {
        ResourceLocation id = BuiltInRegistries.ITEM.getKey(stack.getItem());
        return id != null && "crazythings".equals(id.getNamespace()) && "crazy_phone".equals(id.getPath());
    }
}
