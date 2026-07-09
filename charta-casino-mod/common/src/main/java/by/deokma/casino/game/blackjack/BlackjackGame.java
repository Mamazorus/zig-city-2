package by.deokma.casino.game.blackjack;

import by.deokma.casino.CasinoAddon;
import by.deokma.casino.CasinoBank;
import dev.lucaargolo.charta.common.block.entity.CardTableBlockEntity;
import dev.lucaargolo.charta.common.game.Ranks;
import dev.lucaargolo.charta.common.game.Suits;
import dev.lucaargolo.charta.common.game.api.CardPlayer;
import dev.lucaargolo.charta.common.game.api.GamePlay;
import dev.lucaargolo.charta.common.game.api.GameSlot;
import dev.lucaargolo.charta.common.game.api.card.Card;
import dev.lucaargolo.charta.common.game.api.card.Deck;
import dev.lucaargolo.charta.common.game.api.card.Rank;
import dev.lucaargolo.charta.common.game.api.game.Game;
import dev.lucaargolo.charta.common.game.api.game.GameOption;
import dev.lucaargolo.charta.common.menu.AbstractCardMenu;
import dev.lucaargolo.charta.common.sound.ModSounds;
import dev.lucaargolo.charta.common.utils.CardImage;
import net.minecraft.ChatFormatting;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Inventory;

import java.util.*;
import java.util.function.Predicate;

/**
 * Blackjack — all players bet simultaneously, then play against dealer.
 *
 * Flow:
 * 1. BETTING: all players set their bet (ACTION_BET+amount). When all bets placed, deal.
 * 2. PLAYING: players take turns — Hit, Stand, Double.
 * 3. DEALER: dealer auto-plays (hit ≤16, stand ≥17).
 * 4. RESULT: compare hands, pay out, start new round.
 */
public class BlackjackGame extends Game<BlackjackGame, BlackjackMenu> {

    public static final int ACTION_HIT    = 200;
    public static final int ACTION_STAND  = 201;
    public static final int ACTION_DOUBLE = 202;
    public static final int ACTION_BET    = 300;

    private final GameOption.Number STARTING_CHIPS_OPT = new GameOption.Number(
            10, 1, 20,
            Component.translatable("rule.charta_casino.blackjack.starting_chips"),
            Component.translatable("rule.charta_casino.blackjack.starting_chips.description"));

    private final GameOption.Number MIN_BET_OPT = new GameOption.Number(
            1, 1, 50,
            Component.translatable("rule.charta_casino.blackjack.min_bet"),
            Component.translatable("rule.charta_casino.blackjack.min_bet.description"));

    public int[]     chips;
    public int[]     bets;
    public boolean[] stood;
    public boolean[] busted;
    public int       phaseOrdinal;

    public enum Phase { BETTING, PLAYING, DEALER, RESULT }
    public Phase getPhase() { return Phase.values()[phaseOrdinal]; }

    public static final int MAX_DEALER_CARDS = 7;
    public final GameSlot[] dealerSlots = new GameSlot[MAX_DEALER_CARDS];
    private final LinkedList<Card> dealerCards = new LinkedList<>();
    private final LinkedList<Card> drawPile = new LinkedList<>();

    private int activePlayerIndex = 0;

    private int startingChips() { return STARTING_CHIPS_OPT.get() * 100; }
    private int minBet()        { return MIN_BET_OPT.get(); }

    private void ensureCurrentPlayer() {
        if (players.isEmpty()) return;
        if (currentPlayer != null && players.contains(currentPlayer)) return;

        int idx = Math.max(0, Math.min(activePlayerIndex, players.size() - 1));
        for (int offset = 0; offset < players.size(); offset++) {
            int candidate = (idx + offset) % players.size();
            if (bets[candidate] >= 0 || chips[candidate] > 0) {
                currentPlayer = players.get(candidate);
                return;
            }
        }

        currentPlayer = players.get(0);
    }

    public BlackjackGame(List<CardPlayer> players, Deck deck) {
        super(players, deck);
        int n = Math.max(players.size(), 1);
        chips        = new int[n];
        bets         = new int[n];
        stood        = new boolean[n];
        busted       = new boolean[n];
        phaseOrdinal = Phase.BETTING.ordinal();

        float cardW  = CardImage.WIDTH;
        float gapD   = 8f;
        float totalD = MAX_DEALER_CARDS * cardW + (MAX_DEALER_CARDS - 1) * gapD;
        float startX = (CardTableBlockEntity.TABLE_WIDTH - totalD) / 2f;
        float cy     = CardTableBlockEntity.TABLE_HEIGHT / 2f - CardImage.HEIGHT / 2f - 30f;
        for (int di = 0; di < MAX_DEALER_CARDS; di++) {
            float cx = startX + di * (cardW + gapD);
            dealerSlots[di] = addSlot(new GameSlot(new LinkedList<>(), cx, cy, 0f, 0f) {
                @Override public boolean canInsertCard(CardPlayer p, List<Card> c, int i) { return false; }
                @Override public boolean canRemoveCard(CardPlayer p, int i)               { return false; }
            });
        }
    }

    @Override
    public List<GameOption<?>> getOptions() { return List.of(MIN_BET_OPT); }

    @Override
    public java.util.Optional<Component> playerPredicate(List<CardPlayer> players) {
        for (CardPlayer p : players) {
            if (p.getEntity() instanceof ServerPlayer sp && CasinoBank.countCoins(sp) <= 0) {
                return java.util.Optional.of(Component.translatable("message.charta_casino.no_coins", p.getName()));
            }
        }
        return java.util.Optional.empty();
    }

    @Override
    public BlackjackMenu createMenu(int containerId, Inventory playerInventory, AbstractCardMenu.Definition definition) {
        return new BlackjackMenu(containerId, playerInventory, definition);
    }

    @Override
    public Predicate<Deck> getDeckPredicate() {
        return deck -> deck.getCards().size() >= 52
                && Suits.STANDARD.containsAll(deck.getSuits())
                && deck.getSuits().containsAll(Suits.STANDARD);
    }

    @Override
    public Predicate<Card> getCardPredicate() {
        return card -> Suits.STANDARD.contains(card.suit()) && Ranks.STANDARD.contains(card.rank());
    }

    @Override
    public void startGame() {
        int n = players.size();
        Arrays.fill(bets,   0);
        Arrays.fill(stood,  false);
        Arrays.fill(busted, false);
        for (GameSlot s : dealerSlots) s.clear();
        dealerCards.clear();
        drawPile.clear();
        activePlayerIndex = 0;
        waitingForPlayAction = false;

        // Buy-in (cave auto): each seated player's gold coins become their stack, 1:1.
        for (int i = 0; i < n; i++) {
            chips[i] = (players.get(i).getEntity() instanceof ServerPlayer sp) ? CasinoBank.buyIn(sp) : 0;
        }

        buildDrawPile();
        for (CardPlayer p : players) { getPlayerHand(p).clear(); getCensoredHand(p).clear(); }
        ensureCurrentPlayer();

        phaseOrdinal = Phase.BETTING.ordinal();
        isGameReady  = false;
        isGameOver   = false;

        table(Component.translatable("message.charta.game_started"));
        table(Component.translatable("message.charta_casino.blackjack.place_bets"));

        for (int i = 0; i < 5; i++) scheduledActions.add(() -> {});
    }

    @Override
    public void runGame() {
        if (isGameOver) return;
        switch (getPhase()) {
            case BETTING -> startBettingRound();
            case PLAYING -> startPlayingRound();
            case DEALER  -> runDealerTurn();
            case RESULT  -> {}
        }
    }

    private void startBettingRound() {
        for (int i = 0; i < players.size(); i++) {
            if (chips[i] == 0 && bets[i] == 0) bets[i] = -1;
        }
        int active = 0;
        for (int i = 0; i < players.size(); i++) if (chips[i] > 0) active++;
        if (active == 0) { endGame(); return; }

        table(Component.translatable("message.charta_casino.blackjack.place_bets"));
        ensureCurrentPlayer();
        checkAllBetsPlaced();
    }

    private void checkAllBetsPlaced() {
        for (int i = 0; i < players.size(); i++) {
            if (chips[i] > 0 && bets[i] == 0) return;
        }
        isGameReady = false;
        scheduledActions.add(this::dealInitialCards);
    }

    public void handleBet(int playerIdx, int amount) {
        if (playerIdx < 0 || playerIdx >= players.size()) return;
        if (bets[playerIdx] > 0) return;
        int actual = Math.max(minBet(), Math.min(amount, chips[playerIdx]));
        bets[playerIdx]   = actual;
        chips[playerIdx] -= actual;
        play(players.get(playerIdx), Component.translatable("message.charta_casino.blackjack.bet_placed", actual));
        checkAllBetsPlaced();
    }

    private void dealInitialCards() {
        for (int round = 0; round < 2; round++) {
            for (int i = 0; i < players.size(); i++) {
                if (bets[i] < 0) continue;
                final int pi = i;
                scheduledActions.add(() -> {
                    players.get(pi).playSound(ModSounds.CARD_DRAW.get());
                    dealFaceUp(players.get(pi), 1);
                });
                for (int d = 0; d < 8; d++) scheduledActions.add(() -> {});
            }
            final boolean faceDown = (round == 1);
            scheduledActions.add(() -> {
                if (!drawPile.isEmpty()) {
                    Card c = drawPile.removeLast();
                    if (!faceDown && c.flipped()) c.flip();
                    int dIdx = 0;
                    for (int i = 0; i < dealerSlots.length; i++) { if (dealerSlots[i].isEmpty()) { dIdx = i; break; } }
                    dealerSlots[dIdx].add(c);
                    dealerCards.add(c);
                }
            });
            scheduledActions.add(() -> {});
        }

        scheduledActions.add(() -> {
            phaseOrdinal = Phase.PLAYING.ordinal();
            Arrays.fill(stood, false);
            Arrays.fill(busted, false);
            activePlayerIndex = 0;
            waitingForPlayAction = false;

            for (int i = 0; i < players.size(); i++) {
                if (handValue(getPlayerHand(players.get(i))) == 21) {
                    stood[i] = true;
                    play(players.get(i), Component.translatable("message.charta_casino.blackjack.blackjack").withStyle(ChatFormatting.GOLD));
                }
            }

            ensureCurrentPlayer();
        });
        scheduledActions.add(() -> {});
    }

    public final Set<Integer> notifiedLeavers = new HashSet<>();
    private boolean waitingForPlayAction = false;

    private void startPlayingRound() {
        if (waitingForPlayAction) return;

        while (activePlayerIndex < players.size()
                && (stood[activePlayerIndex] || busted[activePlayerIndex] || bets[activePlayerIndex] < 0)) {
            activePlayerIndex++;
        }

        if (activePlayerIndex >= players.size()) {
            isGameReady = false;
            for (int d = 0; d < 15; d++) scheduledActions.add(() -> {});
            scheduledActions.add(() -> {
                phaseOrdinal = Phase.DEALER.ordinal();
                Arrays.stream(dealerSlots).filter(s -> !s.isEmpty()).flatMap(GameSlot::stream)
                        .filter(Card::flipped).findFirst().ifPresent(Card::flip);
                table(Component.translatable("message.charta_casino.blackjack.dealer_reveals"));
            });
            return;
        }

        currentPlayer = players.get(activePlayerIndex);
        final int pi = activePlayerIndex;

        currentPlayer.resetPlay();
        waitingForPlayAction = true;
        table(Component.translatable("message.charta.its_player_turn", currentPlayer.getColoredName()));

        currentPlayer.afterPlay(play -> {
            waitingForPlayAction = false;
            if (play != null) {
                switch (play.slot()) {
                    case ACTION_HIT    -> doHit(pi);
                    case ACTION_STAND  -> doStand(pi);
                    case ACTION_DOUBLE -> doDouble(pi);
                }
            }
            if (busted[pi] || stood[pi]) activePlayerIndex++;
            isGameReady = false;
            scheduledActions.add(() -> {});
        });
    }

    private void doHit(int pi) {
        dealFaceUp(players.get(pi), 1);
        players.get(pi).playSound(ModSounds.CARD_DRAW.get());
        int val = handValue(getPlayerHand(players.get(pi)));
        if (val > 21) {
            busted[pi] = true;
            play(players.get(pi), Component.translatable("message.charta_casino.blackjack.bust").withStyle(ChatFormatting.RED));
        } else if (val == 21) {
            stood[pi] = true;
        }
    }

    private void doStand(int pi) {
        stood[pi] = true;
        play(players.get(pi), Component.translatable("message.charta_casino.blackjack.stand"));
    }

    private void doDouble(int pi) {
        int extra = Math.min(bets[pi], chips[pi]);
        bets[pi]  += extra;
        chips[pi] -= extra;
        play(players.get(pi), Component.translatable("message.charta_casino.blackjack.doubled", bets[pi]));
        doHit(pi);
        if (!busted[pi]) stood[pi] = true;
    }

    private void runDealerTurn() {
        LinkedList<Card> all = new LinkedList<>();
        for (GameSlot s : dealerSlots) s.stream().forEach(all::add);
        int dv = handValue(new GameSlot(all, 0, 0, 0, 0));
        if (dv < 17) {
            isGameReady = false;
            for (int d = 0; d < 15; d++) scheduledActions.add(() -> {});
            scheduledActions.add(() -> {
                if (!drawPile.isEmpty()) {
                    Card c = drawPile.removeLast();
                    if (c.flipped()) c.flip();
                    int dIdx = 0;
                    for (int i = 0; i < dealerSlots.length; i++) { if (dealerSlots[i].isEmpty()) { dIdx = i; break; } }
                    dealerSlots[dIdx].add(c);
                    dealerCards.add(c);
                    LinkedList<Card> _all = new LinkedList<>();
                    for (GameSlot _s : dealerSlots) _s.stream().forEach(_all::add);
                    table(Component.translatable("message.charta_casino.blackjack.dealer_hits",
                            handValue(new GameSlot(_all, 0, 0, 0, 0))));
                }
            });
        } else {
            resolveRound(dv);
        }
    }

    private void resolveRound(int dealerValue) {
        boolean dealerBust = dealerValue > 21;
        if (dealerBust) table(Component.translatable("message.charta_casino.blackjack.dealer_busts").withStyle(ChatFormatting.GREEN));

        boolean anyWithChips = false;
        for (int i = 0; i < players.size(); i++) {
            if (bets[i] < 0) continue;
            CardPlayer p  = players.get(i);
            int pv        = handValue(getPlayerHand(p));
            boolean bjack = pv == 21 && getPlayerHand(p).stream().count() == 2;

            if (busted[i]) {
                play(p, Component.translatable("message.charta_casino.blackjack.lost", bets[i]).withStyle(ChatFormatting.RED));
            } else if (dealerBust || pv > dealerValue) {
                int win = bjack ? (int)(bets[i] * 1.5) : bets[i];
                chips[i] += bets[i] + win;
                play(p, Component.translatable("message.charta_casino.blackjack.won", win).withStyle(ChatFormatting.GREEN));
            } else if (pv == dealerValue) {
                chips[i] += bets[i];
                play(p, Component.translatable("message.charta_casino.blackjack.push").withStyle(ChatFormatting.YELLOW));
            } else {
                play(p, Component.translatable("message.charta_casino.blackjack.lost", bets[i]).withStyle(ChatFormatting.RED));
            }

            if (chips[i] > 0) anyWithChips = true;
        }

        // Keep the persisted escrow in sync with each player's live balance (crash safety).
        for (int i = 0; i < players.size(); i++) {
            if (players.get(i).getEntity() instanceof ServerPlayer sp) CasinoBank.syncEscrow(sp, Math.max(0, chips[i]));
        }

        phaseOrdinal = Phase.RESULT.ordinal();
        isGameReady  = false;
        final boolean hasChips = anyWithChips;
        for (int i = 0; i < 60; i++) scheduledActions.add(() -> {});
        scheduledActions.add(() -> {
            if (hasChips) startNewRound();
            else endGame();
        });
    }

    private void startNewRound() {
        int n = players.size();
        Arrays.fill(bets,   0);
        Arrays.fill(stood,  false);
        Arrays.fill(busted, false);
        for (GameSlot s : dealerSlots) s.clear();
        dealerCards.clear();
        activePlayerIndex = 0;
        waitingForPlayAction = false;
        for (CardPlayer p : players) { getPlayerHand(p).clear(); getCensoredHand(p).clear(); }

        if (drawPile.size() < 20 * n) {
            buildDrawPile();
            table(Component.translatable("message.charta_casino.blackjack.reshuffled"));
        }

        phaseOrdinal = Phase.BETTING.ordinal();
    }

    @Override
    public boolean canPlay(CardPlayer player, GamePlay play) {
        if (isGameOver) return false;
        int idx = players.indexOf(player);
        if (idx < 0) return false;

        int slot  = play.slot();
        Phase phase = getPhase();

        if (phase == Phase.BETTING) {
            return isGameReady && bets[idx] == 0
                    && slot >= ACTION_BET
                    && (slot - ACTION_BET) >= minBet()
                    && (slot - ACTION_BET) <= chips[idx];
        }

        if (phase == Phase.PLAYING) {
            if (!isGameReady) return false;
            if (player != currentPlayer) return false;
            if (stood[idx] || busted[idx]) return false;
            return slot == ACTION_HIT || slot == ACTION_STAND
                    || (slot == ACTION_DOUBLE && chips[idx] > 0 && getPlayerHand(player).stream().count() == 2);
        }

        return false;
    }

    private void buildDrawPile() {
        drawPile.clear();
        for (int d = 0; d < 4; d++) {
            for (Card template : gameDeck) {
                Card copy = template.copy();
                if (!copy.flipped()) copy.flip();
                drawPile.add(copy);
            }
        }
        Collections.shuffle(drawPile);
    }

    private void dealFaceUp(CardPlayer player, int count) {
        for (int i = 0; i < count; i++) {
            if (drawPile.isEmpty()) return;
            Card c = drawPile.removeLast();
            if (c.flipped()) c.flip();
            getPlayerHand(player).add(c);
            getCensoredHand(player).add(c.copy());
        }
    }

    public static int handValue(GameSlot slot) {
        int total = 0, aces = 0;
        for (Card c : slot.stream().toList()) {
            int v = cardValue(c.rank());
            if (v == 11) aces++;
            total += v;
        }
        while (total > 21 && aces > 0) { total -= 10; aces--; }
        return total;
    }

    private static int cardValue(Rank rank) {
        if (rank == Ranks.ACE)   return 11;
        if (rank == Ranks.JACK || rank == Ranks.QUEEN || rank == Ranks.KING) return 10;
        int v = rank.ordinal();
        return (v >= 2 && v <= 10) ? v : 10;
    }

    public void onPlayerLeft(int idx) {
        if (idx < 0 || idx >= players.size()) return;
        busted[idx] = true;
        chips[idx]  = 0;
        bets[idx]   = -1;

        if (getPhase() == Phase.BETTING) {
            checkAllBetsPlaced();
        } else if (getPhase() == Phase.PLAYING) {
            if (waitingForPlayAction && currentPlayer == players.get(idx)) {
                waitingForPlayAction = false;
                activePlayerIndex++;
                isGameReady = false;
                scheduledActions.add(() -> {});
            }
        }
    }

    @Override
    public void endGame() {
        if (isGameOver) return;
        isGameOver = true;
        ensureCurrentPlayer();
        // Cash-game : pas de « vainqueur de la partie » (chacun repart avec sa cave).
        // Le titre plein écran « You won! / You lost! » de fin de partie est retiré
        // volontairement (fork ZigCity) : il n'a pas de sens en jeu d'argent réel.
        // Cash-out (cave auto): return each player's remaining chips as gold coins, 1:1.
        for (int i = 0; i < players.size(); i++) {
            if (players.get(i).getEntity() instanceof ServerPlayer sp) {
                CasinoBank.cashOut(sp, Math.max(0, chips[i]));
            }
            chips[i] = 0;
        }

        scheduledActions.clear();
        for (CardPlayer p : players) p.play(null);
    }

    @Override public int getMinPlayers() { return 1; }

    public int getDealerValue() {
        LinkedList<Card> all = new LinkedList<>();
        for (GameSlot s : dealerSlots) s.stream().forEach(all::add);
        return handValue(new GameSlot(all, 0, 0, 0, 0));
    }

    @Override
    public CardPlayer getCurrentPlayer() {
        ensureCurrentPlayer();
        return super.getCurrentPlayer();
    }

    public int getStartingChipsPublic() { return startingChips(); }
}

