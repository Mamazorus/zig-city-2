package by.deokma.casino.network;

import by.deokma.casino.game.texasholdem.TexasHoldemGame;
import by.deokma.casino.game.texasholdem.TexasHoldemMenu;
import dev.lucaargolo.charta.common.ChartaMod;
import dev.lucaargolo.charta.common.game.api.CardPlayer;
import dev.lucaargolo.charta.common.game.api.GamePlay;
import dev.lucaargolo.charta.mixed.LivingEntityMixed;
import io.netty.buffer.ByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import org.jetbrains.annotations.NotNull;

import java.util.List;
import java.util.concurrent.Executor;

public record TexasHoldemActionPayload(int action) implements CustomPacketPayload {

    public static final Type<TexasHoldemActionPayload> TYPE =
            new Type<>(ResourceLocation.fromNamespaceAndPath("charta_casino", "texas_holdem_action"));

    public static final StreamCodec<ByteBuf, TexasHoldemActionPayload> STREAM_CODEC =
            StreamCodec.composite(
                    ByteBufCodecs.VAR_INT,
                    TexasHoldemActionPayload::action,
                    TexasHoldemActionPayload::new);

    public static void handleServer(TexasHoldemActionPayload payload, ServerPlayer player, Executor executor) {
        executor.execute(() -> handleServer(payload, player));
    }

    public static void handleServer(TexasHoldemActionPayload payload, ServerPlayer player) {
        if (!(player.containerMenu instanceof TexasHoldemMenu menu)) return;

        CardPlayer cardPlayer = ((LivingEntityMixed) player).charta_getCardPlayer();
        TexasHoldemGame game = menu.getGame();

        CardPlayer currentPlayer = game.getCurrentPlayer();
        if (currentPlayer == null || currentPlayer != cardPlayer) return;

        int action = payload.action();
        boolean valid = action == TexasHoldemGame.ACTION_FOLD
                || action == TexasHoldemGame.ACTION_CALL
                || action == TexasHoldemGame.ACTION_RAISE_MIN
                || action == TexasHoldemGame.ACTION_ALL_IN
                || action >= TexasHoldemGame.ACTION_RAISE_CUSTOM;
        if (!valid) {
            ChartaMod.LOGGER.warn("TexasHoldemActionPayload: unknown action {} from {}",
                    action, player.getName().getString());
            return;
        }

        cardPlayer.play(new GamePlay(List.of(), action));
    }

    @Override
    public @NotNull Type<? extends CustomPacketPayload> type() { return TYPE; }
}

