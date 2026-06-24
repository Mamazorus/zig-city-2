package com.rawstudio.zigshop.client;

import com.rawstudio.zigshop.ZigShop;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.inventory.MerchantScreen;
import net.minecraft.network.chat.Component;
import net.minecraft.world.item.trading.MerchantOffer;
import net.minecraft.world.item.trading.MerchantOffers;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.client.event.ScreenEvent;

/**
 * Affiche, par-dessus l'écran de troc du marchand, le quota restant par offre limitée
 * (« reste X/Y »), à droite de la fenêtre. Les offres reçues côté client portent déjà
 * {@code uses} + {@code maxUses} (réglés côté serveur par {@link com.rawstudio.zigshop.MerchantEntity}),
 * donc aucun réseau custom n'est nécessaire.
 *
 * <p>CLIENT uniquement, sur le bus de jeu (défaut de {@code @EventBusSubscriber}).
 */
@EventBusSubscriber(modid = ZigShop.MODID, value = Dist.CLIENT)
public final class QuotaOverlay {
    private QuotaOverlay() {}

    /** Au-delà de ce seuil, l'offre est considérée illimitée (maxUses = Integer.MAX_VALUE). */
    private static final int LIMIT_THRESHOLD = 100_000;

    @SubscribeEvent
    public static void onScreenRender(ScreenEvent.Render.Post event) {
        if (!(event.getScreen() instanceof MerchantScreen screen)) {
            return;
        }
        MerchantOffers offers = screen.getMenu().getOffers();
        if (offers == null || offers.isEmpty()) {
            return;
        }
        GuiGraphics gui = event.getGuiGraphics();
        Font font = Minecraft.getInstance().font;
        // À GAUCHE de la fenêtre : textes alignés à droite, finissant juste avant le bord
        // gauche (zone dégagée — à droite, les items portés/inventaire passaient par-dessus).
        int rightEdge = screen.getGuiLeft() - 6;
        int y = screen.getGuiTop() + 8;

        boolean titleDrawn = false;
        for (MerchantOffer offer : offers) {
            int max = offer.getMaxUses();
            if (max <= 0 || max >= LIMIT_THRESHOLD) {
                continue; // offre illimitée : rien à afficher
            }
            if (!titleDrawn) {
                Component title = Component.literal("§eTon quota");
                gui.drawString(font, title, rightEdge - font.width(title), y, 0xFFFFFF);
                y += 12;
                titleDrawn = true;
            }
            int remaining = Math.max(0, max - offer.getUses());
            String color = remaining > 0 ? "§a" : "§c";
            Component line = Component.empty()
                    .append(offer.getCostA().getHoverName())
                    .append(Component.literal(" " + color + remaining + "§7/" + max));
            gui.drawString(font, line, rightEdge - font.width(line), y, 0xFFFFFF);
            y += 11;
        }
    }
}
