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
 * Deux raccourcis Zig Phone vers l'écran de banque, SANS passer par un PNJ :
 * <ul>
 *   <li><b>Phase 1</b> (cf. design du 19/07) : SHIFT + clic-droit avec le téléphone
 *   ({@code crazythings:crazy_phone}) en main principale. L'event est annulé pour empêcher le
 *   comportement normal du téléphone (menu MCreator natif du mod {@code crazythings}, hors de
 *   notre contrôle) de s'ouvrir EN PLUS — un clic-droit SANS shift garde ce comportement natif
 *   intact (annulation conditionnelle).</li>
 *   <li><b>Phase 2</b> (cf. design du 21/07) : une vraie icône "Banque" sur l'écran d'accueil du
 *   téléphone, ajoutée par patch bytecode du jar {@code crazythings} ({@code crazythings} n'a pas
 *   de système de plugin — mod MCreator, même situation que les patches déjà faits sur
 *   coastercart/sable/requins). Le patch appelle {@link ZigPhoneAppBridge#onHomeScreenButton},
 *   qui retombe sur {@link #openBankFor} ci-dessous — LA MÊME logique que le raccourci shift-clic,
 *   pour ne pas la dupliquer.</li>
 * </ul>
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
        openBankFor(sp);
    }

    /** Ouvre l'écran de banque pour {@code sp} (config Firebase relue, comme un PNJ banquier),
     *  sans PNJ à proximité ({@code entityId = -1}, cf. {@link BankServerHandler#open}). Partagé
     *  entre le raccourci shift-clic ci-dessus et {@link ZigPhoneAppBridge} (icône de l'écran
     *  d'accueil) — appelant déjà garanti côté SERVEUR par les deux. */
    public static void openBankFor(ServerPlayer sp) {
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
