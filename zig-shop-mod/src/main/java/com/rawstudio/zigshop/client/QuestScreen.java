package com.rawstudio.zigshop.client;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.rawstudio.zigshop.net.AcceptQuestPayload;
import com.rawstudio.zigshop.net.ClaimQuestPayload;

import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Blocks;
import net.neoforged.neoforge.network.PacketDistributor;

import java.util.ArrayList;
import java.util.List;

/**
 * Écran de quêtes : liste les quêtes avec leur OBJECTIF (verbe selon le type + cible),
 * la RÉCOMPENSE (icône + nom), l'état de répétabilité (quotidienne en cooldown, limitée
 * X/N, unique déjà remportée) et un bouton contextuel (Accepter / Réclamer). La récompense
 * est visible AVANT d'accepter. Données reçues en JSON depuis le serveur.
 *
 * <p>La liste DÉFILE quand elle dépasse la zone visible : molette + barre de défilement
 * cliquable/glissable à droite. Le bouton « Fermer » reste fixe en bas (hors liste) et les
 * boutons Accepter/Réclamer suivent le défilement (masqués hors zone).
 */
public class QuestScreen extends Screen {

    private record Row(String id, String title, String description, String type, String target,
                       int amount, String status, int progress, String rewardItem, int rewardQty,
                       String mode, int maxClaims, int claims, long cooldownMs, String winner) {}

    /** Bouton d'une quête + son Y « absolu » (hors défilement), pour le repositionner au scroll. */
    private record Positioned(Button button, int baseY) {}

    private static final int PANEL_W = 320;
    private static final int ROW_H = 56;
    private static final int TOP = 46;
    private static final int SCROLLBAR_W = 4;
    private static final int BOTTOM_MARGIN = 34; // place réservée en bas pour le bouton « Fermer »

    private String json;
    private final List<Row> rows = new ArrayList<>();
    private final List<Positioned> questButtons = new ArrayList<>();
    private int scrollY = 0;           // défilement courant (px), 0 = haut
    private int maxScroll = 0;         // défilement max (0 = tout tient à l'écran)
    private boolean draggingScrollbar = false;

    public QuestScreen(String json) {
        super(Component.literal("Quetes"));
        this.json = json;
    }

    /** Recharge l'écran avec un nouvel état (après accept/claim). Conserve la position de défilement. */
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
        questButtons.clear();
        try {
            JsonObject root = JsonParser.parseString(this.json).getAsJsonObject();
            JsonArray arr = root.getAsJsonArray("quests");
            for (JsonElement el : arr) {
                JsonObject o = el.getAsJsonObject();
                rows.add(new Row(
                        o.get("id").getAsString(),
                        o.get("title").getAsString(),
                        o.has("description") ? o.get("description").getAsString() : "",
                        o.has("type") ? o.get("type").getAsString() : "kill",
                        o.has("target") ? o.get("target").getAsString() : "",
                        o.get("amount").getAsInt(),
                        o.get("status").getAsString(),
                        o.has("progress") ? o.get("progress").getAsInt() : 0,
                        o.has("rewardItem") ? o.get("rewardItem").getAsString() : "",
                        o.has("rewardQty") ? o.get("rewardQty").getAsInt() : 1,
                        o.has("mode") ? o.get("mode").getAsString() : "once",
                        o.has("maxClaims") ? o.get("maxClaims").getAsInt() : 0,
                        o.has("claims") ? o.get("claims").getAsInt() : 0,
                        o.has("cooldownMs") ? o.get("cooldownMs").getAsLong() : 0L,
                        o.has("winner") ? o.get("winner").getAsString() : ""
                ));
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
            int baseY = TOP + i * ROW_H + 18;
            final String id = r.id();
            boolean locked = "unique".equals(r.mode()) && !r.winner().isBlank();
            if (locked) {
                continue; // quête unique déjà remportée : aucun bouton
            }
            Button btn = null;
            if ("available".equals(r.status())) {
                btn = Button.builder(Component.literal("Accepter"),
                                b -> PacketDistributor.sendToServer(new AcceptQuestPayload(id)))
                        .bounds(x + PANEL_W - 84, baseY, 80, 20).build();
            } else if ("completed".equals(r.status())) {
                btn = Button.builder(Component.literal("Reclamer"),
                                b -> PacketDistributor.sendToServer(new ClaimQuestPayload(id)))
                        .bounds(x + PANEL_W - 84, baseY, 80, 20).build();
            }
            if (btn != null) {
                this.addRenderableWidget(btn);
                questButtons.add(new Positioned(btn, baseY));
            }
        }
        // Bouton « Fermer » FIXE en bas (hors liste défilante → toujours accessible).
        this.addRenderableWidget(Button.builder(Component.literal("Fermer"), b -> this.onClose())
                .bounds((this.width - 100) / 2, this.height - 28, 100, 20).build());

        updateButtonPositions();
    }

    /** Décale les boutons de quête selon le défilement et masque ceux hors de la zone visible. */
    private void updateButtonPositions() {
        int bottom = listBottom();
        for (Positioned pb : questButtons) {
            int y = pb.baseY() - scrollY;
            boolean visible = y >= TOP && (y + 20) <= bottom;
            pb.button().visible = visible;
            pb.button().active = visible;
            pb.button().setY(y);
        }
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        this.renderBackground(g, mouseX, mouseY, partialTick);
        g.drawCenteredString(this.font, this.title, this.width / 2, 20, 0xFFFFFF);

        int x = (this.width - PANEL_W) / 2;
        int bottom = listBottom();

        // Contenu de la liste, découpé (scissor) à la zone visible.
        g.enableScissor(x - 2, TOP, x + PANEL_W + 2, bottom);
        for (int i = 0; i < rows.size(); i++) {
            int y = TOP + i * ROW_H - scrollY;
            if (y + ROW_H < TOP || y > bottom) {
                continue; // hors de la zone visible
            }
            Row r = rows.get(i);
            g.fill(x, y, x + PANEL_W, y + ROW_H - 4, 0x55000000);
            g.drawString(this.font, r.title(), x + 8, y + 5, 0xFFE08A);

            // Étiquette de mode (discrète, en haut à droite).
            String modeTag = modeTag(r);
            if (!modeTag.isEmpty()) {
                g.drawString(this.font, modeTag, x + PANEL_W - this.font.width(modeTag) - 8, y + 5, 0xFFFFFF);
            }

            // Récompense (visible avant d'accepter) : icône + quantité + nom.
            ItemStack reward = resolveStack(r.rewardItem(), r.rewardQty());
            int ry = y + 18;
            String label = "§7Recompense :";
            g.drawString(this.font, label, x + 8, ry + 4, 0xFFFFFF);
            int ix = x + 8 + this.font.width(label) + 4;
            if (!reward.isEmpty()) {
                g.renderItem(reward, ix, ry);
                g.renderItemDecorations(this.font, reward, ix, ry);
                g.drawString(this.font, reward.getHoverName(), ix + 22, ry + 4, 0xFFFFFF);
            } else {
                g.drawString(this.font, "§8(item inconnu)", ix, ry + 4, 0xFFFFFF);
            }

            // Objectif / progression / état.
            g.drawString(this.font, statusLine(r), x + 8, y + 35, 0xFFFFFF);
        }
        g.disableScissor();

        if (rows.isEmpty()) {
            g.drawCenteredString(this.font, "§7Aucune quete disponible", this.width / 2, TOP + 10, 0xFFFFFF);
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

        // Widgets (boutons Accepter/Réclamer visibles + Fermer) par-dessus les fonds de ligne.
        super.render(g, mouseX, mouseY, partialTick);
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

    /** Ligne d'état sous une quête, selon son statut et son mode de répétition. */
    private String statusLine(Row r) {
        if ("unique".equals(r.mode()) && !r.winner().isBlank()) {
            return "§6Reussie par " + r.winner();
        }
        return switch (r.status()) {
            case "claimed" -> claimedLine(r);
            case "completed" -> "§aObjectif atteint - reclame ta recompense";
            case "accepted" -> "§eEn cours : " + r.progress() + "/" + r.amount();
            default -> {
                String base = "§7Objectif : " + verb(r.type()) + " " + r.amount() + " " + targetName(r.type(), r.target());
                if ("limited".equals(r.mode()) && r.claims() > 0) {
                    base += " §8(fait " + r.claims() + "/" + Math.max(1, r.maxClaims()) + ")";
                }
                yield base;
            }
        };
    }

    /** Ligne pour une quête réclamée (dépend du mode : cooldown daily, quota limited, sinon terminée). */
    private String claimedLine(Row r) {
        if ("daily".equals(r.mode()) && r.cooldownMs() > 0) {
            return "§7Revenir dans " + formatDuration(r.cooldownMs());
        }
        if ("limited".equals(r.mode())) {
            return "§aTermine (" + r.claims() + "/" + Math.max(1, r.maxClaims()) + ")";
        }
        return "§aDeja terminee";
    }

    private static String modeTag(Row r) {
        return switch (r.mode()) {
            case "limited" -> "§8[x" + Math.max(1, r.maxClaims()) + "]";
            case "daily" -> "§8[Quotidien]";
            case "unique" -> "§6[Unique]";
            default -> "";
        };
    }

    private static String verb(String type) {
        return switch (type) {
            case "break" -> "Casser";
            case "place" -> "Poser";
            case "craft" -> "Fabriquer";
            case "smelt" -> "Cuire";
            case "fish" -> "Pecher";
            case "breed" -> "Elever";
            default -> "Tuer";
        };
    }

    /** Nom lisible de la cible selon le type ; « (tout) » si joker (cible vide/"*"). */
    private static String targetName(String type, String target) {
        if (target == null || target.isBlank() || "*".equals(target)) {
            return "(tout)";
        }
        ResourceLocation rl = ResourceLocation.tryParse(target);
        if (rl == null) {
            return shortId(target);
        }
        return switch (type) {
            case "kill", "breed" -> {
                EntityType<?> et = BuiltInRegistries.ENTITY_TYPE.get(rl);
                yield et != null ? et.getDescription().getString() : shortId(target);
            }
            case "break", "place" -> {
                var block = BuiltInRegistries.BLOCK.get(rl);
                yield block != Blocks.AIR ? block.getName().getString() : shortId(target);
            }
            default -> {
                Item it = BuiltInRegistries.ITEM.get(rl);
                yield (it != Items.AIR || "minecraft:air".equals(target))
                        ? new ItemStack(it).getHoverName().getString() : shortId(target);
            }
        };
    }

    private static String shortId(String id) {
        int i = id.indexOf(':');
        return i >= 0 ? id.substring(i + 1) : id;
    }

    /** Formate une durée (ms) en « Xh Ymin » / « Ymin ». */
    private static String formatDuration(long ms) {
        long totalMin = ms / 60000L;
        long h = totalMin / 60;
        long m = totalMin % 60;
        if (h > 0) {
            return h + "h" + (m > 0 ? " " + m + "min" : "");
        }
        if (m > 0) {
            return m + "min";
        }
        return "moins d'une minute";
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
