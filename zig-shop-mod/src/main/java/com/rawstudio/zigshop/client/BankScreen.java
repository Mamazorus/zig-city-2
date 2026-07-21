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
 * vanilla), le delta depuis la dernière visite, et un graphique en bougies (à gauche) du taux
 * RISQUÉ partagé cycle par cycle — remplace l'ancien historique en lignes de texte, jugé peu
 * lisible (design demandé le 21/07).
 *
 * <p>Le montant est saisi côté client pour lisibilité UNIQUEMENT : le serveur revalide toujours
 * le solde réel (inventaire pour un dépôt, {@code BankAccountData} pour un retrait) avant
 * d'agir — voir {@code BankServerHandler}.
 *
 * <p>Rafraîchissement « temps réel » : tant que l'écran reste ouvert, un ping silencieux
 * ({@code action = "refresh"}) est envoyé toutes les {@link #REFRESH_INTERVAL_TICKS} pour capter
 * un nouveau cycle sans que le joueur ait besoin de rouvrir l'écran (cf. {@link #tick()}).
 */
public class BankScreen extends Screen {

    /** Une bougie du taux RISQUÉ : {@code open}/{@code close} = valeur d'un indice synthétique
     *  (cf. {@code BankAccountData.RiskyCandle}), {@code pct} = le tirage brut du cycle (pour le
     *  texte du sous-titre / de l'infobulle). */
    private record RiskyCandleRow(String date, double pct, double open, double close) {}

    private static final int PANEL_W = 360;
    private static final int TOP = 54;
    private static final int SECTION_H = 82;
    private static final int BOTTOM_MARGIN = 34;
    private static final int CHART_W_MAX = 300;
    private static final int CHART_GAP = 16;
    private static final int SCREEN_MARGIN = 6;
    private static final int CANDLE_UP = 0xFF55FF55;
    private static final int CANDLE_DOWN = 0xFFFF5555;
    private static final int REFRESH_INTERVAL_TICKS = 300; // ~15 s (20 ticks/s)

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
    private final List<RiskyCandleRow> riskyCandles = new ArrayList<>();
    private int refreshTicks = 0;

    private EditBox savingsBox;
    private EditBox riskyBox;

    public BankScreen(String json) {
        super(Component.literal("Banque"));
        this.json = json;
    }

    /** Recharge l'écran avec un nouvel état (après dépôt/retrait/ping périodique), en préservant
     *  ce que le joueur est en train de taper dans les deux champs de montant. */
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

    /** Largeur du bloc graphique : TOUJOURS ce qui reste réellement une fois le panneau de
     *  comptes + la marge d'écran casés (jamais un plancher fixe — cf. bug du 21/07 : un
     *  plancher forçait le total à dépasser une fenêtre étroite, poussant tout le bloc graphique
     *  hors de l'écran à gauche). 0 si vraiment aucune place (fenêtre très étroite) : le
     *  graphique est alors simplement masqué, {@link #layoutX} recentre le panneau de comptes
     *  seul, comme avant l'ajout du graphique. */
    private int chartWidth() {
        int available = this.width - PANEL_W - CHART_GAP - SCREEN_MARGIN * 2;
        return Math.max(0, Math.min(CHART_W_MAX, available));
    }

    /** Position X du panneau de comptes (à droite du graphique) ; {@code chartW == 0} retombe
     *  sur le simple centrage d'avant l'ajout du graphique (aucun gap à réserver). */
    private int layoutX(int chartW) {
        if (chartW <= 0) {
            return (this.width - PANEL_W) / 2;
        }
        return (this.width - (chartW + CHART_GAP + PANEL_W)) / 2 + chartW + CHART_GAP;
    }

    @Override
    protected void init() {
        parseJson();

        int x = layoutX(chartWidth());
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

    @Override
    public void tick() {
        super.tick();
        if (++refreshTicks >= REFRESH_INTERVAL_TICKS) {
            refreshTicks = 0;
            PacketDistributor.sendToServer(new BankActionPayload(this.entityId, "refresh", "", 0));
        }
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
        riskyCandles.clear();
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
            JsonArray riskyArr = root.getAsJsonArray("riskyHistory");
            if (riskyArr != null) {
                for (JsonElement el : riskyArr) {
                    JsonObject o = el.getAsJsonObject();
                    riskyCandles.add(new RiskyCandleRow(
                            o.has("date") ? o.get("date").getAsString() : "",
                            o.has("pct") ? o.get("pct").getAsDouble() : 0,
                            o.has("open") ? o.get("open").getAsDouble() : 0,
                            o.has("close") ? o.get("close").getAsDouble() : 0));
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

        int chartW = chartWidth();
        int x = layoutX(chartW);
        int chartX = x - CHART_GAP - chartW;
        int bottom = listBottom();

        // Fonds OPAQUES des deux panneaux, AVANT les widgets (cf. ShopScreen : sinon le flou
        // d'arrière-plan Sodium/Iris transparaît). Pas de panneau graphique si chartW == 0
        // (fenêtre trop étroite pour lui faire de la place, cf. chartWidth()).
        if (chartW > 0) {
            g.fill(chartX - 6, TOP, chartX + chartW + 6, bottom, 0xF20E0B16);
        }
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

        g.drawString(this.font, "§7Frais de retrait : §e" + fmt(withdrawFeePct) + "%", x + 8, TOP + SECTION_H * 2 + 14, 0xFFFFFF);

        if (chartW > 0) {
            renderRiskyChart(g, chartX, chartW, bottom, mouseX, mouseY);
        }
    }

    /** Bloc graphique (bougies) du taux RISQUÉ partagé : un point par cycle écoulé, {@code open}
     *  = valeur de l'indice synthétique à la fin du cycle précédent, {@code close} = après ce
     *  cycle (cf. {@code BankAccountData.RiskyCandle}) — vert si le cycle est positif, rouge
     *  sinon. Survoler une bougie affiche son détail (date + pourcentage tiré). */
    private void renderRiskyChart(GuiGraphics g, int chartX, int chartW, int bottom, int mouseX, int mouseY) {
        g.drawString(this.font, "§fMarche risque", chartX + 6, TOP + 6, 0xFFFFFF);
        RiskyCandleRow last = riskyCandles.isEmpty() ? null : riskyCandles.get(riskyCandles.size() - 1);
        String subtitle = last == null
                ? "§7En attente du 1er cycle"
                : "§7Dernier cycle : " + (last.pct() >= 0 ? "§a+" : "§c") + fmt(last.pct()) + "%";
        g.drawString(this.font, subtitle, chartX + 6, TOP + 18, 0xFFFFFF);

        int plotTop = TOP + 34;
        int plotBottom = bottom - 6;
        int plotLeft = chartX + 6;
        int plotRight = chartX + chartW - 6;
        if (plotBottom <= plotTop || plotRight <= plotLeft) {
            return;
        }
        g.fill(plotLeft, plotTop, plotRight, plotBottom, 0x1AFFFFFF);

        if (riskyCandles.isEmpty()) {
            g.drawCenteredString(this.font, "§7Pas encore de donnees", chartX + chartW / 2, (plotTop + plotBottom) / 2 - 4, 0xFFFFFF);
            return;
        }

        int maxSlots = Math.max(1, (plotRight - plotLeft) / 4);
        int from = Math.max(0, riskyCandles.size() - maxSlots);
        List<RiskyCandleRow> visible = riskyCandles.subList(from, riskyCandles.size());

        double minV = Double.MAX_VALUE;
        double maxV = -Double.MAX_VALUE;
        for (RiskyCandleRow c : visible) {
            minV = Math.min(minV, Math.min(c.open(), c.close()));
            maxV = Math.max(maxV, Math.max(c.open(), c.close()));
        }
        double pad = Math.max(1.0, (maxV - minV) * 0.12);
        minV -= pad;
        maxV += pad;
        double range = Math.max(0.0001, maxV - minV);

        float slotW = (plotRight - plotLeft) / (float) visible.size();
        int bodyW = Math.max(2, (int) (slotW * 0.6f));

        RiskyCandleRow hovered = null;
        for (int i = 0; i < visible.size(); i++) {
            RiskyCandleRow c = visible.get(i);
            int cx = plotLeft + Math.round(i * slotW + slotW / 2f);
            int yOpen = plotBottom - (int) Math.round((c.open() - minV) / range * (plotBottom - plotTop));
            int yClose = plotBottom - (int) Math.round((c.close() - minV) / range * (plotBottom - plotTop));
            int yTop = Math.min(yOpen, yClose);
            int yBot = Math.max(yOpen, yClose);
            if (yBot - yTop < 1) {
                yBot = yTop + 1;
            }
            int color = c.close() >= c.open() ? CANDLE_UP : CANDLE_DOWN;
            g.fill(cx - bodyW / 2, yTop, cx - bodyW / 2 + bodyW, yBot, color);

            if (mouseX >= plotLeft + i * slotW && mouseX < plotLeft + (i + 1) * slotW
                    && mouseY >= plotTop && mouseY <= plotBottom) {
                hovered = c;
            }
        }

        if (hovered != null) {
            String l1 = "§7" + hovered.date();
            String l2 = (hovered.pct() >= 0 ? "§a+" : "§c") + fmt(hovered.pct()) + "%";
            int tw = Math.max(this.font.width(l1), this.font.width(l2)) + 8;
            int th = 24;
            int tx = Math.min(mouseX + 10, this.width - tw - 4);
            int ty = Math.max(mouseY - th - 6, 2);
            g.fill(tx, ty, tx + tw, ty + th, 0xF20E0B16);
            g.drawString(this.font, l1, tx + 4, ty + 4, 0xFFFFFF);
            g.drawString(this.font, l2, tx + 4, ty + 14, 0xFFFFFF);
        }
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
