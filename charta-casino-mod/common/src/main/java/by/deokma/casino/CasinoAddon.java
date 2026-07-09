package by.deokma.casino;

import by.deokma.casino.game.blackjack.BlackjackGame;
import by.deokma.casino.game.blackjack.BlackjackMenu;
import by.deokma.casino.game.durak.DurakGame;
import by.deokma.casino.game.durak.DurakMenu;
import by.deokma.casino.game.texasholdem.TexasHoldemGame;
import by.deokma.casino.game.texasholdem.TexasHoldemMenu;
import dev.lucaargolo.charta.common.game.api.game.GameType;
import net.minecraft.world.inventory.MenuType;

import java.util.function.Supplier;

public final class CasinoAddon {

    public static final String MOD_ID = "charta_casino";

    public static Supplier<GameType<BlackjackGame, BlackjackMenu>> BLACKJACK_GAME;
    public static Supplier<GameType<TexasHoldemGame, TexasHoldemMenu>> TEXAS_HOLDEM_GAME;
    public static Supplier<GameType<DurakGame, DurakMenu>> DURAK_GAME;

    public static Supplier<MenuType<BlackjackMenu>> BLACKJACK_MENU;
    public static Supplier<MenuType<TexasHoldemMenu>> TEXAS_HOLDEM_MENU;
    public static Supplier<MenuType<DurakMenu>> DURAK_MENU;

    public static void init() {
    }

    private CasinoAddon() {}
}
