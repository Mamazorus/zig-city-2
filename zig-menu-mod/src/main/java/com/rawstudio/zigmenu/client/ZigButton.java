package com.rawstudio.zigmenu.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.AbstractButton;
import net.minecraft.client.gui.narration.NarrationElementOutput;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;

/**
 * Bouton "bloc de pierre" facon jeu : texture de bloc (deepslate briques) carrelee +
 * relief facon bouton (aretes hautes/gauches eclaircies, basses/droites assombries) +
 * bordure (sombre par defaut, DOREE pour le bouton principal ZIG CITY). Libelle blanc
 * avec ombre portee (lisibilite sur la pierre), police Minecraft.
 */
public class ZigButton extends AbstractButton {

    // Texture de bloc vanilla, carrelee sur le bouton (suit le resource pack du joueur).
    private static final ResourceLocation TEX =
            ResourceLocation.fromNamespaceAndPath("minecraft", "textures/block/deepslate_bricks.png");
    private static final int TILE = 16;                 // resolution native de la texture

    private static final int TEXT        = 0xFFFFFFFF;
    private static final int BORDER      = 0xFF101012;  // bordure sombre (boutons secondaires)
    private static final int BORDER_HOV  = 0xFFFFFFFF;  // bordure claire au survol (neutre)
    private static final int GOLD        = 0xFFFFD157;  // lisere dore (assorti au logo ZIG CITY 2)
    private static final int GOLD_HOV    = 0xFFFFE9A6;

    private final Runnable action;
    private final boolean gold;                         // true = bouton principal (lisere dore)

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
        int b = Math.max(2, h / 12);

        // 1) Texture pierre carrelee, clippee au rectangle du bouton (derniere tuile rognee).
        g.enableScissor(x, y, x + w, y + h);
        for (int ty = y; ty < y + h; ty += TILE) {
            for (int tx = x; tx < x + w; tx += TILE) {
                g.blit(TEX, tx, ty, 0f, 0f, TILE, TILE, TILE, TILE);
            }
        }
        g.disableScissor();

        // 2) Relief facon bouton (g.fill fond bien l'alpha cote GUI) : aretes claires en
        //    haut/gauche, sombres en bas/droite ; legere surbrillance au survol.
        if (hov) {
            g.fill(x, y, x + w, y + h, 0x22FFFFFF);
        }
        g.fill(x, y, x + w, y + b, 0x55FFFFFF);             // haut clair
        g.fill(x, y, x + b, y + h, 0x55FFFFFF);             // gauche clair
        g.fill(x, y + h - b, x + w, y + h, 0x66000000);     // bas sombre
        g.fill(x + w - b, y, x + w, y + h, 0x66000000);     // droite sombre

        // 3) Bordure : doree pour le bouton ZIG CITY, sinon sombre ; plus claire au survol.
        int bc = this.gold ? (hov ? GOLD_HOV : GOLD) : (hov ? BORDER_HOV : BORDER);
        int bw = this.gold ? 2 : 1;
        g.fill(x, y, x + w, y + bw, bc);                    // haut
        g.fill(x, y + h - bw, x + w, y + h, bc);            // bas
        g.fill(x, y, x + bw, y + h, bc);                    // gauche
        g.fill(x + w - bw, y, x + w, y + h, bc);            // droite

        // 4) Libelle centre, blanc + ombre (contraste sur la pierre).
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
