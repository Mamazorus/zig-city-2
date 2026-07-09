package by.deokma.casino.game.durak;

import by.deokma.casino.CasinoAddon;
import dev.lucaargolo.charta.common.block.entity.CardTableBlockEntity;
import dev.lucaargolo.charta.common.game.Ranks;
import dev.lucaargolo.charta.common.game.Suits;
import dev.lucaargolo.charta.common.game.api.CardPlayer;
import dev.lucaargolo.charta.common.game.api.GamePlay;
import dev.lucaargolo.charta.common.game.api.GameSlot;
import dev.lucaargolo.charta.common.game.api.card.Card;
import dev.lucaargolo.charta.common.game.api.card.Deck;
import dev.lucaargolo.charta.common.game.api.card.Rank;
import dev.lucaargolo.charta.common.game.api.card.Suit;
import dev.lucaargolo.charta.common.game.api.game.Game;
import dev.lucaargolo.charta.common.game.api.game.GameOption;
import dev.lucaargolo.charta.common.menu.AbstractCardMenu;
import dev.lucaargolo.charta.common.sound.ModSounds;
import dev.lucaargolo.charta.common.utils.CardImage;
import net.minecraft.ChatFormatting;
import net.minecraft.core.Direction;
import net.minecraft.network.chat.Component;
import net.minecraft.world.entity.player.Inventory;

import java.util.*;
import java.util.function.Predicate;

/**
 * Durak (Дурак) — classic Russian card game.
 *
 * Actions encoded as int:
 *   ACT_ATTACK + handCardIndex          — attacker/co-attacker plays a card
 *   ACT_DEFEND + atkSlot*100 + handIdx  — defender beats an attack card
 *   ACT_TAKE                            — defender takes all table cards
 *   ACT_DONE                            — attacker passes (ends attack round)
 */
public class DurakGame extends Game<DurakGame, DurakMenu> {

    public static final int ACT_ATTACK = 1000;
    public static final int ACT_DEFEND = 2000;
    public static final int ACT_TAKE   = 3000;
    public static final int ACT_DONE   = 4000;

    public static final int MAX_TABLE = 6;

    // ── Rank ordering for Durak (6 through Ace) ───────────────────────────────
    private static final List<Rank> DURAK_RANKS = List.of(
            Ranks.SIX, Ranks.SEVEN, Ranks.EIGHT, Ranks.NINE, Ranks.TEN,
            Ranks.JACK, Ranks.QUEEN, Ranks.KING, Ranks.ACE
    );

    private static int rankValue(Rank r) {
        return DURAK_RANKS.indexOf(r);
    }

    // ── Phases ────────────────────────────────────────────────────────────────
    public enum Phase { ATTACK, DEFENSE, DRAWING, GAME_OVER }

    // ── Synced state ──────────────────────────────────────────────────────────
    public int phaseOrd    = Phase.ATTACK.ordinal();
    public int attackerIdx = 0;
    public int defenderIdx = 1;
    public int trumpOrd    = 0;
    public int tableCount  = 0;
    public int durakIdx    = -1;
    /** Bitmask: which non-defender players have already thrown in this round. */
    public int thrownInMask = 0;

    // ── Slots ─────────────────────────────────────────────────────────────────
    /** Draw pile — face-down stack. */
    public final GameSlot drawPile;
    /** Discard pile — beaten cards go here. */
    public final GameSlot discardPile;
    /** Attack slots (up to MAX_TABLE). */
    public final GameSlot[] atkSlots = new GameSlot[MAX_TABLE];
    /** Defense slots (one per attack slot). */
    public final GameSlot[] defSlots = new GameSlot[MAX_TABLE];

    // ── Server-side state ─────────────────────────────────────────────────────
    private Suit trump;
    private final boolean[] eliminated;
    private boolean waitingForAction = false;

    public DurakGame(List<CardPlayer> players, Deck deck) {
        super(players, deck);
        eliminated = new boolean[Math.max(players.size(), 2)];

        float tw = CardTableBlockEntity.TABLE_WIDTH;
        float th = CardTableBlockEntity.TABLE_HEIGHT;
        float cw = CardImage.WIDTH, ch = CardImage.HEIGHT;

        // Draw pile — left of centre
        drawPile = addSlot(new GameSlot(new LinkedList<>(),
                tw / 2f - cw - 20f, th / 2f - ch / 2f, 0f, 0f) {
            @Override public boolean canInsertCard(CardPlayer p, List<Card> c, int i) { return false; }
            @Override public boolean canRemoveCard(CardPlayer p, int i) { return false; }
        });

        // Discard pile — right of centre
        discardPile = addSlot(new GameSlot(new LinkedList<>(),
                tw / 2f + 20f, th / 2f - ch / 2f, 0f, 0f) {
            @Override public boolean canInsertCard(CardPlayer p, List<Card> c, int i) { return false; }
            @Override public boolean canRemoveCard(CardPlayer p, int i) { return false; }
        });

        // Attack / defense slot pairs spread across the table
        float startX = tw / 2f - (MAX_TABLE * (cw + 8f)) / 2f;
        float atkY = th / 2f - ch - ch / 2f;
        float defY = th / 2f + ch / 2f;
        for (int i = 0; i < MAX_TABLE; i++) {
            float x = startX + i * (cw + 8f);
            atkSlots[i] = addSlot(new GameSlot(new LinkedList<>(), x, atkY, 0f, 0f, Direction.UP, 0f) {
                @Override public boolean canInsertCard(CardPlayer p, List<Card> c, int idx) { return false; }
                @Override public boolean canRemoveCard(CardPlayer p, int idx) { return false; }
            });
            defSlots[i] = addSlot(new GameSlot(new LinkedList<>(), x, defY, 0f, 0f, Direction.UP, 0f) {
                @Override public boolean canInsertCard(CardPlayer p, List<Card> c, int idx) { return false; }
                @Override public boolean canRemoveCard(CardPlayer p, int idx) { return false; }
            });
        }
    }

    @Override
    public DurakMenu createMenu(int id, Inventory inv, AbstractCardMenu.Definition def) {
        return new DurakMenu(id, inv, def);
    }

    @Override
    public Predicate<Deck> getDeckPredicate() {
        return d -> d.getCards().size() >= 36
                && Suits.STANDARD.containsAll(d.getSuits())
                && d.getSuits().containsAll(Suits.STANDARD);
    }

    @Override
    public Predicate<Card> getCardPredicate() {
        return c -> Suits.STANDARD.contains(c.suit()) && DURAK_RANKS.contains(c.rank());
    }

    @Override
    public List<GameOption<?>> getOptions() { return List.of(); }

    @Override
    public int getMinPlayers() { return 2; }

    @Override
    public int getMaxPlayers() { return 6; }

    @Override
    protected GameSlot createPlayerHand(CardPlayer player) {
        return new GameSlot(player.hand(), 0f, 0f, 0f, 0f,
                Direction.EAST, CardTableBlockEntity.TABLE_WIDTH) {
            @Override public boolean removeAll() { return false; }
        };
    }

    // ── startGame ─────────────────────────────────────────────────────────────

    @Override
    public void startGame() {
        isGameReady = false;
        isGameOver  = false;
        Arrays.fill(eliminated, false);
        waitingForAction = false;
        tableCount   = 0;
        durakIdx     = -1;
        thrownInMask = 0;

        drawPile.clear();
        discardPile.clear();
        for (GameSlot s : atkSlots) s.clear();
        for (GameSlot s : defSlots) s.clear();
        for (CardPlayer p : players) {
            getPlayerHand(p).clear();
            getCensoredHand(p).clear();
        }

        // Shuffle deck into draw pile (face-down)
        List<Card> shuffled = new ArrayList<>(gameDeck);
        Collections.shuffle(shuffled);
        shuffled.forEach(c -> {
            if (!c.flipped()) c.flip();
            drawPile.add(c);
        });

        // Trump = bottom card (first in pile), flip it face-up
        Card trumpCard = drawPile.stream().findFirst().orElse(null);
        if (trumpCard != null) {
            if (trumpCard.flipped()) trumpCard.flip();
            trump   = trumpCard.suit();
            trumpOrd = suitOrd(trump);
        }

        // Deal 6 cards to each player
        for (int round = 0; round < 6; round++) {
            for (CardPlayer p : players) {
                scheduledActions.add(() -> { p.playSound(ModSounds.CARD_DRAW.get()); dealOneCard(p); });
                scheduledActions.add(() -> {});
            }
        }

        // Player with lowest trump leads
        scheduledActions.add(() -> {
            attackerIdx = findLowestTrumpHolder();
            defenderIdx = nextActive(attackerIdx);
            phaseOrd    = Phase.ATTACK.ordinal();
            thrownInMask = 0;
            currentPlayer = players.get(attackerIdx);

            table(Component.translatable("message.charta.game_started"));
            table(Component.literal("Trump: " + Suits.getLocation(trump).getPath().toUpperCase())
                    .withStyle(ChatFormatting.GOLD));
            table(Component.translatable("message.charta.its_player_turn",
                    players.get(attackerIdx).getColoredName()));
        });
    }

    // ── runGame ───────────────────────────────────────────────────────────────

    @Override
    public void runGame() {
        if (isGameOver || waitingForAction) return;

        Phase phase = Phase.values()[phaseOrd];
        if (phase == Phase.DRAWING) {
            doDrawPhase();
            return;
        }

        int actorIdx = (phase == Phase.DEFENSE) ? defenderIdx : attackerIdx;
        currentPlayer = players.get(actorIdx);
        currentPlayer.resetPlay();
        waitingForAction = true;

        currentPlayer.afterPlay(play -> {
            waitingForAction = false;
            if (play != null) handleAction(players.indexOf(currentPlayer), play.slot());
            isGameReady = false;
            scheduledActions.add(() -> {});
        });
    }

    // ── handleAction ──────────────────────────────────────────────────────────

    public void handleAction(int playerIndex, int action) {
        Phase phase = Phase.values()[phaseOrd];

        // ── TAKE: defender takes all table cards ──────────────────────────────
        if (action == ACT_TAKE && phase == Phase.DEFENSE && playerIndex == defenderIdx) {
            CardPlayer defender = players.get(defenderIdx);
            for (int i = 0; i < MAX_TABLE; i++) {
                for (Card c : atkSlots[i].getCards()) {
                    if (c.flipped()) c.flip();
                    getPlayerHand(defender).add(c);
                    getCensoredHand(defender).add(new Card());
                }
                for (Card c : defSlots[i].getCards()) {
                    if (c.flipped()) c.flip();
                    getPlayerHand(defender).add(c);
                    getCensoredHand(defender).add(new Card());
                }
                atkSlots[i].clear();
                defSlots[i].clear();
            }
            tableCount = 0;
            thrownInMask = 0;
            play(defender, Component.translatable("message.charta_casino.durak.takes").withStyle(ChatFormatting.RED));
            // Attacker stays, defender skips their turn (they just took)
            defenderIdx = nextActive(defenderIdx);
            phaseOrd = Phase.DRAWING.ordinal();
            return;
        }

        // ── DONE: attacker ends attack (all cards defended) ───────────────────
        if (action == ACT_DONE && phase == Phase.ATTACK && playerIndex == attackerIdx) {
            // Must have at least one card on table and all defended
            if (tableCount == 0) return;
            for (int i = 0; i < tableCount; i++) {
                if (!atkSlots[i].isEmpty() && defSlots[i].isEmpty()) return; // undefended card
            }
            discardTable();
            play(players.get(attackerIdx), Component.literal("Pass — defense successful!").withStyle(ChatFormatting.GREEN));
            int oldDef = defenderIdx;
            attackerIdx  = oldDef;
            defenderIdx  = nextActive(attackerIdx);
            thrownInMask = 0;
            phaseOrd = Phase.DRAWING.ordinal();
            return;
        }

        // ── ATTACK: attacker OR co-attacker throws a card ─────────────────────
        if (action >= ACT_ATTACK && action < ACT_DEFEND && phase == Phase.ATTACK) {
            boolean isAttacker   = (playerIndex == attackerIdx);
            boolean isCoAttacker = (playerIndex != defenderIdx)
                    && !eliminated[playerIndex]
                    && tableCount > 0                          // can only throw in after first card
                    && ((thrownInMask >> playerIndex) & 1) == 0; // hasn't thrown in yet this round

            if (!isAttacker && !isCoAttacker) return;

            int handIdx = action - ACT_ATTACK;
            CardPlayer attacker = players.get(playerIndex);
            List<Card> hand = getPlayerHand(attacker).stream().toList();
            if (handIdx < 0 || handIdx >= hand.size()) return;
            Card card = hand.get(handIdx);
            if (!canAttackWith(card)) return;
            // Limit: can't exceed defender's hand size
            if (!canAddMoreAttacks()) return;

            getPlayerHand(attacker).remove(card);
            getCensoredHand(attacker).removeLast();
            if (card.flipped()) card.flip();
            atkSlots[tableCount].add(card);
            tableCount++;
            attacker.playSound(ModSounds.CARD_PLAY.get());

            if (isAttacker) {
                play(attacker, Component.translatable("message.charta_casino.durak.attacked"));
            } else {
                thrownInMask |= (1 << playerIndex);
                play(attacker, Component.literal("Throws in!").withStyle(ChatFormatting.YELLOW));
            }
            phaseOrd = Phase.DEFENSE.ordinal();
            return;
        }

        // ── DEFEND: defender beats an attack card ─────────────────────────────
        if (action >= ACT_DEFEND && action < ACT_TAKE && phase == Phase.DEFENSE && playerIndex == defenderIdx) {
            int rem     = action - ACT_DEFEND;
            int atkSlot = rem / 100;
            int handIdx = rem % 100;
            if (atkSlot < 0 || atkSlot >= tableCount) return;
            if (!defSlots[atkSlot].isEmpty()) return;

            CardPlayer defender = players.get(defenderIdx);
            List<Card> hand = getPlayerHand(defender).stream().toList();
            if (handIdx < 0 || handIdx >= hand.size()) return;

            Card defCard = hand.get(handIdx);
            Card atkCard = atkSlots[atkSlot].stream().findFirst().orElse(null);
            if (atkCard == null || !canDefend(atkCard, defCard)) return;

            getPlayerHand(defender).remove(defCard);
            getCensoredHand(defender).removeLast();
            if (defCard.flipped()) defCard.flip();
            defSlots[atkSlot].add(defCard);
            defender.playSound(ModSounds.CARD_PLAY.get());
            play(defender, Component.translatable("message.charta_casino.durak.defended").withStyle(ChatFormatting.GREEN));

            // If all attacks defended → back to ATTACK so attacker/co-attackers can throw more
            if (allDefended()) phaseOrd = Phase.ATTACK.ordinal();
        }
    }

    // ── DRAWING phase ─────────────────────────────────────────────────────────

    private void doDrawPhase() {
        // Draw order: attacker first, then clockwise, defender last
        List<Integer> order = new ArrayList<>();
        int idx = attackerIdx;
        for (int i = 0; i < players.size(); i++) {
            if (!eliminated[idx]) order.add(idx);
            idx = (idx + 1) % players.size();
        }
        order.remove(Integer.valueOf(defenderIdx));
        order.add(defenderIdx);

        for (int playerIndex : order) {
            CardPlayer p = players.get(playerIndex);
            int need = 6 - getPlayerHand(p).size();
            for (int i = 0; i < need && !drawPile.isEmpty(); i++) {
                dealOneCard(p);
            }
            if (getPlayerHand(p).isEmpty() && drawPile.isEmpty() && !eliminated[playerIndex]) {
                eliminated[playerIndex] = true;
                play(p, Component.translatable("message.charta_casino.durak.out").withStyle(ChatFormatting.GREEN));
            }
        }

        // Check if game over
        int remaining = 0, lastIdx = -1;
        for (int i = 0; i < players.size(); i++) {
            if (!eliminated[i]) { remaining++; lastIdx = i; }
        }
        if (remaining <= 1) {
            durakIdx = lastIdx;
            endGame();
            return;
        }

        attackerIdx  = nextActive(attackerIdx);
        defenderIdx  = nextActive(attackerIdx);
        thrownInMask = 0;
        phaseOrd     = Phase.ATTACK.ordinal();
        currentPlayer = players.get(attackerIdx);
        table(Component.translatable("message.charta.its_player_turn", currentPlayer.getColoredName()));
    }

    // ── canPlay ───────────────────────────────────────────────────────────────

    @Override
    public boolean canPlay(CardPlayer player, GamePlay play) {
        if (!isGameReady || isGameOver) return false;
        if (player != currentPlayer) return false;
        int playerIndex = players.indexOf(player);
        Phase phase = Phase.values()[phaseOrd];
        int action = play.slot();

        if (phase == Phase.ATTACK) {
            boolean isAttacker   = (playerIndex == attackerIdx);
            boolean isCoAttacker = (playerIndex != defenderIdx)
                    && !eliminated[playerIndex]
                    && tableCount > 0
                    && ((thrownInMask >> playerIndex) & 1) == 0;

            if (isAttacker && action == ACT_DONE) return true;
            if ((isAttacker || isCoAttacker) && action >= ACT_ATTACK && action < ACT_DEFEND) {
                int handIdx = action - ACT_ATTACK;
                List<Card> hand = getPlayerHand(player).stream().toList();
                if (handIdx < 0 || handIdx >= hand.size()) return false;
                return canAttackWith(hand.get(handIdx)) && canAddMoreAttacks();
            }
        }
        if (phase == Phase.DEFENSE && playerIndex == defenderIdx) {
            if (action == ACT_TAKE) return true;
            if (action >= ACT_DEFEND && action < ACT_TAKE) {
                int rem     = action - ACT_DEFEND;
                int atkSlot = rem / 100, handIdx = rem % 100;
                if (atkSlot < 0 || atkSlot >= tableCount) return false;
                if (!defSlots[atkSlot].isEmpty()) return false;
                List<Card> hand = getPlayerHand(player).stream().toList();
                if (handIdx < 0 || handIdx >= hand.size()) return false;
                Card atkCard = atkSlots[atkSlot].stream().findFirst().orElse(null);
                return atkCard != null && canDefend(atkCard, hand.get(handIdx));
            }
        }
        return false;
    }

    // ── endGame ───────────────────────────────────────────────────────────────

    @Override
    public void endGame() {
        if (isGameOver) return;
        isGameOver = true;
        phaseOrd   = Phase.GAME_OVER.ordinal();
        scheduledActions.clear();
        players.forEach(p -> p.play(null));

        if (durakIdx >= 0 && durakIdx < players.size()) {
            CardPlayer durak = players.get(durakIdx);
            durak.sendTitle(
                    Component.translatable("message.charta_casino.durak.you_are_durak").withStyle(ChatFormatting.RED),
                    Component.translatable("message.charta_casino.durak.durak_subtitle"));
            for (int i = 0; i < players.size(); i++) {
                if (i != durakIdx) players.get(i).sendTitle(
                        Component.literal("You won!").withStyle(ChatFormatting.GREEN),
                        Component.translatable("message.charta_casino.durak.not_durak", durak.getName()));
            }
            table(Component.translatable("message.charta_casino.durak.durak_is", durak.getColoredName())
                    .withStyle(ChatFormatting.RED));
        }
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private void dealOneCard(CardPlayer player) {
        if (drawPile.isEmpty()) return;
        Card c = drawPile.removeLast();
        if (c.flipped()) c.flip();
        getPlayerHand(player).add(c);
        getCensoredHand(player).add(new Card());
    }

    private void discardTable() {
        for (int i = 0; i < MAX_TABLE; i++) {
            atkSlots[i].getCards().forEach(discardPile::add);
            defSlots[i].getCards().forEach(discardPile::add);
            atkSlots[i].clear();
            defSlots[i].clear();
        }
        tableCount = 0;
    }

    private boolean canAttackWith(Card card) {
        if (tableCount == 0) return true; // first card — anything goes
        Rank r = card.rank();
        for (int i = 0; i < tableCount; i++) {
            for (Card c : atkSlots[i].getCards()) if (c.rank() == r) return true;
            for (Card c : defSlots[i].getCards()) if (c.rank() == r) return true;
        }
        return false;
    }

    /** Can't throw more cards than the defender has in hand, and can't exceed MAX_TABLE. */
    public boolean canAddMoreAttacks() {
        int defenderHandSize = getPlayerHand(players.get(defenderIdx)).size();
        return tableCount < Math.min(MAX_TABLE, defenderHandSize);
    }

    private boolean canDefend(Card attack, Card defense) {
        boolean atkTrump = attack.suit() == trump;
        boolean defTrump = defense.suit() == trump;
        if (defTrump && !atkTrump) return true;
        if (!defTrump && atkTrump) return false;
        if (defense.suit() != attack.suit()) return false;
        return rankValue(defense.rank()) > rankValue(attack.rank());
    }

    public boolean allDefended() {
        for (int i = 0; i < tableCount; i++) {
            if (defSlots[i].isEmpty()) return false;
        }
        return tableCount > 0;
    }

    private int findLowestTrumpHolder() {
        int best = 0, bestVal = Integer.MAX_VALUE;
        for (int i = 0; i < players.size(); i++) {
            for (Card c : getPlayerHand(players.get(i)).getCards()) {
                if (c.suit() == trump) {
                    int v = rankValue(c.rank());
                    if (v < bestVal) { bestVal = v; best = i; }
                }
            }
        }
        return best;
    }

    private int nextActive(int from) {
        int n = players.size();
        int cur = (from + 1) % n;
        int tries = 0;
        while (eliminated[cur] && tries < n) { cur = (cur + 1) % n; tries++; }
        return cur;
    }

    private int suitOrd(Suit s) {
        List<Suit> list = List.of(Suits.SPADES, Suits.HEARTS, Suits.CLUBS, Suits.DIAMONDS);
        return list.indexOf(s);
    }

    public Suit getTrump()           { return trump; }
    public boolean isEliminated(int i) { return i >= 0 && i < eliminated.length && eliminated[i]; }
    public Phase getPhase()          { return Phase.values()[phaseOrd]; }
    public int getDrawPileSize()     { return drawPile.size(); }

    public static int encodeAttack(int handIdx)              { return ACT_ATTACK + handIdx; }
    public static int encodeDefend(int atkSlot, int handIdx) { return ACT_DEFEND + atkSlot * 100 + handIdx; }
}
