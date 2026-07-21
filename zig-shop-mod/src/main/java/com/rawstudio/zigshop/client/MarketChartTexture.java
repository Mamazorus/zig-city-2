package com.rawstudio.zigshop.client;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.blaze3d.platform.NativeImage;
import com.rawstudio.zigshop.ZigShop;

import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.resources.ResourceLocation;

import java.util.ArrayList;
import java.util.List;

/**
 * Texture DYNAMIQUE (pleine résolution/couleur, cf. {@code NpcSkinTextures} pour le même
 * mécanisme {@link DynamicTexture} + {@link NativeImage}) dessinant le graphique en bougies du
 * taux RISQUÉ pour {@code MarketScreenEntity} (écran mural). UNE seule texture partagée pour
 * TOUTES les instances de l'écran (la série est identique partout) — régénérée entièrement à
 * chaque nouvel historique reçu du serveur ({@link #update}), jamais à chaque frame.
 *
 * <p>Volontairement SANS texte (dates/pourcentages) : dessiner des glyphes dans un
 * {@link NativeImage} brut (hors pipeline de police normal) ajoute une complexité qui n'apporte
 * rien à un écran fait pour être lu de loin — seule la COURBE compte ici (le détail chiffré reste
 * dans l'écran banque, cf. {@code BankScreen}).
 *
 * <p>⚠️ {@link NativeImage#setPixelRGBA} attend un entier au format <b>ABGR</b> (octet de poids
 * faible = rouge), PAS l'ARGB habituel de {@code GuiGraphics.fill}/AWT — {@link #argb} fait la
 * conversion ; se tromper inverse rouge et bleu à l'écran.
 */
public final class MarketChartTexture {
    private MarketChartTexture() {}

    private static final int WIDTH = 256;
    private static final int HEIGHT = 320;
    private static final ResourceLocation LOCATION =
            ResourceLocation.fromNamespaceAndPath(ZigShop.MODID, "market_chart");

    private static final int BG = argb(255, 14, 11, 22);       // 0x0E0B16, cohérent avec le reste du mod
    private static final int GRID = argb(60, 255, 255, 255);
    private static final int CANDLE_UP = argb(255, 0x55, 0xFF, 0x55);
    private static final int CANDLE_DOWN = argb(255, 0xFF, 0x55, 0x55);

    private static DynamicTexture texture;
    private static List<Candle> lastCandles = List.of();

    private record Candle(double pct, double open, double close) {}

    /** {@link ResourceLocation} à lier pour le rendu (crée/enregistre la texture au 1er appel). */
    public static ResourceLocation location() {
        ensureTexture();
        return LOCATION;
    }

    /** Reçoit un nouvel historique (JSON {@code [{date,pct,open,close}, …]}, cf.
     *  {@code BankAccountData#riskyCandlesJson}) et redessine la texture entière. */
    public static void update(String json) {
        List<Candle> candles = parse(json);
        lastCandles = candles;
        ensureTexture();
        redraw(candles);
    }

    private static void ensureTexture() {
        if (texture != null) {
            return;
        }
        NativeImage image = new NativeImage(NativeImage.Format.RGBA, WIDTH, HEIGHT, false);
        texture = new DynamicTexture(image);
        Minecraft.getInstance().getTextureManager().register(LOCATION, texture);
        redraw(lastCandles);
    }

    private static List<Candle> parse(String json) {
        List<Candle> out = new ArrayList<>();
        try {
            JsonArray arr = JsonParser.parseString(json).getAsJsonArray();
            for (JsonElement el : arr) {
                JsonObject o = el.getAsJsonObject();
                out.add(new Candle(
                        o.has("pct") ? o.get("pct").getAsDouble() : 0,
                        o.has("open") ? o.get("open").getAsDouble() : 0,
                        o.has("close") ? o.get("close").getAsDouble() : 0));
            }
        } catch (RuntimeException ignored) {
            // JSON invalide : on garde l'historique precedent plutot que d'effacer l'ecran.
            return lastCandles;
        }
        return out;
    }

    private static void redraw(List<Candle> candles) {
        if (texture == null) {
            return;
        }
        NativeImage img = texture.getPixels();
        if (img == null) {
            return;
        }
        fillRect(img, 0, 0, WIDTH, HEIGHT, BG);

        if (candles.isEmpty()) {
            texture.upload();
            return;
        }

        int marginX = 12;
        int marginY = 16;
        int plotLeft = marginX;
        int plotRight = WIDTH - marginX;
        int plotTop = marginY;
        int plotBottom = HEIGHT - marginY;

        double minV = Double.MAX_VALUE;
        double maxV = -Double.MAX_VALUE;
        for (Candle c : candles) {
            minV = Math.min(minV, Math.min(c.open(), c.close()));
            maxV = Math.max(maxV, Math.max(c.open(), c.close()));
        }
        double pad = Math.max(1.0, (maxV - minV) * 0.12);
        minV -= pad;
        maxV += pad;
        double range = Math.max(0.0001, maxV - minV);

        // 3 lignes de repere horizontales (haut / milieu / bas de la plage affichee).
        for (int i = 0; i <= 2; i++) {
            int y = plotTop + i * (plotBottom - plotTop) / 2;
            fillRect(img, plotLeft, y, plotRight, y + 1, GRID);
        }

        float slotW = (plotRight - plotLeft) / (float) candles.size();
        int bodyW = Math.max(2, (int) (slotW * 0.6f));

        for (int i = 0; i < candles.size(); i++) {
            Candle c = candles.get(i);
            int cx = plotLeft + Math.round(i * slotW + slotW / 2f);
            int yOpen = plotBottom - (int) Math.round((c.open() - minV) / range * (plotBottom - plotTop));
            int yClose = plotBottom - (int) Math.round((c.close() - minV) / range * (plotBottom - plotTop));
            int yTop = Math.min(yOpen, yClose);
            int yBot = Math.max(yOpen, yClose);
            if (yBot - yTop < 2) {
                yBot = yTop + 2;
            }
            int color = c.close() >= c.open() ? CANDLE_UP : CANDLE_DOWN;
            fillRect(img, cx - bodyW / 2, yTop, cx - bodyW / 2 + bodyW, yBot, color);
        }

        texture.upload();
    }

    private static void fillRect(NativeImage img, int x0, int y0, int x1, int y1, int color) {
        int minX = Math.max(0, x0);
        int minY = Math.max(0, y0);
        int maxX = Math.min(WIDTH, x1);
        int maxY = Math.min(HEIGHT, y1);
        for (int y = minY; y < maxY; y++) {
            for (int x = minX; x < maxX; x++) {
                img.setPixelRGBA(x, y, color);
            }
        }
    }

    /** Conversion ARGB (intuitif : {@code alpha,rouge,vert,bleu}) → l'ABGR attendu par
     *  {@link NativeImage#setPixelRGBA} (cf. javadoc de classe). */
    private static int argb(int a, int r, int g, int b) {
        return (a << 24) | (b << 16) | (g << 8) | r;
    }
}
