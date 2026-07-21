package com.rawstudio.zigshop;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
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

    /** Offres de la BOUTIQUE (fixes, /shop/store — on y dépense les coins). Liste vide si aucune donnée. */
    public static CompletableFuture<List<ShopOffer>> fetchStoreOffers() {
        return getJson("/shop/store").thenApply(FirebaseClient::parseOffers);
    }

    /** Offres « COURSE » (/shop/race — trades PARTAGÉS entre tous : maxUses = limite globale). */
    public static CompletableFuture<List<ShopOffer>> fetchRaceOffers() {
        return getJson("/shop/race").thenApply(FirebaseClient::parseOffers);
    }

    /** Définitions des quêtes (/quests). Liste vide si aucune donnée. */
    public static CompletableFuture<List<QuestDef>> fetchQuests() {
        return getJson("/quests").thenApply(FirebaseClient::parseQuests);
    }

    /** Gagnants des quêtes « unique » (/questWinners). Map vide si aucune donnée. */
    public static CompletableFuture<Map<String, QuestWinnersData.Winner>> fetchQuestWinners() {
        return getJson("/questWinners").thenApply(FirebaseClient::parseQuestWinners);
    }

    private static Map<String, QuestWinnersData.Winner> parseQuestWinners(String body) {
        Map<String, QuestWinnersData.Winner> out = new HashMap<>();
        if (body == null || body.isBlank()) return out;
        JsonElement root = JsonParser.parseString(body);
        if (root == null || !root.isJsonObject()) return out;
        for (Map.Entry<String, JsonElement> e : root.getAsJsonObject().entrySet()) {
            if (!e.getValue().isJsonObject()) continue;
            JsonObject o = e.getValue().getAsJsonObject();
            String player = str(o, "player");
            if (player.isBlank()) continue;
            long ts = 0L;
            try {
                if (o.has("ts") && !o.get("ts").isJsonNull()) ts = o.get("ts").getAsLong();
            } catch (RuntimeException ignored) { /* ts = 0 */ }
            out.put(e.getKey(), new QuestWinnersData.Winner(player, str(o, "uuid"), ts));
        }
        return out;
    }

    /**
     * Config d'un PNJ configurable ({@code /npcs/{id}}) : {@code {name, role}} + skin
     * optionnel choisi depuis le launcher ({@code skinUrl} = image PNG 64×64 hébergée sur
     * Firebase Storage ; {@code skinSlim} = modèle fin type Alex). {@code skinUrl} vide = pas
     * de skin custom → le PNJ garde son skin par défaut (Steve ou preset embarqué).
     */
    public record NpcConfig(String role, String name, String skinUrl, boolean skinSlim) {}

    /** Lit la config d'un PNJ ({@code /npcs/{npcId}}). {@code null} si introuvable ou sans rôle. */
    public static CompletableFuture<NpcConfig> fetchNpc(String npcId) {
        return getJson("/npcs/" + npcId).thenApply(FirebaseClient::parseNpc);
    }

    private static NpcConfig parseNpc(String body) {
        if (body == null || body.isBlank()) return null;
        JsonElement root = JsonParser.parseString(body);
        if (root == null || !root.isJsonObject()) return null;
        JsonObject o = root.getAsJsonObject();
        String role = str(o, "role");
        if (role.isBlank()) return null;
        return new NpcConfig(role, str(o, "name"), str(o, "skinUrl"), "slim".equals(str(o, "skinVariant")));
    }

    /**
     * Réglages de la BANQUE ({@code /bank/config}), édités depuis le dashboard (onglet PNJ →
     * banquier) ou {@code economie/bank-config.json} + {@code push-economie.mjs}.
     *
     * <p>{@code savingsPeriodHours}/{@code riskyPeriodHours} : durée d'un CYCLE, INDÉPENDANTE
     * pour chaque compte (défaut 24 = comportement historique « par jour » pour les deux).
     * {@code savingsRatePct}/{@code savingsCap} : le compte ÉPARGNE rapporte {@code savingsRatePct}
     * % PAR CYCLE ÉPARGNE, calculé UNIQUEMENT sur {@code min(solde, savingsCap)} (le surplus ne
     * fructifie pas). Réduire un {@code *PeriodHours} SANS baisser le taux correspondant accélère
     * le rendement composé d'autant (le taux s'applique tel quel à chaque cycle, il n'est jamais
     * reproportionné automatiquement). {@code riskyMinPct}/{@code riskyMaxPct}/{@code riskyAvgPct} :
     * le compte RISQUÉ tire à chaque cycle RISQUÉ un pourcentage aléatoire dans
     * [{@code riskyMinPct}, {@code riskyMaxPct}], dont la MOYENNE est pilotée vers
     * {@code riskyAvgPct} (cf. {@code BankAccountData#rollRiskyPct} pour la formule).
     * {@code withdrawFeePct} : prélevé à CHAQUE retrait (les deux comptes), reversé à
     * {@code feeRecipient} (pseudo). Anti-abus (« dépôt juste avant / retrait juste après ») : un
     * dépôt ne fructifie/tire qu'à partir du PROCHAIN cycle DE CE SOUS-COMPTE (délai structurel —
     * cf. {@code BankAccountData} champs {@code *Pending}).
     */
    public record BankConfig(String currencyItem, double savingsPeriodHours, double riskyPeriodHours,
                              double savingsRatePct, long savingsCap,
                              double riskyMinPct, double riskyMaxPct, double riskyAvgPct,
                              double withdrawFeePct, String feeRecipient) {
        /** Valeurs de repli si {@code /bank/config} est absent/injoignable (le jeu reste jouable). */
        public static final BankConfig DEFAULT = new BankConfig(
                "crazythings:crazy_coin", 24.0, 24.0, 0.5, 10_000L, -8.0, 10.0, -1.0, 3.0, "");
    }

    /** Lit la config de la banque ({@code /bank/config}). {@link BankConfig#DEFAULT} si absente. */
    public static CompletableFuture<BankConfig> fetchBankConfig() {
        return getJson("/bank/config").thenApply(FirebaseClient::parseBankConfig);
    }

    private static BankConfig parseBankConfig(String body) {
        if (body == null || body.isBlank()) return BankConfig.DEFAULT;
        JsonElement root = JsonParser.parseString(body);
        if (root == null || !root.isJsonObject()) return BankConfig.DEFAULT;
        JsonObject o = root.getAsJsonObject();
        BankConfig d = BankConfig.DEFAULT;
        return new BankConfig(
                strOr(o, "currencyItem", d.currencyItem()),
                dblOr(o, "savingsPeriodHours", d.savingsPeriodHours()),
                dblOr(o, "riskyPeriodHours", d.riskyPeriodHours()),
                dblOr(o, "savingsRatePct", d.savingsRatePct()),
                (long) dblOr(o, "savingsCap", d.savingsCap()),
                dblOr(o, "riskyMinPct", d.riskyMinPct()),
                dblOr(o, "riskyMaxPct", d.riskyMaxPct()),
                dblOr(o, "riskyAvgPct", d.riskyAvgPct()),
                dblOr(o, "withdrawFeePct", d.withdrawFeePct()),
                strOr(o, "feeRecipient", d.feeRecipient()));
    }

    /** Nombre à virgule, ou {@code def} si absent/invalide. */
    private static double dblOr(JsonObject o, String key, double def) {
        try {
            return o.has(key) && !o.get(key).isJsonNull() ? o.get(key).getAsDouble() : def;
        } catch (RuntimeException ex) {
            return def;
        }
    }

    /**
     * Publie (PUT) un miroir du compte bancaire de {@code player} sous
     * {@code /bank/accounts/{player}} : {@code {savingsTotal, riskyTotal, total, updatedAt}}.
     * Écriture AUTHENTIFIÉE (secret SERVEUR, cf. {@link ServerConfig}), best-effort (erreurs
     * seulement loguées) — la source de vérité reste {@link BankAccountData} (SavedData local),
     * ce miroir n'est qu'informatif (consultable directement dans la base par l'admin).
     */
    public static void putBankAccount(String secret, String player, long savingsTotal, long riskyTotal) {
        if (secret == null || secret.isBlank() || player == null || player.isBlank()) {
            return;
        }
        JsonObject body = new JsonObject();
        body.addProperty("savingsTotal", savingsTotal);
        body.addProperty("riskyTotal", riskyTotal);
        body.addProperty("total", savingsTotal + riskyTotal);
        body.addProperty("updatedAt", System.currentTimeMillis());
        URI uri = URI.create(BASE + "/bank/accounts/" + player + ".json?auth=" + secret);
        HttpRequest req = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofSeconds(15))
                .header("Content-Type", "application/json")
                .PUT(HttpRequest.BodyPublishers.ofString(body.toString()))
                .build();
        HTTP.sendAsync(req, HttpResponse.BodyHandlers.ofString()).whenComplete((resp, err) -> {
            if (err != null) {
                ZigShop.LOGGER.warn("[ZigShop] Publication du compte bancaire echouee : {}", err.toString());
            } else if (resp.statusCode() / 100 != 2) {
                ZigShop.LOGGER.warn("[ZigShop] Publication du compte bancaire : HTTP {}", resp.statusCode());
            }
        });
    }

    /**
     * Publie (PUT, écrase) l'historique COMMUN du taux RISQUÉ ({@code /bank/riskyHistory}) : un
     * tableau borné de bougies {@code {date, pct, open, close}} (cf.
     * {@code BankAccountData#riskyCandles}) — alimente le graphique en bougies (écran banque en
     * jeu + dashboard admin).
     * Un seul tirage PAR CYCLE pour TOUS les joueurs (cf. {@code BankAccountData#getOrRollRiskyPct}),
     * donc un seul PUT par cycle, pas un par joueur/dépôt/retrait. Écriture AUTHENTIFIÉE
     * (secret SERVEUR), best-effort comme {@link #putBankAccount}.
     */
    public static void putBankRiskyHistory(String secret, List<BankAccountData.RiskyCandle> candles) {
        if (secret == null || secret.isBlank()) {
            return;
        }
        JsonArray arr = new JsonArray();
        for (BankAccountData.RiskyCandle c : candles) {
            JsonObject o = new JsonObject();
            o.addProperty("date", c.date());
            o.addProperty("pct", c.pct());
            o.addProperty("open", c.open());
            o.addProperty("close", c.close());
            arr.add(o);
        }
        URI uri = URI.create(BASE + "/bank/riskyHistory.json?auth=" + secret);
        HttpRequest req = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofSeconds(15))
                .header("Content-Type", "application/json")
                .PUT(HttpRequest.BodyPublishers.ofString(arr.toString()))
                .build();
        HTTP.sendAsync(req, HttpResponse.BodyHandlers.ofString()).whenComplete((resp, err) -> {
            if (err != null) {
                ZigShop.LOGGER.warn("[ZigShop] Publication de l'historique risque echouee : {}", err.toString());
            } else if (resp.statusCode() / 100 != 2) {
                ZigShop.LOGGER.warn("[ZigShop] Publication de l'historique risque : HTTP {}", resp.statusCode());
            }
        });
    }

    private static List<QuestDef> parseQuests(String body) {
        List<QuestDef> out = new ArrayList<>();
        if (body == null || body.isBlank()) return out;
        JsonElement root = JsonParser.parseString(body);
        if (root == null || !root.isJsonObject()) return out;
        for (Map.Entry<String, JsonElement> e : root.getAsJsonObject().entrySet()) {
            if (!e.getValue().isJsonObject()) continue;
            JsonObject o = e.getValue().getAsJsonObject();
            out.add(new QuestDef(
                    e.getKey(),
                    str(o, "title"),
                    str(o, "description"),
                    strOr(o, "type", "kill"),   // rétrocompat : ancienne quête sans type = kill
                    str(o, "target"),           // vide autorisé = n'importe quelle cible (wildcard)
                    intVal(o, "amount"),
                    str(o, "rewardItem"),
                    intVal(o, "rewardQty"),
                    strOr(o, "mode", "once"),   // rétrocompat : sans mode = once
                    intOr(o, "maxClaims", 0),
                    str(o, "npc")               // PNJ propriétaire ("" = quête globale)
            ));
        }
        return out;
    }

    /**
     * Publie (PUT) le compteur d'échanges {@code count} d'un joueur pour une offre, sous
     * {@code /shop/trades/{player}/{offerId}}. Écriture AUTHENTIFIÉE (secret SERVEUR, cf.
     * {@link ServerConfig}). Asynchrone, best-effort : les erreurs sont seulement loguées.
     * Le launcher lit ce chemin pour afficher le quota restant du joueur.
     */
    public static void putTradeCount(String secret, String player, String offerId, int count) {
        if (secret == null || secret.isBlank() || player == null || player.isBlank() || offerId == null || offerId.isBlank()) {
            return;
        }
        URI uri = URI.create(BASE + "/shop/trades/" + player + "/" + offerId + ".json?auth=" + secret);
        HttpRequest req = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofSeconds(15))
                .header("Content-Type", "application/json")
                .PUT(HttpRequest.BodyPublishers.ofString(Integer.toString(Math.max(0, count))))
                .build();
        HTTP.sendAsync(req, HttpResponse.BodyHandlers.ofString()).whenComplete((resp, err) -> {
            if (err != null) {
                ZigShop.LOGGER.warn("[ZigShop] Publication du compteur echouee : {}", err.toString());
            } else if (resp.statusCode() / 100 != 2) {
                ZigShop.LOGGER.warn("[ZigShop] Publication du compteur : HTTP {}", resp.statusCode());
            }
        });
    }

    /**
     * Publie (PUT) le gagnant d'une quête « unique » sous {@code /questWinners/{questId}} :
     * {@code {player, uuid, ts}}. Écriture AUTHENTIFIÉE (secret SERVEUR, cf. {@link ServerConfig}),
     * best-effort (erreurs seulement loguées). Le launcher lit ce chemin pour afficher le gagnant.
     * La source de vérité reste le verrou local ({@link QuestWinnersData}) : ce miroir n'est
     * qu'informatif côté launcher.
     */
    public static void putQuestWinner(String secret, String questId, String player, String uuid, long ts) {
        if (secret == null || secret.isBlank() || questId == null || questId.isBlank() || player == null || player.isBlank()) {
            return;
        }
        JsonObject body = new JsonObject();
        body.addProperty("player", player);
        body.addProperty("uuid", uuid == null ? "" : uuid);
        body.addProperty("ts", ts);
        URI uri = URI.create(BASE + "/questWinners/" + questId + ".json?auth=" + secret);
        HttpRequest req = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofSeconds(15))
                .header("Content-Type", "application/json")
                .PUT(HttpRequest.BodyPublishers.ofString(body.toString()))
                .build();
        HTTP.sendAsync(req, HttpResponse.BodyHandlers.ofString()).whenComplete((resp, err) -> {
            if (err != null) {
                ZigShop.LOGGER.warn("[ZigShop] Publication du gagnant echouee : {}", err.toString());
            } else if (resp.statusCode() / 100 != 2) {
                ZigShop.LOGGER.warn("[ZigShop] Publication du gagnant : HTTP {}", resp.statusCode());
            }
        });
    }

    // ─── SKINS (comptes hors-ligne) ───────────────────────────────────────────
    /**
     * Skin custom d'un joueur choisi depuis le launcher, publié sous {@code /skins/{pseudo}} :
     * {@code url} (texture hébergée, en principe textures.minecraft.net), {@code variant}
     * (classic|slim), {@code updatedAt} (ms) et, quand le launcher a pu la produire, la
     * <b>texture signée</b> ({@code textureValue}/{@code textureSignature}) telle que renvoyée
     * par MineSkin. Ces deux derniers champs permettent d'appliquer le skin SANS repasser par
     * MineSkin au join (application directe, stable, idempotente). Vides = repli sur le provider
     * « web » (l'URL est refetchée par MineSkin côté serveur).
     */
    public record PlayerSkin(String url, String variant, long updatedAt,
                             String textureValue, String textureSignature) {}

    /** Lit le skin custom d'un joueur ({@code /skins/{pseudo}}). {@code null} si aucun défini. */
    public static CompletableFuture<PlayerSkin> fetchPlayerSkin(String player) {
        return getJson("/skins/" + player).thenApply(FirebaseClient::parsePlayerSkin);
    }

    private static PlayerSkin parsePlayerSkin(String body) {
        if (body == null || body.isBlank()) return null;                 // "null" => aucun skin
        JsonElement root = JsonParser.parseString(body);
        if (root == null || !root.isJsonObject()) return null;
        JsonObject o = root.getAsJsonObject();
        String url = str(o, "url");
        if (url.isBlank()) return null;
        long updatedAt = 0L;
        try {
            if (o.has("updatedAt") && !o.get("updatedAt").isJsonNull()) updatedAt = o.get("updatedAt").getAsLong();
        } catch (RuntimeException ignored) { /* garde updatedAt=0 */ }
        return new PlayerSkin(url, str(o, "variant"), updatedAt,
                str(o, "textureValue"), str(o, "textureSignature"));
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
                    intVal(o, "outputQty"),
                    maxUsesVal(o),
                    str(o, "npc")               // PNJ propriétaire ("" = offre globale)
            ));
        }
        return out;
    }

    private static String str(JsonObject o, String key) {
        return o.has(key) && !o.get(key).isJsonNull() ? o.get(key).getAsString() : "";
    }

    /** Chaîne, ou {@code def} si absente/vide (pour les champs rétrocompatibles type/mode). */
    private static String strOr(JsonObject o, String key, String def) {
        String v = str(o, key);
        return v.isBlank() ? def : v;
    }

    /** Entier brut, ou {@code def} si absent/invalide (≠ {@link #intVal} qui force un minimum de 1). */
    private static int intOr(JsonObject o, String key, int def) {
        try {
            return o.has(key) && !o.get(key).isJsonNull() ? o.get(key).getAsInt() : def;
        } catch (RuntimeException ex) {
            return def;
        }
    }

    private static int intVal(JsonObject o, String key) {
        try {
            return o.has(key) && !o.get(key).isJsonNull() ? Math.max(1, o.get(key).getAsInt()) : 1;
        } catch (RuntimeException ex) {
            return 1;
        }
    }

    /** Limite par joueur : 0 (illimité) si absent/invalide, sinon la valeur (≥ 0). */
    private static int maxUsesVal(JsonObject o) {
        try {
            return o.has("maxUses") && !o.get("maxUses").isJsonNull() ? Math.max(0, o.get("maxUses").getAsInt()) : 0;
        } catch (RuntimeException ex) {
            return 0;
        }
    }
}
