package by.deokma.casino;

import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;

/**
 * Cash-game bridge for the Zig City fork of Charta Casino.
 *
 * <p>Charta plays with an abstract {@code int} chip counter that is reset every game and
 * never touches the real inventory. This class bridges that counter to a real world item
 * ({@code slotsmachine:gold_coin}) at a strict <b>1:1</b> ratio, using the "cave auto" model:
 * on buy-in ALL of a player's gold coins become their table stack, and the remaining balance
 * is handed back on cash-out.
 *
 * <p>Every method here is server-authoritative — callers must pass a real {@link ServerPlayer}.
 */
public final class CasinoBank {

    /** Item used as casino chips. Already present on the server (slotsmachine mod). */
    public static final ResourceLocation COIN_ID = ResourceLocation.parse("slotsmachine:gold_coin");

    private CasinoBank() {}

    /** The chip item, or {@code null} if the slotsmachine mod is absent. */
    public static Item coinItem() {
        Item item = BuiltInRegistries.ITEM.get(COIN_ID);
        return item == Items.AIR ? null : item;
    }

    /** Counts the loose gold coins in a player's inventory (0 if the item is missing). */
    public static int countCoins(ServerPlayer player) {
        Item coin = coinItem();
        if (coin == null) return 0;
        Inventory inv = player.getInventory();
        int total = 0;
        for (int i = 0; i < inv.getContainerSize(); i++) {
            ItemStack s = inv.getItem(i);
            if (s.is(coin)) total += s.getCount();
        }
        return total;
    }

    /** Removes ALL gold coins from the inventory and returns how many were taken (buy-in). */
    public static int removeAllCoins(ServerPlayer player) {
        Item coin = coinItem();
        if (coin == null) return 0;
        Inventory inv = player.getInventory();
        int removed = 0;
        for (int i = 0; i < inv.getContainerSize(); i++) {
            ItemStack s = inv.getItem(i);
            if (s.is(coin)) {
                removed += s.getCount();
                inv.setItem(i, ItemStack.EMPTY);
            }
        }
        return removed;
    }

    /** Gives {@code amount} gold coins back, dropping any overflow at the player's feet. */
    public static void giveCoins(ServerPlayer player, int amount) {
        Item coin = coinItem();
        if (coin == null || amount <= 0) return;
        int maxStack = new ItemStack(coin).getMaxStackSize();
        int remaining = amount;
        while (remaining > 0) {
            int give = Math.min(remaining, maxStack);
            ItemStack stack = new ItemStack(coin, give);
            player.getInventory().add(stack);
            if (!stack.isEmpty()) {
                player.drop(stack, false);
            }
            remaining -= give;
        }
    }

    // ── High-level cave operations (escrow-backed for crash/disconnect safety) ──────────────

    /** Buy-in: take all the player's coins as their starting stack, and record the escrow. */
    public static int buyIn(ServerPlayer player) {
        int amount = removeAllCoins(player);
        CasinoEscrow.of(player).set(player.getUUID(), amount);
        return amount;
    }

    /** Keep the persisted escrow in sync with the live chip balance (call at each round end). */
    public static void syncEscrow(ServerPlayer player, int chipsNow) {
        CasinoEscrow.of(player).set(player.getUUID(), Math.max(0, chipsNow));
    }

    /** Cash-out: hand back {@code chipsNow} coins and clear the escrow. */
    public static void cashOut(ServerPlayer player, int chipsNow) {
        giveCoins(player, chipsNow);
        CasinoEscrow.of(player).clear(player.getUUID());
    }

    /** On login: refund any stranded escrow (crash / mid-game disconnect) then clear it. */
    public static void refundStranded(ServerPlayer player) {
        CasinoEscrow escrow = CasinoEscrow.of(player);
        int owed = escrow.get(player.getUUID());
        if (owed > 0) {
            giveCoins(player, owed);
            escrow.clear(player.getUUID());
        }
    }
}
