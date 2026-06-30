package com.rawstudio.zigmenu.client;

import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Pattern;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.blaze3d.platform.NativeImage;

import com.rawstudio.zigmenu.ZigMenu;

import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.resources.ResourceLocation;

/**
 * Carrousel de tetes du menu : liste live des joueurs vus, tiree de Firebase
 * {@code /playersSeen} (lecture publique, sans secret), comme le launcher. Les tetes
 * sont telechargees depuis {@code minotar.net/helm} et enregistrees en
 * {@link DynamicTexture}.
 *
 * <p>Le chargement est <b>rechargeable</b> (pas une seule fois par session) : on
 * rafraichit a l'ouverture du menu et periodiquement tant qu'il est affiche, avec un
 * cache-buster sur l'URL, pour que les changements de skin (et la liste des joueurs)
 * se refletent sans relancer le jeu.
 *
 * <p>Entierement defensif : tout echec reseau laisse simplement le carrousel inchange,
 * jamais d'exception cote rendu.
 */
public final class PlayerHeads {

    private static final String FIREBASE =
            "https://zig-base-default-rtdb.europe-west1.firebasedatabase.app";
    private static final int MAX_PLAYERS = 24;
    private static final Pattern VALID_NAME = Pattern.compile("^[A-Za-z0-9_]{1,16}$");
    // Intervalle minimal entre deux rechargements (le menu appelle refresh() en boucle).
    private static final long RELOAD_THROTTLE_MS = 30_000L;

    private static final AtomicBoolean loading = new AtomicBoolean(false);
    private static volatile long lastLoadMs = 0L;
    // Reference echangee d'un coup (jamais de liste partielle vue par le rendu).
    private static volatile List<ResourceLocation> heads = List.of();

    private PlayerHeads() {}

    /** Tetes deja chargees (instantane immuable, lu par le thread de rendu). */
    public static List<ResourceLocation> getHeads() {
        return heads;
    }

    /**
     * (Re)charge les tetes en arriere-plan si le dernier chargement date de plus de
     * {@link #RELOAD_THROTTLE_MS}. Appelable a chaque frame/tick sans surcout (throttle).
     */
    public static void refresh() {
        long now = System.currentTimeMillis();
        if (now - lastLoadMs < RELOAD_THROTTLE_MS) {
            return;
        }
        if (!loading.compareAndSet(false, true)) {
            return;   // un chargement est deja en cours
        }
        lastLoadMs = now;
        Thread t = new Thread(() -> load(now), "zigmenu-heads");
        t.setDaemon(true);
        t.start();
    }

    private static void load(long stamp) {
        try {
            HttpClient http = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(8))
                    .build();

            // Cache-buster : force un re-telechargement frais (defait un eventuel cache
            // CDN de minotar) pour refleter le skin courant apres un changement.
            String bust = "?t=" + (stamp / 1000L);
            List<NameImage> loaded = new ArrayList<>();
            for (String name : fetchPlayerNames(http)) {
                try {
                    byte[] png = httpBytes(http, "https://minotar.net/helm/" + name + "/64.png" + bust);
                    if (png == null || png.length < 16) {
                        continue;
                    }
                    loaded.add(new NameImage(name, NativeImage.read(new ByteArrayInputStream(png))));
                } catch (Exception ignore) {
                    // tete individuelle ratee -> on continue
                }
            }
            Minecraft.getInstance().execute(() -> registerAll(loaded));
        } catch (Throwable t) {
            ZigMenu.LOGGER.warn("[ZigMenu] Carrousel indisponible : {}", t.toString());
        } finally {
            loading.set(false);
        }
    }

    /** Doit s'executer sur le thread de rendu (via Minecraft.execute). */
    private static void registerAll(List<NameImage> loaded) {
        List<ResourceLocation> next = new ArrayList<>(loaded.size());
        var tm = Minecraft.getInstance().getTextureManager();
        for (NameImage ni : loaded) {
            try {
                DynamicTexture tex = new DynamicTexture(ni.img());
                ResourceLocation id = ResourceLocation.fromNamespaceAndPath(
                        "zigmenu", "heads/" + ni.name().toLowerCase(Locale.ROOT));
                tm.register(id, tex);   // remplace la texture existante au meme id (ferme l'ancienne)
                next.add(id);
            } catch (Exception e) {
                ni.img().close();
            }
        }
        if (next.isEmpty()) {
            return;   // rechargement rate (reseau) -> on garde les tetes precedentes
        }
        heads = List.copyOf(next);   // echange atomique
    }

    private static List<String> fetchPlayerNames(HttpClient http) {
        List<String> result = new ArrayList<>();
        try {
            // Identite Minecraft INSENSIBLE a la casse : on masque et deduplique en
            // minuscules. Sinon un masquage « LYenBrrr » ne bloque pas « Lyenbrrr », et
            // « WoxDfor » + « Woxdfor » s'affichent comme deux tetes distinctes.
            Set<String> hidden = jsonKeys(http, FIREBASE + "/playersHidden.json");
            Set<String> hiddenLower = new HashSet<>();
            for (String h : hidden) hiddenLower.add(h.toLowerCase(Locale.ROOT));
            List<String> seen = new ArrayList<>(jsonKeys(http, FIREBASE + "/playersSeen.json"));
            seen.sort(String.CASE_INSENSITIVE_ORDER);
            Set<String> usedLower = new HashSet<>();
            for (String n : seen) {
                String key = n.toLowerCase(Locale.ROOT);
                if (hiddenLower.contains(key)) continue;   // masque (insensible a la casse)
                if (!usedLower.add(key)) continue;         // doublon de casse -> ignore
                if (VALID_NAME.matcher(n).matches()) {
                    result.add(n);
                    if (result.size() >= MAX_PLAYERS) {
                        break;
                    }
                }
            }
        } catch (Exception e) {
            ZigMenu.LOGGER.warn("[ZigMenu] Liste joueurs indisponible : {}", e.toString());
        }
        return result;
    }

    private static Set<String> jsonKeys(HttpClient http, String url) {
        LinkedHashSet<String> out = new LinkedHashSet<>();
        try {
            String body = httpString(http, url);
            if (body == null || body.isEmpty() || body.equals("null")) {
                return out;
            }
            JsonObject obj = JsonParser.parseString(body).getAsJsonObject();
            out.addAll(obj.keySet());
        } catch (Exception ignore) {
            // payload invalide -> aucune cle
        }
        return out;
    }

    private static String httpString(HttpClient http, String url) throws Exception {
        HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(8))
                .header("Accept", "application/json")
                .GET().build();
        HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (resp.statusCode() / 100 != 2) {
            return null;
        }
        return resp.body();
    }

    private static byte[] httpBytes(HttpClient http, String url) throws Exception {
        HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(8))
                .GET().build();
        HttpResponse<byte[]> resp = http.send(req, HttpResponse.BodyHandlers.ofByteArray());
        if (resp.statusCode() / 100 != 2) {
            return null;
        }
        return resp.body();
    }

    /** Couple (pseudo, image) telecharge sur le thread de fond, enregistre sur le thread de rendu. */
    private record NameImage(String name, NativeImage img) {}
}
