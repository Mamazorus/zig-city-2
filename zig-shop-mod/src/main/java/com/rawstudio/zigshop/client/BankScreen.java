package com.rawstudio.zigshop.client;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.rawstudio.zigshop.net.BankActionPayload;

import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.neoforged.neoforge.network.PacketDistributor;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Écran de la BANQUE : deux sous-comptes (ÉPARGNE, RISQUÉ) avec solde, taux, un champ de
 * montant et deux boutons (Déposer/Retirer — SHIFT-clic = tout, convention de l'inventaire
 * vanilla), le delta depuis la dernière visite, et un petit historique des derniers jours.
 * Contenu de hauteur FIXE (pas de défilement, contrairement à {@code ShopScreen}) : les montants
 * affichés sont bornés (2 comptes + ~6 lignes d'historique), pas de liste de taille variable.
 *
 * <p>Le montant est saisi côté client pour lisibilité UNIQUEMENT : le serveur revalide toujours
 * le solde réel (inventaire pour un dépôt, {@code BankAccountData} pour un retrait) avant
 * d'agir — voir {@code BankServerHandler}.
 */
public class BankScreen extends Screen {

    private record HistoryRow(String date, long savingsDelta, long riskyDelta) {}

    private static final int PANEL_W = 360;
    private static final int TOP = 54;
    private static final int SECTION_H = 82;
    private static final int BOTTOM_MARGIN = 34;
    private static final int MAX_HISTORY_SHOWN = 6;

    private String json;
    private int entityId = -1;
    private String currencyItem = "";
    private int currencyOwned = 0;
    private long savingsEligible;
    private long savingsPending;
    private long riskyEligible;
    private long riskyPending;
    private long seenDelta;
    private double savingsRatePct;
    private long savingsCap;
    private double savingsPeriodHours = 24;
    private double riskyMinPct;
    private double riskyMaxPct;
    private double riskyPeriodHours = 24;
    private double withdrawFeePct;
    private final List<HistoryRow> history = new ArrayList<>();

    private EditBox savingsBox;
    private EditBox riskyBox;

    public BankScreen(String json) {
        super(Component.literal("Banque"));
        this.json = json;
    }

    /** Recharge l'écran avec un nouvel état (après dépôt/retrait), en préservant ce que le
     *  joueur est en train de taper dans les deux champs de montant. */
    public void refresh(String newJson) {
        this.json = newJson;
        String keepSavings = savingsBox != null ? savingsBox.getValue() : "";
        String keepRisky = riskyBox != null ? riskyBox.getValue() : "";
        this.rebuildWidgets();
        if (savingsBox != null) savingsBox.setValue(keepSavings);
        if (riskyBox != null) riskyBox.setValue(keepRisky);
    }

    private int listBottom() {
        return this.height - BOTTOM_MARGIN;
    }

    @Override
    protected void init() {
        parseJson();

        int x = (this.width - PANEL_W) / 2;
        int savingsY = TOP + 6;
        int riskyY = TOP + SECTION_H + 6;

        savingsBox = new EditBox(this.font, x + 8, savingsY + 40, 90, 20, Component.literal("Montant epargne"));
        savingsBox.setMaxLength(9);
        savingsBox.setFilter(s -> s.isEmpty() || s.matches("[0-9]{1,9}"));
        this.addRenderableWidget(savingsBox);
        this.addRenderableWidget(Button.builder(Component.literal("Deposer"),
                        b -> sendAction("deposit", "savings", Screen.hasShiftDown() ? currencyOwned : parseAmount(savingsBox)))
                .bounds(x + 106, savingsY + 40, 68, 20).build());
        this.addRenderableWidget(Button.builder(Component.literal("Retirer"),
                        b -> sendAction("withdraw", "savings", Screen.hasShiftDown() ? cappedInt(savingsEligible + savingsPending) : parseAmount(savingsBox)))
                .bounds(x + 178, savingsY + 40, 68, 20).build());

        riskyBox = new EditBox(this.font, x + 8, riskyY + 40, 90, 20, Component.literal("Montant risque"));
        riskyBox.setMaxLength(9);
        riskyBox.setFilter(s -> s.isEmpty() || s.matches("[0-9]{1,9}"));
        this.addRenderableWidget(riskyBox);
        this.addRenderableWidget(Button.builder(Component.literal("Deposer"),
                        b -> sendAction("deposit", "risky", Screen.hasShiftDown() ? currencyOwned : parseAmount(riskyBox)))
                .bounds(x + 106, riskyY + 40, 68, 20).build());
        this.addRenderableWidget(Button.builder(Component.literal("Retirer"),
                        b -> sendAction("withdraw", "risky", Screen.hasShiftDown() ? cappedInt(riskyEligible + riskyPending) : parseAmount(riskyBox)))
                .bounds(x + 178, riskyY + 40, 68, 20).build());

        this.addRenderableWidget(Button.builder(Component.literal("Fermer"), b -> this.onClose())
                .bounds((this.width - 100) / 2, this.height - 28, 100, 20).build());
    }

    private static int cappedInt(long v) {
        return (int) Math.max(0, Math.min(Integer.MAX_VALUE, v));
    }

    private static int parseAmount(EditBox box) {
        try {
            return Integer.parseInt(box.getValue());
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private void sendAction(String action, String accountType, int amount) {
        if (amount <= 0) {
            return;
        }
        PacketDistributor.sendToServer(new BankActionPayload(this.entityId, action, accountType, amount));
    }

    @Override
    public void onClose() {
        PacketDistributor.sendToServer(new BankActionPayload(this.entityId, "close", "", 0));
        super.onClose();
    }

    private void parseJson() {
        history.clear();
        try {
            JsonObject root = JsonParser.parseString(this.json).getAsJsonObject();
            this.entityId = root.has("entityId") ? root.get("entityId").getAsInt() : -1;
            this.currencyItem = root.has("currencyItem") ? root.get("currencyItem").getAsString() : "";
            this.currencyOwned = root.has("currencyOwned") ? root.get("currencyOwned").getAsInt() : 0;
            this.savingsEligible = longOr(root, "savingsEligible");
            this.savingsPending = longOr(root, "savingsPending");
            this.riskyEligible = longOr(root, "riskyEligible");
            this.riskyPending = longOr(root, "riskyPending");
            this.seenDelta = longOr(root, "seenDelta");
            this.savingsRatePct = root.has("savingsRatePct") ? root.get("savingsRatePct").getAsDouble() : 0;
            this.savingsCap = longOr(root, "savingsCap");
            this.savingsPeriodHours = root.has("savingsPeriodHours") ? root.get("savingsPeriodHours").getAsDouble() : 24;
            this.riskyMinPct = root.has("riskyMinPct") ? root.get("riskyMinPct").getAsDouble() : 0;
            this.riskyMaxPct = root.has("riskyMaxPct") ? root.get("riskyMaxPct").getAsDouble() : 0;
            this.riskyPeriodHours = root.has("riskyPeriodHours") ? root.get("riskyPeriodHours").getAsDouble() : 24;
            this.withdrawFeePct = root.has("withdrawFeePct") ? root.get("withdrawFeePct").getAsDouble() : 0;
            JsonArray arr = root.getAsJsonArray("history");
            if (arr != null) {
                for (JsonElement el : arr) {
                    if (history.size() >= MAX_HISTORY_SHOWN) break;
                    JsonObject o = el.getAsJsonObject();
                    history.add(new HistoryRow(
                            o.has("date") ? o.get("date").getAsString() : "",
                            longOr(o, "savingsDelta"),
                            longOr(o, "riskyDelta")));
                }
            }
        } catch (RuntimeException ignored) {
            // JSON invalide : écran vide
        }
    }

    private static long longOr(JsonObject o, String key) {
        try {
            return o.has(key) && !o.get(key).isJsonNull() ? o.get(key).getAsLong() : 0L;
        } catch (RuntimeException e) {
            return 0L;
        }
    }

    @Override
    public void render(GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        this.renderBackground(g, mouseX, mouseY, partialTick);

        int x = (this.width - PANEL_W) / 2;
        int bottom = listBottom();

        // Fond OPAQUE du panneau, AVANT les widgets (cf. ShopScreen : sinon le flou
        // d'arrière-plan Sodium/Iris transparaît).
        g.fill(x - 6, TOP, x + PANEL_W + 6, bottom, 0xF20E0B16);

        super.render(g, mouseX, mouseY, partialTick);

        g.drawCenteredString(this.font, "Banque", this.width / 2, 20, 0xFFFFFF);
        g.drawCenteredString(this.font, "§7Ton solde : §e" + currencyOwned + " §7" + resolveName(currencyItem),
                this.width / 2, 32, 0xFFFFFF);
        if (seenDelta != 0) {
            String arrow = seenDelta > 0 ? "§a▲ +" : "§c▼ ";
            g.drawCenteredString(this.font, "§7Depuis ta derniere visite : " + arrow + seenDelta,
                    this.width / 2, 44, 0xFFFFFF);
        }

        int savingsY = TOP + 6;
        int riskyY = TOP + SECTION_H + 6;

        g.drawString(this.font, "§fEPARGNE  §7solde : §e" + (savingsEligible + savingsPending)
                + (savingsPending > 0 ? " §7(dont " + savingsPending + " en attente)" : ""), x + 8, savingsY, 0xFFFFFF);
        g.drawString(this.font, "§7Taux : §a+" + fmt(savingsRatePct) + "%/" + fmtPeriod(savingsPeriodHours) + " §7(plafond " + savingsCap + ")", x + 8, savingsY + 12, 0xFFFFFF);
        g.drawString(this.font, "§8Shift-clic = tout", x + 8, savingsY + 62, 0xFFFFFF);

        g.drawString(this.font, "§fRISQUE  §7solde : §e" + (riskyEligible + riskyPending)
                + (riskyPending > 0 ? " §7(dont " + riskyPending + " en attente)" : ""), x + 8, riskyY, 0xFFFFFF);
        g.drawString(this.font, "§7Tirage : §6" + fmt(riskyMinPct) + "% §7a §6+" + fmt(riskyMaxPct) + "%§7/" + fmtPeriod(riskyPeriodHours), x + 8, riskyY + 12, 0xFFFFFF);
        g.drawString(this.font, "§8Shift-clic = tout", x + 8, riskyY + 62, 0xFFFFFF);

        int histY = TOP + SECTION_H * 2 + 14;
        g.drawString(this.font, "§7Frais de retrait : §e" + fmt(withdrawFeePct) + "%", x + 8, histY, 0xFFFFFF);
        histY += 12;
        if (!history.isEmpty()) {
            g.drawString(this.font, "§7Historique :", x + 8, histY, 0xFFFFFF);
            histY += 11;
            for (HistoryRow h : history) {
                String line = "§8" + h.date() + "  §7Epargne " + signed(h.savingsDelta()) + "  §7Risque " + signed(h.riskyDelta());
                g.drawString(this.font, line, x + 8, histY, 0xFFFFFF);
                histY += 10;
            }
        }
    }

    private static String signed(long v) {
        return (v > 0 ? "§a+" : v < 0 ? "§c" : "§7") + v;
    }

    /** Toujours avec un point décimal (JAMAIS la virgule d'une locale FR) : {@code Locale.ROOT}. */
    private static String fmt(double v) {
        return String.format(Locale.ROOT, "%.1f", v);
    }

    /** "jour" pour le cas par défaut (24h, plus lisible que "24h"), sinon "{X}h". */
    private static String fmtPeriod(double hours) {
        return Math.abs(hours - 24.0) < 0.01 ? "jour" : fmt(hours) + "h";
    }

    private static String resolveName(String id) {
        ItemStack s = resolveStack(id);
        return s.isEmpty() ? "monnaie" : s.getHoverName().getString();
    }

    private static ItemStack resolveStack(String id) {
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
        return new ItemStack(item, 1);
    }

    @Override
    public boolean isPauseScreen() {
        return false;
    }
}
