package by.deokma.casino.game.texasholdem;

import by.deokma.casino.CasinoAddon;
import by.deokma.casino.client.CasinoClientData;
import dev.lucaargolo.charta.client.ChartaModClient;
import dev.lucaargolo.charta.client.render.screen.GameScreen;
import dev.lucaargolo.charta.common.ChartaMod;
import dev.lucaargolo.charta.common.game.api.CardPlayer;
import dev.lucaargolo.charta.common.menu.CardSlot;
import by.deokma.casino.network.TexasHoldemActionPayload;
import net.minecraft.ChatFormatting;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;
import net.minecraft.world.item.DyeColor;
import net.minecraft.world.entity.player.Inventory;
import org.jetbrains.annotations.NotNull;

import java.util.List;

public class TexasHoldemScreen extends GameScreen<TexasHoldemGame, TexasHoldemMenu> {

    private static final ResourceLocation TEXTURE =
            ResourceLocation.fromNamespaceAndPath("charta_casino", "textures/gui/texas_holdem_bg.png");

    // ── Button dimensions ─────────────────────────────────────────────────────
    private static final int BTN_W      = 56;
    private static final int BTN_H      = 20;
    private static final int BTN_GAP    = 6;
    private static final int RAISE_W    = 48; // raise toggle button (narrower)

    // ── Raise sub-panel dimensions ────────────────────────────────────────────
    private static final int QW = 40; // quick-raise chip button width
    private static final int QH = 18; // quick-raise chip button height (shorter than BTN_H)
    private static final int QG = 4;  // gap between quick buttons
    private static final int FIELD_W = 80; // custom raise input field width

    // ── Colours ───────────────────────────────────────────────────────────────
    private static final int COLOR_FOLD     = 0xAA2222;
    private static final int COLOR_CHECK    = 0x228844;
    private static final int COLOR_RAISE    = 0xBB7700;
    private static final int COLOR_ALLIN    = 0x7722AA;
    private static final int COLOR_INACTIVE = 0x444444;
    private static final int COLOR_QUICK    = 0x445588;

    // ── Quick-raise amounts ───────────────────────────────────────────────────
    private static final int[] QUICK_RAISES = {10, 25, 50};

    // ── Layout ────────────────────────────────────────────────────────────────
    private static final int BG_TOP           = 40;
    private static final int BG_BOTTOM_OFFSET = 63;
    private static final int BTN_ROW_MARGIN   = 6;

    /** Bottom edge of the green felt area (screen-space). */
    private int bgBottom()     { return height - BG_BOTTOM_OFFSET; }
    /** Y of the action-button row (screen-space). */
    private int btnY()         { return bgBottom() - BTN_H - BTN_ROW_MARGIN; }
    /** Y for the phase title (GUI-relative). */
    private int titleY()       { return BG_TOP - topPos + 4; }
    /** Y for the turn/status label between community cards and buttons (GUI-relative). */
    private int statusY()      { return (communityCardsBottom() + btnY() - topPos) / 2; }
    /** Bottom edge of community-card area in GUI-relative coords. */
    private int communityCardsBottom() { return 60 - topPos + 38 + 10; }
    /** Width of a player slot in the top bar. */
    private float playerSlotW() { return CardSlot.getWidth(CardSlot.Type.PREVIEW) + 42f; }

    // ── Main action button X positions (computed in renderBg, reused in mouseClicked) ─
    // These are derived from the same formula; keep them as helpers to avoid drift.
    private int mainRowTotalW() { return BTN_W + BTN_GAP + BTN_W + BTN_GAP + RAISE_W + BTN_GAP + BTN_W; }
    private int foldX()   { return rowStartX(mainRowTotalW()); }
    private int callX()   { return foldX() + BTN_W + BTN_GAP; }
    private int raiseX()  { return callX() + BTN_W + BTN_GAP; }
    private int allInX()  { return raiseX() + RAISE_W + BTN_GAP; }

    // ── Raise sub-panel state ─────────────────────────────────────────────────
    private boolean raiseMenuOpen       = false;
    private String  customRaiseText     = "";
    private boolean customFieldFocused  = false;

    // ── Constructor ───────────────────────────────────────────────────────────
    public TexasHoldemScreen(TexasHoldemMenu menu, Inventory playerInventory, Component title) {
        super(menu, playerInventory, title);
        this.imageWidth  = 256;
        this.imageHeight = 230;
    }

    // ── Colour helpers ────────────────────────────────────────────────────────
    private static int lighten(int rgb) {
        int r = Math.min(255, ((rgb >> 16) & 0xFF) + 70);
        int g = Math.min(255, ((rgb >>  8) & 0xFF) + 70);
        int b = Math.min(255, ( rgb        & 0xFF) + 70);
        return (r << 16) | (g << 8) | b;
    }

    private static int darken(int rgb) {
        int r = Math.max(0, ((rgb >> 16) & 0xFF) - 55);
        int g = Math.max(0, ((rgb >>  8) & 0xFF) - 55);
        int b = Math.max(0, ( rgb        & 0xFF) - 55);
        return (r << 16) | (g << 8) | b;
    }

    // ── render ────────────────────────────────────────────────────────────────
    @Override
    public void render(@NotNull GuiGraphics g, int mouseX, int mouseY, float partialTick) {
        BlockPos tablePos = menu.getBlockPos();
        if (tablePos != null) {
            List<CardPlayer> players = menu.getGame().getPlayers();
            int n = players.size();
            int[] chips = new int[n];
            int foldedMask = 0, allInMask = 0;
            for (int i = 0; i < n; i++) {
                chips[i] = menu.getChips(i);
                if (menu.isFolded(i)) foldedMask |= (1 << i);
                if (menu.isAllIn(i))  allInMask  |= (1 << i);
            }
            CasinoClientData.TABLE_POKER_CHIPS.put(tablePos, chips);
            CasinoClientData.TABLE_POKER_GAME_SLOT_COUNT.put(tablePos, menu.getGame().getSlots().size());
            CasinoClientData.TABLE_POKER_FOLDED.put(tablePos, foldedMask);
            CasinoClientData.TABLE_POKER_ALLIN.put(tablePos, allInMask);
            CasinoClientData.TABLE_POKER_STARTING_CHIPS.put(tablePos, menu.getStartingChips());
        }
        super.render(g, mouseX, mouseY, partialTick);
    }

    // ── renderBg ──────────────────────────────────────────────────────────────
    @Override
    protected void renderBg(@NotNull GuiGraphics g, float partialTick, int mouseX, int mouseY) {
        int bgBottom = bgBottom();
        g.blit(TEXTURE, 0, BG_TOP, 0, 0, width, bgBottom - BG_TOP, width, bgBottom - BG_TOP);

        boolean myTurn = menu.isCurrentPlayer() && menu.isGameReady()
                && menu.getPhase() != PokerPhase.SHOWDOWN;
        int myIdx = menu.getGame().getPlayers().indexOf(menu.getCardPlayer());

        if (!myTurn || (myIdx >= 0 && menu.isFolded(myIdx)) || (myIdx >= 0 && menu.isAllIn(myIdx))) {
            raiseMenuOpen = false;
            return;
        }

        int  callAmount = menu.getCallAmount();
        boolean canCheck = callAmount == 0;
        int  myChips    = myIdx >= 0 ? menu.getChips(myIdx) : 0;
        int  minRaise   = menu.getRaiseAmount();
        int  by         = btnY();

        // ── Action row: [Fold] [Check/Call] [Raise ▲/▼] [All-In] ───────────
        drawBtn(g, mouseX, mouseY, foldX(), by, BTN_W, BTN_H,
                Component.translatable("button.charta_casino.texas_holdem.fold"),
                true, COLOR_FOLD);

        drawBtn(g, mouseX, mouseY, callX(), by, BTN_W, BTN_H,
                canCheck
                        ? Component.translatable("button.charta_casino.texas_holdem.check")
                        : Component.translatable("button.charta_casino.texas_holdem.call").copy().append(" " + callAmount),
                true, COLOR_CHECK);

        drawBtn(g, mouseX, mouseY, raiseX(), by, RAISE_W, BTN_H,
                Component.literal(raiseMenuOpen ? "Raise ▼" : "Raise ▲"),
                myChips > 0, myChips > 0 ? COLOR_RAISE : COLOR_INACTIVE);

        drawBtn(g, mouseX, mouseY, allInX(), by, BTN_W, BTN_H,
                Component.translatable("button.charta_casino.texas_holdem.allin"),
                myChips > 0, myChips > 0 ? COLOR_ALLIN : COLOR_INACTIVE);

        // ── Raise sub-panel ──────────────────────────────────────────────────
        if (raiseMenuOpen && myChips > 0) {
            int panelW = QUICK_RAISES.length * (QW + QG) + FIELD_W + QG;
            int panelH = QH + 8;

            // Clamp panel so it never overflows the screen edges at any GUI Scale
            int px = Mth.clamp(
                    raiseX() + RAISE_W / 2 - panelW / 2,
                    2,
                    width - panelW - 2);
            int py = by - panelH - 4;

            // Panel background
            g.fill(px - 2, py - 2, px + panelW + 2, py + panelH + 2, 0xCC000000);
            g.fill(px - 1, py - 1, px + panelW + 1, py + panelH + 1, 0x88222222);

            // Quick-raise buttons (+10, +25, +50) using QH height
            for (int qi = 0; qi < QUICK_RAISES.length; qi++) {
                int qa  = QUICK_RAISES[qi];
                int qx  = px + qi * (QW + QG);
                int qy  = py + 4;
                boolean ok = myChips >= qa;
                drawBtn(g, mouseX, mouseY, qx, qy, QW, QH,
                        Component.literal("+" + qa), ok, ok ? COLOR_QUICK : COLOR_INACTIVE);
            }

            // Custom input field
            int fieldX = px + QUICK_RAISES.length * (QW + QG);
            int fieldY = py + 4;
            g.fill(fieldX,     fieldY,     fieldX + FIELD_W, fieldY + QH, 0xFF111111);
            g.fill(fieldX + 1, fieldY + 1, fieldX + FIELD_W - 1, fieldY + QH - 1,
                    customFieldFocused ? 0xFF334455 : 0xFF222222);

            String display   = customRaiseText.isEmpty() ? ("min " + minRaise) : customRaiseText;
            int    textColor = customRaiseText.isEmpty() ? 0xFF666666 : 0xFFFFFFFF;
            g.pose().pushPose();
            g.pose().translate(fieldX + 3, fieldY + (QH - 7) / 2f, 0);
            g.pose().scale(0.75f, 0.75f, 1f);
            g.drawString(font, display, 0, 0, textColor, false);
            if (customFieldFocused && (System.currentTimeMillis() / 500) % 2 == 0) {
                int cw = font.width(customRaiseText);
                g.fill(cw + 1, 0, cw + 2, 7, 0xFFFFFFFF);
            }
            g.pose().popPose();

            if (!customRaiseText.isEmpty()) {
                int sendX = fieldX + FIELD_W - 14;
                int sendY = fieldY + (QH - 10) / 2;
                g.fill(sendX, sendY, sendX + 12, sendY + 10, 0xFF228844);
                g.drawString(font, "↵", sendX + 2, sendY + 1, 0xFFFFFFFF, false);
            }
        }
    }

    // ── renderLabels ──────────────────────────────────────────────────────────
    @Override
    protected void renderLabels(@NotNull GuiGraphics g, int mouseX, int mouseY) {
        int cx      = width / 2 - leftPos;
        int titleY  = titleY();
        int statusY = statusY();
        PokerPhase phase = menu.getPhase();

        // Phase title
        String phaseName = switch (phase) {
            case PREFLOP  -> "Pre-Flop";
            case FLOP     -> "Flop";
            case TURN     -> "Turn";
            case RIVER    -> "River";
            case SHOWDOWN -> "Showdown";
        };
        Component phaseComp = Component.literal(phaseName)
                .withStyle(ChatFormatting.GOLD, ChatFormatting.BOLD);
        g.drawString(font, phaseComp, cx - font.width(phaseComp) / 2, titleY, 0xFFFFFF);

        // Pot
        Component potComp = Component.translatable("message.charta_casino.texas_holdem.pot", menu.getPot());
        g.drawString(font, potComp, cx - font.width(potComp) / 2, titleY + 10, 0xFFD700);

        // Current bet
        int currentBet = menu.getCurrentBet();
        if (currentBet > 0) {
            Component betComp = Component.literal("Bet: " + currentBet).withStyle(ChatFormatting.WHITE);
            g.drawString(font, betComp, cx - font.width(betComp) / 2, titleY + 20, 0xFFFFFF);
        }

        // Turn / showdown / status
        if (phase == PokerPhase.SHOWDOWN) {
            Component bannerMsg = null;
            var history = ChartaModClient.LOCAL_HISTORY;
            for (int i = history.size() - 1; i >= 0; i--) {
                var entry = history.get(i);
                if (entry.getLeft().getString().isEmpty()) { bannerMsg = entry.getRight(); break; }
            }
            if (bannerMsg != null) {
                int bw = font.width(bannerMsg) + 12;
                int bx = cx - bw / 2;
                g.fill(bx - 1, statusY - 4, bx + bw + 1, statusY + 12, 0xCC000000);
                g.fill(bx,     statusY - 3, bx + bw,     statusY + 11, 0x88004400);
                g.drawString(font, bannerMsg, cx - font.width(bannerMsg) / 2, statusY, 0xFFD700);
            }
        } else if (menu.isGameReady()) {
            CardPlayer current = menu.getCurrentPlayer();
            if (current == null) {
                Component waitComp = Component.translatable("message.charta.dealing_cards").withStyle(ChatFormatting.GOLD);
                g.drawString(font, waitComp, cx - font.width(waitComp) / 2, statusY, 0xFFFFFF);
                return;
            }
            Component turnComp = menu.isCurrentPlayer()
                    ? Component.translatable("message.charta.your_turn").withStyle(ChatFormatting.GREEN)
                    : Component.translatable("message.charta.other_turn", current.getName())
                    .withStyle(s -> s.withColor(current.getColor().getTextureDiffuseColor()));
            g.drawString(font, turnComp, cx - font.width(turnComp) / 2, statusY, 0xFFFFFF);
        } else if (menu.isPaused()) {
            Component nextComp = Component.literal("Next hand starting...").withStyle(ChatFormatting.YELLOW);
            g.drawString(font, nextComp, cx - font.width(nextComp) / 2, statusY, 0xFFFFFF);
        } else {
            Component dealComp = Component.translatable("message.charta.dealing_cards").withStyle(ChatFormatting.GOLD);
            g.drawString(font, dealComp, cx - font.width(dealComp) / 2, statusY, 0xFFFFFF);
        }
    }

    // ── Input handling ────────────────────────────────────────────────────────
    @Override
    public boolean mouseClicked(double mouseX, double mouseY, int button) {
        boolean myTurn = menu.isCurrentPlayer() && menu.isGameReady()
                && menu.getPhase() != PokerPhase.SHOWDOWN;
        int myIdx    = menu.getGame().getPlayers().indexOf(menu.getCardPlayer());
        boolean isFolded = myIdx >= 0 && menu.isFolded(myIdx);
        boolean isAllIn  = myIdx >= 0 && menu.isAllIn(myIdx);

        if (myTurn && !isFolded && !isAllIn) {
            int myChips  = myIdx >= 0 ? menu.getChips(myIdx) : 0;
            int minRaise = menu.getRaiseAmount();
            int by       = btnY();

            // Main action buttons
            if (hit(mouseX, mouseY, foldX(),  by, BTN_W, BTN_H)) {
                raiseMenuOpen = false; sendAction(TexasHoldemGame.ACTION_FOLD); return true;
            }
            if (hit(mouseX, mouseY, callX(),  by, BTN_W, BTN_H)) {
                raiseMenuOpen = false; sendAction(TexasHoldemGame.ACTION_CALL); return true;
            }
            if (myChips > 0 && hit(mouseX, mouseY, raiseX(), by, RAISE_W, BTN_H)) {
                raiseMenuOpen = !raiseMenuOpen;
                customRaiseText    = "";
                customFieldFocused = false;
                return true;
            }
            if (myChips > 0 && hit(mouseX, mouseY, allInX(), by, BTN_W, BTN_H)) {
                raiseMenuOpen = false; sendAction(TexasHoldemGame.ACTION_ALL_IN); return true;
            }

            // Raise sub-panel interactions
            if (raiseMenuOpen && myChips > 0) {
                int panelW = QUICK_RAISES.length * (QW + QG) + FIELD_W + QG;
                int panelH = QH + 8;
                int px = Mth.clamp(raiseX() + RAISE_W / 2 - panelW / 2, 2, width - panelW - 2);
                int py = by - panelH - 4;

                // Quick-raise buttons — use QH for correct hit detection
                for (int qi = 0; qi < QUICK_RAISES.length; qi++) {
                    int qa = QUICK_RAISES[qi];
                    int qx = px + qi * (QW + QG);
                    int qy = py + 4;
                    if (myChips >= qa && hit(mouseX, mouseY, qx, qy, QW, QH)) {
                        int raise = Math.max(minRaise, qa);
                        raiseMenuOpen = false; customRaiseText = "";
                        sendAction(TexasHoldemGame.ACTION_RAISE_CUSTOM + raise);
                        return true;
                    }
                }

                // Custom input field — use QH for correct hit detection
                int fieldX = px + QUICK_RAISES.length * (QW + QG);
                int fieldY = py + 4;
                if (hit(mouseX, mouseY, fieldX, fieldY, FIELD_W, QH)) {
                    customFieldFocused = true;
                    if (!customRaiseText.isEmpty()) {
                        int sendX = fieldX + FIELD_W - 14;
                        int sendY = fieldY + (QH - 10) / 2;
                        if (mouseX >= sendX && mouseX < sendX + 12 && mouseY >= sendY && mouseY < sendY + 10) {
                            tryConfirmCustomRaise(minRaise, myChips);
                            return true;
                        }
                    }
                    return true;
                } else {
                    customFieldFocused = false;
                }

                // Click outside the panel closes it
                if (!hit(mouseX, mouseY, px - 2, py - 2, panelW + 4, panelH + 4)) {
                    raiseMenuOpen = false;
                }
            }
        }
        return super.mouseClicked(mouseX, mouseY, button);
    }

    @Override
    public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
        if (raiseMenuOpen && customFieldFocused) {
            if (keyCode == 257 || keyCode == 335) { // Enter / Numpad Enter
                int myIdx   = menu.getGame().getPlayers().indexOf(menu.getCardPlayer());
                int myChips = myIdx >= 0 ? menu.getChips(myIdx) : 0;
                tryConfirmCustomRaise(menu.getRaiseAmount(), myChips);
                return true;
            }
            if (keyCode == 259 && !customRaiseText.isEmpty()) { // Backspace
                customRaiseText = customRaiseText.substring(0, customRaiseText.length() - 1);
                return true;
            }
            if (keyCode == 256) { // Escape
                raiseMenuOpen = false; customRaiseText = ""; customFieldFocused = false;
                return true;
            }
            return true; // consume all keys while field is focused
        }
        return super.keyPressed(keyCode, scanCode, modifiers);
    }

    @Override
    public boolean charTyped(char ch, int modifiers) {
        if (raiseMenuOpen && customFieldFocused) {
            if (Character.isDigit(ch) && customRaiseText.length() < 6) customRaiseText += ch;
            return true;
        }
        return super.charTyped(ch, modifiers);
    }

    // ── Top/Bottom bars ────────────────────────────────────────────────────────
    @Override
    public void renderTopBar(@NotNull GuiGraphics g) {
        super.renderTopBar(g);
        List<CardPlayer> players = menu.getGame().getPlayers();
        int n = players.size();
        float playerSlotW = CardSlot.getWidth(CardSlot.Type.PREVIEW) + 28f;
        float playersWidth = n * playerSlotW + (n - 1f) * (playerSlotW / 10f);

        for (int i = 0; i < n; i++) {
            float px = width / 2f - playersWidth / 2f + i * (playerSlotW + playerSlotW / 10f);
            DyeColor color = players.get(i).getColor();
            g.fill(Mth.floor(px), 28, Mth.ceil(px + playerSlotW), 40,
                    0x88000000 + color.getTextureDiffuseColor());
            if (i < n - 1) {
                g.fill(Mth.ceil(px + playerSlotW), 28,
                        Mth.floor(px + playerSlotW + playerSlotW / 10f), 40, 0x88000000);
            }
        }
        g.fill(0, 28, Mth.floor((width - playersWidth) / 2f), 40, 0x88000000);
        g.fill(width - Mth.floor((width - playersWidth) / 2f), 28, width, 40, 0x88000000);

        for (int i = 0; i < n; i++) {
            float px = width / 2f - playersWidth / 2f + i * (playerSlotW + playerSlotW / 10f);
            boolean fd     = menu.isFolded(i);
            boolean ai     = menu.isAllIn(i);
            boolean dealer = i == menu.getDealerIndex();
            int chips      = menu.getChips(i);
            int bet        = menu.getRoundBet(i);

            String chipStr = fd ? "Fold" : ai ? "All-In" : chips + "♦";
            if (dealer)          chipStr = "[D] " + chipStr;
            if (bet > 0 && !fd)  chipStr += "(" + bet + ")";
            int textColor = fd ? 0xAAAAAA : ai ? 0xFFD700 : 0xFFFFFF;

            g.pose().pushPose();
            g.pose().translate(px + 26f, 29f, 0f);
            g.pose().scale(0.5f, 0.5f, 0.5f);
            g.drawString(font, chipStr, 0, 0, textColor, true);
            g.pose().popPose();
        }
    }

    @Override
    public void renderBottomBar(@NotNull GuiGraphics g) {
        DyeColor color = menu.getCardPlayer().getColor();
        int tw = Mth.floor(CardSlot.getWidth(CardSlot.Type.HORIZONTAL)) + 10;
        g.fill(0,                 bgBottom(), (width - tw) / 2,          height, 0x88000000);
        g.fill((width - tw) / 2, bgBottom(), (width - tw) / 2 + tw,     height, 0x88000000 + color.getTextureDiffuseColor());
        g.fill((width-tw)/2+tw,  bgBottom(), width,                      height, 0x88000000);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Returns the left-x for a centred button row, clamped to always stay
     * within the screen bounds. This ensures layout correctness at any GUI Scale.
     */
    private int rowStartX(int totalW) {
        return Math.max(2, (width - totalW) / 2);
    }

    /** Hit-test for a button of arbitrary width and height. */
    private boolean hit(double mx, double my, int ax, int ay, int w, int h) {
        return mx >= ax && mx < ax + w && my >= ay && my < ay + h;
    }

    private void tryConfirmCustomRaise(int minRaise, int myChips) {
        try {
            int val   = Integer.parseInt(customRaiseText);
            int raise = Mth.clamp(Math.max(val, minRaise), minRaise, myChips);
            raiseMenuOpen      = false;
            customRaiseText    = "";
            customFieldFocused = false;
            sendAction(TexasHoldemGame.ACTION_RAISE_CUSTOM + raise);
        } catch (NumberFormatException ignored) {
            customRaiseText = "";
        }
    }

    private void sendAction(int action) {
        ChartaMod.getPacketManager().sendToServer(new TexasHoldemActionPayload(action));
    }

    /**
     * Draws a styled button with configurable width and height.
     *
     * @param w button width  (BTN_W for main actions, RAISE_W for raise toggle, QW for quick chips)
     * @param h button height (BTN_H for main actions, QH for raise sub-panel buttons)
     */
    private void drawBtn(GuiGraphics g, int mx, int my, int ax, int ay, int w, int h,
                         Component label, boolean active, int baseColor) {
        int color = active ? baseColor : COLOR_INACTIVE;
        int ca    = 0xFF000000 | color;
        int light = 0xFF000000 | lighten(color);
        int dark  = 0xFF000000 | darken(color);

        // Bevel / shadow
        g.fill(ax + 2, ay + h - 1, ax + w - 1, ay + h,    dark);
        g.fill(ax + w - 1, ay + 2, ax + w,     ay + h,    dark);
        g.fill(ax,     ay,     ax + w - 1, ay + 1,        light);
        g.fill(ax,     ay + 1, ax + 1,     ay + h - 1,    light);
        // Fill
        g.fill(ax + 1, ay + 1, ax + w - 1, ay + h - 1,    ca);
        // Top sheen
        g.fill(ax + 1, ay + 1, ax + w - 1, ay + 1 + h / 3, 0x22FFFFFF);
        // Label (with shadow)
        int tx = ax + w / 2 - font.width(label) / 2;
        int ty = ay + (h - 8) / 2;
        g.drawString(font, label, tx + 1, ty + 1, 0x44000000, false);
        g.drawString(font, label, tx,     ty,     0xFFFFFFFF, false);
        // Hover highlight
        if (active && mx >= ax && mx < ax + w && my >= ay && my < ay + h) {
            g.fill(ax + 1, ay + 1, ax + w - 1, ay + h - 1, 0x33FFFFFF);
            g.fill(ax + 1, ay + 1, ax + w - 1, ay + 2,     0x44FFFFFF);
        }
    }
}