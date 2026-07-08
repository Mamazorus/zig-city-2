package com.rawstudio.zigshop.net;

import com.rawstudio.zigshop.ZigShop;

import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.ResourceLocation;

/**
 * C→S : le joueur achète 1× l'offre {@code offerId} au PNJ d'identifiant réseau
 * {@code entityId}. Le prix n'est PAS transmis (le serveur le relit depuis Firebase pour
 * éviter toute triche de prix), seul l'identifiant de l'offre l'est.
 */
public record BuyOfferPayload(int entityId, String offerId) implements CustomPacketPayload {
    public static final Type<BuyOfferPayload> TYPE =
            new Type<>(ResourceLocation.fromNamespaceAndPath(ZigShop.MODID, "buy_offer"));
    public static final StreamCodec<FriendlyByteBuf, BuyOfferPayload> CODEC = StreamCodec.composite(
            ByteBufCodecs.VAR_INT, BuyOfferPayload::entityId,
            ByteBufCodecs.STRING_UTF8, BuyOfferPayload::offerId,
            BuyOfferPayload::new);

    @Override
    public Type<? extends CustomPacketPayload> type() {
        return TYPE;
    }
}
