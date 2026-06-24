package com.rawstudio.zigshop;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;

/**
 * Accès REST à la Realtime Database Firebase du launcher Zig City 2.
 *
 * <p>La LECTURE du shop est publique (aucun secret nécessaire) — c'est ce dont la
 * phase 1 a besoin. L'ÉCRITURE (création d'offres in-game) viendra plus tard et
 * utilisera un secret lu UNIQUEMENT côté serveur (fichier hors du jar) : le secret
 * ne doit jamais être embarqué dans le mod distribué aux joueurs.
 *
 * <p>Toutes les requêtes sont asynchrones (HttpClient) : ne jamais bloquer le thread
 * serveur. L'appelant doit reposter le résultat sur le thread serveur ({@code server.execute}).
 */
public final class FirebaseClient {
    private FirebaseClient() {}

    /** Base de la Realtime Database (cf. launcher : FIREBASE_DATABASE_URL). */
    public static final String BASE = "https://zig-base-default-rtdb.europe-west1.firebasedatabase.app";

    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    /** Offres du jour {@code date} (YYYY-MM-DD). Liste vide si aucune donnée. */
    public static CompletableFuture<List<ShopOffer>> fetchDayOffers(String date) {
        return getJson("/shop/days/" + date).thenApply(FirebaseClient::parseOffers);
    }

    /** GET public sur un chemin de la base (sans auth). Le corps brut est renvoyé. */
    private static CompletableFuture<String> getJson(String path) {
        HttpRequest req = HttpRequest.newBuilder(URI.create(BASE + path + ".json"))
                .timeout(Duration.ofSeconds(15))
                .header("Accept", "application/json")
                .GET()
                .build();
        return HTTP.sendAsync(req, HttpResponse.BodyHandlers.ofString())
                .thenApply(resp -> {
                    if (resp.statusCode() / 100 != 2) {
                        throw new RuntimeException("HTTP " + resp.statusCode());
                    }
                    return resp.body();
                });
    }

    /** Parse un map Firebase {pushId: {input, inputQty, output, outputQty}} en offres. */
    private static List<ShopOffer> parseOffers(String body) {
        List<ShopOffer> out = new ArrayList<>();
        if (body == null || body.isBlank()) return out;
        JsonElement root = JsonParser.parseString(body);
        if (root == null || !root.isJsonObject()) return out; // "null" => aucune offre
        for (Map.Entry<String, JsonElement> e : root.getAsJsonObject().entrySet()) {
            if (!e.getValue().isJsonObject()) continue;
            JsonObject o = e.getValue().getAsJsonObject();
            out.add(new ShopOffer(
                    e.getKey(),
                    str(o, "input"),
                    intVal(o, "inputQty"),
                    str(o, "output"),
                    intVal(o, "outputQty")
            ));
        }
        return out;
    }

    private static String str(JsonObject o, String key) {
        return o.has(key) && !o.get(key).isJsonNull() ? o.get(key).getAsString() : "";
    }

    private static int intVal(JsonObject o, String key) {
        try {
            return o.has(key) && !o.get(key).isJsonNull() ? Math.max(1, o.get(key).getAsInt()) : 1;
        } catch (RuntimeException ex) {
            return 1;
        }
    }
}
