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

    // Tabac (thedirtystuff) : addiction PLUS DOUCE que le joint, cf. AddictionManager#onSmoke
    // pour la règle de dominance (un joueur n'est jamais suivi sur les deux à la fois).
    private static String tobaccoItemIds = "thedirtystuff:cigar,thedirtystuff:cigarette";
    private static int tobaccoCravingMinutes = 120; // 2 h, contre 1 h pour le joint
    private static int tobaccoPoisonDelayMinutes = 15;
    private static int tobaccoEscalationStepMinutes = 15;
    private static int tobaccoDeathMinutes = 150;

    /** Systeme actif ? */
    public static synchronized boolean enabled()              { ensureLoaded(); return enabled; }
    /** Identifiant de l'item dont la consommation déclenche et calme l'addiction au joint. */
    public static synchronized String  jointItemId()          { ensureLoaded(); return jointItemId; }
    /** Identifiants (séparés par des virgules) des items tabac déclenchant/calmant l'addiction. */
    public static synchronized String  tobaccoItemIds()       { ensureLoaded(); return tobaccoItemIds; }
    /** Temps de jeu après la dernière taffe avant le message de manque. */
    public static synchronized int     cravingMinutes(AddictionData.Substance sub) {
        ensureLoaded();
        return sub == AddictionData.Substance.TOBACCO ? tobaccoCravingMinutes : cravingMinutes;
    }
    /** Délai après le message de manque avant le tout premier poison. */
    public static synchronized int     poisonDelayMinutes(AddictionData.Substance sub) {
        ensureLoaded();
        return sub == AddictionData.Substance.TOBACCO ? tobaccoPoisonDelayMinutes : poisonDelayMinutes;
    }
    /** Intervalle entre deux aggravations du manque (escalade). */
    public static synchronized int     escalationStepMinutes(AddictionData.Substance sub) {
        ensureLoaded();
        return sub == AddictionData.Substance.TOBACCO ? tobaccoEscalationStepMinutes : escalationStepMinutes;
    }
    /** Temps de jeu total (depuis la dernière taffe) avant la mort par manque. 0 = jamais létal. */
    public static synchronized int     deathMinutes(AddictionData.Substance sub) {
        ensureLoaded();
        return sub == AddictionData.Substance.TOBACCO ? tobaccoDeathMinutes : deathMinutes;
    }

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

                String tIds = p.getProperty("tobacco_item_ids", "").trim();
                if (!tIds.isEmpty()) {
                    tobaccoItemIds = tIds;
                }
                tobaccoCravingMinutes        = parseInt(p.getProperty("tobacco_craving_minutes"), tobaccoCravingMinutes, 0);
                tobaccoPoisonDelayMinutes    = parseInt(p.getProperty("tobacco_poison_delay_minutes"), tobaccoPoisonDelayMinutes, 0);
                tobaccoEscalationStepMinutes = parseInt(p.getProperty("tobacco_escalation_step_minutes"), tobaccoEscalationStepMinutes, 1);
                tobaccoDeathMinutes          = parseInt(p.getProperty("tobacco_death_minutes"), tobaccoDeathMinutes, 0);
            } else {
                writeDefault(file);
            }
        } catch (Exception e) {
            ZigAddiction.LOGGER.warn("[ZigAddiction] Lecture de config/{} impossible : {}", FILE, e.toString());
        }
        ZigAddiction.LOGGER.info("[ZigAddiction] Config : enabled={} joint={} craving={}min poisonDelay={}min step={}min death={}min | tabac={} craving={}min poisonDelay={}min step={}min death={}min",
                enabled, jointItemId, cravingMinutes, poisonDelayMinutes, escalationStepMinutes, deathMinutes,
                tobaccoItemIds, tobaccoCravingMinutes, tobaccoPoisonDelayMinutes, tobaccoEscalationStepMinutes, tobaccoDeathMinutes);
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

                # --- Tabac (mod thedirtystuff : cigare/cigarette) ---
                # Addiction PLUS DOUCE que le joint. Si le joueur est deja accro au joint, celui-ci
                # reste seul pris en compte (le joint est plus agressif) : jamais 2 addictions a la fois.

                # Identifiants des items dont la consommation declenche/calme l'addiction au tabac.
                tobacco_item_ids=thedirtystuff:cigar,thedirtystuff:cigarette

                # Temps de jeu apres la derniere cigarette/cigare avant le message de manque.
                # 120 min (2h) par defaut, contre 60 min (1h) pour le joint : addiction plus lente.
                tobacco_craving_minutes=120

                # Delai apres le message de manque avant le tout premier poison.
                tobacco_poison_delay_minutes=15

                # Intervalle entre deux aggravations du manque (escalade du poison).
                tobacco_escalation_step_minutes=15

                # Temps de jeu total avant la mort par overdose de manque. 0 = jamais letal.
                tobacco_death_minutes=150
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
