package com.rawstudio.zigshop.net;

import com.rawstudio.zigshop.ZigShop;

import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.ResourceLocation;

/** C→S : le joueur accepte la quête {@code questId}. */
public record AcceptQuestPayload(String questId) implements CustomPacketPayload {
    public static final Type<AcceptQuestPayload> TYPE =
            new Type<>(ResourceLocation.fromNamespaceAndPath(ZigShop.MODID, "accept_quest"));
    public static final StreamCodec<FriendlyByteBuf, AcceptQuestPayload> CODEC =
            StreamCodec.composite(ByteBufCodecs.STRING_UTF8, AcceptQuestPayload::questId, AcceptQuestPayload::new);

    @Override
    public Type<? extends CustomPacketPayload> type() {
        return TYPE;
    }
}
