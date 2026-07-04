package com.rawstudio.zigshop;

import net.neoforged.fml.loading.FMLPaths;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Properties;

/**
 * Configuration SERVEUR du mod, lue depuis un fichier hors du jar :
 * {@code config/zigshop-server.properties}. Contient la clé d'écriture Firebase
 * (Realtime Database).
 *
 * <p>🔴 Le secret n'est JAMAIS embarqué dans le jar distribué aux joueurs : seul le
 * serveur possède ce fichier, donc seul le serveur peut écrire. Les clients (jar des
 * joueurs) n'ont pas le fichier ⇒ ne publient rien.
 *
 * <p>Format attendu :
 * <pre>
 * firebase_secret=VOTRE_CLE
 * max_active_quests=4
 * </pre>
 * Fichier absent ou clé vide ⇒ publication désactivée (le jeu fonctionne normalement) et
 * limite de quêtes par défaut.
 */
public final class ServerConfig {
    private ServerConfig() {}

    /** Limite par défaut de quêtes ACCEPTÉES simultanément par joueur (si clé absente/invalide). */
    private static final int DEFAULT_MAX_ACTIVE_QUESTS = 4;

    private static boolean loaded = false;
    private static String firebaseSecret = null;
    private static int maxActiveQuests = DEFAULT_MAX_ACTIVE_QUESTS;

    /** Clé d'écriture Firebase, ou {@code null} si non configurée (publication désactivée). */
    public static synchronized String firebaseSecret() {
        ensureLoaded();
        return firebaseSecret;
    }

    /**
     * Nombre maximum de quêtes qu'un joueur peut avoir ACCEPTÉES (en cours) en même temps,
     * tous PNJ confondus. Clé {@code max_active_quests} du fichier de config (défaut
     * {@value #DEFAULT_MAX_ACTIVE_QUESTS}, minimum 1). Empêche un joueur d'activer toutes
     * les quêtes d'un coup.
     */
    public static synchronized int maxActiveQuests() {
        ensureLoaded();
        return maxActiveQuests;
    }

    /** Charge le fichier de config une seule fois (appelé sous le verrou des getters). */
    private static void ensureLoaded() {
        if (loaded) {
            return;
        }
        loaded = true;
        try {
            Path file = FMLPaths.CONFIGDIR.get().resolve("zigshop-server.properties");
            if (Files.exists(file)) {
                Properties props = new Properties();
                try (var in = Files.newInputStream(file)) {
                    props.load(in);
                }
                String s = props.getProperty("firebase_secret", "").trim();
                if (!s.isEmpty()) {
                    firebaseSecret = s;
                }
                String m = props.getProperty("max_active_quests", "").trim();
                if (!m.isEmpty()) {
                    try {
                        maxActiveQuests = Math.max(1, Integer.parseInt(m));
                    } catch (NumberFormatException nfe) {
                        ZigShop.LOGGER.warn("[ZigShop] max_active_quests invalide (\"{}\") : valeur {} conservee.", m, maxActiveQuests);
                    }
                }
            }
        } catch (Exception e) {
            ZigShop.LOGGER.warn("[ZigShop] Lecture de config/zigshop-server.properties impossible : {}", e.toString());
        }
        if (firebaseSecret == null) {
            ZigShop.LOGGER.info("[ZigShop] Pas de cle Firebase (config/zigshop-server.properties) : compteurs non publies (le jeu fonctionne normalement).");
        } else {
            ZigShop.LOGGER.info("[ZigShop] Cle Firebase chargee : publication des compteurs d'echanges activee.");
        }
        ZigShop.LOGGER.info("[ZigShop] Limite de quetes en cours par joueur : {}.", maxActiveQuests);
    }
}
