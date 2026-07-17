package com.rawstudio.zigaddiction;

import net.minecraft.core.HolderLookup;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.ListTag;
import net.minecraft.nbt.Tag;
import net.minecraft.server.MinecraftServer;
import net.minecraft.world.level.saveddata.SavedData;

import javax.annotation.Nullable;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * État d'addiction de chaque joueur, persisté dans les données du monde (overworld)
 * sous {@code <world>/data/zigaddiction.dat}.
 *
 * <p>Indexé par UUID : l'état survit donc à la mort, à la déconnexion ET au redémarrage
 * du serveur — sans avoir à le recopier au respawn (contrairement à un état stocké sur
 * l'entité joueur, cf. {@code QuestState} du mod zigshop). Cette classe ne fait que
 * stocker/charger ; toute la logique de gameplay vit dans {@link AddictionManager}.
 *
 * <p>Le compteur {@link Entry#onlineTicks} mesure le TEMPS DE JEU CONNECTÉ écoulé depuis
 * la dernière taffe : il n'est incrémenté que pendant que le joueur est en ligne
 * (cf. {@link AddictionManager#onServerPlayerTick}), donc une absence ne « punit » jamais.
 */
public final class AddictionData extends SavedData {

    /** Nom du fichier {@code .dat} sous {@code <world>/data/}. */
    public static final String FILE_ID = "zigaddiction";

    /**
     * Substance responsable du cycle d'addiction en cours. Un joueur n'est JAMAIS suivi sur
     * les deux à la fois : le joint (plus agressif) domine toujours le tabac — cf.
     * {@link AddictionManager#onSmoke}.
     */
    public enum Substance { JOINT, TOBACCO }

    /** État mutable d'un joueur. Créé à la PREMIÈRE taffe (avant, le joueur n'est pas suivi). */
    public static final class Entry {
        /** Temps de JEU CONNECTÉ écoulé depuis la dernière taffe, en ticks (20/s). */
        public long onlineTicks = 0L;
        /** Le joueur a fumé au moins une fois : le cycle d'addiction tourne pour lui. */
        public boolean addicted = false;
        /** Le message de manque (palier 1) a déjà été envoyé pour le cycle en cours. */
        public boolean cravingSent = false;
        /** Palier de manque courant (0 = rien, 1 = malaise sans poison, ≥2 = poison croissant). */
        public int stage = 0;
        /** Substance à l'origine du cycle courant (joint par défaut : retrocompatibilité NBT). */
        public Substance substance = Substance.JOINT;
    }

    private final Map<UUID, Entry> players = new HashMap<>();

    public AddictionData() {}

    /** Instance persistée du monde (crée le fichier si absent). À appeler sur le thread serveur. */
    public static AddictionData get(MinecraftServer server) {
        return server.overworld().getDataStorage().computeIfAbsent(
                new SavedData.Factory<>(AddictionData::new, AddictionData::load),
                FILE_ID);
    }

    /** État du joueur, ou {@code null} s'il n'a jamais fumé (donc pas suivi). */
    @Nullable
    public Entry get(UUID id) {
        return players.get(id);
    }

    /** État du joueur, créé vide au besoin. */
    public Entry getOrCreate(UUID id) {
        return players.computeIfAbsent(id, k -> new Entry());
    }

    /** Oublie complètement un joueur (il n'est plus accro). */
    public void clear(UUID id) {
        if (players.remove(id) != null) {
            setDirty();
        }
    }

    @Override
    public CompoundTag save(CompoundTag tag, HolderLookup.Provider registries) {
        ListTag list = new ListTag();
        for (Map.Entry<UUID, Entry> e : players.entrySet()) {
            Entry st = e.getValue();
            if (!st.addicted) {
                continue; // on ne persiste que les joueurs réellement accros
            }
            CompoundTag c = new CompoundTag();
            c.putUUID("id", e.getKey());
            c.putLong("ticks", st.onlineTicks);
            c.putBoolean("addicted", st.addicted);
            c.putBoolean("craving", st.cravingSent);
            c.putInt("stage", st.stage);
            c.putString("substance", st.substance.name());
            list.add(c);
        }
        tag.put("players", list);
        return tag;
    }

    /** Recharge l'instance depuis le NBT persisté. */
    public static AddictionData load(CompoundTag tag, HolderLookup.Provider registries) {
        AddictionData data = new AddictionData();
        ListTag list = tag.getList("players", Tag.TAG_COMPOUND);
        for (int i = 0; i < list.size(); i++) {
            CompoundTag c = list.getCompound(i);
            Entry st = new Entry();
            st.onlineTicks = c.getLong("ticks");
            st.addicted = c.getBoolean("addicted");
            st.cravingSent = c.getBoolean("craving");
            st.stage = c.getInt("stage");
            try {
                st.substance = Substance.valueOf(c.getString("substance"));
            } catch (IllegalArgumentException ignored) {
                st.substance = Substance.JOINT; // sauvegarde pré-tabac : le joint reste le defaut
            }
            data.players.put(c.getUUID("id"), st);
        }
        return data;
    }
}
