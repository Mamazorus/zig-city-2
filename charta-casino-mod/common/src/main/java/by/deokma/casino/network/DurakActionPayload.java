package by.deokma.casino.network;

import by.deokma.casino.game.durak.DurakGame;
import by.deokma.casino.game.durak.DurakMenu;
import dev.lucaargolo.charta.common.game.api.CardPlayer;
import dev.lucaargolo.charta.mixed.LivingEntityMixed;
import io.netty.buffer.ByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import org.jetbrains.annotations.NotNull;

import java.util.concurrent.Executor;

public record DurakActionPayload(int action) implements CustomPacketPayload {

    public static final Type<DurakActionPayload> TYPE =
            new Type<>(ResourceLocation.fromNamespaceAndPath("charta_casino", "durak_action"));

    public static final StreamCodec<ByteBuf, DurakActionPayload> STREAM_CODEC =
            StreamCodec.composite(
                    ByteBufCodecs.VAR_INT, DurakActionPayload::action,
                    DurakActionPayload::new);

    public static void handleServer(DurakActionPayload payload, ServerPlayer player, Executor executor) {
        executor.execute(() -> handleServer(payload, player));
    }

    public static void handleServer(DurakActionPayload payload, ServerPlayer player) {
        if (!(player.containerMenu instanceof DurakMenu menu)) return;
        CardPlayer cp = ((LivingEntityMixed) player).charta_getCardPlayer();
        DurakGame game = menu.getGame();
        int idx = game.getPlayers().indexOf(cp);
        if (idx < 0) return;
        game.handleAction(idx, payload.action());
    }

    @Override public @NotNull Type<? extends CustomPacketPayload> type() { return TYPE; }
}
