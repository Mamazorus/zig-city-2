package by.deokma.casino.client.compat;

import by.deokma.casino.CasinoAddon;
import by.deokma.casino.game.blackjack.BlackjackScreen;
import by.deokma.casino.game.durak.DurakScreen;
import by.deokma.casino.game.texasholdem.TexasHoldemScreen;
import mezz.jei.api.IModPlugin;
import mezz.jei.api.JeiPlugin;
import mezz.jei.api.gui.handlers.IGuiProperties;
import mezz.jei.api.gui.handlers.IScreenHandler;
import mezz.jei.api.registration.IGuiHandlerRegistration;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.resources.ResourceLocation;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@JeiPlugin
public class JEICompat implements IModPlugin {
    private static final Logger LOGGER = LoggerFactory.getLogger(JEICompat.class);

    @Override
    public void registerGuiHandlers(@NotNull IGuiHandlerRegistration registration) {
        LOGGER.info("[Common JEI Compat] Registering GUI handlers for Casino games");
        registration.addGuiScreenHandler(BlackjackScreen.class, new NoHandler<>());
        registration.addGuiScreenHandler(TexasHoldemScreen.class, new NoHandler<>());
        registration.addGuiScreenHandler(DurakScreen.class, new NoHandler<>());
        LOGGER.info("[Common JEI Compat] GUI handlers registered successfully");
    }

    @Override
    public @NotNull ResourceLocation getPluginUid() {
        return ResourceLocation.fromNamespaceAndPath(CasinoAddon.MOD_ID, "jei_compat");
    }

    private static class NoHandler<T extends Screen> implements IScreenHandler<T> {
        @Override
        public @Nullable IGuiProperties apply(@NotNull T guiScreen) {
            return null;
        }
    }
}
