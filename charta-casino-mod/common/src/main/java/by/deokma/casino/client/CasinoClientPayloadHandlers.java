package by.deokma.casino.client;

import by.deokma.casino.network.TexasHoldemChipsPayload;

public final class CasinoClientPayloadHandlers {

    private CasinoClientPayloadHandlers() {}

    public static void handleTexasHoldemChips(TexasHoldemChipsPayload payload) {
        CasinoClientData.TABLE_POKER_CHIPS.put(payload.pos(), payload.chips());
        CasinoClientData.TABLE_POKER_GAME_SLOT_COUNT.put(payload.pos(), payload.gameSlotCount());
        CasinoClientData.TABLE_POKER_FOLDED.put(payload.pos(), payload.foldedMask());
        CasinoClientData.TABLE_POKER_ALLIN.put(payload.pos(), payload.allInMask());
        CasinoClientData.TABLE_POKER_STARTING_CHIPS.put(payload.pos(), payload.startingChips());
    }
}
