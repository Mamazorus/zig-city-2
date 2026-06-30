package com.rawstudio.zigmenu.client;

import java.util.List;

import com.mojang.math.Axis;

import net.minecraft.Util;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.ConnectScreen;
import net.minecraft.client.gui.screens.options.LanguageSelectScreen;
import net.minecraft.client.gui.screens.options.OptionsScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.client.gui.screens.worldselection.SelectWorldScreen;
import net.minecraft.client.multiplayer.ServerData;
import net.minecraft.client.multiplayer.resolver.ServerAddress;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;

/**
 * Menu principal personnalise Zig City 2 (remplace {@code TitleScreen}).
 *
 * <p>Rendu en couches : fond (screenshot + vignette) -> logo -> splash text ->
 * carrousel de tetes -> boutons (par-dessus, ils masquent le centre des tetes pour
 * l'effet "tetes qui depassent"). Le bouton ZIG CITY connecte directement au serveur.
 */
public class ZigCityMenuScreen extends Screen {

    private static final ResourceLocation BG =
            ResourceLocation.fromNamespaceAndPath("zigmenu", "textures/gui/background.png");
    private static final ResourceLocation LOGO =
            ResourceLocation.fromNamespaceAndPath("zigmenu", "textures/gui/logo.png");

    // Taille de la texture de fond (screenshot 16:9).
    private static final int BG_W = 2048, BG_H = 1152;
    // Fond anime : leger zoom (menage une marge horizontale) + panoramique lent ping-pong.
    private static final float BG_ZOOM = 1.18f;
    private static final long BG_PAN_PERIOD_MS = 38000L; // aller-retour complet (~19 s par sens)

    // Texture logo "ZIG CITY 2" (1920x1080, fond transparent propre, sans halo a nettoyer) :
    // le logo visible (lettres 3D + etoiles + "2" dore) occupe la boite ci-dessous (bbox alpha>0).
    private static final int LOGO_TEX_W = 1920, LOGO_TEX_H = 1080;
    private static final int LOGO_BX = 109, LOGO_BY = 277, LOGO_BW = 1693, LOGO_BH = 574;
    private static final float LOGO_ASPECT = (float) LOGO_BW / (float) LOGO_BH; // ~2.949

    private static final String SERVER = "109.239.153.124:25965";

    // Phrase d'ambiance affichee en bas a gauche (facon "version" du menu vanilla).
    private static final String FOOTER = "Bienvenue dans la ville des Zigs !";

    // Layout calcule dans init().
    private int logoX, logoY, logoW, logoH;
    private int zigBtnX, zigBtnY, zigBtnW, zigBtnH;
    private int headSize, headPeek, headOverlap, headCount, headMaxShift;

    // Animation d'ecartement des tetes au survol du bouton ZIG CITY.
    private float headSpread = 0f;   // 0 (repos) -> 1 (ecarte), lisse image par image
    private long headAnimLastMs = 0L;

    public ZigCityMenuScreen() {
        super(Component.literal("Zig City 2"));
    }

    @Override
    public boolean isPauseScreen() {
        return false;
    }

    @Override
    public boolean shouldCloseOnEsc() {
        return false; // menu principal : Echap ne ferme rien (comme l'ecran-titre vanilla)
    }

    @Override
    protected void init() {
        // Lance (une seule fois) le chargement asynchrone des tetes du carrousel.
        PlayerHeads.ensureLoaded();

        // Filtrage lineaire du logo : la texture haute resolution est reduite a l'ecran ;
        // sans ce lissage, les aretes 3D des lettres sont crenelees ("contours" en jeu).
        // Applique ici (hors batch GUI) ; rejoue a chaque resize (init est rappele).
        try {
            this.minecraft.getTextureManager().getTexture(LOGO).setFilter(true, false);
        } catch (Exception ignore) {
            // texture indisponible -> rendu nearest par defaut, jamais de crash
        }

        int cx = this.width / 2;
        int bw = Mth.clamp((int) (this.width * 0.46f), 220, 340);
        int bh = Mth.clamp((int) (bw * 0.092f), 21, 25);   // un peu d'air haut/bas (compromis vide/serre)
        int gap = Mth.clamp((int) (this.height * 0.03f), 8, 16);

        this.headSize = Mth.clamp((int) (bh * 0.72f), 14, 22);
        this.headPeek = (int) (this.headSize * 0.6f);
        this.headOverlap = this.headSize - this.headPeek;
        this.headCount = Math.max(1, (int) (0.66f * bw / this.headSize));
        // Decalage max des rangees au survol : on revele la portion masquee par le bouton.
        this.headMaxShift = Math.max(3, this.headOverlap);

        int splitGap = 8;
        int totalH = 3 * bh + 2 * gap + 2 * this.headPeek;
        int groupCenterY = (int) (this.height * 0.66f);
        int top = groupCenterY - totalH / 2;

        int leftX = cx - bw / 2;
        int soloY = top;
        int zigY = soloY + bh + gap + this.headPeek;
        int optY = zigY + bh + this.headPeek + gap;

        this.zigBtnX = leftX;
        this.zigBtnY = zigY;
        this.zigBtnW = bw;
        this.zigBtnH = bh;

        // Logo : centre, au-dessus du groupe de boutons (retreci si la place manque).
        this.logoW = Mth.clamp((int) (this.width * 0.60f), 260, 540);
        this.logoH = (int) (this.logoW / LOGO_ASPECT);
        int logoTop = (int) (this.height * 0.05f);
        int logoBottomMax = top - Math.max(6, (int) (this.height * 0.02f));
        if (logoTop + this.logoH > logoBottomMax) {
            this.logoH = Math.max(40, logoBottomMax - logoTop);
            this.logoW = (int) (this.logoH * LOGO_ASPECT);
        }
        this.logoX = cx - this.logoW / 2;
        this.logoY = logoTop;

        // Boutons.
        this.addRenderableWidget(new ZigButton(leftX, soloY, bw, bh,
                Component.literal("Solo :("),
                () -> this.minecraft.setScreen(new SelectWorldScreen(this))));

        this.addRenderableWidget(new ZigButton(leftX, zigY, bw, bh,
                Component.literal("ZIG CITY !"),
                this::joinServer, true));   // bouton principal -> lisere dore (assorti au logo)

        // Ligne du bas : Options | Langue | Quitter (trois colonnes egales).
        int third = (bw - 2 * splitGap) / 3;
        this.addRenderableWidget(new ZigButton(leftX, optY, third, bh,
                Component.literal("Options"),
                () -> this.minecraft.setScreen(new OptionsScreen(this, this.minecraft.options))));
        this.addRenderableWidget(new ZigButton(leftX + third + splitGap, optY, third, bh,
                Component.literal("Langue"),
                () -> this.minecraft.setScreen(new LanguageSelectScreen(this, this.minecraft.options, this.minecraft.getLanguageManager()))));
        this.addRenderableWidget(new ZigButton(leftX + 2 * (third + splitGap), optY, bw - 2 * (third + splitGap), bh,
                Component.literal("Quitter"),
                () -> this.minecraft.stop()));
    }

    private void joinServer() {
        ServerData data = new ServerData("ZIG CITY", SERVER, ServerData.Type.OTHER);
        ConnectScreen.startConnecting(this, this.minecraft, ServerAddress.parseString(SERVER), data, false, null);
    }

    // On dessine notre propre fond dans render() : on neutralise celui de Screen.
    @Override
    public void renderBackground(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        // no-op
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        renderSceneBackground(g);
        renderLogo(g);
        renderSplash(g);
        renderHeads(g, mouseX, mouseY);
        renderFooter(g);
        // Les widgets (boutons) sont rendus par-dessus -> ils masquent le centre des tetes.
        super.render(g, mouseX, mouseY, partialTick);
    }

    // Phrase d'ambiance en bas a gauche (facon "version" du menu vanilla) : texte + ombre.
    private void renderFooter(GuiGraphics g) {
        g.drawString(this.font, Component.literal(FOOTER), 6, this.height - this.font.lineHeight - 4, 0xFFFFFFFF, true);
    }

    private void renderSceneBackground(GuiGraphics g) {
        // "Cover" + leger zoom pour menager une marge horizontale, puis panoramique lent
        // gauche <-> droite (ping-pong, ralenti aux bords) facon ecran-titre anime.
        float scale = Math.max((float) this.width / BG_W, (float) this.height / BG_H) * BG_ZOOM;
        float dw = BG_W * scale;
        float dh = BG_H * scale;
        float slackX = Math.max(0f, dw - this.width);                       // marge horizontale a parcourir
        float phase = (Util.getMillis() % BG_PAN_PERIOD_MS) / (float) BG_PAN_PERIOD_MS;
        float t = 0.5f - 0.5f * Mth.cos(phase * (float) Math.PI * 2f);      // 0 -> 1 -> 0, sans a-coup
        float dx = -slackX * t;                                             // du bord gauche au bord droit
        float dy = (this.height - dh) / 2f;                                 // centre verticalement
        g.pose().pushPose();
        g.pose().translate(dx, dy, 0);
        g.pose().scale(scale, scale, 1f);
        g.blit(BG, 0, 0, 0f, 0f, BG_W, BG_H, BG_W, BG_H);
        g.pose().popPose();

        // Assombrissement global pour la lisibilite.
        g.fill(0, 0, this.width, this.height, 0x40000000);
        // Vignette haut (legere) et bas (plus marquee, sous les boutons).
        g.fillGradient(0, 0, this.width, (int) (this.height * 0.28f), 0x99000000, 0x00000000);
        g.fillGradient(0, (int) (this.height * 0.55f), this.width, this.height, 0x00000000, 0xCC000000);
    }

    private void renderLogo(GuiGraphics g) {
        g.pose().pushPose();
        g.pose().translate(this.logoX, this.logoY, 0);
        g.pose().scale((float) this.logoW / LOGO_BW, (float) this.logoH / LOGO_BH, 1f);
        g.blit(LOGO, 0, 0, (float) LOGO_BX, (float) LOGO_BY, LOGO_BW, LOGO_BH, LOGO_TEX_W, LOGO_TEX_H);
        g.pose().popPose();
    }

    private void renderSplash(GuiGraphics g) {
        Font font = this.font;
        Component txt = Component.literal("Zig city 2 est là !");
        float pulse = 1.0f + 0.05f * Mth.sin((Util.getMillis() % 1000L) / 1000f * (float) Math.PI * 2f);
        float scale = 1.15f * pulse;
        int sx = (int) (this.width * 0.27f);
        int sy = (int) (this.height * 0.12f);
        g.pose().pushPose();
        g.pose().translate(sx, sy, 0);
        g.pose().mulPose(Axis.ZP.rotationDegrees(-20f));
        g.pose().scale(scale, scale, 1f);
        int w = font.width(txt);
        g.drawString(font, txt, -w / 2 + 1, 1, 0xFF463B00, false); // ombre
        g.drawString(font, txt, -w / 2, 0, 0xFFFFD900, false);     // texte
        g.pose().popPose();
    }

    private void renderHeads(GuiGraphics g, int mouseX, int mouseY) {
        List<ResourceLocation> heads = PlayerHeads.getHeads();
        if (heads.isEmpty()) {
            return;
        }
        // Animation : les rangees s'ecartent quand la souris survole le bouton ZIG CITY
        // (haut vers le haut, bas vers le bas) pour reveler davantage les tetes.
        long now = Util.getMillis();
        float dt = this.headAnimLastMs == 0L ? 0f : (now - this.headAnimLastMs) / 1000f;
        this.headAnimLastMs = now;
        boolean hover = mouseX >= this.zigBtnX && mouseX < this.zigBtnX + this.zigBtnW
                && mouseY >= this.zigBtnY && mouseY < this.zigBtnY + this.zigBtnH;
        float target = hover ? 1f : 0f;
        float speed = 6.5f; // course complete en ~0,15 s
        if (this.headSpread < target) {
            this.headSpread = Math.min(target, this.headSpread + dt * speed);
        } else if (this.headSpread > target) {
            this.headSpread = Math.max(target, this.headSpread - dt * speed);
        }
        float eased = this.headSpread * this.headSpread * (3f - 2f * this.headSpread); // smoothstep
        int shift = Math.round(eased * this.headMaxShift);

        // Deux rangees de joueurs DIFFERENTS (plus un reflet) : on repartit les tetes en
        // deux moities -> jusqu'a 2x plus de monde affiche, sans doublon haut/bas.
        int total = Math.min(heads.size(), this.headCount * 2);
        int topCount = (total + 1) / 2;
        int topRowY = this.zigBtnY - this.headPeek - shift;                    // depasse en haut (monte au survol)
        int botRowY = this.zigBtnY + this.zigBtnH - this.headOverlap + shift;  // depasse en bas (descend au survol)
        drawHeadRow(g, heads, 0, topCount, topRowY);
        drawHeadRow(g, heads, topCount, total - topCount, botRowY);
    }

    /** Dessine {@code count} tetes consecutives (a partir de {@code from}), centrees horizontalement. */
    private void drawHeadRow(GuiGraphics g, List<ResourceLocation> heads, int from, int count, int y) {
        if (count <= 0) {
            return;
        }
        int stripW = count * this.headSize;
        int startX = this.width / 2 - stripW / 2;
        for (int i = 0; i < count; i++) {
            drawHead(g, heads.get(from + i), startX + i * this.headSize, y, false);
        }
    }

    private void drawHead(GuiGraphics g, ResourceLocation tex, int x, int y, boolean flip) {
        g.pose().pushPose();
        g.pose().translate(x, y, 0);
        g.pose().scale(this.headSize / 64f, this.headSize / 64f, 1f);
        if (flip) {
            // Rotation 180deg autour du centre de la tete (boite 64x64).
            g.pose().translate(32f, 32f, 0);
            g.pose().mulPose(Axis.ZP.rotationDegrees(180f));
            g.pose().translate(-32f, -32f, 0);
        }
        g.blit(tex, 0, 0, 0f, 0f, 64, 64, 64, 64);
        g.pose().popPose();
    }
}
