package com.rawstudio.zigshop.client;

import com.google.gson.JsonArray;
import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import net.minecraft.client.Minecraft;

import java.util.ArrayList;
import java.util.List;

/**
 * État CLIENT des quêtes ACTIVES du joueur, poussé par le serveur ({@code SyncActiveQuestsPayload}).
 * Lu par le journal ({@link ActiveQuestsScreen}). Sans ce cache, le client ne connaît l'état des
 * quêtes que le temps de l'écran du PNJ : c'est la cause du « on ne voit plus quoi faire ».
 * CLIENT uniquement.
 */
public final class ActiveQuestsClient {
    private ActiveQuestsClient() {}

    /** Une quête active (instantané reçu du serveur). {@code status} = accepted | completed. */
    public record ActiveQuest(String id, String title, String type, String target,
                              int amount, int progress, String status, String mode) {}

    private static volatile List<ActiveQuest> quests = List.of();

    /**
     * Remplace l'état courant à partir du JSON serveur, puis rafraîchit le journal s'il est ouvert.
     * Appelé sur le thread client (via {@code enqueueWork} dans le handler réseau).
     */
    public static void update(String json) {
        quests = parse(json);
        Minecraft mc = Minecraft.getInstance();
        if (mc.screen instanceof ActiveQuestsScreen screen) {
            screen.onQuestsUpdated();
        }
    }

    /** Liste courante (immuable, jamais null). */
    public static List<ActiveQuest> list() {
        return quests;
    }

    private static List<ActiveQuest> parse(String json) {
        List<ActiveQuest> out = new ArrayList<>();
        try {
            JsonObject root = JsonParser.parseString(json).getAsJsonObject();
            JsonArray arr = root.getAsJsonArray("quests");
            for (JsonElement el : arr) {
                JsonObject o = el.getAsJsonObject();
                out.add(new ActiveQuest(
                        o.get("id").getAsString(),
                        o.has("title") ? o.get("title").getAsString() : "",
                        o.has("type") ? o.get("type").getAsString() : "kill",
                        o.has("target") ? o.get("target").getAsString() : "",
                        o.has("amount") ? o.get("amount").getAsInt() : 1,
                        o.has("progress") ? o.get("progress").getAsInt() : 0,
                        o.has("status") ? o.get("status").getAsString() : "accepted",
                        o.has("mode") ? o.get("mode").getAsString() : "once"
                ));
            }
        } catch (RuntimeException ignored) {
            // JSON invalide : liste vide (l'écran affichera « aucune quête »)
        }
        return out;
    }
}
