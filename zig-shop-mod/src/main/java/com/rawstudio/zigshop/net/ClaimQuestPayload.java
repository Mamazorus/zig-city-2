package com.rawstudio.zigshop.net;

import com.rawstudio.zigshop.ZigShop;

import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.ResourceLocation;

/** C→S : le joueur réclame la récompense de la quête {@code questId} (si complétée). */
public record ClaimQuestPayload(String questId) implements CustomPacketPayload {
    public static final Type<ClaimQuestPayload> TYPE =
            new Type<>(ResourceLocation.fromNamespaceAndPath(ZigShop.MODID, "claim_quest"));
    public static final StreamCodec<FriendlyByteBuf, ClaimQuestPayload> CODEC =
            StreamCodec.composite(ByteBufCodecs.STRING_UTF8, ClaimQuestPayload::questId, ClaimQuestPayload::new);

    @Override
    public Type<? extends CustomPacketPayload> type() {
        return TYPE;
    }
}
