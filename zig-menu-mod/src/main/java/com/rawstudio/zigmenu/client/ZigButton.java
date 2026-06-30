package com.rawstudio.zigmenu.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.AbstractButton;
import net.minecraft.client.gui.narration.NarrationElementOutput;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;

/**
 * Bouton "pierre" sobre, facon jeu de base : aplat gris + GRAIN de pierre vanilla
 * (stone) carrele puis attenue (~20 % d'opacite) par un voile gris, + relief doux.
 * Bordure sombre par defaut, DOREE pour le bouton principal ZIG CITY. Libelle blanc
 * avec ombre. Le voile (un simple g.fill) garantit que la texture reste discrete,
 * sans dependre de l'alpha d'un blit.
 */
public class ZigButton extends AbstractButton {

    // Texture de pierre lisse vanilla (suit le resource pack du joueur).
    private static final ResourceLocation TEX =
            ResourceLocation.fromNamespaceAndPath("minecraft", "textures/block/stone.png");
    private static final int TILE = 16;

    // Voile gris pose SUR la texture pleine : alpha 0xCC (80 %) -> le grain de pierre ne
    // ressort qu'a ~20 %. La couleur RGB (0x767679) est l'aplat gris "pierre" de fond.
    private static final int VEIL        = 0xCC767679;
    private static final int BASE        = 0xFF767679;   // aplat sous la texture (bords)
    private static final int TEXT        = 0xFFFFFFFF;
    private static final int BORDER      = 0xFF1C1C1E;
    private static final int BORDER_HOV  = 0xFFFFFFFF;
    private static final int GOLD        = 0xFFFFD157;   // lisere dore (assorti au logo)
    private static final int GOLD_HOV    = 0xFFFFE9A6;

    private final Runnable action;
    private final boolean gold;

    public ZigButton(int x, int y, int width, int height, Component label, Runnable action) {
        this(x, y, width, height, label, action, false);
    }

    public ZigButton(int x, int y, int width, int height, Component label, Runnable action, boolean gold) {
        super(x, y, width, height, label);
        this.action = action;
        this.gold = gold;
    }

    @Override
    public void onPress() {
        this.action.run();
    }

    @Override
    protected void renderWidget(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        boolean hov = this.isHoveredOrFocused();
        int x = this.getX(), y = this.getY(), w = this.getWidth(), h = this.getHeight();
        int b = Math.max(2, h / 14);

        // 1) Aplat gris (visible sous le grain, et au cas ou la texture manquerait).
        g.fill(x, y, x + w, y + h, BASE);

        // 2) Grain de pierre carrele (clippe au bouton), puis attenue par le voile gris
        //    -> texture discrete ~20 %, facon bouton du jeu de base.
        g.enableScissor(x, y, x + w, y + h);
        for (int ty = y; ty < y + h; ty += TILE) {
            for (int tx = x; tx < x + w; tx += TILE) {
                g.blit(TEX, tx, ty, 0f, 0f, TILE, TILE, TILE, TILE);
            }
        }
        g.disableScissor();
        g.fill(x, y, x + w, y + h, VEIL);

        // 3) Relief doux : aretes claires en haut/gauche, sombres en bas/droite.
        if (hov) {
            g.fill(x, y, x + w, y + h, 0x18FFFFFF);
        }
        g.fill(x, y, x + w, y + b, 0x2AFFFFFF);             // haut clair
        g.fill(x, y, x + b, y + h, 0x2AFFFFFF);             // gauche clair
        g.fill(x, y + h - b, x + w, y + h, 0x37000000);     // bas sombre
        g.fill(x + w - b, y, x + w, y + h, 0x37000000);     // droite sombre

        // 4) Bordure : doree (ZIG CITY) ou sombre ; plus claire au survol.
        int bc = this.gold ? (hov ? GOLD_HOV : GOLD) : (hov ? BORDER_HOV : BORDER);
        int bw = this.gold ? 2 : 1;
        g.fill(x, y, x + w, y + bw, bc);
        g.fill(x, y + h - bw, x + w, y + h, bc);
        g.fill(x, y, x + bw, y + h, bc);
        g.fill(x + w - bw, y, x + w, y + h, bc);

        // 5) Libelle centre, blanc + ombre (contraste sur la pierre).
        Font font = Minecraft.getInstance().font;
        int tw = font.width(this.getMessage());
        int tx = x + (w - tw) / 2;
        int ty = y + (h - font.lineHeight) / 2 + 1;
        g.drawString(font, this.getMessage(), tx, ty, TEXT, true);
    }

    @Override
    protected void updateWidgetNarration(NarrationElementOutput output) {
        this.defaultButtonNarrationText(output);
    }
}
