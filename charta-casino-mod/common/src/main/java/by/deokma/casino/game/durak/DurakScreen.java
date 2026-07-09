package by.deokma.casino.game.durak;

import by.deokma.casino.network.DurakActionPayload;
import dev.lucaargolo.charta.client.render.screen.GameScreen;
import dev.lucaargolo.charta.common.ChartaMod;
import dev.lucaargolo.charta.common.game.Suits;
import dev.lucaargolo.charta.common.game.api.CardPlayer;
import dev.lucaargolo.charta.common.game.api.card.Card;
import dev.lucaargolo.charta.common.game.api.card.Suit;
import dev.lucaargolo.charta.common.menu.CardSlot;
import net.minecraft.ChatFormatting;
import net.minecraft.client.gui.GuiGraphics;
import net.minecraft.network.chat.Component;
import net.minecraft.util.Mth;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.item.DyeColor;
import org.jetbrains.annotations.NotNull;

import java.util.List;

public class DurakScreen extends GameScreen<DurakGame, DurakMenu> {

    // ── Button dimensions ─────────────────────────────────────────────────────
    private static final int BTN_W   = 60;
    private static final int BTN_H   = 20;
    private static final int BTN_GAP = 6;

    // ── Colours ───────────────────────────────────────────────────────────────
    private static final int COLOR_TAKE     = 0xAA6600;
    private static final int COLOR_PASS     = 0x446688;
    private static final int COLOR_THROW_IN = 0x886600;
    private static final int COLOR_INACTIVE = 0x444444;

    // ── Layout ────────────────────────────────────────────────────────────────
    private static final int BG_TOP           = 40;
    private static final int BG_BOTTOM_OFFSET = 63;
    private static final int BTN_ROW_MARGIN   = 6;

    /** Bottom edge of the green felt area (screen-space). */
    private int bgBottom()        { return height - BG_BOTTOM_OFFSET; }
    /** Y of the action-button row (screen-space). */
    private int btnY()            { return bgBottom() - BTN_H - BTN_ROW_MARGIN; }
    /** Vertical centre of the card play area (GUI-relative). */
    private int cardAreaCenterY() { return (BG_TOP + bgBottom()) / 2 - topPos; }
    /** Y for the phase title (GUI-relative). */
    private int titleY()          { return (BG_TOP - topPos + (cardAreaCenterY() - 55)) / 2; }
    /** Y for the turn/status label below defense cards (GUI-relative). */
    private int statusY()         { return (cardAreaCenterY() + 55 + btnY() - topPos) / 2; }
    /** Width of a player slot in the top bar. */
    private float playerSlotW()   { return CardSlot.getWidth(CardSlot.Type.PREVIEW) + 42f; }

    // ── Selection state ───────────────────────────────────────────────────────
    /** Index of the attack slot selected for beating (-1 = none). */
    private int selectedAtkSlot = -1;
    /** Index of the hand card selected for attacking or beating (-1 = none). */
    private int selectedHandIdx = -1;

    // ── Constructor ───────────────────────────────────────────────────────────
    public DurakScreen(DurakMenu menu, Inventory playerInventory, Component title) {
        super(menu, playerInventory, title);
        this.imageWidth  = 256;
        this.imageHeight = 230;
    }

    // ── renderBg ──────────────────────────────────────────────────────────────
    @Override
    protected void renderBg(@NotNull GuiGraphics g, float partialTick, int mx, int my) {
        int bgBottom = bgBottom();

        // Felt background
        g.fill(0, BG_TOP, width, bgBottom, 0xFF1B5E20);
        g.fill(2, BG_TOP + 2, width - 2, bgBottom - 2, 0xFF2E7D32);

        // Trump indicator (top-right corner)
        Suit trump = menu.getGame().getTrump();
        if (trump != null) {
            String suitPath   = Suits.getLocation(trump).getPath();
            String suitSymbol = getSuitSymbol(suitPath);
            int    suitColor  = getSuitColor(suitPath);
            Component tc = Component.literal("Trump: " + suitSymbol + " " +
                            Character.toUpperCase(suitPath.charAt(0)) + suitPath.substring(1))
                    .withStyle(ChatFormatting.BOLD);
            int tw = font.width(tc) + 8;
            g.fill(width - tw - 4, BG_TOP + 2, width - 4, BG_TOP + 14, 0x88000000);
            g.drawString(font, tc, width - tw, BG_TOP + 4, suitColor);
        }

        // Deck size (top-left corner)
        int       deckSize = menu.getDeckSize();
        Component dc       = Component.literal("🂠 " + deckSize).withStyle(ChatFormatting.WHITE);
        g.fill(2, BG_TOP + 2, font.width(dc) + 10, BG_TOP + 14, 0x88000000);
        g.drawString(font, dc, 6, BG_TOP + 4, 0xFFFFFF);

        // Highlight selected attack slot
        if (selectedAtkSlot >= 0 && selectedAtkSlot < DurakGame.MAX_TABLE) {
            var slot = menu.cardSlots.get(getAtkSlotMenuIdx(selectedAtkSlot));
            int sx = leftPos + (int) slot.x - 2;
            int sy = topPos  + (int) slot.y - 2;
            g.fill(sx, sy, sx + (int) CardSlot.getWidth(slot) + 4, sy + (int) CardSlot.getHeight(slot) + 4, 0xAAFFFF00);
        }

        // Highlight selected hand card
        if (selectedHandIdx >= 0) {
            List<Card> cards = menu.getGame().getPlayerHand(menu.getCardPlayer()).stream().toList();
            if (selectedHandIdx < cards.size()) {
                float slotW  = CardSlot.getWidth(CardSlot.Type.HORIZONTAL);
                float startX = (width - slotW) / 2f;
                float cx     = startX + selectedHandIdx * 30f;
                g.fill((int) cx - 2, height - 62, (int) cx + 29, height - 20, 0xAAFFFF00);
            }
        }

        DurakGame.Phase phase  = menu.getPhase();
        boolean         myTurn = menu.isCurrentPlayer() && menu.isGameReady();

        // Buttons — only render when this player has an action available
        if (!myTurn && !menu.canThrowIn()) return;

        // Two-button row centred on screen
        int bx = rowStartX(2 * BTN_W + BTN_GAP);
        int by = btnY();

        // Pass button (attacker — only when table has cards and all are defended)
        if (phase == DurakGame.Phase.ATTACK && menu.isAttacker() && myTurn
                && menu.getTableCount() > 0) {
            boolean canPass = menu.getGame().allDefended();
            drawBtn(g, mx, my, bx, by, BTN_W, BTN_H,
                    Component.translatable("button.charta_casino.durak.pass"),
                    canPass, canPass ? COLOR_PASS : COLOR_INACTIVE);
        }

        // Take button (defender)
        if (phase == DurakGame.Phase.DEFENSE && menu.isDefender() && myTurn) {
            drawBtn(g, mx, my, bx, by, BTN_W, BTN_H,
                    Component.translatable("button.charta_casino.durak.take"),
                    true, COLOR_TAKE);
        }

        // Throw-in button (co-attacker) — centred independently
        if (phase == DurakGame.Phase.ATTACK && menu.canThrowIn()) {
            int throwX = rowStartX(BTN_W);
            drawBtn(g, mx, my, throwX, by, BTN_W, BTN_H,
                    Component.translatable("button.charta_casino.durak.throw_in"),
                    true, COLOR_THROW_IN);
        }
    }

    // ── renderLabels ──────────────────────────────────────────────────────────
    @Override
    protected void renderLabels(@NotNull GuiGraphics g, int mx, int my) {
        int cx = width / 2 - leftPos;
        DurakGame.Phase phase = menu.getPhase();

        // Phase title
        String phaseStr = switch (phase) {
            case ATTACK    -> "⚔ Attack";
            case DEFENSE   -> "🛡 Defense";
            case DRAWING   -> "Drawing...";
            case GAME_OVER -> "Game Over";
        };
        Component phaseComp = Component.literal(phaseStr)
                .withStyle(ChatFormatting.GOLD, ChatFormatting.BOLD);
        g.drawString(font, phaseComp, cx - font.width(phaseComp) / 2, titleY(), 0xFFFFFF);

        // Turn indicator + contextual hints
        int statusY = statusY();
        if (menu.isGameReady() && phase != DurakGame.Phase.GAME_OVER) {
            CardPlayer current = menu.getCurrentPlayer();
            if (current != null) {
                Component turnComp = menu.isCurrentPlayer()
                        ? Component.translatable("message.charta.your_turn").withStyle(ChatFormatting.GREEN)
                        : Component.translatable("message.charta.other_turn", current.getName())
                        .withStyle(s -> s.withColor(current.getColor().getTextureDiffuseColor()));
                g.drawString(font, turnComp, cx - font.width(turnComp) / 2, statusY, 0xFFFFFF);

                Component hint = buildHint(phase);
                if (hint != null) {
                    g.drawString(font, hint, cx - font.width(hint) / 2, statusY + 12, 0xAAAAAA);
                }
            }
        }

        // Game-over: show durak's name
        int durakIdx = menu.getDurakIdx();
        if (durakIdx >= 0 && durakIdx < menu.getGame().getPlayers().size()) {
            Component durakComp = Component.literal("🃏 Durak: " +
                            menu.getGame().getPlayers().get(durakIdx).getName().getString())
                    .withStyle(ChatFormatting.RED, ChatFormatting.BOLD);
            int dy = cardAreaCenterY() - 10;
            g.fill(cx - font.width(durakComp)/2 - 4, dy - 2, cx + font.width(durakComp)/2 + 4, dy + 12, 0xCC000000);
            g.drawString(font, durakComp, cx - font.width(durakComp) / 2, dy, 0xFFFFFF);
        }
    }

    /** Returns a context-sensitive hint for the current player, or {@code null} when none applies. */
    private Component buildHint(DurakGame.Phase phase) {
        if (menu.isCurrentPlayer()) {
            if (phase == DurakGame.Phase.ATTACK && menu.isAttacker()) {
                if (menu.getTableCount() == 0)
                    return Component.literal("Click a card in your hand to attack").withStyle(ChatFormatting.GRAY);
                if (menu.getGame().allDefended())
                    return Component.literal("All defended — press Pass or throw more cards").withStyle(ChatFormatting.GRAY);
                return Component.literal("Wait for defense, or throw more cards of same rank").withStyle(ChatFormatting.GRAY);
            }
            if (phase == DurakGame.Phase.DEFENSE && menu.isDefender()) {
                if      (selectedAtkSlot < 0 && selectedHandIdx < 0)
                    return Component.literal("Click an attack card, then your card to beat it").withStyle(ChatFormatting.GRAY);
                else if (selectedAtkSlot >= 0)
                    return Component.literal("Now click a card from your hand to beat it").withStyle(ChatFormatting.GRAY);
                else
                    return Component.literal("Now click the attack card to beat").withStyle(ChatFormatting.GRAY);
            }
        } else if (menu.canThrowIn()) {
            return Component.literal("You can throw in a card of the same rank!").withStyle(ChatFormatting.YELLOW);
        }
        return null;
    }

    // ── Input handling ────────────────────────────────────────────────────────
    @Override
    public boolean mouseClicked(double mx, double my, int btn) {
        DurakGame.Phase phase  = menu.getPhase();
        boolean         myTurn = menu.isCurrentPlayer() && menu.isGameReady();
        int             bx     = rowStartX(2 * BTN_W + BTN_GAP);
        int             by     = btnY();

        if (myTurn) {
            // Pass (attacker — only when table has cards)
            if (phase == DurakGame.Phase.ATTACK && menu.isAttacker()
                    && menu.getTableCount() > 0) {
                if (hit(mx, my, bx, by, BTN_W, BTN_H) && menu.getGame().allDefended()) {
                    send(DurakGame.ACT_DONE);
                    clearSelection();
                    return true;
                }
            }
            // Take (defender)
            if (phase == DurakGame.Phase.DEFENSE && menu.isDefender()) {
                if (hit(mx, my, bx, by, BTN_W, BTN_H)) {
                    send(DurakGame.ACT_TAKE);
                    clearSelection();
                    return true;
                }
            }
        }

        // Throw-in button (co-attacker) — toggle hand-select mode
        if (phase == DurakGame.Phase.ATTACK && menu.canThrowIn()) {
            int throwX = rowStartX(BTN_W);
            if (hit(mx, my, throwX, by, BTN_W, BTN_H)) {
                // Just clear selection; the next hand-card click will send the attack
                clearSelection();
                return true;
            }
        }

        // Click on a hand card
        int handIdx = getClickedHandCard(mx, my);
        if (handIdx >= 0) {
            if (phase == DurakGame.Phase.ATTACK && (myTurn && menu.isAttacker() || menu.canThrowIn())) {
                send(DurakGame.encodeAttack(handIdx));
                clearSelection();
                return true;
            }
            if (phase == DurakGame.Phase.DEFENSE && myTurn && menu.isDefender()) {
                if (selectedAtkSlot >= 0) {
                    send(DurakGame.encodeDefend(selectedAtkSlot, handIdx));
                    clearSelection();
                } else {
                    selectedHandIdx = handIdx;
                }
                return true;
            }
        }

        // Click on an attack slot (defender picks which to beat)
        if (phase == DurakGame.Phase.DEFENSE && myTurn && menu.isDefender()) {
            for (int i = 0; i < menu.getTableCount(); i++) {
                if (!menu.getGame().atkSlots[i].isEmpty() && menu.getGame().defSlots[i].isEmpty()) {
                    var slot = menu.cardSlots.get(getAtkSlotMenuIdx(i));
                    int sx = leftPos + (int) slot.x;
                    int sy = topPos  + (int) slot.y;
                    if (mx >= sx && mx < sx + CardSlot.getWidth(slot) && my >= sy && my < sy + CardSlot.getHeight(slot)) {
                        if (selectedHandIdx >= 0) {
                            send(DurakGame.encodeDefend(i, selectedHandIdx));
                            clearSelection();
                        } else {
                            selectedAtkSlot = (selectedAtkSlot == i) ? -1 : i;
                        }
                        return true;
                    }
                }
            }
        }

        return super.mouseClicked(mx, my, btn);
    }

    // ── Top/Bottom bars ───────────────────────────────────────────────────────
    @Override
    public void renderTopBar(@NotNull GuiGraphics g) {
        super.renderTopBar(g);
        List<CardPlayer> players = menu.getGame().getPlayers();
        int   n     = players.size();
        float slotW = playerSlotW();
        float total = n * slotW + (n - 1f) * (slotW / 10f);

        // Colour band per player
        for (int i = 0; i < n; i++) {
            float    px  = width / 2f - total / 2f + i * (slotW + slotW / 10f);
            DyeColor col = players.get(i).getColor();
            g.fill(Mth.floor(px), 28, Mth.ceil(px + slotW), 40, 0x88000000 + col.getTextureDiffuseColor());
        }
        g.fill(0, 28, Mth.floor((width - total) / 2f), 40, 0x88000000);
        g.fill(width - Mth.floor((width - total) / 2f), 28, width, 40, 0x88000000);

        // Role indicators and card counts
        for (int i = 0; i < n; i++) {
            float   px     = width / 2f - total / 2f + i * (slotW + slotW / 10f);
            boolean isAtk  = i == menu.getAttackerIdx();
            boolean isDef  = i == menu.getDefenderIdx();
            boolean isElim = menu.isEliminated(i);
            boolean threw  = menu.hasThrownIn(i);

            String roleStr; int roleColor;
            if      (isElim) { roleStr = "✓ OUT";    roleColor = 0x44FF44; }
            else if (isAtk)  { roleStr = "⚔ ATK";   roleColor = 0xFF5555; }
            else if (isDef)  { roleStr = "🛡 DEF";  roleColor = 0x5555FF; }
            else if (threw)  { roleStr = "+ IN";      roleColor = 0xFFAA00; }
            else             { roleStr = menu.getHandSize(i) + " cards"; roleColor = 0xCCCCCC; }

            g.pose().pushPose();
            g.pose().translate(px + 4f, 29f, 0f);
            g.pose().scale(0.65f, 0.65f, 0.65f);
            g.drawString(font, roleStr, 0, 0, roleColor, true);
            if (isAtk || isDef || threw) {
                g.drawString(font, menu.getHandSize(i) + " cards", 0, 10, 0xCCCCCC, true);
            }
            g.pose().popPose();
        }
    }

    @Override
    public void renderBottomBar(@NotNull GuiGraphics g) {
        DyeColor col = menu.getCardPlayer().getColor();
        int tw = Mth.floor(CardSlot.getWidth(CardSlot.Type.HORIZONTAL)) + 10;
        g.fill(0,                 bgBottom(), (width - tw) / 2,          height, 0x88000000);
        g.fill((width - tw) / 2, bgBottom(), (width - tw) / 2 + tw,     height, 0x88000000 + col.getTextureDiffuseColor());
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

    private int getAtkSlotMenuIdx(int i) {
        return menu.getGame().getPlayers().size() + i;
    }

    private int getClickedHandCard(double mx, double my) {
        List<Card> cards = menu.getGame().getPlayerHand(menu.getCardPlayer()).stream().toList();
        if (cards.isEmpty()) return -1;
        float slotW  = CardSlot.getWidth(CardSlot.Type.HORIZONTAL);
        float startX = (width - slotW) / 2f;
        float cardW  = 30f, cardH = 40f, cardY = height - 58f;
        for (int i = 0; i < cards.size(); i++) {
            float cx = startX + i * cardW;
            if (mx >= cx && mx < cx + cardW && my >= cardY && my < cardY + cardH) return i;
        }
        return -1;
    }

    private void clearSelection() {
        selectedAtkSlot = -1;
        selectedHandIdx = -1;
    }

    private void send(int action) {
        ChartaMod.getPacketManager().sendToServer(new DurakActionPayload(action));
    }

    // ── Suit helpers ──────────────────────────────────────────────────────────

    private static String getSuitSymbol(String suitPath) {
        return switch (suitPath) {
            case "spades"   -> "♠";
            case "hearts"   -> "♥";
            case "clubs"    -> "♣";
            case "diamonds" -> "♦";
            default         -> suitPath.substring(0, 1).toUpperCase();
        };
    }

    private static int getSuitColor(String suitPath) {
        return switch (suitPath) {
            case "hearts", "diamonds" -> 0xFF5555; // red suits
            default                   -> 0xFFFFFF; // black suits shown white on dark background
        };
    }

    // ── Colour helpers ────────────────────────────────────────────────────────

    private static int lighten(int c) {
        int r = Math.min(255, ((c >> 16) & 0xFF) + 70);
        int g = Math.min(255, ((c >>  8) & 0xFF) + 70);
        int b = Math.min(255, ( c        & 0xFF) + 70);
        return (r << 16) | (g << 8) | b;
    }

    private static int darken(int c) {
        int r = Math.max(0, ((c >> 16) & 0xFF) - 55);
        int g = Math.max(0, ((c >>  8) & 0xFF) - 55);
        int b = Math.max(0, ( c        & 0xFF) - 55);
        return (r << 16) | (g << 8) | b;
    }

    /**
     * Draws a styled button.
     *
     * @param w button width
     * @param h button height
     */
    private void drawBtn(GuiGraphics g, int mx, int my, int ax, int ay, int w, int h,
                         Component label, boolean active, int base) {
        int col = active ? base : COLOR_INACTIVE;
        int ca  = 0xFF000000 | col;
        int li  = 0xFF000000 | lighten(col);
        int dk  = 0xFF000000 | darken(col);

        // Bevel / shadow
        g.fill(ax + 2, ay + h - 1, ax + w - 1, ay + h,    dk);
        g.fill(ax + w - 1, ay + 2, ax + w,     ay + h,    dk);
        g.fill(ax,     ay,     ax + w - 1, ay + 1,       li);
        g.fill(ax,     ay + 1, ax + 1,     ay + h - 1,   li);
        // Fill
        g.fill(ax + 1, ay + 1, ax + w - 1, ay + h - 1,   ca);
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