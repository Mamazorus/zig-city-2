package by.deokma.casino.game.blackjack;

import dev.lucaargolo.charta.client.render.screen.GameScreen;
import dev.lucaargolo.charta.common.ChartaMod;
import dev.lucaargolo.charta.common.game.Ranks;
import dev.lucaargolo.charta.common.game.api.CardPlayer;
import dev.lucaargolo.charta.common.menu.CardSlot;
import net.minecraft.ChatFormatting;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.item.DyeColor;
import org.jetbrains.annotations.NotNull;

import java.util.List;

public class BlackjackScreen extends GameScreen<BlackjackGame, BlackjackMenu> {

    // ── Button dimensions ─────────────────────────────────────────────────────
    private static final int BTN_W = 52;
    private static final int BTN_H = 20;
    private static final int BTN_GAP = 6;

    // ── Colours ───────────────────────────────────────────────────────────────
    private static final int COLOR_HIT = 0x228844;
    private static final int COLOR_STAND = 0xAA2222;
    private static final int COLOR_DOUBLE = 0xBB7700;
    private static final int COLOR_BET = 0x446688;
    private static final int COLOR_INACTIVE = 0x444444;

    // ── Quick-bet amounts ─────────────────────────────────────────────────────
    private static final int[] QUICK_BETS = {1, 2, 3, 4, 5, 10};

    // ── Layout ────────────────────────────────────────────────────────────────
    private static final int BG_TOP = 40;
    private static final int BG_BOTTOM_OFFSET = 63;
    private static final int BTN_ROW_MARGIN = 6;
    private static final int STRIP_H = 26; // player-info strip height above buttons
    private static final int PLAYER_LABEL_SCALE_PREF = 26; // preferred px offset of name text in top-bar

    /**
     * Bottom edge of the green felt area (screen-space).
     */
    private int bgBottom() {
        return height - BG_BOTTOM_OFFSET;
    }

    /**
     * Y of the action-button row (screen-space).
     */
    private int btnY() {
        return bgBottom() - BTN_H - BTN_ROW_MARGIN;
    }

    /**
     * Vertical centre of the card play area (GUI-relative).
     */
    private int cardAreaCenterY() {
        return (BG_TOP + bgBottom()) / 2 - topPos;
    }

    /**
     * Y for the "Your hand" label above player cards (GUI-relative).
     */
    private int handLabelY() {
        return bgBottom() - topPos - 80;
    }

    /**
     * Y for the phase title above dealer cards (GUI-relative).
     */
    private int titleY() {
        return BG_TOP - topPos + 4;
    }

    /**
     * Width of a player slot in the top bar.
     */
    private float playerSlotW() {
        return CardSlot.getWidth(CardSlot.Type.PREVIEW) + 42f;
    }

    // ── Betting-input state ───────────────────────────────────────────────────
    private String customBetText = "";
    private boolean customBetFocused = false;
    private int lastBet = 0;                       // remembers the previous round's bet
    private BlackjackGame.Phase prevPhase = null;  // detects entry into a new betting round


    // ── Constructor ───────────────────────────────────────────────────────────
    public BlackjackScreen(BlackjackMenu menu, Inventory playerInventory, Component title) {
        super(menu, playerInventory, title);
        this.imageWidth = 256;
        this.imageHeight = 230;
    }

    // ── Colour helpers ────────────────────────────────────────────────────────
    private static int lighten(int c) {
        int r = Math.min(255, ((c >> 16) & 0xFF) + 70);
        int g = Math.min(255, ((c >> 8) & 0xFF) + 70);
        int b = Math.min(255, (c & 0xFF) + 70);
        return (r << 16) | (g << 8) | b;
    }

    private static int darken(int c) {
        int r = Math.max(0, ((c >> 16) & 0xFF) - 55);
        int g = Math.max(0, ((c >> 8) & 0xFF) - 55);
        int b = Math.max(0, (c & 0xFF) - 55);
        return (r << 16) | (g << 8) | b;
    }

    // ── renderBg ──────────────────────────────────────────────────────────────
    @Override
    protected void renderBg(@NotNull GuiGraphics g, float pt, int mx, int my) {
        int bgBottom = bgBottom();

        // Persist the previous round's bet: pre-fill the input when a new betting round starts.
        BlackjackGame.Phase curPhase = menu.getPhase();
        if (curPhase == BlackjackGame.Phase.BETTING && prevPhase != BlackjackGame.Phase.BETTING && !customBetFocused) {
            customBetText = lastBet > 0 ? String.valueOf(lastBet) : "";
        }
        prevPhase = curPhase;

        // Felt background
        g.fill(0, BG_TOP, width, bgBottom, 0xFF1B5E20);
        g.fill(2, BG_TOP + 2, width - 2, bgBottom - 2, 0xFF2E7D32);

        // Erase dealer-slot borders (paint felt over the 38×53 WIDGETS blit)
        for (int di = 0; di < BlackjackGame.MAX_DEALER_CARDS; di++) {
            var slot = menu.cardSlots.get(menu.dealerSlotStart + di);
            int sx = leftPos + (int) slot.x;
            int sy = topPos + (int) slot.y;
            g.fill(sx - 1, sy - 1, sx + 39, sy + 54, 0xFF2E7D32);
        }

        BlackjackGame.Phase phase = menu.getPhase();
        boolean myTurn = menu.isCurrentPlayer() && menu.isGameReady();
        int myIdx = menu.getGame().getPlayers().indexOf(menu.getCardPlayer());

        // ── Per-player info strip (non-BETTING phases) ─────────────────────
        if (phase != BlackjackGame.Phase.BETTING) {
            List<CardPlayer> plrs = menu.getGame().getPlayers();
            int n = plrs.size();
            int colW = width / Math.max(1, n);
            int stripY = btnY() - STRIP_H;

            for (int i = 0; i < n; i++) {
                if (menu.isPlayerLeft(i)) continue;

                int chips = menu.getChips(i), bet = menu.getBet(i);
                boolean busted = menu.isBusted(i), stood = menu.isStood(i);

                // Hand value with ace reduction
                var hand = menu.getGame().getCensoredHand(menu.getCardPlayer(), plrs.get(i));
                int rawSum = 0, aceCount = 0;
                for (var c : hand.stream().toList()) {
                    if (c.rank() == Ranks.ACE) {
                        rawSum += 11;
                        aceCount++;
                    } else {
                        int ord = c.rank().ordinal();
                        rawSum += (ord >= 2 && ord <= 10) ? ord : 10;
                    }
                }
                int hv = rawSum, acesReduced = 0;
                while (hv > 21 && aceCount > 0) {
                    hv -= 10;
                    aceCount--;
                    acesReduced++;
                }

                String name = plrs.get(i).getName().getString();
                if (name.length() > 8) name = name.substring(0, 7) + ".";

                String hvStr = busted ? hv + " BUST"
                        : hv == 21 ? hv + " ★"
                        : acesReduced > 0 ? hv + " (A=1)"
                        : String.valueOf(hv);
                int l1col = busted ? 0xFF5555 : hv == 21 ? 0xFFD700 : 0xFFFFFF;
                String line1 = name + "  " + hvStr;

                String line2;
                int l2col;
                if (busted) {
                    line2 = chips + "♦  lost " + bet + "♦";
                    l2col = 0xFF7777;
                } else if (stood) {
                    line2 = chips + "♦  bet " + bet + "♦  Stand";
                    l2col = 0xAAFFAA;
                } else if (bet > 0) {
                    line2 = chips + "♦  bet " + bet + "♦";
                    l2col = 0xDDDDDD;
                } else {
                    line2 = chips + "♦";
                    l2col = 0xAAAAAA;
                }

                int cx = i * colW + colW / 2;
                g.drawString(font, line1, cx - font.width(line1) / 2, stripY, l1col, true);
                g.drawString(font, line2, cx - font.width(line2) / 2, stripY + 10, l2col, true);
            }
        }

        // ── BETTING phase: quick bets + custom field ──────────────────────
        boolean myBetPending = myIdx >= 0 && menu.getBet(myIdx) == 0 && menu.getMyChips() > 0;
        if (phase == BlackjackGame.Phase.BETTING && myBetPending && menu.isGameReady()) {
            // Row: [10♦][25♦][50♦][100♦][custom]
            int totalW = QUICK_BETS.length * (BTN_W + BTN_GAP) + BTN_W;
            int bx = rowStartX(totalW);
            int by = btnY();

            for (int qi = 0; qi < QUICK_BETS.length; qi++) {
                int qa = QUICK_BETS[qi];
                int qx = bx + qi * (BTN_W + BTN_GAP);
                boolean ok = menu.getMyChips() >= qa;
                drawBtn(g, mx, my, qx, by, BTN_W, BTN_H,
                        Component.literal(qa + "♦"), ok, ok ? COLOR_BET : COLOR_INACTIVE);
            }

            // Custom-bet input field
            int fieldX = bx + QUICK_BETS.length * (BTN_W + BTN_GAP);
            g.fill(fieldX, by, fieldX + BTN_W, by + BTN_H, 0xFF111111);
            g.fill(fieldX + 1, by + 1, fieldX + BTN_W - 1, by + BTN_H - 1,
                    customBetFocused ? 0xFF334455 : 0xFF222222);
            String disp = customBetText.isEmpty() ? "bet..." : customBetText;
            int tc = customBetText.isEmpty() ? 0xFF666666 : 0xFFFFFFFF;
            g.pose().pushPose();
            g.pose().translate(fieldX + 3, by + (BTN_H - 7) / 2f, 0);
            g.pose().scale(0.75f, 0.75f, 1f);
            g.drawString(font, disp, 0, 0, tc, false);
            if (customBetFocused && (System.currentTimeMillis() / 500) % 2 == 0) {
                g.fill(font.width(customBetText) + 1, 0, font.width(customBetText) + 2, 7, 0xFFFFFFFF);
            }
            g.pose().popPose();
            if (!customBetText.isEmpty()) {
                int sx = fieldX + BTN_W - 14, sy = by + (BTN_H - 10) / 2;
                g.fill(sx, sy, sx + 12, sy + 10, 0xFF228844);
                g.drawString(font, "↵", sx + 2, sy + 1, 0xFFFFFFFF, false);
            }
        }

        // ── PLAYING phase: Hit / Stand / Double ───────────────────────────
        if (phase == BlackjackGame.Phase.PLAYING && myTurn) {
            boolean stood = myIdx >= 0 && menu.isStood(myIdx);
            boolean busted = myIdx >= 0 && menu.isBusted(myIdx);

            if (!stood && !busted) {
                boolean canDouble = menu.getMyChips() > 0
                        && menu.getGame().getPlayerHand(menu.getCardPlayer()).stream().count() == 2;
                int totalW = 3 * BTN_W + 2 * BTN_GAP;
                int bx = rowStartX(totalW);
                int by = btnY();

                drawBtn(g, mx, my, bx, by, BTN_W, BTN_H,
                        Component.translatable("button.charta_casino.blackjack.hit"), true, COLOR_HIT);
                drawBtn(g, mx, my, bx + BTN_W + BTN_GAP, by, BTN_W, BTN_H,
                        Component.translatable("button.charta_casino.blackjack.stand"), true, COLOR_STAND);
                drawBtn(g, mx, my, bx + 2 * (BTN_W + BTN_GAP), by, BTN_W, BTN_H,
                        Component.translatable("button.charta_casino.blackjack.double"), canDouble,
                        canDouble ? COLOR_DOUBLE : COLOR_INACTIVE);
            }
        }
    }

    // ── renderLabels ──────────────────────────────────────────────────────────
    @Override
    protected void renderLabels(@NotNull GuiGraphics g, int mx, int my) {
        int cx = width / 2 - leftPos;
        int titleY = titleY();
        BlackjackGame.Phase phase = menu.getPhase();

        // Phase title (above dealer cards)
        String phaseStr = switch (phase) {
            case BETTING -> "♠ Place Your Bets ♠";
            case PLAYING -> "♠ Your Turn ♠";
            case DEALER -> "♠ Dealer's Turn ♠";
            case RESULT -> "♠ Results ♠";
        };
        Component phaseComp = Component.literal(phaseStr)
                .withStyle(ChatFormatting.GOLD, ChatFormatting.BOLD);
        g.drawString(font, phaseComp, cx - font.width(phaseComp) / 2, titleY, 0xFFFFFF);

        // Dealer value (non-betting phases)
        if (phase != BlackjackGame.Phase.BETTING) {
            String dealerStr;
            int dealerColor;
            if (menu.dealerHasHoleCard()) {
                dealerStr = "Dealer: " + menu.getDealerVisibleValue() + " + ?";
                dealerColor = 0xFFFFFF;
            } else {
                int dv = menu.getDealerValue();
                if (dv > 21) {
                    dealerStr = "Dealer: " + dv + " — BUST!";
                    dealerColor = 0xFF4444;
                } else if (dv == 21) {
                    dealerStr = "Dealer: " + dv + " ★";
                    dealerColor = 0xFFD700;
                } else {
                    dealerStr = "Dealer: " + dv;
                    dealerColor = dv >= 17 ? 0xFFFF55 : 0xFFFFFF;
                }
            }
            int dty = titleY + 11;
            g.fill(cx - font.width(dealerStr) / 2 - 2, dty - 1, cx + font.width(dealerStr) / 2 + 2, dty + 10, 0x66000000);
            g.drawString(font, dealerStr, cx - font.width(dealerStr) / 2, dty, dealerColor);
        }

        // Result banner
        if (phase == BlackjackGame.Phase.RESULT) {
            int myIdx = menu.getGame().getPlayers().indexOf(menu.getCardPlayer());
            int hv = menu.getHandValue();
            int dv = menu.getDealerValue();
            boolean bust = myIdx >= 0 && menu.isBusted(myIdx);
            int bet = myIdx >= 0 ? menu.getBet(myIdx) : 0;
            int chips = myIdx >= 0 ? menu.getChips(myIdx) : 0;
            boolean bj = hv == 21 && menu.getGame().getPlayerHand(menu.getCardPlayer()).stream().count() == 2;

            String resultStr;
            int resultColor;
            if (bust) {
                resultStr = "You bust (" + hv + ") — Dealer wins";
                resultColor = 0xFF4444;
            } else if (dv > 21) {
                int win = bj ? (int) (bet * 1.5) : bet;
                resultStr = "Dealer busts! You win +" + win + "♦";
                resultColor = 0x55FF55;
            } else if (hv > dv) {
                int win = bj ? (int) (bet * 1.5) : bet;
                resultStr = (bj ? "BLACKJACK! " : "You win! ") + "+" + win + "♦";
                resultColor = 0x55FF55;
            } else if (hv == dv) {
                resultStr = "Push — bet returned (" + chips + "♦)";
                resultColor = 0xFFFF55;
            } else {
                resultStr = "Dealer wins  " + dv + " > " + hv;
                resultColor = 0xFF4444;
            }

            int rw = font.width(resultStr);
            int ry = cardAreaCenterY();
            g.fill(cx - rw / 2 - 4, ry - 1, cx + rw / 2 + 4, ry + 13, 0xCC000000);
            g.drawString(font, resultStr, cx - rw / 2, ry + 21, resultColor, true);
        }

        // "Your hand" label
        if (phase != BlackjackGame.Phase.BETTING) {
            int myIdx = menu.getGame().getPlayers().indexOf(menu.getCardPlayer());
            int hv = menu.getHandValue();
            boolean bust = myIdx >= 0 && menu.isBusted(myIdx);
            boolean stood = myIdx >= 0 && menu.isStood(myIdx);
            String handStr = "Your hand: " + hv;
            if (!bust && hv == 21) handStr += " ★ 21!";
            if (bust) handStr = "Your hand: " + hv + " — BUST";
            if (stood && !bust) handStr += " (stood)";
            int handColor = bust ? 0xFF4444 : hv == 21 ? 0xFFD700 : 0xFFFFFF;
            g.drawString(font, handStr, cx - font.width(handStr) / 2, handLabelY(), handColor);
        }

        // Turn / status message
        int statusY = cardAreaCenterY() + 20;
        if (phase == BlackjackGame.Phase.PLAYING && menu.isGameReady()) {
            try {
                CardPlayer cur = menu.getCurrentPlayer();
                Component turnComp = menu.isCurrentPlayer()
                        ? Component.translatable("message.charta.your_turn").withStyle(ChatFormatting.GREEN)
                        : Component.translatable("message.charta.other_turn", cur.getName())
                        .withStyle(s -> s.withColor(cur.getColor().getTextureDiffuseColor()));
                g.drawString(font, turnComp, cx - font.width(turnComp) / 2, statusY, 0xFFFFFF);
            } catch (Exception ignored) {
            }
        } else if (phase == BlackjackGame.Phase.BETTING) {
            int myIdx = menu.getGame().getPlayers().indexOf(menu.getCardPlayer());
            int myBet = myIdx >= 0 ? menu.getBet(myIdx) : 0;
            Component msg = myBet > 0
                    ? Component.literal("Bet placed: " + myBet + "♦  Waiting for others...").withStyle(ChatFormatting.YELLOW)
                    : Component.literal("Choose your bet!").withStyle(ChatFormatting.YELLOW);
            g.drawString(font, msg, cx - font.width(msg) / 2, statusY, 0xFFFFFF);
        } else if (phase == BlackjackGame.Phase.DEALER) {
            Component msg = Component.literal("Dealer is playing...").withStyle(ChatFormatting.GRAY);
            g.drawString(font, msg, cx - font.width(msg) / 2, statusY, 0xFFFFFF);
        }

        // Player-chip/status info in top bar (GUI-relative coords)
        List<CardPlayer> players = menu.getGame().getPlayers();
        int n = players.size();
        float slotW = playerSlotW();
        float totalW = n * slotW + (n - 1f) * (slotW / 10f);
        for (int i = 0; i < n; i++) {
            float px = width / 2f - totalW / 2f + i * (slotW + slotW / 10f);
            int chips = menu.getChips(i), bet = menu.getBet(i);
            boolean busted = menu.isBusted(i), stood = menu.isStood(i);

            String chipStr = chips + "♦";
            int chipColor = chips == 0 ? 0x888888 : 0xFFFFFF;
            String statusStr = "";
            int statusColor = 0xFFFFFF;
            if (busted) {
                statusStr = "BUST!";
                statusColor = 0xFF4444;
            } else if (stood) {
                statusStr = "Stand ✓";
                statusColor = 0xAAFFAA;
            } else if (bet > 0 && phase != BlackjackGame.Phase.BETTING) {
                statusStr = "Bet: " + bet;
            } else if (bet > 0) {
                statusStr = "✓ " + bet + "♦";
                statusColor = 0xAAFFAA;
            }

            g.pose().pushPose();
            g.pose().translate(px + 26f - leftPos, 29f - topPos, 0f);
            g.pose().scale(0.65f, 0.65f, 0.65f);
            g.drawString(font, chipStr, 0, 0, chipColor, true);
            if (!statusStr.isEmpty()) g.drawString(font, statusStr, 0, 10, statusColor, true);
            g.pose().popPose();
        }
    }

    // ── Input handling ────────────────────────────────────────────────────────
    @Override
    public boolean mouseClicked(double mx, double my, int button) {
        BlackjackGame.Phase phase = menu.getPhase();
        boolean myTurn = menu.isCurrentPlayer() && menu.isGameReady();
        int myIdx = menu.getGame().getPlayers().indexOf(menu.getCardPlayer());

        // BETTING phase
        boolean myBetPending = myIdx >= 0 && menu.getBet(myIdx) == 0 && menu.getMyChips() > 0;
        if (phase == BlackjackGame.Phase.BETTING && myBetPending && menu.isGameReady()) {
            int totalW = QUICK_BETS.length * (BTN_W + BTN_GAP) + BTN_W;
            int bx = rowStartX(totalW);
            int by = btnY();

            for (int qi = 0; qi < QUICK_BETS.length; qi++) {
                int qa = QUICK_BETS[qi];
                int qx = bx + qi * (BTN_W + BTN_GAP);
                if (menu.getMyChips() >= qa && hit(mx, my, qx, by, BTN_W, BTN_H)) {
                    sendBet(qa);
                    return true;
                }
            }

            int fieldX = bx + QUICK_BETS.length * (BTN_W + BTN_GAP);
            if (hit(mx, my, fieldX, by, BTN_W, BTN_H)) {
                customBetFocused = true;
                if (!customBetText.isEmpty()) {
                    int sx = fieldX + BTN_W - 14, sy = by + (BTN_H - 10) / 2;
                    if (mx >= sx && mx < sx + 12 && my >= sy && my < sy + 10) {
                        tryConfirmBet();
                        return true;
                    }
                }
                return true;
            } else {
                customBetFocused = false;
            }
        }

        // PLAYING phase
        if (phase == BlackjackGame.Phase.PLAYING && myTurn) {
            if (myIdx >= 0 && !menu.isStood(myIdx) && !menu.isBusted(myIdx)) {
                boolean canDouble = menu.getMyChips() > 0
                        && menu.getGame().getPlayerHand(menu.getCardPlayer()).stream().count() == 2;
                int totalW = 3 * BTN_W + 2 * BTN_GAP;
                int bx = rowStartX(totalW);
                int by = btnY();

                if (hit(mx, my, bx, by, BTN_W, BTN_H)) {
                    sendAction(BlackjackGame.ACTION_HIT);
                    return true;
                }
                if (hit(mx, my, bx + BTN_W + BTN_GAP, by, BTN_W, BTN_H)) {
                    sendAction(BlackjackGame.ACTION_STAND);
                    return true;
                }
                if (canDouble && hit(mx, my, bx + 2 * (BTN_W + BTN_GAP), by, BTN_W, BTN_H)) {
                    sendAction(BlackjackGame.ACTION_DOUBLE);
                    return true;
                }
            }
        }

        return super.mouseClicked(mx, my, button);
    }

    @Override
    public boolean keyPressed(int keyCode, int scanCode, int modifiers) {
        if (customBetFocused) {
            if (keyCode == 257 || keyCode == 335) {
                tryConfirmBet();
                return true;
            }
            if (keyCode == 259 && !customBetText.isEmpty()) {
                customBetText = customBetText.substring(0, customBetText.length() - 1);
                return true;
            }
            if (keyCode == 256) {
                customBetFocused = false;
                customBetText = "";
                return true;
            }
            return true; // consume all keys while field is focused
        }
        return super.keyPressed(keyCode, scanCode, modifiers);
    }

    @Override
    public boolean charTyped(char ch, int modifiers) {
        if (customBetFocused && Character.isDigit(ch) && customBetText.length() < 6) {
            customBetText += ch;
            return true;
        }
        return super.charTyped(ch, modifiers);
    }

    // ── Top/Bottom bars ───────────────────────────────────────────────────────
    @Override
    public void renderTopBar(@NotNull GuiGraphics g) {
        super.renderTopBar(g);
        List<CardPlayer> players = menu.getGame().getPlayers();
        int n = players.size();
        float slotW = CardSlot.getWidth(CardSlot.Type.PREVIEW) + 28f;
        float total = n * slotW + (n - 1f) * (slotW / 10f);
        for (int i = 0; i < n; i++) {
            float px = width / 2f - total / 2f + i * (slotW + slotW / 10f);
            DyeColor col = players.get(i).getColor();
            g.fill(Mth.floor(px), 28, Mth.ceil(px + slotW), 40, 0x88000000 + col.getTextureDiffuseColor());
        }
        g.fill(0, 28, Mth.floor((width - total) / 2f), 40, 0x88000000);
        g.fill(width - Mth.floor((width - total) / 2f), 28, width, 40, 0x88000000);
    }

    @Override
    public void renderBottomBar(@NotNull GuiGraphics g) {
        DyeColor col = menu.getCardPlayer().getColor();
        int tw = Mth.floor(CardSlot.getWidth(CardSlot.Type.HORIZONTAL)) + 10;
        g.fill(0, bgBottom(), (width - tw) / 2, height, 0x88000000);
        g.fill((width - tw) / 2, bgBottom(), (width - tw) / 2 + tw, height, 0x88000000 + col.getTextureDiffuseColor());
        g.fill((width - tw) / 2 + tw, bgBottom(), width, height, 0x88000000);
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    /**
     * Returns the left-x for a centred button row, clamped to always stay
     * within the screen bounds. This ensures layout correctness at any GUI Scale.
     */
    private int rowStartX(int totalW) {
        return Math.max(2, (width - totalW) / 2);
    }

    /**
     * Hit-test for a button of arbitrary width and height.
     */
    private boolean hit(double mx, double my, int ax, int ay, int w, int h) {
        return mx >= ax && mx < ax + w && my >= ay && my < ay + h;
    }

    private void tryConfirmBet() {
        try {
            int clamped = Mth.clamp(Integer.parseInt(customBetText), 1, menu.getMyChips());
            sendBet(clamped);
        } catch (NumberFormatException ignored) {
        }
        customBetText = "";
        customBetFocused = false;
    }

    private void sendBet(int amount) {
        lastBet = amount;
        ChartaMod.getPacketManager().sendToServer(
                new by.deokma.casino.network.BlackjackActionPayload(BlackjackGame.ACTION_BET + amount));
    }

    private void sendAction(int action) {
        ChartaMod.getPacketManager().sendToServer(
                new by.deokma.casino.network.BlackjackActionPayload(action));
    }

    /**
     * Draws a styled button.
     *
     * @param w button width
     * @param h button height (pass BTN_H for standard, or QH for smaller sub-panel buttons)
     */
    private void drawBtn(GuiGraphics g, int mx, int my, int ax, int ay, int w, int h,
                         Component label, boolean active, int base) {
        int col = active ? base : COLOR_INACTIVE;
        int ca = 0xFF000000 | col;
        int li = 0xFF000000 | lighten(col);
        int dk = 0xFF000000 | darken(col);

        // Bevel / shadow
        g.fill(ax + 2, ay + h - 1, ax + w - 1, ay + h, dk);
        g.fill(ax + w - 1, ay + 2, ax + w, ay + h, dk);
        g.fill(ax, ay, ax + w - 1, ay + 1, li);
        g.fill(ax, ay + 1, ax + 1, ay + h - 1, li);
        // Fill
        g.fill(ax + 1, ay + 1, ax + w - 1, ay + h - 1, ca);
        // Top sheen
        g.fill(ax + 1, ay + 1, ax + w - 1, ay + 1 + h / 3, 0x22FFFFFF);
        // Label (with shadow)
        int tx = ax + w / 2 - font.width(label) / 2;
        int ty = ay + (h - 8) / 2;
        g.drawString(font, label, tx + 1, ty + 1, 0x44000000, false);
        g.drawString(font, label, tx, ty, 0xFFFFFFFF, false);
        // Hover highlight
        if (active && mx >= ax && mx < ax + w && my >= ay && my < ay + h) {
            g.fill(ax + 1, ay + 1, ax + w - 1, ay + h - 1, 0x33FFFFFF);
            g.fill(ax + 1, ay + 1, ax + w - 1, ay + 2, 0x44FFFFFF);
        }
    }
}