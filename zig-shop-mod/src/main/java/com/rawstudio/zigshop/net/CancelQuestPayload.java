package com.rawstudio.zigshop.net;

import com.rawstudio.zigshop.ZigShop;

import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.ResourceLocation;

/** C→S : le joueur annule la quête {@code questId} en cours (la remet disponible, libère un emplacement). */
public record CancelQuestPayload(String questId) implements CustomPacketPayload {
    public static final Type<CancelQuestPayload> TYPE =
            new Type<>(ResourceLocation.fromNamespaceAndPath(ZigShop.MODID, "cancel_quest"));
    public static final StreamCodec<FriendlyByteBuf, CancelQuestPayload> CODEC =
            StreamCodec.composite(ByteBufCodecs.STRING_UTF8, CancelQuestPayload::questId, CancelQuestPayload::new);

    @Override
    public Type<? extends CustomPacketPayload> type() {
        return TYPE;
    }
}
