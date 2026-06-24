package com.rawstudio.zigshop.net;

import com.rawstudio.zigshop.QuestServerHandler;
import com.rawstudio.zigshop.ZigShop;

import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.network.event.RegisterPayloadHandlersEvent;
import net.neoforged.neoforge.network.registration.PayloadRegistrar;

/**
 * Enregistrement des paquets réseau du mod (bus du MOD). 1 paquet S→C (ouvrir l'écran)
 * et 2 paquets C→S (accepter / réclamer une quête).
 *
 * <p>Le handler de {@code OpenQuestsPayload} référence une classe CLIENT
 * ({@code QuestClientHandler}) : comme il n'est exécuté que côté client (playToClient),
 * cette classe n'est chargée que là — le serveur dédié ne la touche jamais.
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
        registrar.playToServer(AcceptQuestPayload.TYPE, AcceptQuestPayload.CODEC,
                (payload, context) -> QuestServerHandler.accept(context, payload.questId()));
        registrar.playToServer(ClaimQuestPayload.TYPE, ClaimQuestPayload.CODEC,
                (payload, context) -> QuestServerHandler.claim(context, payload.questId()));
    }
}
