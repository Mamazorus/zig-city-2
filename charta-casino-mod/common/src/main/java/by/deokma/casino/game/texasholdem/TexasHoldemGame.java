package by.deokma.casino.game.texasholdem;

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
 * Server-side Texas Hold'em game logic.
 * Hand lifecycle: startGame → dealNewHand → postBlindsAndStart → runBettingRound
 *   → advancePhase (repeats) → doShowdown → onHandComplete → [pause] → dealNewHand or endGame
 */
public class TexasHoldemGame extends Game<TexasHoldemGame, TexasHoldemMenu> {

    public static final int ACTION_FOLD         = 100;
    public static final int ACTION_CALL         = 101;
    public static final int ACTION_RAISE_MIN    = 102;
    public static final int ACTION_ALL_IN       = 103;
    public static final int ACTION_RAISE_CUSTOM = 200;

    public static final int SLOT_COMMUNITY_FIRST = 0;
    public static final int SLOT_COMMUNITY_LAST  = 4;

    private static final int SHOWDOWN_DELAY_TICKS = 60;
    private static final int PAUSE_DURATION_TICKS = 100;

    private final GameOption.Number startingChipsOption = new GameOption.Number(
            5, 1, 20,
            Component.translatable("rule.charta_casino.texas_holdem.starting_chips"),
            Component.translatable("rule.charta_casino.texas_holdem.starting_chips.description"));

    private final GameOption.Number bigBlindOption = new GameOption.Number(
            10, 2, 50,
            Component.translatable("rule.charta_casino.texas_holdem.big_blind"),
            Component.translatable("rule.charta_casino.texas_holdem.big_blind.description"));

    // Public state — synced via ContainerData in TexasHoldemMenu
    public int[]     chips;
    public int[]     roundBets;
    public int[]     totalCommitted;
    public boolean[] folded;
    public boolean[] allIn;
    public int  pot;
    public int  currentBet;
    public int  dealerIndex;
    public int  phaseOrdinal;
    public int  communityCardCount;
    public boolean isPaused;
    public int  skipVoteMask;

    private final LinkedList<Integer> pendingActors = new LinkedList<>();
    private final Set<Integer> revealedAtShowdown = new HashSet<>();
    public final GameSlot[] communitySlots = new GameSlot[5];
    private final LinkedList<Card> drawPile = new LinkedList<>();

    public TexasHoldemGame(List<CardPlayer> players, Deck deck) {
        super(players, deck);
        int n = Math.max(players.size(), 1);
        chips          = new int[n];
        roundBets      = new int[n];
        totalCommitted = new int[n];
        folded         = new boolean[n];
        allIn          = new boolean[n];
        phaseOrdinal   = PokerPhase.PREFLOP.ordinal();
        dealerIndex    = 0;
        initCommunitySlots();
    }

    private void initCommunitySlots() {
        float cardW  = CardImage.WIDTH;
        float gap    = 8f;
        float totalW = 5 * cardW + 4 * gap;
        float startX = (CardTableBlockEntity.TABLE_WIDTH - totalW) / 2f;
        float centreY = CardTableBlockEntity.TABLE_HEIGHT / 2f - CardImage.HEIGHT / 2f - 5f;
        for (int i = 0; i < 5; i++) {
            final float slotX = startX + i * (cardW + gap);
            communitySlots[i] = addSlot(new GameSlot(new LinkedList<>(), slotX, centreY, 0f, 0f) {
                @Override public boolean canInsertCard(CardPlayer p, List<Card> c, int idx) { return false; }
                @Override public boolean canRemoveCard(CardPlayer p, int idx)               { return false; }
            });
        }
    }

    private int getStartingChips()  { return startingChipsOption.get() * 100; }
    private int getBigBlind()       { return bigBlindOption.get(); }
    private int getSmallBlind()     { return getBigBlind() / 2; }
    private int getRaiseAmount()    { return getBigBlind(); }

    private void ensureCurrentPlayer() {
        if (players.isEmpty()) return;
        if (currentPlayer != null && players.contains(currentPlayer)) return;

        Integer nextActor = pendingActors.peek();
        if (nextActor != null && nextActor >= 0 && nextActor < players.size()) {
            currentPlayer = players.get(nextActor);
            return;
        }

        for (int i = 0; i < players.size(); i++) {
            if (!folded[i] || chips[i] > 0) {
                currentPlayer = players.get(i);
                return;
            }
        }

        currentPlayer = players.get(0);
    }

    public int getStartingChipsPublic() { return getStartingChips(); }
    public int getRaiseAmountPublic()   { return getRaiseAmount(); }

    @Override
    public TexasHoldemMenu createMenu(int containerId, Inventory playerInventory, AbstractCardMenu.Definition definition) {
        return new TexasHoldemMenu(containerId, playerInventory, definition);
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
    public List<GameOption<?>> getOptions() { return List.of(bigBlindOption); }

    @Override
    public java.util.Optional<Component> playerPredicate(List<CardPlayer> players) {
        for (CardPlayer p : players) {
            if (p.getEntity() instanceof ServerPlayer sp && CasinoBank.countCoins(sp) <= 0) {
                return java.util.Optional.of(Component.translatable("message.charta_casino.no_coins", p.getName()));
            }
        }
        return java.util.Optional.empty();
    }

    @Override public int getMinPlayers() { return 2; }
    @Override public int getMaxPlayers() { return 8; }

    @Override
    protected GameSlot createPlayerHand(CardPlayer player) {
        return new GameSlot(player.hand()) {
            @Override public boolean canRemoveCard(CardPlayer p, int idx)               { return false; }
            @Override public boolean canInsertCard(CardPlayer p, List<Card> c, int idx) { return false; }
            @Override public boolean removeAll()                                         { return false; }
        };
    }

    @Override
    public boolean canPlay(CardPlayer player, GamePlay play) {
        if (!isGameReady || isGameOver) return false;
        if (player != currentPlayer)    return false;
        int idx = players.indexOf(player);
        if (idx < 0) return false;
        return switch (play.slot()) {
            case ACTION_FOLD      -> !folded[idx];
            case ACTION_CALL      -> !folded[idx] && !allIn[idx];
            case ACTION_RAISE_MIN -> !folded[idx] && !allIn[idx] && chips[idx] > 0;
            case ACTION_ALL_IN    -> !folded[idx] && !allIn[idx] && chips[idx] > 0;
            default               -> play.slot() >= ACTION_RAISE_CUSTOM && !folded[idx] && !allIn[idx] && chips[idx] > 0;
        };
    }

    @Override
    public GamePlay getBestPlay(CardPlayer player) {
        int idx = players.indexOf(player);
        if (idx < 0 || folded[idx] || allIn[idx]) return null;
        float strength   = evaluateHandStrength(player);
        int   callAmount = currentBet - roundBets[idx];
        if (strength < 0.25f) return callAmount > 0 ? new GamePlay(List.of(), ACTION_FOLD) : new GamePlay(List.of(), ACTION_CALL);
        else if (strength < 0.55f) return new GamePlay(List.of(), ACTION_CALL);
        else if (strength < 0.80f) return chips[idx] >= getRaiseAmount() ? new GamePlay(List.of(), ACTION_RAISE_MIN) : new GamePlay(List.of(), ACTION_CALL);
        else return new GamePlay(List.of(), ACTION_ALL_IN);
    }

    private float evaluateHandStrength(CardPlayer player) {
        List<Card> holeCards = getPlayerHand(player).stream().toList();
        if (PokerPhase.fromOrdinal(phaseOrdinal) == PokerPhase.PREFLOP) return evaluatePreflopStrength(holeCards);
        List<Card> allCards = new ArrayList<>(holeCards);
        for (GameSlot slot : communitySlots) slot.stream().forEach(allCards::add);
        return (float) HandEvaluator.evaluate(allCards) / HandEvaluator.MAX_SCORE;
    }

    @Override
    public void startGame() {
        // Buy-in (cave auto): each seated player's gold coins become their stack, 1:1.
        for (int i = 0; i < players.size(); i++) {
            chips[i] = (players.get(i).getEntity() instanceof ServerPlayer sp) ? CasinoBank.buyIn(sp) : 0;
        }
        isPaused = false; skipVoteMask = 0;
        isGameReady = false; isGameOver = false;
        ensureCurrentPlayer();
        table(Component.translatable("message.charta.game_started"));
        dealNewHand();
    }

    private void dealNewHand() {
        clearHandState();
        buildShuffledDrawPile();
        for (int i = 0; i < players.size(); i++) if (chips[i] == 0) folded[i] = true;
        scheduleDealAnimation();
        scheduledActions.add(this::postBlindsAndStart);
        isGameReady = false; isGameOver = false;
    }

    private void clearHandState() {
        Arrays.fill(roundBets, 0); Arrays.fill(totalCommitted, 0);
        Arrays.fill(folded, false); Arrays.fill(allIn, false);
        pot = 0; currentBet = 0; communityCardCount = 0;
        phaseOrdinal = PokerPhase.PREFLOP.ordinal();
        revealedAtShowdown.clear(); pendingActors.clear();
        for (GameSlot slot : communitySlots) slot.clear();
        drawPile.clear();
        for (CardPlayer p : players) { getPlayerHand(p).clear(); getCensoredHand(p).clear(); }
        ensureCurrentPlayer();
    }

    private void buildShuffledDrawPile() {
        for (Card template : gameDeck) {
            Card copy = template.copy();
            if (!copy.flipped()) copy.flip();
            drawPile.add(copy);
        }
        Collections.shuffle(drawPile);
    }

    private void scheduleDealAnimation() {
        int n = players.size();
        for (int round = 0; round < 2; round++) {
            for (int i = 0; i < n; i++) {
                if (chips[i] == 0) continue;
                final int pi = i;
                scheduledActions.add(() -> { players.get(pi).playSound(ModSounds.CARD_DRAW.get()); dealOneCardFromPile(players.get(pi)); });
                scheduledActions.add(() -> {});
            }
        }
    }

    private void dealOneCardFromPile(CardPlayer player) {
        if (drawPile.isEmpty()) return;
        Card card = drawPile.removeLast();
        if (card.flipped()) card.flip();
        getPlayerHand(player).add(card);
        getCensoredHand(player).add(new Card());
    }

    private void postBlindsAndStart() {
        int n = players.size();
        int sbIdx = (dealerIndex + 1) % n;
        int bbIdx = (dealerIndex + 2) % n;
        postBlind(sbIdx, getSmallBlind());
        postBlind(bbIdx, getBigBlind());
        currentBet = getBigBlind();
        buildPendingActors((bbIdx + 1) % n, bbIdx);
        ensureCurrentPlayer();
        table(Component.translatable("message.charta_casino.texas_holdem.preflop"));
        table(Component.translatable("message.charta_casino.texas_holdem.pot", pot));
    }

    private void postBlind(int playerIndex, int amount) {
        int actual = Math.min(amount, chips[playerIndex]);
        commitChips(playerIndex, actual);
        if (chips[playerIndex] == 0) allIn[playerIndex] = true;
        play(players.get(playerIndex), Component.translatable("message.charta_casino.texas_holdem.posted_blind", actual));
    }

    @Override
    public void runGame() {
        if (!isGameReady) return;
        runBettingRound();
    }

    private void runBettingRound() {
        if (isGameOver) return;
        if (countActivePlayers() <= 1) { awardPotToLastPlayer(); return; }
        Integer nextActorIdx = pollNextBettingActor();
        if (nextActorIdx == null) { advancePhase(); return; }
        final int actorIdx = nextActorIdx;
        currentPlayer = players.get(actorIdx);
        currentPlayer.resetPlay();
        table(Component.translatable("message.charta.its_player_turn", currentPlayer.getColoredName()));
        currentPlayer.afterPlay(play -> {
            handleAction(actorIdx, play != null ? play.slot() : ACTION_FOLD);
            runBettingRound();
        });
    }

    private Integer pollNextBettingActor() {
        while (!pendingActors.isEmpty()) {
            Integer candidate = pendingActors.poll();
            if (!folded[candidate] && !allIn[candidate]) return candidate;
        }
        return null;
    }

    public void handleAction(int playerIndex, int action) {
        if (playerIndex < 0 || playerIndex >= players.size()) return;
        switch (action) {
            case ACTION_FOLD      -> applyFold(playerIndex);
            case ACTION_CALL      -> applyCallOrCheck(playerIndex);
            case ACTION_RAISE_MIN -> applyRaise(playerIndex, getRaiseAmount());
            case ACTION_ALL_IN    -> applyRaise(playerIndex, chips[playerIndex]);
            default -> {
                if (action >= ACTION_RAISE_CUSTOM) {
                    int amount = Math.max(getRaiseAmount(), action - ACTION_RAISE_CUSTOM);
                    applyRaise(playerIndex, Math.min(amount, chips[playerIndex]));
                } else {
                    applyFold(playerIndex);
                }
            }
        }
    }

    private void applyFold(int i) {
        folded[i] = true;
        play(players.get(i), Component.translatable("message.charta_casino.texas_holdem.folded"));
    }

    private void applyCallOrCheck(int i) {
        int owed = currentBet - roundBets[i];
        if (owed <= 0) { play(players.get(i), Component.translatable("message.charta_casino.texas_holdem.checked")); return; }
        int paid = Math.min(owed, chips[i]);
        commitChips(i, paid);
        if (chips[i] == 0) { allIn[i] = true; play(players.get(i), Component.translatable("message.charta_casino.texas_holdem.all_in", roundBets[i])); }
        else play(players.get(i), Component.translatable("message.charta_casino.texas_holdem.called", paid));
    }

    private void applyRaise(int i, int raiseBy) {
        int paid = Math.min(raiseBy, chips[i]);
        commitChips(i, paid);
        if (chips[i] == 0) { allIn[i] = true; play(players.get(i), Component.translatable("message.charta_casino.texas_holdem.all_in", roundBets[i])); }
        else play(players.get(i), Component.translatable("message.charta_casino.texas_holdem.raised", roundBets[i]));
        if (roundBets[i] > currentBet) currentBet = roundBets[i];
        rebuildPendingActorsAfterRaise(i);
        table(Component.translatable("message.charta_casino.texas_holdem.pot", pot));
    }

    private void commitChips(int i, int amount) {
        chips[i] -= amount; roundBets[i] += amount; totalCommitted[i] += amount; pot += amount;
    }

    private void buildPendingActors(int startIdx, int lastToActIdx) {
        pendingActors.clear();
        int n = players.size(), idx = startIdx;
        do { if (!folded[idx] && !allIn[idx]) pendingActors.add(idx); idx = (idx + 1) % n; } while (idx != startIdx);
        if (pendingActors.remove(Integer.valueOf(lastToActIdx))) pendingActors.addLast(lastToActIdx);
    }

    private void rebuildPendingActorsAfterRaise(int raiserIndex) {
        pendingActors.clear();
        int n = players.size(), idx = (raiserIndex + 1) % n;
        while (idx != raiserIndex) { if (!folded[idx] && !allIn[idx]) pendingActors.add(idx); idx = (idx + 1) % n; }
    }

    private void advancePhase() {
        Arrays.fill(roundBets, 0); currentBet = 0;
        switch (PokerPhase.fromOrdinal(phaseOrdinal)) {
            case PREFLOP -> transitionToFlop();
            case FLOP    -> transitionToTurn();
            case TURN    -> transitionToRiver();
            case RIVER   -> transitionToShowdown();
            default      -> onHandComplete();
        }
    }

    private void transitionToFlop()     { phaseOrdinal = PokerPhase.FLOP.ordinal();     dealCommunityCards(3); table(Component.translatable("message.charta_casino.texas_holdem.flop"));  startPostFlopBetting(); }
    private void transitionToTurn()     { phaseOrdinal = PokerPhase.TURN.ordinal();     dealCommunityCards(1); table(Component.translatable("message.charta_casino.texas_holdem.turn"));  startPostFlopBetting(); }
    private void transitionToRiver()    { phaseOrdinal = PokerPhase.RIVER.ordinal();    dealCommunityCards(1); table(Component.translatable("message.charta_casino.texas_holdem.river")); startPostFlopBetting(); }
    private void transitionToShowdown() { phaseOrdinal = PokerPhase.SHOWDOWN.ordinal(); doShowdown(); }

    private void dealCommunityCards(int count) {
        for (int i = 0; i < count && !drawPile.isEmpty() && communityCardCount < 5; i++) {
            Card card = drawPile.removeLast();
            if (card.flipped()) card.flip();
            communitySlots[communityCardCount].add(card);
            communityCardCount++;
        }
    }

    private void startPostFlopBetting() {
        buildPendingActors((dealerIndex + 1) % players.size(), dealerIndex);
        ensureCurrentPlayer();
        table(Component.translatable("message.charta_casino.texas_holdem.pot", pot));
        runBettingRound();
    }

    private void doShowdown() {
        table(Component.translatable("message.charta_casino.texas_holdem.showdown"));
        List<Card> community = collectCommunityCards();
        List<Integer> contenders = activePlayerIndices();
        revealedAtShowdown.addAll(contenders);
        if (contenders.isEmpty()) { onHandComplete(); return; }
        distributeSidePots(contenders, community);
        for (int i = 0; i < SHOWDOWN_DELAY_TICKS; i++) scheduledActions.add(() -> {});
        scheduledActions.add(this::onHandComplete);
        isGameReady = false;
    }

    private void distributeSidePots(List<Integer> contenders, List<Card> community) {
        List<Integer> sorted = new ArrayList<>(contenders);
        sorted.sort(Comparator.comparingInt(i -> totalCommitted[i]));
        List<Integer> eligible = new ArrayList<>(contenders);
        int distributed = 0, prevCap = 0;
        for (Integer capPlayerIdx : sorted) {
            int cap = totalCommitted[capPlayerIdx];
            if (cap <= prevCap) continue;
            int sidePot = computeSidePot(prevCap, cap);
            if (sidePot <= 0) { prevCap = cap; continue; }
            distributed += awardSidePot(sidePot, eligible, community);
            eligible.removeIf(idx -> totalCommitted[idx] <= cap);
            prevCap = cap;
        }
        int remainder = pot - distributed;
        if (remainder > 0 && !contenders.isEmpty()) chips[contenders.get(0)] += remainder;
        pot = 0;
    }

    private int computeSidePot(int prevCap, int cap) {
        int sidePot = 0;
        for (int i = 0; i < players.size(); i++)
            sidePot += Math.min(Math.max(0, totalCommitted[i] - prevCap), cap - prevCap);
        return sidePot;
    }

    private int awardSidePot(int sidePot, List<Integer> eligible, List<Card> community) {
        Map<Integer, Long> scores = new LinkedHashMap<>();
        for (Integer idx : eligible) scores.put(idx, HandEvaluator.evaluate(allSevenCards(idx, community)));
        long bestScore = scores.values().stream().mapToLong(Long::longValue).max().orElse(Long.MIN_VALUE);
        List<Integer> winners = eligible.stream().filter(idx -> scores.get(idx) == bestScore).toList();
        int share = sidePot / winners.size(), remainder = sidePot - share * winners.size(), distributed = 0;
        for (int i = 0; i < winners.size(); i++) {
            int winnerIdx = winners.get(i), actualGain = share + (i == 0 ? remainder : 0);
            chips[winnerIdx] += actualGain; distributed += actualGain;
            announceWinner(winnerIdx, actualGain, community);
        }
        for (int idx : eligible) if (!winners.contains(idx)) announceLoser(idx, community);
        return distributed;
    }

    private void announceWinner(int playerIdx, int share, List<Card> community) {
        String handName = HandEvaluator.getHandName(allSevenCards(playerIdx, community));
        table(Component.translatable("message.charta_casino.texas_holdem.showdown_result",
                players.get(playerIdx).getColoredName(),
                Component.literal(String.valueOf(share)).withStyle(ChatFormatting.GOLD),
                Component.literal(handName).withStyle(ChatFormatting.AQUA)));
    }

    private void announceLoser(int playerIdx, List<Card> community) {
        String handName = HandEvaluator.getHandName(allSevenCards(playerIdx, community));
        play(players.get(playerIdx), Component.translatable("message.charta_casino.texas_holdem.hand_name",
                Component.literal(handName).withStyle(ChatFormatting.GRAY)));
    }

    private List<Card> allSevenCards(int playerIdx, List<Card> community) {
        List<Card> cards = new ArrayList<>(getPlayerHand(players.get(playerIdx)).stream().toList());
        cards.addAll(community);
        return cards;
    }

    private List<Card> collectCommunityCards() {
        List<Card> cards = new ArrayList<>();
        for (GameSlot slot : communitySlots) slot.stream().forEach(cards::add);
        return cards;
    }

    private void awardPotToLastPlayer() {
        int lastIdx = findLastActivePlayer();
        if (lastIdx < 0) { onHandComplete(); return; }
        int cap = totalCommitted[lastIdx], winnable = 0;
        int[] refunds = new int[players.size()];
        for (int i = 0; i < players.size(); i++) { int take = Math.min(totalCommitted[i], cap); winnable += take; refunds[i] = totalCommitted[i] - take; }
        chips[lastIdx] += winnable;
        play(players.get(lastIdx), Component.translatable("message.charta_casino.texas_holdem.wins_pot", winnable));
        for (int i = 0; i < players.size(); i++) if (refunds[i] > 0) { chips[i] += refunds[i]; play(players.get(i), Component.translatable("message.charta_casino.texas_holdem.refunded", refunds[i])); }
        pot = 0;
        onHandComplete();
    }

    private int findLastActivePlayer() {
        for (int i = 0; i < players.size(); i++) if (!folded[i]) return i;
        return -1;
    }

    private void onHandComplete() {
        // Keep the persisted escrow in sync with live balances (crash safety).
        for (int i = 0; i < players.size(); i++) {
            if (players.get(i).getEntity() instanceof ServerPlayer sp) CasinoBank.syncEscrow(sp, Math.max(0, chips[i]));
        }
        if (countPlayersWithChips() > 1) { broadcastChipStandings(); advanceDealer(); enterPause(); }
        else endGame();
    }

    private void enterPause() {
        isPaused = true; skipVoteMask = 0; isGameReady = false;
        final int[] ticksLeft = { PAUSE_DURATION_TICKS };
        Runnable pauseTick = new Runnable() {
            @Override public void run() {
                if (!isPaused) return;
                ticksLeft[0]--;
                if (ticksLeft[0] > 0) scheduledActions.addFirst(this);
                else startNextHandFromPause();
            }
        };
        scheduledActions.add(pauseTick);
    }

    private void startNextHandFromPause() { isPaused = false; skipVoteMask = 0; dealNewHand(); }

    public void voteSkipPause(int playerIndex) {
        if (!isPaused || playerIndex < 0 || playerIndex >= players.size()) return;
        skipVoteMask |= (1 << playerIndex);
        int required = countPlayersWithChips(), votes = 0;
        for (int i = 0; i < players.size(); i++) if (chips[i] > 0 && (skipVoteMask & (1 << i)) != 0) votes++;
        if (votes >= required) { scheduledActions.clear(); startNextHandFromPause(); }
    }

    private void broadcastChipStandings() {
        for (int i = 0; i < players.size(); i++)
            if (chips[i] > 0) play(players.get(i), Component.translatable("message.charta_casino.texas_holdem.chips_remaining", chips[i]));
    }

    @Override
    public void endGame() {
        if (isGameOver) return;
        isGameOver = true;
        refundRemainingPot(); pendingActors.clear(); scheduledActions.clear();
        players.forEach(p -> p.play(null));
        // Cash-game : pas de « vainqueur de la partie ». Titre de fin de partie
        // « You won! / You lost! » retiré volontairement (fork ZigCity).
        ensureCurrentPlayer();
        // Cash-out (cave auto): return each player's remaining chips as gold coins, 1:1.
        for (int i = 0; i < players.size(); i++) {
            if (players.get(i).getEntity() instanceof ServerPlayer sp) CasinoBank.cashOut(sp, Math.max(0, chips[i]));
            chips[i] = 0;
        }
    }

    private void refundRemainingPot() {
        if (pot <= 0) return;
        for (int i = 0; i < players.size(); i++) {
            if (totalCommitted[i] > 0) {
                chips[i] += totalCommitted[i];
                play(players.get(i), Component.translatable("message.charta_casino.texas_holdem.refunded", totalCommitted[i]));
            }
        }
        pot = 0;
    }

    @Override
    public GameSlot getCensoredHand(CardPlayer viewer, CardPlayer player) {
        int idx = players.indexOf(player);
        if (revealedAtShowdown.contains(idx)) return hands.getOrDefault(player, new GameSlot());
        return super.getCensoredHand(viewer, player);
    }

    private long countActivePlayers() { long c = 0; for (boolean f : folded) if (!f) c++; return c; }
    private int countPlayersWithChips() { int c = 0; for (int ch : chips) if (ch > 0) c++; return c; }

    private List<Integer> activePlayerIndices() {
        List<Integer> result = new ArrayList<>();
        for (int i = 0; i < players.size(); i++) if (!folded[i]) result.add(i);
        return result;
    }

    private void advanceDealer() {
        int n = players.size();
        for (int tries = 0; tries < n; tries++) { dealerIndex = (dealerIndex + 1) % n; if (chips[dealerIndex] > 0) return; }
    }

    @Override
    public CardPlayer getCurrentPlayer() {
        ensureCurrentPlayer();
        return super.getCurrentPlayer();
    }

    private static float evaluatePreflopStrength(List<Card> holeCards) {
        if (holeCards.size() < 2) return 0.3f;
        int r1 = HandEvaluator.rankValue(holeCards.get(0)), r2 = HandEvaluator.rankValue(holeCards.get(1));
        boolean suited = holeCards.get(0).suit() == holeCards.get(1).suit();
        boolean paired = holeCards.get(0).rank() == holeCards.get(1).rank();
        boolean connected = Math.abs(r1 - r2) == 1;
        float base = (r1 + r2) / 28f;
        if (paired) base += 0.20f; if (suited) base += 0.10f; if (connected) base += 0.05f;
        return Math.min(base, 1.0f);
    }

//    /** Backward-compat shim so TexasHoldemMenu can reference TexasHoldemGame.Phase. */
//    public static final class Phase {
//        private Phase() {}
//        public static PokerPhase fromOrdinal(int ordinal) { return PokerPhase.fromOrdinal(ordinal); }
//        public static final PokerPhase PREFLOP  = PokerPhase.PREFLOP;
//        public static final PokerPhase FLOP     = PokerPhase.FLOP;
//        public static final PokerPhase TURN     = PokerPhase.TURN;
//        public static final PokerPhase RIVER    = PokerPhase.RIVER;
//        public static final PokerPhase SHOWDOWN = PokerPhase.SHOWDOWN;
//    }
}

