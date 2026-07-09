package com.rawstudio.zigaddiction;

import net.neoforged.fml.loading.FMLPaths;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;

/**
 * Configuration du mod, lue depuis {@code config/zigaddiction-server.properties}
 * (hors du jar). Permet d'ajuster les durées SANS recompiler — pratique pour équilibrer
 * après test (ou pour raccourcir les durées le temps d'un test).
 *
 * <p>Fichier absent au premier démarrage ⇒ il est créé avec les valeurs par défaut
 * ci-dessous, prêt à être édité par l'opérateur. Les durées sont exprimées en minutes de
 * TEMPS DE JEU CONNECTÉ (le compteur n'avance que quand le joueur est en ligne).
 */
public final class AddictionConfig {
    private AddictionConfig() {}

    private static final String FILE = "zigaddiction-server.properties";

    private static boolean loaded = false;
    private static boolean enabled = true;
    private static String jointItemId = "nirvana:joint";
    private static int cravingMinutes = 60;
    private static int poisonDelayMinutes = 15;
    private static int escalationStepMinutes = 15;
    private static int deathMinutes = 150; // 2 h 30 ; 0 = jamais létal

    /** Systeme actif ? */
    public static synchronized boolean enabled()              { ensureLoaded(); return enabled; }
    /** Identifiant de l'item dont la consommation déclenche et calme l'addiction. */
    public static synchronized String  jointItemId()          { ensureLoaded(); return jointItemId; }
    /** Temps de jeu après la dernière taffe avant le message de manque. */
    public static synchronized int     cravingMinutes()       { ensureLoaded(); return cravingMinutes; }
    /** Délai après le message de manque avant le tout premier poison. */
    public static synchronized int     poisonDelayMinutes()   { ensureLoaded(); return poisonDelayMinutes; }
    /** Intervalle entre deux aggravations du manque (escalade). */
    public static synchronized int     escalationStepMinutes(){ ensureLoaded(); return escalationStepMinutes; }
    /** Temps de jeu total (depuis la dernière taffe) avant la mort par manque. 0 = jamais létal. */
    public static synchronized int     deathMinutes()         { ensureLoaded(); return deathMinutes; }

    /** Force le chargement (et la création du fichier). À appeler au démarrage serveur. */
    public static synchronized void preload() { ensureLoaded(); }

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
                enabled               = parseBool(p.getProperty("enabled"), enabled);
                String id             = p.getProperty("joint_item_id", "").trim();
                if (!id.isEmpty()) {
                    jointItemId = id;
                }
                cravingMinutes        = parseInt(p.getProperty("craving_minutes"), cravingMinutes, 0);
                poisonDelayMinutes    = parseInt(p.getProperty("poison_delay_minutes"), poisonDelayMinutes, 0);
                escalationStepMinutes = parseInt(p.getProperty("escalation_step_minutes"), escalationStepMinutes, 1);
                deathMinutes          = parseInt(p.getProperty("death_minutes"), deathMinutes, 0);
            } else {
                writeDefault(file);
            }
        } catch (Exception e) {
            ZigAddiction.LOGGER.warn("[ZigAddiction] Lecture de config/{} impossible : {}", FILE, e.toString());
        }
        ZigAddiction.LOGGER.info("[ZigAddiction] Config : enabled={} joint={} craving={}min poisonDelay={}min step={}min death={}min",
                enabled, jointItemId, cravingMinutes, poisonDelayMinutes, escalationStepMinutes, deathMinutes);
    }

    private static void writeDefault(Path file) {
        String content = """
                # Système d'addiction Zig City (mod zigaddiction).
                # Toutes les durées sont en minutes de TEMPS DE JEU CONNECTÉ : le compteur
                # n'avance que pendant que le joueur est en ligne (une absence ne compte pas).

                # Active/désactive complètement le système.
                enabled=true

                # Identifiant de l'item à fumer qui déclenche ET calme l'addiction.
                joint_item_id=nirvana:joint

                # Temps de jeu après la dernière taffe avant le message de manque.
                craving_minutes=60

                # Délai après le message de manque avant le tout premier poison.
                poison_delay_minutes=15

                # Intervalle entre deux aggravations du manque (escalade du poison).
                escalation_step_minutes=15

                # Temps de jeu total (depuis la derniere taffe) avant la mort par overdose de manque.
                # Avant ce seuil, le manque ne tue jamais. 0 = jamais letal.
                death_minutes=150
                """;
        try {
            Files.writeString(file, content);
            ZigAddiction.LOGGER.info("[ZigAddiction] Fichier de config créé : config/{}", FILE);
        } catch (Exception e) {
            ZigAddiction.LOGGER.warn("[ZigAddiction] Création de config/{} impossible : {}", FILE, e.toString());
        }
    }

    private static boolean parseBool(String s, boolean def) {
        if (s == null) {
            return def;
        }
        s = s.trim();
        if (s.equalsIgnoreCase("true"))  return true;
        if (s.equalsIgnoreCase("false")) return false;
        return def;
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
