package com.rawstudio.zigmenu.client;

import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArrayList;
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
 * <p>Entierement defensif : tout echec reseau laisse simplement le carrousel vide,
 * jamais d'exception cote rendu.
 */
public final class PlayerHeads {

    private static final String FIREBASE =
            "https://zig-base-default-rtdb.europe-west1.firebasedatabase.app";
    private static final int MAX_PLAYERS = 24;
    private static final Pattern VALID_NAME = Pattern.compile("^[A-Za-z0-9_]{1,16}$");

    private static final AtomicBoolean started = new AtomicBoolean(false);
    private static final List<ResourceLocation> heads = new CopyOnWriteArrayList<>();

    private PlayerHeads() {}

    /** Tetes deja chargees (thread-safe, lue par le thread de rendu). */
    public static List<ResourceLocation> getHeads() {
        return heads;
    }

    /** Lance le chargement en arriere-plan, une seule fois par session de jeu. */
    public static void ensureLoaded() {
        if (!started.compareAndSet(false, true)) {
            return;
        }
        Thread t = new Thread(PlayerHeads::load, "zigmenu-heads");
        t.setDaemon(true);
        t.start();
    }

    private static void load() {
        try {
            HttpClient http = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(8))
                    .build();

            for (String name : fetchPlayerNames(http)) {
                try {
                    byte[] png = httpBytes(http, "https://minotar.net/helm/" + name + "/64.png");
                    if (png == null || png.length < 16) {
                        continue;
                    }
                    NativeImage img = NativeImage.read(new ByteArrayInputStream(png));
                    Minecraft.getInstance().execute(() -> registerHead(name, img));
                } catch (Exception ignore) {
                    // tete individuelle ratee -> on continue
                }
            }
        } catch (Throwable t) {
            ZigMenu.LOGGER.warn("[ZigMenu] Carrousel indisponible : {}", t.toString());
        }
    }

    /** Doit s'executer sur le thread de rendu (via Minecraft.execute). */
    private static void registerHead(String name, NativeImage img) {
        try {
            DynamicTexture tex = new DynamicTexture(img);
            ResourceLocation id = ResourceLocation.fromNamespaceAndPath(
                    "zigmenu", "heads/" + name.toLowerCase(Locale.ROOT));
            Minecraft.getInstance().getTextureManager().register(id, tex);
            heads.add(id);
        } catch (Exception e) {
            img.close();
        }
    }

    private static List<String> fetchPlayerNames(HttpClient http) {
        List<String> result = new ArrayList<>();
        try {
            Set<String> hidden = jsonKeys(http, FIREBASE + "/playersHidden.json");
            List<String> seen = new ArrayList<>(jsonKeys(http, FIREBASE + "/playersSeen.json"));
            seen.removeAll(hidden);
            seen.sort(String.CASE_INSENSITIVE_ORDER);
            for (String n : seen) {
                if (VALID_NAME.matcher(n).matches()) {
                    result.add(n);
                }
                if (result.size() >= MAX_PLAYERS) {
                    break;
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
}
