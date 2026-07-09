package by.deokma.casino.client;

import net.minecraft.core.BlockPos;

import java.util.HashMap;
import java.util.Map;

/**
 * Client-side state for casino games (poker chip stacks, fold/all-in masks).
 * Used by TexasHoldemScreen and CardTableBlockEntityRenderer (via addon).
 */
public final class CasinoClientData {

    private CasinoClientData() {}

    public static final Map<BlockPos, int[]>   TABLE_POKER_CHIPS          = new HashMap<>();
    public static final Map<BlockPos, Integer> TABLE_POKER_GAME_SLOT_COUNT = new HashMap<>();
    public static final Map<BlockPos, Integer> TABLE_POKER_FOLDED          = new HashMap<>();
    public static final Map<BlockPos, Integer> TABLE_POKER_ALLIN           = new HashMap<>();
    public static final Map<BlockPos, Integer> TABLE_POKER_STARTING_CHIPS  = new HashMap<>();
}
