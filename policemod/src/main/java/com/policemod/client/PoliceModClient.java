package com.policemod.client;

import com.policemod.PoliceMod;
import com.policemod.init.ModMenuTypes;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.client.event.RegisterMenuScreensEvent;

/**
 * Initialisation côté CLIENT uniquement (la classe n'est chargée que sur le client
 * grâce à {@code value = Dist.CLIENT}).
 *
 * <p>Lie le {@code MenuType} "fouille_menu" à son écran {@link FouilleScreen}. Sans cet
 * enregistrement, ouvrir le menu côté serveur ne déclenche aucun affichage côté client :
 * c'était la cause du bug "le badge ne fait rien à l'écran".
 */
@EventBusSubscriber(modid = PoliceMod.MOD_ID, bus = EventBusSubscriber.Bus.MOD, value = Dist.CLIENT)
public final class PoliceModClient {

    private PoliceModClient() {}

    @SubscribeEvent
    public static void onRegisterScreens(RegisterMenuScreensEvent event) {
        event.register(ModMenuTypes.FOUILLE_MENU.get(), FouilleScreen::new);
    }
}
