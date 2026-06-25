package com.policemod.client;

import com.policemod.gui.FouilleMenu;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.inventory.AbstractContainerScreen;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.inventory.Slot;

/**
 * Écran de la fouille (côté CLIENT uniquement).
 *
 * <p>C'est la pièce qui manquait : le mod enregistrait bien le {@code MenuType}
 * "fouille_menu" et ouvrait le menu côté serveur, mais aucun écran n'était lié à ce
 * menu côté client. Résultat : au clic droit du badge, le serveur ouvrait la fouille
 * (d'où les messages dans le chat) mais rien ne s'affichait à l'écran.
 *
 * <p>Le rendu lit directement les positions des slots définies par {@link FouilleMenu}
 * (inventaire de la cible en haut, inventaire du policier en bas), ce qui garantit que
 * les cases dessinées sont alignées avec les slots, sans dépendre d'une texture de GUI
 * (le mod n'en embarque pas).
 */
public class FouilleScreen extends AbstractContainerScreen<FouilleMenu> {

    // Couleurs reprenant le style d'un inventaire vanilla.
    private static final int PANEL   = 0xFFC6C6C6; // gris clair du panneau
    private static final int EDGE_HI = 0xFFFFFFFF; // arête claire (haut / gauche)
    private static final int EDGE_LO = 0xFF555555; // arête sombre (bas / droite)
    private static final int SLOT_BG = 0xFF8B8B8B; // intérieur d'une case
    private static final int SLOT_BD = 0xFF373737; // bordure d'une case
    private static final int TEXT    = 0x404040;   // texte sombre lisible sur fond clair

    public FouilleScreen(FouilleMenu menu, Inventory playerInv, Component title) {
        super(menu, playerInv, title);
        // Le menu place son slot le plus bas (hotbar du policier) à y=178 ; on dimensionne
        // le panneau pour tout englober avec une petite marge.
        this.imageWidth = 176;
        this.imageHeight = 204;
        this.titleLabelX = 8;
        this.titleLabelY = 6;
    }

    @Override
    protected void renderBg(GuiGraphics g, float partialTick, int mouseX, int mouseY) {
        int left = this.leftPos;
        int top = this.topPos;

        // Panneau de fond.
        g.fill(left, top, left + this.imageWidth, top + this.imageHeight, PANEL);
        // Arêtes pour un léger relief facon inventaire.
        g.fill(left, top, left + this.imageWidth, top + 1, EDGE_HI);
        g.fill(left, top, left + 1, top + this.imageHeight, EDGE_HI);
        g.fill(left + this.imageWidth - 1, top, left + this.imageWidth, top + this.imageHeight, EDGE_LO);
        g.fill(left, top + this.imageHeight - 1, left + this.imageWidth, top + this.imageHeight, EDGE_LO);

        // Cases des slots : on lit les positions réelles du menu -> alignement garanti.
        for (Slot slot : this.menu.slots) {
            int sx = left + slot.x;
            int sy = top + slot.y;
            g.fill(sx - 1, sy - 1, sx + 17, sy + 17, SLOT_BD);
            g.fill(sx, sy, sx + 16, sy + 16, SLOT_BG);
        }
    }

    @Override
    protected void renderLabels(GuiGraphics g, int mouseX, int mouseY) {
        // Titre = "Fouille : <cible>" (fourni par le MenuProvider côté serveur).
        g.drawString(this.font, this.title, this.titleLabelX, this.titleLabelY, TEXT, false);
        // Repère pour séparer les deux inventaires (le bloc du bas est celui du policier).
        g.drawString(this.font, Component.literal("Ton inventaire"), 8, 109, TEXT, false);
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        super.render(g, mouseX, mouseY, partialTick); // fond + cases + items + labels
        this.renderTooltip(g, mouseX, mouseY);        // infobulle de l'item survolé
    }
}
