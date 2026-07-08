package com.rawstudio.zigshop.client;

import net.minecraft.client.Minecraft;

/**
 * Réception client du paquet S→C : ouvre l'écran de boutique, ou le rafraîchit s'il est
 * déjà ouvert (après un achat → solde et quotas à jour). CLIENT uniquement.
 */
public final class ShopClientHandler {
    private ShopClientHandler() {}

    public static void open(String json) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.screen instanceof ShopScreen shop) {
            shop.refresh(json);
        } else {
            mc.setScreen(new ShopScreen(json));
        }
    }
}
