package by.deokma.casino.neoforge;

import by.deokma.casino.CasinoAddon;
import by.deokma.casino.client.PokerChipRenderer;
import by.deokma.casino.game.blackjack.BlackjackGame;
import by.deokma.casino.game.blackjack.BlackjackMenu;
import by.deokma.casino.game.blackjack.BlackjackScreen;
import by.deokma.casino.game.texasholdem.TexasHoldemGame;
import by.deokma.casino.game.texasholdem.TexasHoldemMenu;
import by.deokma.casino.game.texasholdem.TexasHoldemScreen;
import by.deokma.casino.network.BlackjackActionPayload;
import by.deokma.casino.network.TexasHoldemActionPayload;
import by.deokma.casino.network.TexasHoldemChipsPayload;
import dev.lucaargolo.charta.common.game.Games;
import dev.lucaargolo.charta.common.game.api.game.GameType;
import dev.lucaargolo.charta.common.menu.AbstractCardMenu;
import net.minecraft.world.inventory.MenuType;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.common.Mod;
import net.neoforged.fml.loading.FMLEnvironment;
import net.neoforged.neoforge.client.event.RegisterMenuScreensEvent;
import net.neoforged.neoforge.common.extensions.IMenuTypeExtension;
import net.neoforged.neoforge.network.event.RegisterPayloadHandlersEvent;
import net.neoforged.neoforge.registries.DeferredRegister;

import java.util.function.Supplier;

@Mod(CasinoAddon.MOD_ID)
public class CasinoAddonNeoForge {

    private static final DeferredRegister<GameType<?, ?>> GAME_TYPES = DeferredRegister.create(Games.REGISTRY_KEY, CasinoAddon.MOD_ID);
    private static final DeferredRegister<MenuType<?>> MENU_TYPES = DeferredRegister.create(net.minecraft.core.registries.Registries.MENU, CasinoAddon.MOD_ID);
    private static final Supplier<GameType<BlackjackGame, BlackjackMenu>> BLACKJACK_GAME =
            GAME_TYPES.register("blackjack", () -> BlackjackGame::new);
    private static final Supplier<GameType<TexasHoldemGame, TexasHoldemMenu>> TEXAS_HOLDEM_GAME =
            GAME_TYPES.register("texas_holdem", () -> TexasHoldemGame::new);
    //private static final Supplier<GameType<DurakGame, DurakMenu>> DURAK_GAME =
    //        GAME_TYPES.register("durak", () -> DurakGame::new);


    private static final Supplier<MenuType<BlackjackMenu>> BLACKJACK_MENU =
            MENU_TYPES.register("blackjack", () -> IMenuTypeExtension.create((containerId, inventory, extraData) ->
                    new BlackjackMenu(containerId, inventory, AbstractCardMenu.Definition.STREAM_CODEC.decode(extraData))));
    private static final Supplier<MenuType<TexasHoldemMenu>> TEXAS_HOLDEM_MENU =
            MENU_TYPES.register("texas_holdem", () -> IMenuTypeExtension.create((containerId, inventory, extraData) ->
                    new TexasHoldemMenu(containerId, inventory, AbstractCardMenu.Definition.STREAM_CODEC.decode(extraData))));
    //private static final Supplier<MenuType<DurakMenu>> DURAK_MENU =
    //        MENU_TYPES.register("durak", () -> IMenuTypeExtension.create((containerId, inventory, extraData) ->
    //                new DurakMenu(containerId, inventory, AbstractCardMenu.Definition.STREAM_CODEC.decode(extraData))));

    public CasinoAddonNeoForge(IEventBus modBus) {
        CasinoAddon.init();
        GAME_TYPES.register(modBus);
        MENU_TYPES.register(modBus);
        CasinoAddon.BLACKJACK_GAME = BLACKJACK_GAME;
        CasinoAddon.TEXAS_HOLDEM_GAME = TEXAS_HOLDEM_GAME;
        //CasinoAddon.DURAK_GAME = DURAK_GAME;
        CasinoAddon.BLACKJACK_MENU = BLACKJACK_MENU;
        CasinoAddon.TEXAS_HOLDEM_MENU = TEXAS_HOLDEM_MENU;
        //CasinoAddon.DURAK_MENU = DURAK_MENU;

        modBus.addListener(this::registerPayloadHandlers);

        // Refund coins stranded on a table by a crash / mid-game disconnect, on next login.
        net.neoforged.neoforge.common.NeoForge.EVENT_BUS.addListener(
                (net.neoforged.neoforge.event.entity.player.PlayerEvent.PlayerLoggedInEvent event) -> {
                    if (event.getEntity() instanceof net.minecraft.server.level.ServerPlayer sp) {
                        by.deokma.casino.CasinoBank.refundStranded(sp);
                    }
                });

        if (FMLEnvironment.dist == Dist.CLIENT) {
            modBus.addListener((RegisterMenuScreensEvent event) -> {
                event.register(BLACKJACK_MENU.get(), BlackjackScreen::new);
                event.register(TEXAS_HOLDEM_MENU.get(), TexasHoldemScreen::new);
                //event.register(DURAK_MENU.get(), DurakScreen::new);
                PokerChipRenderer.register();
            });
        }
    }

    private void registerPayloadHandlers(RegisterPayloadHandlersEvent event) {
        var registrar = event.registrar("1");
        registrar.playToServer(BlackjackActionPayload.TYPE, BlackjackActionPayload.STREAM_CODEC, (payload, context) ->
                BlackjackActionPayload.handleServer(payload, (net.minecraft.server.level.ServerPlayer) context.player()));
        registrar.playToServer(TexasHoldemActionPayload.TYPE, TexasHoldemActionPayload.STREAM_CODEC, (payload, context) ->
                TexasHoldemActionPayload.handleServer(payload, (net.minecraft.server.level.ServerPlayer) context.player()));
        //registrar.playToServer(DurakActionPayload.TYPE, DurakActionPayload.STREAM_CODEC, (payload, context) ->
        //        DurakActionPayload.handleServer(payload, (net.minecraft.server.level.ServerPlayer) context.player()));
        registrar.playToClient(TexasHoldemChipsPayload.TYPE, TexasHoldemChipsPayload.STREAM_CODEC, (payload, context) ->
                TexasHoldemChipsPayload.handleClient(payload));
    }
}
