package com.rawstudio.zigmenu.client;

import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.regex.Pattern;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.blaze3d.platform.NativeImage;

import com.rawstudio.zigmenu.ZigMenu;

import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.resources.ResourceLocation;

/**
 * Carrousel de tetes du menu : liste live des joueurs vus, tiree de Firebase
 * {@code /playersSeen} (lecture publique, sans secret), comme le launcher.
 *
 * <p><b>Tetes toujours a jour</b> : on resout le skin de chaque joueur directement via
 * l'API publique Mojang (pseudo -> UUID -> URL de texture, <i>content-addressed</i> donc
 * fraiche), exactement comme le launcher. minotar/mc-heads cachaient une tete perimee cote
 * serveur (un changement de skin restait invisible). Le skin telecharge est enregistre en
 * {@link DynamicTexture} ; {@code ZigCityMenuScreen} en compose la tete (face + chapeau)
 * via {@code PlayerFaceRenderer}.
 *
 * <p>Cache (UUID a vie, skin avec TTL) + rechargement throttle pour ne pas spammer Mojang.
 * Entierement defensif : tout echec reseau laisse les tetes precedentes, jamais d'exception.
 */
public final class PlayerHeads {

    private static final String FIREBASE =
            "https://zig-base-default-rtdb.europe-west1.firebasedatabase.app";
    private static final int MAX_PLAYERS = 24;
    private static final Pattern VALID_NAME = Pattern.compile("^[A-Za-z0-9_]{1,16}$");
    private static final long RELOAD_THROTTLE_MS = 30_000L;   // intervalle min. entre 2 rechargements
    private static final long SKIN_TTL_MS = 5 * 60_000L;      // re-verifie le skin d'un joueur ttes 5 min

    private static final AtomicBoolean loading = new AtomicBoolean(false);
    private static volatile long lastLoadMs = 0L;
    private static volatile List<ResourceLocation> heads = List.of();   // skins (1 par joueur)

    private static final Map<String, String> uuidCache = new ConcurrentHashMap<>();   // nameLower -> uuid
    private static final Map<String, Entry> entryCache = new ConcurrentHashMap<>();    // nameLower -> skin connu

    /** Skin connu d'un joueur : URL Mojang courante, texture enregistree, date de derniere verif. */
    private record Entry(String skinUrl, ResourceLocation tex, long checkedAt) {}
    /** Element resolu a poser sur le carrousel : soit on reutilise une texture, soit on en enregistre une. */
    private record Item(String name, String skinUrl, long checkedAt, ResourceLocation reuseTex, NativeImage newSkin) {}

    private PlayerHeads() {}

    /** Skins a afficher (instantane immuable, lu par le thread de rendu). */
    public static List<ResourceLocation> getHeads() {
        return heads;
    }

    /** (Re)charge si le dernier chargement date de plus de {@link #RELOAD_THROTTLE_MS}. */
    public static void refresh() {
        long now = System.currentTimeMillis();
        if (now - lastLoadMs < RELOAD_THROTTLE_MS) {
            return;
        }
        if (!loading.compareAndSet(false, true)) {
            return;
        }
        lastLoadMs = now;
        Thread t = new Thread(PlayerHeads::load, "zigmenu-heads");
        t.setDaemon(true);
        t.start();
    }

    private static void load() {
        try {
            HttpClient http = HttpClient.newBuilder()
                    .connectTimeout(Duration.ofSeconds(8))
                    .build();
            long now = System.currentTimeMillis();
            List<Item> items = new ArrayList<>();

            for (String name : fetchPlayerNames(http)) {
                try {
                    String key = name.toLowerCase(Locale.ROOT);
                    Entry e = entryCache.get(key);
                    if (e != null && e.tex() != null && now - e.checkedAt() < SKIN_TTL_MS) {
                        items.add(new Item(name, e.skinUrl(), e.checkedAt(), e.tex(), null));   // frais -> reutilise
                        continue;
                    }
                    String uuid = uuidCache.computeIfAbsent(key, k -> fetchUuid(http, name));
                    if (uuid == null) {                                  // pseudo inconnu / rate-limit
                        if (e != null && e.tex() != null) items.add(new Item(name, e.skinUrl(), e.checkedAt(), e.tex(), null));
                        continue;
                    }
                    String skinUrl = fetchSkinUrl(http, uuid);
                    if (skinUrl == null) {
                        if (e != null && e.tex() != null) items.add(new Item(name, e.skinUrl(), e.checkedAt(), e.tex(), null));
                        continue;
                    }
                    if (e != null && e.tex() != null && skinUrl.equals(e.skinUrl())) {
                        items.add(new Item(name, skinUrl, now, e.tex(), null));   // skin inchange -> reutilise
                        continue;
                    }
                    byte[] png = httpBytes(http, skinUrl);               // skin nouveau / change -> telecharge
                    if (png == null || png.length < 16) {
                        if (e != null && e.tex() != null) items.add(new Item(name, e.skinUrl(), e.checkedAt(), e.tex(), null));
                        continue;
                    }
                    items.add(new Item(name, skinUrl, now, null, NativeImage.read(new ByteArrayInputStream(png))));
                } catch (Exception ignore) {
                    // joueur individuel rate -> on continue
                }
            }
            Minecraft.getInstance().execute(() -> registerAndSwap(items));
        } catch (Throwable t) {
            ZigMenu.LOGGER.warn("[ZigMenu] Carrousel indisponible : {}", t.toString());
        } finally {
            loading.set(false);
        }
    }

    /** Doit s'executer sur le thread de rendu : enregistre les nouveaux skins, echange la liste. */
    private static void registerAndSwap(List<Item> items) {
        List<ResourceLocation> next = new ArrayList<>(items.size());
        var tm = Minecraft.getInstance().getTextureManager();
        for (Item it : items) {
            String key = it.name().toLowerCase(Locale.ROOT);
            if (it.reuseTex() != null) {
                next.add(it.reuseTex());
                entryCache.put(key, new Entry(it.skinUrl(), it.reuseTex(), it.checkedAt()));
                continue;
            }
            try {
                DynamicTexture tex = new DynamicTexture(it.newSkin());
                ResourceLocation id = ResourceLocation.fromNamespaceAndPath("zigmenu", "skins/" + key);
                tm.register(id, tex);   // remplace la texture existante au meme id (ferme l'ancienne)
                next.add(id);
                entryCache.put(key, new Entry(it.skinUrl(), id, it.checkedAt()));
            } catch (Exception e) {
                it.newSkin().close();
            }
        }
        if (!next.isEmpty()) {
            heads = List.copyOf(next);   // echange atomique (rate reseau -> on garde l'ancien)
        }
    }

    // pseudo -> UUID (non tirete). Cache a vie (l'UUID ne change pas).
    private static String fetchUuid(HttpClient http, String name) {
        try {
            String body = httpString(http, "https://api.mojang.com/users/profiles/minecraft/" + name);
            if (body == null || body.isEmpty()) return null;            // 204 = pseudo inconnu
            JsonObject obj = JsonParser.parseString(body).getAsJsonObject();
            return obj.has("id") ? obj.get("id").getAsString() : null;
        } catch (Exception e) {
            return null;
        }
    }

    // UUID -> URL du skin courant (texture content-addressed, change a chaque nouveau skin).
    private static String fetchSkinUrl(HttpClient http, String uuid) {
        try {
            String body = httpString(http, "https://sessionserver.mojang.com/session/minecraft/profile/" + uuid);
            if (body == null || body.isEmpty()) return null;
            JsonObject obj = JsonParser.parseString(body).getAsJsonObject();
            JsonArray props = obj.getAsJsonArray("properties");
            if (props == null) return null;
            for (var el : props) {
                JsonObject p = el.getAsJsonObject();
                if (!"textures".equals(p.get("name").getAsString())) continue;
                String json = new String(Base64.getDecoder().decode(p.get("value").getAsString()), StandardCharsets.UTF_8);
                JsonObject skin = JsonParser.parseString(json).getAsJsonObject()
                        .getAsJsonObject("textures").getAsJsonObject("SKIN");
                if (skin == null) return null;
                String url = skin.get("url").getAsString();
                return url == null ? null : url.replaceFirst("^http://", "https://");   // force https
            }
            return null;
        } catch (Exception e) {
            return null;
        }
    }

    private static List<String> fetchPlayerNames(HttpClient http) {
        List<String> result = new ArrayList<>();
        try {
            // Identite Minecraft INSENSIBLE a la casse : on masque et deduplique en minuscules.
            Set<String> hidden = jsonKeys(http, FIREBASE + "/playersHidden.json");
            Set<String> hiddenLower = new HashSet<>();
            for (String h : hidden) hiddenLower.add(h.toLowerCase(Locale.ROOT));
            List<String> seen = new ArrayList<>(jsonKeys(http, FIREBASE + "/playersSeen.json"));
            seen.sort(String.CASE_INSENSITIVE_ORDER);
            Set<String> usedLower = new HashSet<>();
            for (String n : seen) {
                String key = n.toLowerCase(Locale.ROOT);
                if (hiddenLower.contains(key)) continue;
                if (!usedLower.add(key)) continue;
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
                .header("User-Agent", "ZigMenu")
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
                .header("User-Agent", "ZigMenu")
                .GET().build();
        HttpResponse<byte[]> resp = http.send(req, HttpResponse.BodyHandlers.ofByteArray());
        if (resp.statusCode() / 100 != 2) {
            return null;
        }
        return resp.body();
    }
}
