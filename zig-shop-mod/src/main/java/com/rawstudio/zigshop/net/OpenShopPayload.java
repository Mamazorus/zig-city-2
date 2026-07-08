package com.rawstudio.zigshop.net;

import com.rawstudio.zigshop.ZigShop;

import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.ResourceLocation;

/**
 * S→C : ouvre/rafraîchit l'écran de BOUTIQUE du PNJ marchand. {@code json} = titre + id
 * de l'entité (pour les achats) + solde du joueur + liste des offres (prix, quota, quantité
 * possédée). Le paiement se fait en un clic depuis l'inventaire (voir {@code ShopScreen}),
 * ce qui lève la limite de « 1 pile » du troc villageois natif (prix > 64 possibles).
 */
public record OpenShopPayload(String json) implements CustomPacketPayload {
    public static final Type<OpenShopPayload> TYPE =
            new Type<>(ResourceLocation.fromNamespaceAndPath(ZigShop.MODID, "open_shop"));
    public static final StreamCodec<FriendlyByteBuf, OpenShopPayload> CODEC =
            StreamCodec.composite(ByteBufCodecs.STRING_UTF8, OpenShopPayload::json, OpenShopPayload::new);

    @Override
    public Type<? extends CustomPacketPayload> type() {
        return TYPE;
    }
}
