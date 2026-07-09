package by.deokma.casino.game.durak;

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

public class DurakMenu extends AbstractCardMenu<DurakGame, DurakMenu> {

    private static final int OFF_PHASE       = 0;
    private static final int OFF_ATK         = 1;
    private static final int OFF_DEF         = 2;
    private static final int OFF_TRUMP       = 3;
    private static final int OFF_TABLE       = 4;
    private static final int OFF_DURAK       = 5;
    private static final int OFF_ELIM        = 6;  // bitmask of eliminated players
    private static final int OFF_THROWN_IN   = 7;  // bitmask of who threw in this round
    private static final int DATA_COUNT      = 8;

    private final ContainerData data = new ContainerData() {
        @Override public int get(int i) {
            DurakGame g = game; if (g == null) return 0;
            return switch (i) {
                case OFF_PHASE     -> g.phaseOrd;
                case OFF_ATK       -> g.attackerIdx;
                case OFF_DEF       -> g.defenderIdx;
                case OFF_TRUMP     -> g.trumpOrd;
                case OFF_TABLE     -> g.tableCount;
                case OFF_DURAK     -> g.durakIdx + 1;
                case OFF_ELIM      -> { int m = 0; for (int j = 0; j < g.getPlayers().size(); j++) if (g.isEliminated(j)) m |= (1 << j); yield m; }
                case OFF_THROWN_IN -> g.thrownInMask;
                default -> 0;
            };
        }
        @Override public void set(int i, int v) {
            DurakGame g = game; if (g == null) return;
            switch (i) {
                case OFF_PHASE     -> g.phaseOrd     = v;
                case OFF_ATK       -> g.attackerIdx   = v;
                case OFF_DEF       -> g.defenderIdx   = v;
                case OFF_TRUMP     -> g.trumpOrd      = v;
                case OFF_TABLE     -> g.tableCount    = v;
                case OFF_DURAK     -> g.durakIdx      = v - 1;
                case OFF_THROWN_IN -> g.thrownInMask  = v;
            }
        }
        @Override public int getCount() { return DATA_COUNT; }
    };

    public DurakMenu(int containerId, Inventory inventory, Definition definition) {
        super(CasinoAddon.DURAK_MENU.get(), containerId, inventory, definition);

        // Player hand previews at top — use same enlarged slot width as other games
        {
            float slotW = CardSlot.getWidth(CardSlot.Type.PREVIEW) + 42f; // #9: was 28f
            int n = definition.players().length;
            float playersWidth = n * slotW + (n - 1f) * (slotW / 10f);
            for (int i = 0; i < n; i++) {
                float headX = 256f / 2f - playersWidth / 2f + i * (slotW + slotW / 10f);
                CardPlayer p = this.game.getPlayers().get(i);
                addCardSlot(new CardSlot<>(this.game,
                        g -> g.getCensoredHand(cardPlayer, p),
                        headX + 26f, 7f, CardSlot.Type.PREVIEW));
            }
        }

        // Attack slots
        for (int i = 0; i < DurakGame.MAX_TABLE; i++) {
            final int idx = i;
            addCardSlot(new CardSlot<>(this.game, g -> g.atkSlots[idx],
                    game.atkSlots[i].getX(), game.atkSlots[i].getY()));
        }

        // Defense slots
        for (int i = 0; i < DurakGame.MAX_TABLE; i++) {
            final int idx = i;
            addCardSlot(new CardSlot<>(this.game, g -> g.defSlots[idx],
                    game.defSlots[i].getX(), game.defSlots[i].getY()));
        }

        // Draw pile
        addCardSlot(new CardSlot<>(this.game, g -> g.drawPile,
                game.drawPile.getX(), game.drawPile.getY()));

        // Discard pile
        addCardSlot(new CardSlot<>(this.game, g -> g.discardPile,
                game.discardPile.getX(), game.discardPile.getY()));

        // Player's own hand
        addCardSlot(new HandSlot<>(this.game,
                g -> g.getPhase() == DurakGame.Phase.ATTACK || g.getPhase() == DurakGame.Phase.DEFENSE,
                this.getCardPlayer(),
                (256f - CardSlot.getWidth(CardSlot.Type.HORIZONTAL)) / 2f,
                -5f, CardSlot.Type.HORIZONTAL));

        addDataSlots(data);
    }

    // ── Accessors ─────────────────────────────────────────────────────────────

    public DurakGame.Phase getPhase()    { return DurakGame.Phase.values()[data.get(OFF_PHASE)]; }
    public int getAttackerIdx()          { return data.get(OFF_ATK); }
    public int getDefenderIdx()          { return data.get(OFF_DEF); }
    public int getTrumpOrd()             { return data.get(OFF_TRUMP); }
    public int getTableCount()           { return data.get(OFF_TABLE); }
    public int getDurakIdx()             { return data.get(OFF_DURAK) - 1; }
    public boolean isEliminated(int i)   { return ((data.get(OFF_ELIM) >> i) & 1) == 1; }
    public boolean hasThrownIn(int i)    { return ((data.get(OFF_THROWN_IN) >> i) & 1) == 1; }

    public boolean isAttacker() { return game.getPlayers().indexOf(cardPlayer) == getAttackerIdx(); }
    public boolean isDefender() { return game.getPlayers().indexOf(cardPlayer) == getDefenderIdx(); }

    /** True if this player can throw in a card (not defender, not eliminated, not thrown in yet, table not empty). */
    public boolean canThrowIn() {
        int myIdx = myIdx();
        if (myIdx < 0) return false;
        if (myIdx == getDefenderIdx()) return false;
        if (isEliminated(myIdx)) return false;
        if (hasThrownIn(myIdx)) return false;
        if (getTableCount() == 0) return false;
        return getPhase() == DurakGame.Phase.ATTACK;
    }

    public int myIdx()               { return game.getPlayers().indexOf(cardPlayer); }
    public boolean isReady()         { return isGameReady(); }
    public int getDeckSize()         { return game.getDrawPileSize(); }
    public int getHandSize(int p)    { return game.getPlayerHand(game.getPlayers().get(p)).size(); }

    @Override
    public GameType<DurakGame, DurakMenu> getGameType() { return CasinoAddon.DURAK_GAME.get(); }

    @Override public @NotNull ItemStack quickMoveStack(@NotNull Player p, int i) { return ItemStack.EMPTY; }
    @Override public boolean stillValid(@NotNull Player p) { return game != null && cardPlayer != null && !game.isGameOver(); }
}
