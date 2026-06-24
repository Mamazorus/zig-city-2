package com.rawstudio.zigshop.client;

import net.minecraft.client.Minecraft;

/**
 * Réception client du paquet S→C : ouvre l'écran de quêtes, ou le rafraîchit s'il est
 * déjà ouvert (après une acceptation / réclamation). CLIENT uniquement.
 */
public final class QuestClientHandler {
    private QuestClientHandler() {}

    public static void open(String json) {
        Minecraft mc = Minecraft.getInstance();
        if (mc.screen instanceof QuestScreen quests) {
            quests.refresh(json);
        } else {
            mc.setScreen(new QuestScreen(json));
        }
    }
}
