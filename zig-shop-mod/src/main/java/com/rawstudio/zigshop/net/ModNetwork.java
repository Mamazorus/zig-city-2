package com.rawstudio.zigshop.net;

import com.rawstudio.zigshop.BankServerHandler;
import com.rawstudio.zigshop.QuestServerHandler;
import com.rawstudio.zigshop.ShopServerHandler;
import com.rawstudio.zigshop.ZigShop;

import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.network.event.RegisterPayloadHandlersEvent;
import net.neoforged.neoforge.network.registration.PayloadRegistrar;

/**
 * Enregistrement des paquets réseau du mod (bus du MOD). S→C : ouvrir l'écran de quêtes,
 * synchroniser le journal des quêtes actives, ouvrir la boutique. C→S : accepter / réclamer /
 * annuler une quête, acheter une offre.
 *
 * <p>Les handlers S→C référencent des classes CLIENT ({@code QuestClientHandler},
 * {@code ActiveQuestsClient}, {@code ShopClientHandler}) : comme ils ne s'exécutent que côté
 * client (playToClient), ces classes ne sont chargées que là — le serveur dédié ne les touche jamais.
 */
@EventBusSubscriber(modid = ZigShop.MODID, bus = EventBusSubscriber.Bus.MOD)
public final class ModNetwork {
    private ModNetwork() {}

    @SubscribeEvent
    public static void register(RegisterPayloadHandlersEvent event) {
        PayloadRegistrar registrar = event.registrar("1");
        registrar.playToClient(OpenQuestsPayload.TYPE, OpenQuestsPayload.CODEC,
                (payload, context) -> context.enqueueWork(() ->
                        com.rawstudio.zigshop.client.QuestClientHandler.open(payload.json())));
        registrar.playToClient(SyncActiveQuestsPayload.TYPE, SyncActiveQuestsPayload.CODEC,
                (payload, context) -> context.enqueueWork(() ->
                        com.rawstudio.zigshop.client.ActiveQuestsClient.update(payload.json())));
        registrar.playToServer(AcceptQuestPayload.TYPE, AcceptQuestPayload.CODEC,
                (payload, context) -> QuestServerHandler.accept(context, payload.questId()));
        registrar.playToServer(ClaimQuestPayload.TYPE, ClaimQuestPayload.CODEC,
                (payload, context) -> QuestServerHandler.claim(context, payload.questId()));
        registrar.playToServer(CancelQuestPayload.TYPE, CancelQuestPayload.CODEC,
                (payload, context) -> QuestServerHandler.cancel(context, payload.questId()));
        // Boutique : ouverture (S→C) + achat d'une offre (C→S).
        registrar.playToClient(OpenShopPayload.TYPE, OpenShopPayload.CODEC,
                (payload, context) -> context.enqueueWork(() ->
                        com.rawstudio.zigshop.client.ShopClientHandler.open(payload.json())));
        registrar.playToServer(BuyOfferPayload.TYPE, BuyOfferPayload.CODEC,
                (payload, context) -> ShopServerHandler.buy(context, payload.entityId(), payload.offerId()));
        // Banque : ouverture (S→C) + dépôt/retrait/fermeture (C→S).
        registrar.playToClient(OpenBankPayload.TYPE, OpenBankPayload.CODEC,
                (payload, context) -> context.enqueueWork(() ->
                        com.rawstudio.zigshop.client.BankClientHandler.open(payload.json())));
        registrar.playToServer(BankActionPayload.TYPE, BankActionPayload.CODEC,
                (payload, context) -> BankServerHandler.handle(context, payload.entityId(), payload.action(), payload.accountType(), payload.amount()));
    }
}
