package com.rawstudio.zigshop.client;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.rawstudio.zigshop.net.AcceptQuestPayload;
import com.rawstudio.zigshop.net.ClaimQuestPayload;

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.network.chat.Component;
import net.neoforged.neoforge.network.PacketDistributor;

import java.util.ArrayList;
import java.util.List;

/**
 * Écran de quêtes : liste les quêtes avec leur progression et un bouton selon l'état
 * (Accepter / Réclamer). Les actions envoient un paquet au serveur ; celui-ci renvoie
 * l'écran à jour ({@link QuestClientHandler#open}). Données reçues en JSON.
 */
public class QuestScreen extends Screen {

    private record Row(String id, String title, String description, int amount, String status, int progress) {}

    private static final int PANEL_W = 300;
    private static final int ROW_H = 48;
    private static final int TOP = 48;

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
                        o.has("progress") ? o.get("progress").getAsInt() : 0
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
                        .bounds(x + PANEL_W - 82, y + 12, 78, 20).build());
            } else if ("completed".equals(r.status())) {
                this.addRenderableWidget(Button.builder(Component.literal("Reclamer"),
                                b -> PacketDistributor.sendToServer(new ClaimQuestPayload(id)))
                        .bounds(x + PANEL_W - 82, y + 12, 78, 20).build());
            }
        }
        this.addRenderableWidget(Button.builder(Component.literal("Fermer"), b -> this.onClose())
                .bounds((this.width - 100) / 2, TOP + rows.size() * ROW_H + 10, 100, 20).build());
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        this.renderBackground(g, mouseX, mouseY, partialTick);
        super.render(g, mouseX, mouseY, partialTick);
        g.drawCenteredString(this.font, this.title, this.width / 2, 22, 0xFFFFFF);

        int x = (this.width - PANEL_W) / 2;
        for (int i = 0; i < rows.size(); i++) {
            Row r = rows.get(i);
            int y = TOP + i * ROW_H;
            g.fill(x, y, x + PANEL_W, y + ROW_H - 4, 0x55000000);
            g.drawString(this.font, r.title(), x + 8, y + 6, 0xFFE08A);
            String sub = switch (r.status()) {
                case "claimed" -> "§aDeja terminee";
                case "completed" -> "§aObjectif atteint - reclame ta recompense";
                case "accepted" -> "§eEn cours : " + r.progress() + "/" + r.amount();
                default -> "§7Pas encore acceptee";
            };
            g.drawString(this.font, sub, x + 8, y + 20, 0xFFFFFF);
            if (!r.description().isEmpty()) {
                g.drawString(this.font, "§8" + r.description(), x + 8, y + 32, 0xFFFFFF);
            }
        }
        if (rows.isEmpty()) {
            g.drawCenteredString(this.font, "§7Aucune quete disponible", this.width / 2, TOP + 10, 0xFFFFFF);
        }
    }

    @Override
    public boolean isPauseScreen() {
        return false;
    }
}
