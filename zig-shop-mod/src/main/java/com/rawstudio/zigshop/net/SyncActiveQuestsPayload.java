package com.rawstudio.zigshop.net;

import com.rawstudio.zigshop.ZigShop;

import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.network.codec.ByteBufCodecs;
import net.minecraft.network.codec.StreamCodec;
import net.minecraft.network.protocol.common.custom.CustomPacketPayload;
import net.minecraft.resources.ResourceLocation;

/**
 * S→C : pousse la liste des quêtes ACTIVES du joueur (acceptées + complétées) pour le journal
 * de quêtes du launcher/inventaire. {@code json} a la même forme que l'écran du PNJ mais est
 * construit UNIQUEMENT depuis l'état du joueur ({@link com.rawstudio.zigshop.QuestState}) — aucun
 * accès Firebase, donc envoyable à tout moment (connexion, progression, accept/annule/réclame).
 */
public record SyncActiveQuestsPayload(String json) implements CustomPacketPayload {
    public static final Type<SyncActiveQuestsPayload> TYPE =
            new Type<>(ResourceLocation.fromNamespaceAndPath(ZigShop.MODID, "sync_active_quests"));
    public static final StreamCodec<FriendlyByteBuf, SyncActiveQuestsPayload> CODEC =
            StreamCodec.composite(ByteBufCodecs.STRING_UTF8, SyncActiveQuestsPayload::json, SyncActiveQuestsPayload::new);

    @Override
    public Type<? extends CustomPacketPayload> type() {
        return TYPE;
    }
}
