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
 * <pre>firebase_secret=VOTRE_CLE</pre>
 * Fichier absent ou clé vide ⇒ publication désactivée (le jeu fonctionne normalement).
 */
public final class ServerConfig {
    private ServerConfig() {}

    private static boolean loaded = false;
    private static String firebaseSecret = null;

    /** Clé d'écriture Firebase, ou {@code null} si non configurée (publication désactivée). */
    public static synchronized String firebaseSecret() {
        if (!loaded) {
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
                }
            } catch (Exception e) {
                ZigShop.LOGGER.warn("[ZigShop] Lecture de config/zigshop-server.properties impossible : {}", e.toString());
            }
            if (firebaseSecret == null) {
                ZigShop.LOGGER.info("[ZigShop] Pas de cle Firebase (config/zigshop-server.properties) : compteurs non publies (le jeu fonctionne normalement).");
            } else {
                ZigShop.LOGGER.info("[ZigShop] Cle Firebase chargee : publication des compteurs d'echanges activee.");
            }
        }
        return firebaseSecret;
    }
}
