package com.rawstudio.zigmenu.client;

import com.rawstudio.zigmenu.ZigMenu;

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
}
