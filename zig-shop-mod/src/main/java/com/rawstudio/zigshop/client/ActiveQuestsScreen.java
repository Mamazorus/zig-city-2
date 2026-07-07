package com.rawstudio.zigshop.client;

import com.rawstudio.zigshop.client.ActiveQuestsClient.ActiveQuest;

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;

import java.util.List;

/**
 * Journal des quêtes ACTIVES du joueur. Remplace l'onglet quêtes (vide) de CustomNPCs — onglet
 * livre de l'inventaire + touche L — via {@link QuestLogRedirect}. LECTURE SEULE : rappelle
 * l'objectif exact, montre l'avancée (barre + compteur), et signale « retourne voir le marchand »
 * dès qu'une quête est terminée. Les données viennent de {@link ActiveQuestsClient} (poussées par
 * le serveur), donc l'écran reflète l'état même hors de tout PNJ.
 *
 * <p>Style et défilement calqués sur {@link QuestScreen} (panneau sombre opaque avant les widgets
 * pour ne pas subir le flou d'arrière-plan du pipeline Sodium/Iris).
 */
public class ActiveQuestsScreen extends Screen {

    private static final int PANEL_W = 320;
    private static final int ROW_H = 44;
    private static final int TOP = 46;
    private static final int SCROLLBAR_W = 4;
    private static final int BOTTOM_MARGIN = 34; // place réservée en bas pour le bouton « Fermer »
    private static final int BAR_W = 140;

    private int scrollY = 0;
    private int maxScroll = 0;
    private boolean draggingScrollbar = false;

    public ActiveQuestsScreen() {
        super(Component.literal("Mes quetes"));
    }

    /** Le serveur a poussé un nouvel état pendant que l'écran est ouvert : on reconstruit. */
    public void onQuestsUpdated() {
        this.rebuildWidgets();
    }

    /** Bas de la zone de liste défilante (au-dessus du bouton « Fermer » fixe). */
    private int listBottom() {
        return this.height - BOTTOM_MARGIN;
    }

    @Override
    protected void init() {
        int contentH = ActiveQuestsClient.list().size() * ROW_H;
        int viewportH = listBottom() - TOP;
        maxScroll = Math.max(0, contentH - viewportH);
        scrollY = clamp(scrollY, 0, maxScroll); // conserve la position (re-clampée) après refresh

        this.addRenderableWidget(Button.builder(Component.literal("Fermer"), b -> this.onClose())
                .bounds((this.width - 100) / 2, this.height - 28, 100, 20).build());
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        this.renderBackground(g, mouseX, mouseY, partialTick);

        int x = (this.width - PANEL_W) / 2;
        int bottom = listBottom();

        // Fond OPAQUE du panneau AVANT les widgets (même raison que QuestScreen : évite le flou).
        g.fill(x - 6, TOP, x + PANEL_W + SCROLLBAR_W + 8, bottom, 0xF20E0B16);
        super.render(g, mouseX, mouseY, partialTick);

        g.drawCenteredString(this.font, this.title, this.width / 2, 20, 0xFFFFFF);

        List<ActiveQuest> quests = ActiveQuestsClient.list();
        if (quests.isEmpty()) {
            g.drawCenteredString(this.font, "§7Aucune quete en cours", this.width / 2, TOP + 16, 0xFFFFFF);
            g.drawCenteredString(this.font, "§8Va voir un marchand de quetes pour en accepter",
                    this.width / 2, TOP + 30, 0xFFFFFF);
            return;
        }

        // Contenu, découpé (scissor) à la zone visible.
        g.enableScissor(x - 6, TOP, x + PANEL_W + SCROLLBAR_W + 8, bottom);
        for (int i = 0; i < quests.size(); i++) {
            int y = TOP + i * ROW_H - scrollY;
            if (y + ROW_H < TOP || y > bottom) {
                continue; // hors zone visible
            }
            renderRow(g, quests.get(i), x, y);
        }
        g.disableScissor();

        // Barre de défilement (seulement si le contenu dépasse).
        if (maxScroll > 0) {
            int barX = x + PANEL_W + 4;
            int trackH = bottom - TOP;
            g.fill(barX, TOP, barX + SCROLLBAR_W, bottom, 0x33FFFFFF);
            int contentH = quests.size() * ROW_H;
            int thumbH = Math.max(20, (int) ((long) trackH * trackH / contentH));
            int thumbY = TOP + (int) ((long) (trackH - thumbH) * scrollY / maxScroll);
            g.fill(barX, thumbY, barX + SCROLLBAR_W, thumbY + thumbH, 0xAAFFFFFF);
        }
    }

    /** Dessine une quête : titre, objectif détaillé, puis avancée (barre + compteur) ou « terminé ». */
    private void renderRow(GuiGraphics g, ActiveQuest q, int x, int y) {
        boolean done = "completed".equals(q.status());
        g.fill(x, y, x + PANEL_W, y + ROW_H - 4, done ? 0x3355FF99 : 0x22FFFFFF);

        // Titre (repli sur l'objectif si le snapshot est ancien et sans titre).
        String objective = QuestFormat.verb(q.type()) + " " + QuestFormat.targetName(q.type(), q.target());
        String title = (q.title() == null || q.title().isBlank()) ? objective : q.title();
        g.drawString(this.font, "§f" + title, x + 8, y + 4, 0xFFFFFF);

        // Objectif détaillé (toujours affiché : c'est CE qu'on avait oublié une fois la quête acceptée).
        g.drawString(this.font, "§7" + objective, x + 8, y + 17, 0xFFFFFF);

        if (done) {
            g.drawString(this.font, "§aTermine ! Retourne voir le marchand", x + 8, y + 30, 0xFFFFFF);
            return;
        }
        // Barre d'avancée + compteur.
        int amount = Math.max(1, q.amount());
        int prog = Math.max(0, Math.min(q.progress(), amount));
        int barX = x + 8;
        int barY = y + 31;
        g.fill(barX, barY, barX + BAR_W, barY + 6, 0xFF3A3346);
        int fill = (int) ((long) BAR_W * prog / amount);
        g.fill(barX, barY, barX + fill, barY + 6, 0xFFFFC24A);
        g.drawString(this.font, "§e" + prog + "§7/" + amount, barX + BAR_W + 8, y + 28, 0xFFFFFF);
    }

    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double scrollX, double dyScroll) {
        if (maxScroll > 0 && dyScroll != 0) {
            scrollY = clamp(scrollY - (int) (dyScroll * 20), 0, maxScroll);
            return true;
        }
        return super.mouseScrolled(mouseX, mouseY, scrollX, dyScroll);
    }

    @Override
    public boolean mouseClicked(double mouseX, double mouseY, int button) {
        if (button == 0 && maxScroll > 0) {
            int x = (this.width - PANEL_W) / 2;
            int barX = x + PANEL_W + 4;
            if (mouseX >= barX && mouseX <= barX + SCROLLBAR_W && mouseY >= TOP && mouseY <= listBottom()) {
                draggingScrollbar = true;
                scrollToMouse(mouseY);
                return true;
            }
        }
        return super.mouseClicked(mouseX, mouseY, button);
    }

    @Override
    public boolean mouseDragged(double mouseX, double mouseY, int button, double dragX, double dragY) {
        if (draggingScrollbar && button == 0) {
            scrollToMouse(mouseY);
            return true;
        }
        return super.mouseDragged(mouseX, mouseY, button, dragX, dragY);
    }

    @Override
    public boolean mouseReleased(double mouseX, double mouseY, int button) {
        if (button == 0) {
            draggingScrollbar = false;
        }
        return super.mouseReleased(mouseX, mouseY, button);
    }

    /** Positionne le défilement pour centrer le curseur de la barre sur la souris. */
    private void scrollToMouse(double mouseY) {
        int trackH = listBottom() - TOP;
        int contentH = ActiveQuestsClient.list().size() * ROW_H;
        int thumbH = Math.max(20, (int) ((long) trackH * trackH / contentH));
        double denom = trackH - thumbH;
        double frac = denom <= 0 ? 0 : (mouseY - TOP - thumbH / 2.0) / denom;
        scrollY = clamp((int) Math.round(frac * maxScroll), 0, maxScroll);
    }

    private static int clamp(int v, int lo, int hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    @Override
    public boolean isPauseScreen() {
        return false;
    }
}
