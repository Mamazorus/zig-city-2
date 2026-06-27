package com.rawstudio.zigmenu.client;

import net.minecraft.client.Minecraft;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.AbstractButton;
import net.minecraft.client.gui.narration.NarrationElementOutput;
import net.minecraft.network.chat.Component;

/**
 * Bouton plat facon design Figma : fond {@code #2f2f2f}, bordure uniforme {@code #686868}
 * (blanche au survol), libelle blanc centre sans ombre. Police Minecraft par defaut.
 */
public class ZigButton extends AbstractButton {

    private static final int FILL        = 0xFF2F2F2F;
    private static final int FILL_HOVER  = 0xFF3C3C3C;
    private static final int BORDER      = 0xFF686868;
    private static final int BORDER_HOVER = 0xFFFFFFFF;
    private static final int TEXT        = 0xFFFFFFFF;

    private final Runnable action;

    public ZigButton(int x, int y, int width, int height, Component label, Runnable action) {
        super(x, y, width, height, label);
        this.action = action;
    }

    @Override
    public void onPress() {
        this.action.run();
    }

    @Override
    protected void renderWidget(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        boolean hov = this.isHoveredOrFocused();
        int fill = hov ? FILL_HOVER : FILL;
        int border = hov ? BORDER_HOVER : BORDER;

        int x = this.getX();
        int y = this.getY();
        int w = this.getWidth();
        int h = this.getHeight();
        int b = Math.max(2, h / 14);

        // Fond plein.
        g.fill(x, y, x + w, y + h, fill);
        // Bordure plate et uniforme (4 cotes).
        g.fill(x, y, x + w, y + b, border);             // haut
        g.fill(x, y + h - b, x + w, y + h, border);     // bas
        g.fill(x, y, x + b, y + h, border);             // gauche
        g.fill(x + w - b, y, x + w, y + h, border);     // droite

        // Libelle centre, sans ombre (comme le design).
        Font font = Minecraft.getInstance().font;
        int tw = font.width(this.getMessage());
        int tx = x + (w - tw) / 2;
        int ty = y + (h - font.lineHeight) / 2 + 1;
        g.drawString(font, this.getMessage(), tx, ty, TEXT, false);
    }

    @Override
    protected void updateWidgetNarration(NarrationElementOutput output) {
        this.defaultButtonNarrationText(output);
    }
}
