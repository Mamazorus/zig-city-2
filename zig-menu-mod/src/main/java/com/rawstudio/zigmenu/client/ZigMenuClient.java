package com.rawstudio.zigmenu.client;

import com.rawstudio.zigmenu.ZigMenu;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.screens.TitleScreen;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.client.event.ScreenEvent;

/**
 * Setup client-only. Intercepte l'ouverture de l'ecran-titre vanilla et la remplace
 * par {@link ZigCityMenuScreen}.
 *
 * <p>{@link ScreenEvent.Opening} est diffuse sur le bus de JEU ({@code Bus.GAME}).
 * Comme notre ecran herite de {@code Screen} (et non de {@code TitleScreen}), il n'y a
 * aucune boucle de remplacement.
 */
@EventBusSubscriber(modid = ZigMenu.MODID, bus = EventBusSubscriber.Bus.GAME, value = Dist.CLIENT)
public final class ZigMenuClient {

    private ZigMenuClient() {}

    @SubscribeEvent
    public static void onScreenOpening(ScreenEvent.Opening event) {
        if (event.getNewScreen() instanceof TitleScreen) {
            event.setNewScreen(new ZigCityMenuScreen());
        }
    }

    // Hors du jeu (level == null), peint le fond Zig City derriere TOUS les ecrans de menu
    // vanilla (Options, Langue, selection de monde, connexion...) au lieu du fond
    // "dirt/panorama" vanilla. Notre propre ecran gere deja son fond -> on l'exclut.
    // BackgroundRendered est poste APRES le fond vanilla et AVANT les widgets : notre fond
    // recouvre le dirt sans masquer boutons ni textes.
    @SubscribeEvent
    public static void onBackgroundRendered(ScreenEvent.BackgroundRendered event) {
        if (Minecraft.getInstance().level != null) {
            return;   // en jeu : le fond est le monde, on n'y touche pas
        }
        var screen = event.getScreen();
        if (screen instanceof ZigCityMenuScreen) {
            return;   // notre menu peint deja son propre fond
        }
        ZigCityMenuScreen.renderSceneBackground(event.getGuiGraphics(), screen.width, screen.height);
    }
}
