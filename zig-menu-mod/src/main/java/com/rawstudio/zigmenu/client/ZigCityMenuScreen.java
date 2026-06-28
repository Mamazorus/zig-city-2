package com.rawstudio.zigmenu.client;

import java.util.List;

import com.mojang.math.Axis;

import net.minecraft.Util;
import net.minecraft.client.gui.Font;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.screens.ConnectScreen;
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

    // Texture logo (halo exterieur retire pour eviter le "contour" sur fond clair en jeu) :
    // 2684x1308, le logo visible (avec etoiles) occupe la boite ci-dessous.
    private static final int LOGO_TEX_W = 2684, LOGO_TEX_H = 1308;
    private static final int LOGO_BX = 117, LOGO_BY = 179, LOGO_BW = 2451, LOGO_BH = 812;
    private static final float LOGO_ASPECT = (float) LOGO_BW / (float) LOGO_BH; // ~3.018

    private static final String SERVER = "109.239.153.124:25965";

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
        int bh = Mth.clamp((int) (bw * 0.11f), 22, 30);
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
                this::joinServer));

        int halfW = (bw - splitGap) / 2;
        this.addRenderableWidget(new ZigButton(leftX, optY, halfW, bh,
                Component.literal("Options"),
                () -> this.minecraft.setScreen(new OptionsScreen(this, this.minecraft.options))));
        this.addRenderableWidget(new ZigButton(leftX + halfW + splitGap, optY, bw - halfW - splitGap, bh,
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
        // Les widgets (boutons) sont rendus par-dessus -> ils masquent le centre des tetes.
        super.render(g, mouseX, mouseY, partialTick);
    }

    private void renderSceneBackground(GuiGraphics g) {
        // Screenshot en "cover" (rempli, recadre au centre).
        float scale = Math.max((float) this.width / BG_W, (float) this.height / BG_H);
        float dw = BG_W * scale;
        float dh = BG_H * scale;
        float dx = (this.width - dw) / 2f;
        float dy = (this.height - dh) / 2f;
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
        int n = Math.min(this.headCount, heads.size());
        if (n <= 0) {
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

        int stripW = n * this.headSize;
        int startX = this.width / 2 - stripW / 2;
        int topRowY = this.zigBtnY - this.headPeek - shift;                    // depasse en haut (monte au survol)
        int botRowY = this.zigBtnY + this.zigBtnH - this.headOverlap + shift;  // depasse en bas (descend au survol)
        for (int i = 0; i < n; i++) {
            int hx = startX + i * this.headSize;
            drawHead(g, heads.get(i % heads.size()), hx, topRowY, false);
            // Rangee du bas = reflet par symetrie centrale (rotation 180deg), comme le Figma.
            drawHead(g, heads.get((n - 1 - i) % heads.size()), hx, botRowY, true);
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
