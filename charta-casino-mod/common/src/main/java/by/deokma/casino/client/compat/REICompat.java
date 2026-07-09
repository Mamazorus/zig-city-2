package by.deokma.casino.client.compat;

import by.deokma.casino.game.blackjack.BlackjackScreen;
import by.deokma.casino.game.durak.DurakScreen;
import by.deokma.casino.game.texasholdem.TexasHoldemScreen;
import me.shedaniel.rei.api.client.plugins.REIClientPlugin;
import me.shedaniel.rei.api.client.registry.screen.ExclusionZones;

public class REICompat implements REIClientPlugin {

    @Override
    public void registerExclusionZones(ExclusionZones zones) {
        zones.register(BlackjackScreen.class, screen -> java.util.Collections.emptyList());
        zones.register(TexasHoldemScreen.class, screen -> java.util.Collections.emptyList());
        zones.register(DurakScreen.class, screen -> java.util.Collections.emptyList());
    }
}
