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
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.neoforged.neoforge.network.PacketDistributor;

import java.util.ArrayList;
import java.util.List;

/**
 * Écran de quêtes : liste les quêtes avec leur progression, LA RÉCOMPENSE (icône + nom),
 * et un bouton selon l'état (Accepter / Réclamer). La récompense est visible AVANT
 * d'accepter, pour juger si la quête vaut le coup. Données reçues en JSON.
 */
public class QuestScreen extends Screen {

    private record Row(String id, String title, String description, int amount, String status, int progress,
                       String rewardItem, int rewardQty) {}

    private static final int PANEL_W = 320;
    private static final int ROW_H = 56;
    private static final int TOP = 46;

    private String json;
    private final List<Row> rows = new ArrayList<>();

    public QuestScreen(String json) {
        super(Component.literal("Quetes"));
        this.json = json;
    }

    /** Recharge l'écran avec un nouvel état (après accept/claim). */
    public void refresh(String newJson) {
        this.json = newJson;
        this.rebuildWidgets();
    }

    @Override
    protected void init() {
        rows.clear();
        try {
            JsonObject root = JsonParser.parseString(this.json).getAsJsonObject();
            JsonArray arr = root.getAsJsonArray("quests");
            for (JsonElement el : arr) {
                JsonObject o = el.getAsJsonObject();
                rows.add(new Row(
                        o.get("id").getAsString(),
                        o.get("title").getAsString(),
                        o.has("description") ? o.get("description").getAsString() : "",
                        o.get("amount").getAsInt(),
                        o.get("status").getAsString(),
                        o.has("progress") ? o.get("progress").getAsInt() : 0,
                        o.has("rewardItem") ? o.get("rewardItem").getAsString() : "",
                        o.has("rewardQty") ? o.get("rewardQty").getAsInt() : 1
                ));
            }
        } catch (RuntimeException ignored) {
            // JSON invalide : écran vide
        }

        int x = (this.width - PANEL_W) / 2;
        for (int i = 0; i < rows.size(); i++) {
            Row r = rows.get(i);
            int y = TOP + i * ROW_H;
            final String id = r.id();
            if ("available".equals(r.status())) {
                this.addRenderableWidget(Button.builder(Component.literal("Accepter"),
                                b -> PacketDistributor.sendToServer(new AcceptQuestPayload(id)))
                        .bounds(x + PANEL_W - 84, y + 18, 80, 20).build());
            } else if ("completed".equals(r.status())) {
                this.addRenderableWidget(Button.builder(Component.literal("Reclamer"),
                                b -> PacketDistributor.sendToServer(new ClaimQuestPayload(id)))
                        .bounds(x + PANEL_W - 84, y + 18, 80, 20).build());
            }
        }
        this.addRenderableWidget(Button.builder(Component.literal("Fermer"), b -> this.onClose())
                .bounds((this.width - 100) / 2, TOP + rows.size() * ROW_H + 10, 100, 20).build());
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        this.renderBackground(g, mouseX, mouseY, partialTick);
        super.render(g, mouseX, mouseY, partialTick);
        g.drawCenteredString(this.font, this.title, this.width / 2, 20, 0xFFFFFF);

        int x = (this.width - PANEL_W) / 2;
        for (int i = 0; i < rows.size(); i++) {
            Row r = rows.get(i);
            int y = TOP + i * ROW_H;
            g.fill(x, y, x + PANEL_W, y + ROW_H - 4, 0x55000000);
            g.drawString(this.font, r.title(), x + 8, y + 5, 0xFFE08A);

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

            // Objectif / progression.
            String sub = switch (r.status()) {
                case "claimed" -> "§aDeja terminee";
                case "completed" -> "§aObjectif atteint - reclame ta recompense";
                case "accepted" -> "§eEn cours : " + r.progress() + "/" + r.amount();
                default -> "§7Objectif : tuer " + r.amount() + " cibles";
            };
            g.drawString(this.font, sub, x + 8, y + 35, 0xFFFFFF);
        }
        if (rows.isEmpty()) {
            g.drawCenteredString(this.font, "§7Aucune quete disponible", this.width / 2, TOP + 10, 0xFFFFFF);
        }
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
