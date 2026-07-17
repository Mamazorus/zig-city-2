package net.bogismok.thedirtystuff;

import net.minecraft.core.Holder;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.item.Item;
import net.neoforged.fml.loading.FMLPaths;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.Properties;
import java.util.Set;

/**
 * Configuration du mod, lue depuis {@code config/thedirtystuff-server.properties}
 * (hors du jar) — meme modele que zigaddiction, plutot que le ForgeConfigSpec d'origine
 * (evite de dependre d'une API qui a change de nom entre Forge et NeoForge).
 */
public final class Config {
    private Config() {}

    private static final String FILE = "thedirtystuff-server.properties";

    private static boolean loaded = false;

    private static String cigaretteEffectId = "minecraft:speed";
    private static int cigaretteEffectLevel = 1;
    private static int cigaretteEffectDuration = 100;

    private static String cigarEffectId = "minecraft:strength";
    private static int cigarEffectLevel = 1;
    private static int cigarEffectDuration = 100;

    private static String ignitersRaw = "minecraft:flint_and_steel,minecraft:fire_charge";

    public static synchronized Holder<MobEffect> cigaretteEffect()         { ensureLoaded(); return resolveEffect(cigaretteEffectId); }
    public static synchronized int               cigaretteEffectLevel()    { ensureLoaded(); return cigaretteEffectLevel; }
    public static synchronized int               cigaretteEffectDuration() { ensureLoaded(); return cigaretteEffectDuration; }

    public static synchronized Holder<MobEffect> cigarEffect()         { ensureLoaded(); return resolveEffect(cigarEffectId); }
    public static synchronized int               cigarEffectLevel()    { ensureLoaded(); return cigarEffectLevel; }
    public static synchronized int               cigarEffectDuration() { ensureLoaded(); return cigarEffectDuration; }

    public static synchronized Set<Item> igniters() {
        ensureLoaded();
        Set<Item> set = new HashSet<>();
        for (String id : ignitersRaw.split(",")) {
            id = id.trim();
            if (id.isEmpty()) {
                continue;
            }
            BuiltInRegistries.ITEM.getOptional(ResourceLocation.parse(id)).ifPresent(set::add);
        }
        return set;
    }

    /** Force le chargement (et la creation du fichier). A appeler au demarrage serveur. */
    public static synchronized void preload() {
        ensureLoaded();
    }

    private static Holder<MobEffect> resolveEffect(String id) {
        return BuiltInRegistries.MOB_EFFECT.getHolder(ResourceLocation.parse(id)).orElse(null);
    }

    private static void ensureLoaded() {
        if (loaded) {
            return;
        }
        loaded = true;
        Path file = FMLPaths.CONFIGDIR.get().resolve(FILE);
        try {
            if (Files.exists(file)) {
                Properties p = new Properties();
                try (var in = Files.newInputStream(file)) {
                    p.load(in);
                }
                cigaretteEffectId       = p.getProperty("cigarette_effect", cigaretteEffectId).trim();
                cigaretteEffectLevel    = parseInt(p.getProperty("cigarette_effect_level"), cigaretteEffectLevel, 0);
                cigaretteEffectDuration = parseInt(p.getProperty("cigarette_effect_duration"), cigaretteEffectDuration, 0);
                cigarEffectId           = p.getProperty("cigar_effect", cigarEffectId).trim();
                cigarEffectLevel        = parseInt(p.getProperty("cigar_effect_level"), cigarEffectLevel, 0);
                cigarEffectDuration     = parseInt(p.getProperty("cigar_effect_duration"), cigarEffectDuration, 0);
                ignitersRaw             = p.getProperty("igniters", ignitersRaw).trim();
            } else {
                writeDefault(file);
            }
        } catch (Exception e) {
            TheDirtyStuff.LOGGER.warn("[TheDirtyStuff] Lecture de config/{} impossible : {}", FILE, e.toString());
        }
    }

    private static void writeDefault(Path file) {
        String content = """
                # Config du mod thedirtystuff (portage NeoForge de The Dirty Stuff).

                # Effet applique en finissant de fumer une cigarette / un cigare.
                cigarette_effect=minecraft:speed
                cigarette_effect_level=1
                cigarette_effect_duration=100

                cigar_effect=minecraft:strength
                cigar_effect_level=1
                cigar_effect_duration=100

                # Objets pouvant allumer une cigarette/un cigare tenu en main secondaire, separes par des virgules.
                igniters=minecraft:flint_and_steel,minecraft:fire_charge
                """;
        try {
            Files.writeString(file, content);
            TheDirtyStuff.LOGGER.info("[TheDirtyStuff] Fichier de config cree : config/{}", FILE);
        } catch (Exception e) {
            TheDirtyStuff.LOGGER.warn("[TheDirtyStuff] Creation de config/{} impossible : {}", FILE, e.toString());
        }
    }

    private static int parseInt(String s, int def, int min) {
        if (s == null || s.trim().isEmpty()) {
            return def;
        }
        try {
            return Math.max(min, Integer.parseInt(s.trim()));
        } catch (NumberFormatException e) {
            return def;
        }
    }
}
