package by.deokma.casino.network;

import by.deokma.casino.game.blackjack.BlackjackGame;
import by.deokma.casino.game.blackjack.BlackjackMenu;
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

public record BlackjackActionPayload(int action) implements CustomPacketPayload {

    public static final Type<BlackjackActionPayload> TYPE =
            new Type<>(ResourceLocation.fromNamespaceAndPath("charta_casino", "blackjack_action"));

    public static final StreamCodec<ByteBuf, BlackjackActionPayload> STREAM_CODEC =
            StreamCodec.composite(
                    ByteBufCodecs.VAR_INT, BlackjackActionPayload::action,
                    BlackjackActionPayload::new);

    public static void handleServer(BlackjackActionPayload payload, ServerPlayer player, Executor executor) {
        executor.execute(() -> handleServer(payload, player));
    }

    public static void handleServer(BlackjackActionPayload payload, ServerPlayer player) {
        if (!(player.containerMenu instanceof BlackjackMenu menu)) return;

        CardPlayer cardPlayer = ((LivingEntityMixed) player).charta_getCardPlayer();
        BlackjackGame game = menu.getGame();
        int idx = game.getPlayers().indexOf(cardPlayer);
        if (idx < 0) return;

        int action = payload.action();
        if (action >= BlackjackGame.ACTION_BET) {
            if (game.getPhase() == BlackjackGame.Phase.BETTING) {
                game.handleBet(idx, action - BlackjackGame.ACTION_BET);
            }
            return;
        }

        CardPlayer currentPlayer = game.getCurrentPlayer();
        if (currentPlayer == null || currentPlayer != cardPlayer) return;

        boolean valid = action == BlackjackGame.ACTION_HIT
                || action == BlackjackGame.ACTION_STAND
                || action == BlackjackGame.ACTION_DOUBLE;
        if (!valid) return;

        cardPlayer.play(new GamePlay(List.of(), action));
    }

    @Override
    public @NotNull Type<? extends CustomPacketPayload> type() { return TYPE; }
}

