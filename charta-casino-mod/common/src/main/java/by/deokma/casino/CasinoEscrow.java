package by.deokma.casino;

import net.minecraft.core.HolderLookup;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.level.saveddata.SavedData;

import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Persistent per-player record of the gold coins currently "on the table".
 *
 * <p>Charta never persists a running game, and has no disconnect handling, so without this a
 * server restart / crash / mid-game disconnect would strand a player's escrowed coins.
 * This {@link SavedData} (stored on the overworld) survives all of that; the amount is refunded
 * on the player's next login via {@link CasinoBank#refundStranded(ServerPlayer)}.
 */
public class CasinoEscrow extends SavedData {

    private static final String NAME = "charta_casino_escrow";

    private final Map<UUID, Integer> owed = new HashMap<>();

    public static CasinoEscrow of(ServerPlayer player) {
        ServerLevel overworld = player.getServer().overworld();
        return overworld.getDataStorage().computeIfAbsent(
                new SavedData.Factory<>(CasinoEscrow::new, CasinoEscrow::load), NAME);
    }

    public int get(UUID id) {
        return owed.getOrDefault(id, 0);
    }

    public void set(UUID id, int amount) {
        if (amount <= 0) {
            if (owed.remove(id) != null) setDirty();
        } else if (!Integer.valueOf(amount).equals(owed.put(id, amount))) {
            setDirty();
        }
    }

    public void clear(UUID id) {
        if (owed.remove(id) != null) setDirty();
    }

    @Override
    public CompoundTag save(CompoundTag tag, HolderLookup.Provider registries) {
        CompoundTag map = new CompoundTag();
        owed.forEach((id, amount) -> map.putInt(id.toString(), amount));
        tag.put("owed", map);
        return tag;
    }

    public static CasinoEscrow load(CompoundTag tag, HolderLookup.Provider registries) {
        CasinoEscrow data = new CasinoEscrow();
        CompoundTag map = tag.getCompound("owed");
        for (String key : map.getAllKeys()) {
            try {
                data.owed.put(UUID.fromString(key), map.getInt(key));
            } catch (IllegalArgumentException ignored) {
                // skip malformed keys
            }
        }
        return data;
    }
}
