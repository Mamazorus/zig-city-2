package com.rawstudio.zigshop.client;

import net.minecraft.client.Minecraft;

/**
 * Réception client du paquet S→C : ouvre l'écran de banque, ou le rafraîchit s'il est déjà
 * ouvert (après un dépôt/retrait → soldes à jour). CLIENT uniquement.
 */
public final class BankClientHandler {
    private BankClientHandler() {}

    public static void open(String json) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.screen instanceof BankScreen bank) {
            bank.refresh(json);
        } else {
            mc.setScreen(new BankScreen(json));
        }
    }
}
