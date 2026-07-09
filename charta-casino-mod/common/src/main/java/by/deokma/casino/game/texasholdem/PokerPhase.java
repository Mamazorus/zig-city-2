package by.deokma.casino.game.texasholdem;

public enum PokerPhase {
    PREFLOP, FLOP, TURN, RIVER, SHOWDOWN;

    private static final PokerPhase[] VALUES = values();

    public static PokerPhase fromOrdinal(int ordinal) {
        return (ordinal >= 0 && ordinal < VALUES.length) ? VALUES[ordinal] : PREFLOP;
    }

    public boolean isPostFlop() {
        return this == FLOP || this == TURN || this == RIVER;
    }
}
