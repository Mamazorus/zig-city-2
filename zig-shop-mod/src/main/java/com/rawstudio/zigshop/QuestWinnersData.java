package com.rawstudio.zigshop;

import net.minecraft.core.HolderLookup;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.server.MinecraftServer;
import net.minecraft.world.level.saveddata.SavedData;

import javax.annotation.Nullable;
import java.util.HashMap;
import java.util.Map;

/**
 * Verrou GLOBAL des quêtes en mode {@code unique} (« un seul gagnant sur tout le serveur »).
 *
 * <p>Persisté dans les données du monde (overworld) sous {@code <world>/data/zigshop_quest_winners.dat}.
 * Comme la réclamation d'une quête s'exécute sur le THREAD SERVEUR (thread unique), la
 * vérification « premier arrivé » via {@link #tryClaim} est atomique sans verrou Java.
 *
 * <p>Un miroir best-effort est publié dans Firebase ({@code /questWinners/{id}}) pour
 * l'affichage côté launcher ; à l'inverse, {@link #mergeIfAbsent} permet de ré-importer les
 * gagnants depuis Firebase au démarrage du serveur (robustesse si le monde a été réinitialisé).
 */
public final class QuestWinnersData extends SavedData {

    /** Nom du fichier {@code .dat} sous {@code <world>/data/}. */
    public static final String FILE_ID = "zigshop_quest_winners";

    /** Gagnant d'une quête unique : pseudo, UUID (pour la tête), horodatage (ms). */
    public record Winner(String name, String uuid, long ts) {}

    private final Map<String, Winner> winners = new HashMap<>();

    public QuestWinnersData() {}

    /** Instance persistée du monde (crée le fichier si absent). À appeler sur le thread serveur. */
    public static QuestWinnersData get(MinecraftServer server) {
        return server.overworld().getDataStorage().computeIfAbsent(
                new SavedData.Factory<>(QuestWinnersData::new, QuestWinnersData::load),
                FILE_ID);
    }

    /** Gagnant enregistré pour cette quête, ou {@code null} si personne ne l'a encore remportée. */
    @Nullable
    public Winner winner(String questId) {
        return winners.get(questId);
    }

    /**
     * Tente d'enregistrer {@code name} comme gagnant de {@code questId}. Renvoie {@code false}
     * si la quête a DÉJÀ un gagnant (premier arrivé, premier servi). Atomique (thread serveur).
     */
    public boolean tryClaim(String questId, String name, String uuid, long ts) {
        if (questId == null || questId.isBlank() || name == null || name.isBlank()) {
            return false;
        }
        if (winners.containsKey(questId)) {
            return false;
        }
        winners.put(questId, new Winner(name, uuid, ts));
        setDirty();
        return true;
    }

    /** Injecte un gagnant venu de Firebase seulement s'il n'existe pas déjà localement. */
    public void mergeIfAbsent(String questId, String name, String uuid, long ts) {
        if (questId == null || questId.isBlank() || name == null || name.isBlank()) {
            return;
        }
        if (winners.putIfAbsent(questId, new Winner(name, uuid, ts)) == null) {
            setDirty();
        }
    }

    @Override
    public CompoundTag save(CompoundTag tag, HolderLookup.Provider registries) {
        CompoundTag map = new CompoundTag();
        for (Map.Entry<String, Winner> e : winners.entrySet()) {
            CompoundTag w = new CompoundTag();
            w.putString("name", e.getValue().name());
            w.putString("uuid", e.getValue().uuid());
            w.putLong("ts", e.getValue().ts());
            map.put(e.getKey(), w);
        }
        tag.put("winners", map);
        return tag;
    }

    /** Recharge l'instance depuis le NBT persisté. */
    public static QuestWinnersData load(CompoundTag tag, HolderLookup.Provider registries) {
        QuestWinnersData data = new QuestWinnersData();
        CompoundTag map = tag.getCompound("winners");
        for (String questId : map.getAllKeys()) {
            CompoundTag w = map.getCompound(questId);
            data.winners.put(questId, new Winner(w.getString("name"), w.getString("uuid"), w.getLong("ts")));
        }
        return data;
    }
}
