package com.rawstudio.zigshop.net;

import com.rawstudio.zigshop.BankAccountData;

import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.neoforged.neoforge.network.PacketDistributor;

/**
 * Diffuse l'historique (bougies) du taux RISQUÉ partagé (cf. {@link BankAccountData#riskyCandlesJson})
 * à des joueurs, pour les écrans muraux {@code MarketScreenEntity} (cf.
 * {@code client.MarketChartTexture}). Séparé de {@link BankAccountData} pour ne pas lui faire
 * connaître le réseau/la liste des joueurs — {@code BankAccountData} reste un simple stockage.
 */
public final class MarketScreenNetwork {
    private MarketScreenNetwork() {}

    /** À TOUS les joueurs connectés (liste courte, identique pour tout le monde — pas la peine
     *  de filtrer par proximité d'un écran) : appelé à chaque nouveau cycle RISQUÉ. */
    public static void broadcast(MinecraftServer server, BankAccountData data) {
        MarketChartPayload payload = new MarketChartPayload(data.riskyCandlesJson().toString());
        for (ServerPlayer p : server.getPlayerList().getPlayers()) {
            PacketDistributor.sendToPlayer(p, payload);
        }
    }

    /** À UN joueur (connexion) : pour qu'un écran mural affiche tout de suite l'état courant sans
     *  attendre le prochain cycle. */
    public static void sendTo(ServerPlayer player, BankAccountData data) {
        PacketDistributor.sendToPlayer(player, new MarketChartPayload(data.riskyCandlesJson().toString()));
    }
}
