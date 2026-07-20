package com.rawstudio.zigshop.net;

import com.rawstudio.zigshop.ZigShop;

import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.ResourceLocation;

/**
 * S→C : ouvre/rafraîchit l'écran de BANQUE du PNJ banquier. {@code json} = soldes (épargne et
 * risqué, éligible + en attente), delta depuis la dernière visite, historique récent, réglages
 * affichables (taux, plafond, frais). Voir {@code BankServerHandler#buildJson}.
 */
public record OpenBankPayload(String json) implements CustomPacketPayload {
    public static final Type<OpenBankPayload> TYPE =
            new Type<>(ResourceLocation.fromNamespaceAndPath(ZigShop.MODID, "open_bank"));
    public static final StreamCodec<FriendlyByteBuf, OpenBankPayload> CODEC =
            StreamCodec.composite(ByteBufCodecs.STRING_UTF8, OpenBankPayload::json, OpenBankPayload::new);

    @Override
    public Type<? extends CustomPacketPayload> type() {
        return TYPE;
    }
}
