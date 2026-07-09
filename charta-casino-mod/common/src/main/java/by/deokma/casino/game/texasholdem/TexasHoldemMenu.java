package by.deokma.casino.game.texasholdem;

import by.deokma.casino.CasinoAddon;
import dev.lucaargolo.charta.common.game.api.CardPlayer;
import dev.lucaargolo.charta.common.game.api.game.GameType;
import dev.lucaargolo.charta.common.menu.AbstractCardMenu;
import dev.lucaargolo.charta.common.menu.CardSlot;
import dev.lucaargolo.charta.common.menu.HandSlot;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.ContainerData;
import net.minecraft.world.item.ItemStack;
import org.jetbrains.annotations.NotNull;

public class TexasHoldemMenu extends AbstractCardMenu<TexasHoldemGame, TexasHoldemMenu> {

    private static final int MAX_PLAYERS          = 8;
    private static final int OFFSET_CHIPS         = 0;
    private static final int OFFSET_BETS          = MAX_PLAYERS;
    private static final int OFFSET_FOLDED        = MAX_PLAYERS * 2;
    private static final int OFFSET_ALLIN         = MAX_PLAYERS * 2 + 1;
    private static final int OFFSET_POT           = MAX_PLAYERS * 2 + 2;
    private static final int OFFSET_BET           = MAX_PLAYERS * 2 + 3;
    private static final int OFFSET_PHASE         = MAX_PLAYERS * 2 + 4;
    private static final int OFFSET_DEALER        = MAX_PLAYERS * 2 + 5;
    private static final int OFFSET_COMMUNITY_CNT = MAX_PLAYERS * 2 + 6;
    private static final int OFFSET_RAISE_AMOUNT  = MAX_PLAYERS * 2 + 7;
    private static final int OFFSET_IS_PAUSED     = MAX_PLAYERS * 2 + 8;
    private static final int OFFSET_SKIP_VOTES    = MAX_PLAYERS * 2 + 9;
    private static final int DATA_COUNT           = MAX_PLAYERS * 2 + 10;

    private final ContainerData data = new ContainerData() {
        @Override
        public int get(int index) {
            TexasHoldemGame g = game;
            int n = g.getPlayers().size();
            if (index < OFFSET_BETS)          { int i = index - OFFSET_CHIPS;  return i < n ? g.chips[i]     : 0; }
            else if (index < OFFSET_FOLDED)   { int i = index - OFFSET_BETS;   return i < n ? g.roundBets[i] : 0; }
            else if (index == OFFSET_FOLDED)  { int m = 0; for (int i = 0; i < n; i++) if (g.folded[i]) m |= (1 << i); return m; }
            else if (index == OFFSET_ALLIN)   { int m = 0; for (int i = 0; i < n; i++) if (g.allIn[i])  m |= (1 << i); return m; }
            else if (index == OFFSET_POT)           return g.pot;
            else if (index == OFFSET_BET)           return g.currentBet;
            else if (index == OFFSET_PHASE)         return g.phaseOrdinal;
            else if (index == OFFSET_DEALER)        return g.dealerIndex;
            else if (index == OFFSET_COMMUNITY_CNT) return g.communityCardCount;
            else if (index == OFFSET_RAISE_AMOUNT)  return g.getRaiseAmountPublic();
            else if (index == OFFSET_IS_PAUSED)     return g.isPaused ? 1 : 0;
            else if (index == OFFSET_SKIP_VOTES)    return g.skipVoteMask;
            return 0;
        }

        @Override
        public void set(int index, int value) {
            TexasHoldemGame g = game;
            int n = g.getPlayers().size();
            if (index < OFFSET_BETS)          { int i = index - OFFSET_CHIPS; if (i < n) g.chips[i] = value; }
            else if (index < OFFSET_FOLDED)   { int i = index - OFFSET_BETS;  if (i < n) g.roundBets[i] = value; }
            else if (index == OFFSET_FOLDED)  { for (int i = 0; i < n; i++) g.folded[i] = (value & (1 << i)) != 0; }
            else if (index == OFFSET_ALLIN)   { for (int i = 0; i < n; i++) g.allIn[i]  = (value & (1 << i)) != 0; }
            else if (index == OFFSET_POT)           g.pot = value;
            else if (index == OFFSET_BET)           g.currentBet = value;
            else if (index == OFFSET_PHASE)         g.phaseOrdinal = value;
            else if (index == OFFSET_DEALER)        g.dealerIndex = value;
            else if (index == OFFSET_COMMUNITY_CNT) g.communityCardCount = value;
            else if (index == OFFSET_IS_PAUSED)     g.isPaused = (value != 0);
            else if (index == OFFSET_SKIP_VOTES)    g.skipVoteMask = value;
        }

        @Override
        public int getCount() { return DATA_COUNT; }
    };

    public TexasHoldemMenu(int containerId, Inventory inventory, Definition definition) {
        super(CasinoAddon.TEXAS_HOLDEM_MENU.get(), containerId, inventory, definition);

        // Player hand previews
        {
            float slotW = CardSlot.getWidth(CardSlot.Type.PREVIEW) + 28f;
            int n = definition.players().length;
            float playersWidth = n * slotW + (n - 1f) * (slotW / 10f);
            for (int i = 0; i < n; i++) {
                float headX = 256f / 2f - playersWidth / 2f + i * (slotW + slotW / 10f);
                float cardX = headX + 26f;
                CardPlayer p = this.game.getPlayers().get(i);
                addCardSlot(new CardSlot<>(this.game,
                        g -> g.getCensoredHand(cardPlayer, p),
                        cardX, 7f, CardSlot.Type.PREVIEW));
            }
        }

        // 5 community card slots
        float cW = 25f, gapC = 20f, totalC = 5 * cW + 4 * gapC;
        float startC = (256f - totalC) / 2f;
        for (int i = 0; i < 5; i++) {
            final int slotIdx = TexasHoldemGame.SLOT_COMMUNITY_FIRST + i;
            addCardSlot(new CardSlot<>(this.game, g -> g.getSlot(slotIdx),
                    startC + i * (cW + gapC), 60f));
        }

        // Player's own hole cards
        addCardSlot(new HandSlot<>(this.game, g -> true, this.getCardPlayer(),
                (256f - CardSlot.getWidth(CardSlot.Type.HORIZONTAL)) / 2f,
                -5f, CardSlot.Type.HORIZONTAL));

        addDataSlots(data);
    }

    public int getChips(int i)       { return data.get(OFFSET_CHIPS + i); }
    public int getRoundBet(int i)    { return data.get(OFFSET_BETS  + i); }
    public boolean isFolded(int i)   { return (data.get(OFFSET_FOLDED) & (1 << i)) != 0; }
    public boolean isAllIn(int i)    { return (data.get(OFFSET_ALLIN)  & (1 << i)) != 0; }
    public int getPot()              { return data.get(OFFSET_POT); }
    public int getCurrentBet()       { return data.get(OFFSET_BET); }
    public PokerPhase getPhase()     { return PokerPhase.fromOrdinal(data.get(OFFSET_PHASE)); }
    public int getDealerIndex()      { return data.get(OFFSET_DEALER); }
    public int getCommunityCardCount() { return data.get(OFFSET_COMMUNITY_CNT); }
    public int getRaiseAmount()      { return data.get(OFFSET_RAISE_AMOUNT); }
    public boolean isPaused()        { return data.get(OFFSET_IS_PAUSED) != 0; }
    public int getSkipVoteMask()     { return data.get(OFFSET_SKIP_VOTES); }
    public int getStartingChips()    { return game.getStartingChipsPublic(); }

    public int getCallAmount() {
        int myIdx = game.getPlayers().indexOf(cardPlayer);
        return myIdx < 0 ? 0 : Math.max(0, getCurrentBet() - getRoundBet(myIdx));
    }

    @Override
    public GameType<TexasHoldemGame, TexasHoldemMenu> getGameType() { return CasinoAddon.TEXAS_HOLDEM_GAME.get(); }

    @Override
    public @NotNull ItemStack quickMoveStack(@NotNull Player player, int index) { return ItemStack.EMPTY; }

    @Override
    public boolean stillValid(@NotNull Player player) {
        return this.game != null && this.cardPlayer != null && !this.game.isGameOver();
    }
}

