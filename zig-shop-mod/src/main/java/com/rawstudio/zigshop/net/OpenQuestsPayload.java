package com.rawstudio.zigshop.net;

import com.rawstudio.zigshop.ZigShop;

import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.ResourceLocation;

/** S→C : ouvre/rafraîchit l'écran de quêtes. {@code json} = liste des quêtes + état du joueur. */
public record OpenQuestsPayload(String json) implements CustomPacketPayload {
    public static final Type<OpenQuestsPayload> TYPE =
            new Type<>(ResourceLocation.fromNamespaceAndPath(ZigShop.MODID, "open_quests"));
    public static final StreamCodec<FriendlyByteBuf, OpenQuestsPayload> CODEC =
            StreamCodec.composite(ByteBufCodecs.STRING_UTF8, OpenQuestsPayload::json, OpenQuestsPayload::new);

    @Override
    public Type<? extends CustomPacketPayload> type() {
        return TYPE;
    }
}
