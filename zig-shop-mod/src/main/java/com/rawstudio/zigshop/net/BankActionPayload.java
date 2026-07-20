package com.rawstudio.zigshop.net;

import com.rawstudio.zigshop.ZigShop;

import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.ResourceLocation;

/**
 * C→S : action sur la banque au PNJ d'identifiant réseau {@code entityId}. {@code action} =
 * "deposit" / "withdraw" / "close" ; {@code accountType} = "savings" / "risky" (ignoré pour
 * "close") ; {@code amount} = quantité de monnaie demandée (ignoré pour "close"). Le serveur
 * revalide tout (solde réel, item en inventaire, config à jour) — le client n'est jamais source
 * de vérité, comme {@link BuyOfferPayload}. "close" fait avancer le repère « dernière visite »
 * (cf. {@code BankAccountData#markSeen}) : envoyé par l'écran à sa fermeture.
 */
public record BankActionPayload(int entityId, String action, String accountType, int amount) implements CustomPacketPayload {
    public static final Type<BankActionPayload> TYPE =
            new Type<>(ResourceLocation.fromNamespaceAndPath(ZigShop.MODID, "bank_action"));
    public static final StreamCodec<FriendlyByteBuf, BankActionPayload> CODEC = StreamCodec.composite(
            ByteBufCodecs.VAR_INT, BankActionPayload::entityId,
            ByteBufCodecs.STRING_UTF8, BankActionPayload::action,
            ByteBufCodecs.STRING_UTF8, BankActionPayload::accountType,
            ByteBufCodecs.VAR_INT, BankActionPayload::amount,
            BankActionPayload::new);

    @Override
    public Type<? extends CustomPacketPayload> type() {
        return TYPE;
    }
}
