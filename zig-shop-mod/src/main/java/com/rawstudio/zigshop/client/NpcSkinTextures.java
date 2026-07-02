package com.rawstudio.zigshop.client;

import com.mojang.blaze3d.platform.NativeImage;
import com.rawstudio.zigshop.ZigShop;

import net.minecraft.client.Minecraft;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.resources.ResourceLocation;

import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Cache de textures de PNJ téléchargées depuis une URL (skin choisi dans le launcher).
 *
 * <p>Le {@link MerchantRenderer} ne sait afficher qu'une {@link ResourceLocation}. Pour un skin
 * arbitraire hébergé (Firebase Storage), on télécharge le PNG 64×64 UNE seule fois par URL, on
 * en fait une {@link DynamicTexture} enregistrée sous une {@code ResourceLocation} dérivée de
 * l'URL, puis on la renvoie instantanément aux frames suivantes. Le temps du téléchargement, le
 * rendu retombe sur Steve (côté appelant).
 *
 * <p><b>CLIENT-ONLY</b> : ne jamais référencer côté serveur (dépend de {@link Minecraft} + GL).
 * Le téléchargement se fait sur le pool du {@link HttpClient} ; l'upload GPU est reposté sur le
 * thread de rendu via {@code Minecraft#execute}.
 */
public final class NpcSkinTextures {
    private NpcSkinTextures() {}

    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    /** URL → texture prête (rendu immédiat). */
    private static final Map<String, ResourceLocation> READY = new ConcurrentHashMap<>();
    /** URLs dont le téléchargement est en cours (évite de relancer à chaque frame). */
    private static final Map<String, Boolean> LOADING = new ConcurrentHashMap<>();

    /**
     * {@link ResourceLocation} de la texture pour {@code url}, ou {@code null} si pas encore
     * prête. Le PREMIER appel pour une URL déclenche le téléchargement asynchrone ; les appels
     * suivants renvoient {@code null} tant que ce n'est pas fini, puis la texture.
     */
    public static ResourceLocation get(String url) {
        if (url == null || url.isBlank()) {
            return null;
        }
        ResourceLocation ready = READY.get(url);
        if (ready != null) {
            return ready;
        }
        // putIfAbsent == null → premier à demander cette URL : on lance le téléchargement.
        if (LOADING.putIfAbsent(url, Boolean.TRUE) == null) {
            download(url);
        }
        return null;
    }

    private static void download(String url) {
        HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                .timeout(Duration.ofSeconds(20))
                .header("Accept", "image/png")
                .GET()
                .build();
        HTTP.sendAsync(req, HttpResponse.BodyHandlers.ofByteArray()).whenComplete((resp, err) -> {
            if (err != null || resp == null || resp.statusCode() / 100 != 2) {
                ZigShop.LOGGER.warn("[ZigShop] Skin PNJ : telechargement echoue ({}) — {}",
                        err != null ? err.toString() : "HTTP " + (resp != null ? resp.statusCode() : "?"), url);
                LOADING.remove(url); // autorise une nouvelle tentative plus tard
                return;
            }
            byte[] png = resp.body();
            // L'upload GPU doit se faire sur le thread de rendu.
            Minecraft.getInstance().execute(() -> register(url, png));
        });
    }

    private static void register(String url, byte[] png) {
        try {
            NativeImage image = NativeImage.read(new ByteArrayInputStream(png));
            DynamicTexture texture = new DynamicTexture(image); // upload GL + conserve l'image
            ResourceLocation rl = ResourceLocation.fromNamespaceAndPath(ZigShop.MODID, "npc_skin/" + hash(url));
            Minecraft.getInstance().getTextureManager().register(rl, texture);
            READY.put(url, rl);
        } catch (Exception e) {
            ZigShop.LOGGER.warn("[ZigShop] Skin PNJ : image illisible — {} ({})", url, e.toString());
            LOADING.remove(url);
        }
    }

    /** Identifiant de chemin sûr (hex minuscule) pour la ResourceLocation, dérivé de l'URL. */
    private static String hash(String s) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-1").digest(s.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                sb.append(Character.forDigit((b >> 4) & 0xF, 16));
                sb.append(Character.forDigit(b & 0xF, 16));
            }
            return sb.toString();
        } catch (Exception e) {
            // Repli : hashCode en hex (toujours des caractères valides pour un path).
            return Integer.toHexString(s.hashCode());
        }
    }
}
