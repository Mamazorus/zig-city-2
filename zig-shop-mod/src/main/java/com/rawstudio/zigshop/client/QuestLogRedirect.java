package com.rawstudio.zigshop.client;

import com.rawstudio.zigshop.ZigShop;

import net.minecraft.client.gui.screens.Screen;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.client.event.ScreenEvent;

/**
 * Redirige l'ouverture du journal de quêtes de CustomNPCs (onglet « livre » en haut de l'inventaire
 * ET touche L) vers NOTRE journal de quêtes actives ({@link ActiveQuestsScreen}).
 *
 * <p>CustomNPCs et zigshop ont deux systèmes de quêtes indépendants : le journal de CustomNPCs est
 * donc vide chez nous. On ouvre le nôtre à la place. La détection se fait par NOM DE CLASSE
 * ({@value #CUSTOMNPCS_QUEST_LOG}) pour ne PAS ajouter de dépendance de compilation à CustomNPCs
 * (mod tiers non officiel). Si une MAJ de CustomNPCs renomme cette classe, la redirection cesse
 * simplement d'opérer (sans planter) — à re-vérifier lors d'un changement de version du mod.
 *
 * <p>CLIENT, bus de jeu (défaut). {@code ScreenEvent.Opening} est déclenché à chaque
 * {@code Minecraft.setScreen} : {@code InventoryTabQuests} comme le raccourci passent tous deux par
 * {@code setScreen(new GuiQuestLog(...))}, donc les deux entrées sont couvertes.
 */
@EventBusSubscriber(modid = ZigShop.MODID, value = Dist.CLIENT)
public final class QuestLogRedirect {
    private QuestLogRedirect() {}

    private static final String CUSTOMNPCS_QUEST_LOG = "noppes.npcs.client.gui.player.GuiQuestLog";

    @SubscribeEvent
    public static void onScreenOpening(ScreenEvent.Opening event) {
        // getNewScreen() = l'écran sur le point de s'ouvrir (accesseur non ambigu ; getScreen()
        // peut renvoyer l'écran courant selon les versions). setNewScreen() le remplace.
        Screen next = event.getNewScreen();
        if (next != null && CUSTOMNPCS_QUEST_LOG.equals(next.getClass().getName())) {
            event.setNewScreen(new ActiveQuestsScreen());
        }
    }
}
