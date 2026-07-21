package com.rawstudio.zigshop.net;

import com.rawstudio.zigshop.ZigShop;

import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.ResourceLocation;

/**
 * S→C : historique (bougies) du taux RISQUÉ partagé, pour les écrans muraux
 * {@code MarketScreenEntity}. {@code json} = même tableau {@code {date, pct, open, close}} que
 * {@code riskyHistory} dans {@code BankServerHandler#buildJson} (cf. {@code BankAccountData
 * #riskyCandlesJson}) — diffusé à TOUS les joueurs (pas juste ceux près d'un écran : la liste est
 * petite et identique pour tout le monde) à chaque nouveau cycle + à la connexion.
 */
public record MarketChartPayload(String json) implements CustomPacketPayload {
    public static final Type<MarketChartPayload> TYPE =
            new Type<>(ResourceLocation.fromNamespaceAndPath(ZigShop.MODID, "market_chart"));
    public static final StreamCodec<FriendlyByteBuf, MarketChartPayload> CODEC =
            StreamCodec.composite(ByteBufCodecs.STRING_UTF8, MarketChartPayload::json, MarketChartPayload::new);

    @Override
    public Type<? extends CustomPacketPayload> type() {
        return TYPE;
    }
}
