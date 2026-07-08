package com.rawstudio.zigshop.client;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.rawstudio.zigshop.net.BuyOfferPayload;

import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.neoforged.neoforge.network.PacketDistributor;

import java.util.ArrayList;
import java.util.List;

/**
 * Écran de BOUTIQUE (remplace le troc villageois natif). Chaque offre affiche l'ARTICLE reçu
 * (icône + quantité + nom), son PRIX (icône monnaie + quantité, écrite en TEXTE — donc SANS la
 * limite de « 1 pile / 64 » du troc natif : un prix de 150, 256… s'affiche et se paie), le quota
 * restant, et un bouton « Acheter » (grisé si rupture ou fonds insuffisants). Le paiement est
 * débité automatiquement de l'inventaire au clic (voir {@code ShopServerHandler}).
 *
 * <p>La liste DÉFILE (molette + barre cliquable/glissable). Le bouton « Fermer » reste fixe en
 * bas. Données reçues en JSON depuis le serveur ; rafraîchi après chaque achat (solde + quotas).
 */
public class ShopScreen extends Screen {

    private record Row(String id, String input, int inputQty, String output, int outputQty,
                       int maxUses, int usesDone, int owned) {}

    /** Bouton d'achat + son Y « absolu » (hors défilement) + s'il doit rester actif (achetable). */
    private record Positioned(Button button, int baseY, boolean enabled) {}

    private static final int PANEL_W = 340;
    private static final int ROW_H = 52;
    private static final int TOP = 46;
    private static final int SCROLLBAR_W = 4;
    private static final int BOTTOM_MARGIN = 34; // place réservée en bas pour le bouton « Fermer »

    private String json;
    private final List<Row> rows = new ArrayList<>();
    private final List<Positioned> buyButtons = new ArrayList<>();
    private String screenTitle = "Boutique";
    private int entityId = -1;
    private String currency = "";
    private int currencyOwned = 0;
    private int scrollY = 0;
    private int maxScroll = 0;
    private boolean draggingScrollbar = false;

    public ShopScreen(String json) {
        super(Component.literal("Boutique"));
        this.json = json;
    }

    /** Recharge l'écran avec un nouvel état (après un achat). Conserve la position de défilement. */
    public void refresh(String newJson) {
        this.json = newJson;
        this.rebuildWidgets();
    }

    /** Bas de la zone de liste défilante (au-dessus du bouton « Fermer » fixe). */
    private int listBottom() {
        return this.height - BOTTOM_MARGIN;
    }

    @Override
    protected void init() {
        rows.clear();
        buyButtons.clear();
        try {
            JsonObject root = JsonParser.parseString(this.json).getAsJsonObject();
            this.screenTitle = root.has("title") ? root.get("title").getAsString() : "Boutique";
            this.entityId = root.has("entityId") ? root.get("entityId").getAsInt() : -1;
            this.currency = root.has("currency") ? root.get("currency").getAsString() : "";
            this.currencyOwned = root.has("currencyOwned") ? root.get("currencyOwned").getAsInt() : 0;
            JsonArray arr = root.getAsJsonArray("offers");
            if (arr != null) {
                for (JsonElement el : arr) {
                    JsonObject o = el.getAsJsonObject();
                    rows.add(new Row(
                            o.get("id").getAsString(),
                            o.get("input").getAsString(),
                            o.get("inputQty").getAsInt(),
                            o.get("output").getAsString(),
                            o.get("outputQty").getAsInt(),
                            o.has("maxUses") ? o.get("maxUses").getAsInt() : 0,
                            o.has("usesDone") ? o.get("usesDone").getAsInt() : 0,
                            o.has("owned") ? o.get("owned").getAsInt() : 0
                    ));
                }
            }
        } catch (RuntimeException ignored) {
            // JSON invalide : écran vide
        }

        // Défilement : hauteur du contenu vs zone visible.
        int contentH = rows.size() * ROW_H;
        int viewportH = listBottom() - TOP;
        maxScroll = Math.max(0, contentH - viewportH);
        scrollY = clamp(scrollY, 0, maxScroll); // conserve la position (re-clampée) après refresh

        int x = (this.width - PANEL_W) / 2;
        for (int i = 0; i < rows.size(); i++) {
            Row r = rows.get(i);
            int baseY = TOP + i * ROW_H + 16;
            final String id = r.id();
            boolean soldOut = r.maxUses() > 0 && r.usesDone() >= r.maxUses();
            boolean canAfford = r.owned() >= r.inputQty();
            boolean enabled = !soldOut && canAfford;
            Button btn = Button.builder(Component.literal(soldOut ? "Epuise" : "Acheter"),
                            b -> PacketDistributor.sendToServer(new BuyOfferPayload(this.entityId, id)))
                    .bounds(x + PANEL_W - 74, baseY, 70, 20).build();
            this.addRenderableWidget(btn);
            buyButtons.add(new Positioned(btn, baseY, enabled));
        }
        // Bouton « Fermer » FIXE en bas (hors liste défilante → toujours accessible).
        this.addRenderableWidget(Button.builder(Component.literal("Fermer"), b -> this.onClose())
                .bounds((this.width - 100) / 2, this.height - 28, 100, 20).build());

        updateButtonPositions();
    }

    /** Décale les boutons selon le défilement et masque/désactive ceux hors de la zone visible. */
    private void updateButtonPositions() {
        int bottom = listBottom();
        for (Positioned pb : buyButtons) {
            int y = pb.baseY() - scrollY;
            boolean visible = y >= TOP && (y + 20) <= bottom;
            pb.button().visible = visible;
            pb.button().active = visible && pb.enabled();
            pb.button().setY(y);
        }
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        this.renderBackground(g, mouseX, mouseY, partialTick);

        int x = (this.width - PANEL_W) / 2;
        int bottom = listBottom();

        // Fond OPAQUE du panneau, AVANT les widgets (sinon le flou d'arrière-plan transparaît).
        g.fill(x - 6, TOP, x + PANEL_W + SCROLLBAR_W + 8, bottom, 0xF20E0B16);

        // Widgets AVANT le contenu (pipeline Sodium/Iris : le contenu dessiné après super.render
        // ne subit pas le flou d'arrière-plan). Cf. QuestScreen.
        super.render(g, mouseX, mouseY, partialTick);

        g.drawCenteredString(this.font, this.screenTitle, this.width / 2, 20, 0xFFFFFF);

        // Solde de monnaie du joueur (nom résolu côté client → « Zig Coin » via le lang patché).
        if (!currency.isBlank()) {
            ItemStack cur = resolveStack(currency, 1);
            String name = cur.isEmpty() ? "monnaie" : cur.getHoverName().getString();
            g.drawCenteredString(this.font, "§7Ton solde : §e" + currencyOwned + " §7" + name,
                    this.width / 2, 32, 0xFFFFFF);
        }

        // Contenu de la liste, découpé (scissor) à la zone visible.
        g.enableScissor(x - 6, TOP, x + PANEL_W + SCROLLBAR_W + 8, bottom);
        for (int i = 0; i < rows.size(); i++) {
            int y = TOP + i * ROW_H - scrollY;
            if (y + ROW_H < TOP || y > bottom) {
                continue; // hors de la zone visible
            }
            Row r = rows.get(i);
            g.fill(x, y, x + PANEL_W, y + ROW_H - 4, 0x22FFFFFF);

            // Ligne 1 : l'article reçu (icône + quantité + nom).
            ItemStack outStack = resolveStack(r.output(), 1);
            int oy = y + 6;
            if (!outStack.isEmpty()) {
                g.renderItem(outStack, x + 8, oy);
            }
            String outName = outStack.isEmpty() ? r.output() : outStack.getHoverName().getString();
            String outLabel = (r.outputQty() > 1 ? "§f×" + r.outputQty() + " " : "§f") + outName;
            g.drawString(this.font, outLabel, x + 30, oy + 4, 0xFFFFFF);

            // Ligne 2 : le prix (icône monnaie + quantité EN TEXTE → aucune limite de pile) + quota.
            ItemStack inStack = resolveStack(r.input(), 1);
            int py = y + 26;
            String priceLabel = "§7Prix : §e" + r.inputQty();
            g.drawString(this.font, priceLabel, x + 8, py + 4, 0xFFFFFF);
            int ix = x + 8 + this.font.width(priceLabel) + 3;
            if (!inStack.isEmpty()) {
                g.renderItem(inStack, ix, py);
            }
            // Info à droite du prix : rupture / quota restant / fonds insuffisants.
            String info = "";
            if (r.maxUses() > 0) {
                int remaining = Math.max(0, r.maxUses() - r.usesDone());
                info = (remaining > 0 ? "§a" : "§c") + "reste " + remaining + "§7/" + r.maxUses();
            }
            if (r.owned() < r.inputQty()) {
                info = "§cfonds insuffisants";
            }
            if (!info.isEmpty()) {
                g.drawString(this.font, info, ix + 22, py + 4, 0xFFFFFF);
            }
        }
        g.disableScissor();

        if (rows.isEmpty()) {
            g.drawCenteredString(this.font, "§7Aucune offre disponible", this.width / 2, TOP + 10, 0xFFFFFF);
        }

        // Barre de défilement (seulement si le contenu dépasse la zone).
        if (maxScroll > 0) {
            int barX = x + PANEL_W + 4;
            int trackH = bottom - TOP;
            g.fill(barX, TOP, barX + SCROLLBAR_W, bottom, 0x33FFFFFF);
            int contentH = rows.size() * ROW_H;
            int thumbH = Math.max(20, (int) ((long) trackH * trackH / contentH));
            int thumbY = TOP + (int) ((long) (trackH - thumbH) * scrollY / maxScroll);
            g.fill(barX, thumbY, barX + SCROLLBAR_W, thumbY + thumbH, 0xAAFFFFFF);
        }
    }

    @Override
    public boolean mouseScrolled(double mouseX, double mouseY, double scrollX, double dyScroll) {
        if (maxScroll > 0 && dyScroll != 0) {
            scrollY = clamp(scrollY - (int) (dyScroll * 20), 0, maxScroll);
            updateButtonPositions();
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
        int contentH = rows.size() * ROW_H;
        int thumbH = Math.max(20, (int) ((long) trackH * trackH / contentH));
        double denom = trackH - thumbH;
        double frac = denom <= 0 ? 0 : (mouseY - TOP - thumbH / 2.0) / denom;
        scrollY = clamp((int) Math.round(frac * maxScroll), 0, maxScroll);
        updateButtonPositions();
    }

    private static int clamp(int v, int lo, int hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    /** Résout un identifiant d'item en ItemStack (vide si introuvable). */
    private static ItemStack resolveStack(String id, int qty) {
        if (id == null || id.isBlank()) {
            return ItemStack.EMPTY;
        }
        ResourceLocation rl = ResourceLocation.tryParse(id);
        if (rl == null) {
            return ItemStack.EMPTY;
        }
        Item item = BuiltInRegistries.ITEM.get(rl);
        if (item == Items.AIR && !"minecraft:air".equals(id)) {
            return ItemStack.EMPTY;
        }
        return new ItemStack(item, Math.max(1, qty));
    }

    @Override
    public boolean isPauseScreen() {
        return false;
    }
}
