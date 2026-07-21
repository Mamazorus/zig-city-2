package com.rawstudio.zigshop.client;

/**
 * Réception client du paquet S→C {@code MarketChartPayload} : redessine la texture partagée de
 * l'écran mural (cf. {@link MarketChartTexture}). CLIENT uniquement.
 */
public final class MarketChartClientHandler {
    private MarketChartClientHandler() {}

    public static void update(String json) {
        MarketChartTexture.update(json);
    }
}
