# Charta Addon Development Guide

## Overview

A Charta addon is a normal multiloader mod that plugs game logic into Charta's game registry and menu flow.
With the current API, each loader registers its own `GameType`, `MenuType`, and payload handlers directly, while shared gameplay code stays in `common/`.

This repository is a reference implementation of that pattern.

## What this addon registers

- **Game types**: Blackjack and Texas Hold'em
- **Menu types**: one menu per game
- **Client screens**: one screen per menu
- **Custom payloads**: action packets for both games and a client sync packet for poker chip state
- **Extra table rendering**: 3D chip stacks for Texas Hold'em tables

## Recommended project structure

```text
my-addon/
  common/
    src/main/java/com/example/myaddon/
      MyAddon.java
      game/
        blackjack/
          BlackjackGame.java
          BlackjackMenu.java
          BlackjackScreen.java
      network/
        BlackjackActionPayload.java
  fabric/
    src/main/java/com/example/myaddon/fabric/
      MyAddonFabric.java
      MyAddonFabricClient.java
  neoforge/
    src/main/java/com/example/myaddon/neoforge/
      MyAddonNeoForge.java
```

## Shared bridge class

Keep loader-independent references in a common class so menus, screens, and game logic can resolve the active registrations without importing Fabric or NeoForge APIs.

```java
public final class MyAddon {

    public static final String MOD_ID = "my_addon";

    public static Supplier<GameType<MyGame, MyMenu>> MY_GAME;
    public static Supplier<MenuType<MyMenu>> MY_MENU;

    public static void init() {
    }

    private MyAddon() {
    }
}
```

The loader entrypoint is responsible for assigning those suppliers during startup.

## Fabric registration

On Fabric, register the game type in Charta's game registry, register the menu in the vanilla menu registry, then wire payload codecs and handlers with Fabric networking APIs.

```java
public class MyAddonFabric implements ModInitializer {

    @Override
    public void onInitialize() {
        MyAddon.init();

        GameType<MyGame, MyMenu> game = Registry.register(
                Games.getRegistry(),
                ResourceLocation.fromNamespaceAndPath(MyAddon.MOD_ID, "my_game"),
                MyGame::new
        );
        MyAddon.MY_GAME = () -> game;

        MenuType<MyMenu> menu = Registry.register(
                BuiltInRegistries.MENU,
                ResourceLocation.fromNamespaceAndPath(MyAddon.MOD_ID, "my_game"),
                new ExtendedScreenHandlerType<>(MyMenu::new, AbstractCardMenu.Definition.STREAM_CODEC)
        );
        MyAddon.MY_MENU = () -> menu;

        PayloadTypeRegistry.playC2S().register(MyActionPayload.TYPE, MyActionPayload.STREAM_CODEC);
        ServerPlayNetworking.registerGlobalReceiver(MyActionPayload.TYPE, (payload, context) ->
                MyActionPayload.handleServer(payload, context.player(), context.server()));
    }
}
```

Client-only Fabric setup is separate:

```java
public class MyAddonFabricClient implements ClientModInitializer {

    @Override
    public void onInitializeClient() {
        MenuScreens.register(MyAddon.MY_MENU.get(), MyScreen::new);
    }
}
```

## NeoForge registration

On NeoForge, use `DeferredRegister` for game types and menus, then register payload handlers from the mod event bus.

```java
@Mod(MyAddon.MOD_ID)
public class MyAddonNeoForge {

    private static final DeferredRegister<GameType<?, ?>> GAME_TYPES =
            DeferredRegister.create(Games.REGISTRY_KEY, MyAddon.MOD_ID);
    private static final DeferredRegister<MenuType<?>> MENU_TYPES =
            DeferredRegister.create(Registries.MENU, MyAddon.MOD_ID);

    private static final Supplier<GameType<MyGame, MyMenu>> MY_GAME =
            GAME_TYPES.register("my_game", () -> MyGame::new);
    private static final Supplier<MenuType<MyMenu>> MY_MENU =
            MENU_TYPES.register("my_game", () -> IMenuTypeExtension.create((containerId, inventory, extraData) ->
                    new MyMenu(containerId, inventory, AbstractCardMenu.Definition.STREAM_CODEC.decode(extraData))));

    public MyAddonNeoForge(IEventBus modBus) {
        MyAddon.init();
        GAME_TYPES.register(modBus);
        MENU_TYPES.register(modBus);

        MyAddon.MY_GAME = MY_GAME;
        MyAddon.MY_MENU = MY_MENU;

        modBus.addListener(this::registerPayloadHandlers);
    }

    private void registerPayloadHandlers(RegisterPayloadHandlersEvent event) {
        var registrar = event.registrar("1");
        registrar.playToServer(MyActionPayload.TYPE, MyActionPayload.STREAM_CODEC, (payload, context) ->
                MyActionPayload.handleServer(payload, (ServerPlayer) context.player()));
    }
}
```

Client registration can be attached conditionally from the same mod constructor:

```java
if (FMLEnvironment.dist == Dist.CLIENT) {
    modBus.addListener((RegisterMenuScreensEvent event) -> {
        event.register(MY_MENU.get(), MyScreen::new);
    });
}
```

## Implementing a game

Extend `Game<G, M>` and keep the implementation free of loader-specific APIs.

Key points from this addon:

- Return menus through `createMenu(...)`.
- Resolve your active game type and menu type through the suppliers initialized by the loader.
- Keep per-player turn state stable even when players fold, bust, or run out of chips.
- Treat payloads as input transport only; validate every action against the server-side game state.

Minimal example:

```java
public class MyGame extends Game<MyGame, MyMenu> {

    public MyGame(List<CardPlayer> players, Deck deck) {
        super(players, deck);
    }

    @Override
    public MyMenu createMenu(int containerId, Inventory playerInventory, AbstractCardMenu.Definition definition) {
        return new MyMenu(containerId, playerInventory, definition);
    }

    @Override
    public List<GameOption<?>> getOptions() {
        return List.of();
    }
}
```

## Implementing a menu

Menus extend `AbstractCardMenu<G, M>` and use the loader-populated `MenuType` supplier directly.

```java
public class MyMenu extends AbstractCardMenu<MyGame, MyMenu> {

    public MyMenu(int containerId, Inventory inventory, Definition definition) {
        super(MyAddon.MY_MENU.get(), containerId, inventory, definition);
    }

    @Override
    public GameType<MyGame, MyMenu> getGameType() {
        return MyAddon.MY_GAME.get();
    }
}
```

This is one of the major API changes compared with the older addon docs: you no longer return a wrapped advanced menu entry from the common game or menu code.

## Custom payloads

This addon uses custom payload records with explicit `TYPE` and `STREAM_CODEC` fields.

Pattern:

```java
public record MyActionPayload(int action) implements CustomPacketPayload {

    public static final Type<MyActionPayload> TYPE =
            new Type<>(ResourceLocation.fromNamespaceAndPath("my_addon", "my_action"));

    public static final StreamCodec<ByteBuf, MyActionPayload> STREAM_CODEC =
            StreamCodec.composite(ByteBufCodecs.VAR_INT, MyActionPayload::action, MyActionPayload::new);

    public static void handleServer(MyActionPayload payload, ServerPlayer player) {
        // Validate current menu, current player, and allowed action set here.
    }

    @Override
    public Type<? extends CustomPacketPayload> type() {
        return TYPE;
    }
}
```

Current payloads in this repository:

- `BlackjackActionPayload`: client to server input for betting and turn actions
- `TexasHoldemActionPayload`: client to server input for fold/call/raise/all-in
- `TexasHoldemChipsPayload`: server to client chip-state sync for table rendering and spectators

## Rendering hooks

If your addon needs extra visuals on the card table, register them from client setup rather than hard-coding platform-specific renderer state in common logic.

This addon uses:

```java
ChartaModClient.registerExtraRenderer(predicate, renderer);
```

`PokerChipRenderer` filters by `TexasHoldem` game type and renders colored chip discs using the synced chip payload data.

## Assets and namespaces

Keep addon assets under your own namespace, not under Charta's namespace.

Example from this repository:

```text
common/src/main/resources/assets/charta_casino/textures/gui/game/blackjack.png
common/src/main/resources/assets/charta_casino/textures/gui/game/texas_holdem.png
```

## Gradle dependencies

This project now consumes Charta from Maven instead of referencing locally built jars.

`common/build.gradle`

```groovy
implementation "dev.lucaargolo:charta-common-1.21.1:${charta_version}"
```

`fabric/build.gradle`

```groovy
modImplementation "dev.lucaargolo:charta-fabric-1.21.1:${charta_version}"
```

`neoforge/build.gradle`

```groovy
implementation "dev.lucaargolo:charta-neoforge-1.21.1:${charta_version}"
```

`gradle.properties`

```properties
charta_version=1.2.1
```

## Practical guidance

- Keep gameplay logic in `common/` and loader wiring in `fabric/` or `neoforge/` only.
- Do not trust payload data by itself; validate menu type, acting player, phase, and allowed actions on the server.
- Use shared suppliers to avoid duplicating menu and game references across platforms.
- Register screens and render hooks only on the client side.
- Prefer your own addon namespace for textures, lang keys, and payload ids.

## Current reference files

- `common/src/main/java/by/deokma/casino/CasinoAddon.java`
- `fabric/src/main/java/by/deokma/casino/fabric/CasinoAddonFabric.java`
- `fabric/src/main/java/by/deokma/casino/fabric/CasinoAddonFabricClient.java`
- `neoforge/src/main/java/by/deokma/casino/neoforge/CasinoAddonNeoForge.java`
- `common/src/main/java/by/deokma/casino/network/BlackjackActionPayload.java`
- `common/src/main/java/by/deokma/casino/network/TexasHoldemActionPayload.java`
- `common/src/main/java/by/deokma/casino/network/TexasHoldemChipsPayload.java`
