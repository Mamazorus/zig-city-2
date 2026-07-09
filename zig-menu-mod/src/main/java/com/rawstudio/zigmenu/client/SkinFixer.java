package com.rawstudio.zigmenu.client;

import java.io.ByteArrayInputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import com.mojang.blaze3d.platform.NativeImage;

import com.rawstudio.zigmenu.ZigMenu;

import net.minecraft.client.Minecraft;
import net.minecraft.client.multiplayer.ClientLevel;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.client.renderer.texture.DynamicTexture;
import net.minecraft.client.renderer.texture.TextureManager;
import net.minecraft.client.resources.PlayerSkin;
import net.minecraft.resources.ResourceLocation;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.client.event.ClientTickEvent;

/**
 * Correctif « skins joueurs full-noir » (bug 100 % CLIENT, cf. mémoire feature-offline-skins).
 *
 * <p><b>Symptôme</b> : par intermittence, des joueurs distants apparaissent en silhouette
 * 100 % noire (tête comprise), de façon aléatoire et dépendante de l'observateur — un joueur
 * vu noir par certains clients, correct par d'autres, au même instant. Réparé par F3+T.
 *
 * <p><b>Cause</b> : la texture du skin ARRIVE bien sur le client (donnée saine : skin appliqué
 * côté serveur par SkinRestorer, texture {@code textures.minecraft.net} valide), mais l'upload/bind
 * GPU de la {@code HttpTexture} vanilla rate silencieusement au chargement initial (course avec
 * Sodium 0.6.x) → la texture reste marquée « uploadée » mais échantillonnée noire, et rien dans
 * le chemin vanilla ne la ré-uploade (le {@code load()} d'une HttpTexture déjà chargée est un no-op).
 *
 * <p><b>Fix</b> : pour chaque joueur distant, on (ré)enregistre sa texture de skin via une
 * {@link DynamicTexture} — qui, elle, uploade réellement au GPU dans son constructeur sur le thread
 * de rendu — À LA MÊME {@link ResourceLocation} que celle que le renderer échantillonne
 * ({@code player.getSkin().texture()}). C'est l'équivalent d'un F3+T mais scopé à UNE image 64×64,
 * automatique et sans gel. {@code TextureManager.register} ferme proprement l'ancienne HttpTexture.
 *
 * <p>Chemin GPU neuf, indépendant de la HttpTexture racy — c'est le pattern déjà éprouvé par
 * {@link PlayerHeads} pour le carrousel. Entièrement défensif : tout échec laisse le rendu vanilla.
 */
@EventBusSubscriber(modid = ZigMenu.MODID, bus = EventBusSubscriber.Bus.GAME, value = Dist.CLIENT)
public final class SkinFixer {

    private SkinFixer() {}

    /** Cooldown avant de retenter un téléchargement de skin qui a échoué (évite de spammer). */
    private static final long RETRY_COOLDOWN_MS = 60_000L;

    /** Notre override par emplacement de skin. La loc est <i>content-addressed</i> (= hash du skin),
     *  donc un changement de skin serveur produit une nouvelle loc, traitée automatiquement. */
    private static final Map<ResourceLocation, DynamicTexture> applied = new ConcurrentHashMap<>();
    /** Octets PNG en cache par loc, pour ré-appliquer sans re-télécharger si vanilla nous clobbe. */
    private static final Map<ResourceLocation, byte[]> png = new ConcurrentHashMap<>();
    /** Loc dont le téléchargement est en cours (anti double-fetch). */
    private static final Set<ResourceLocation> fetching = ConcurrentHashMap.newKeySet();
    /** Loc en cooldown après un échec de téléchargement : « ne pas retenter avant ». */
    private static final Map<ResourceLocation, Long> retryAfter = new ConcurrentHashMap<>();

    private static final HttpClient HTTP = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(8))
            .build();

    /**
     * Posté par {@code Minecraft.tick()} sur le THREAD DE RENDU (le thread client = render thread),
     * donc les opérations GPU ({@code new DynamicTexture}, {@code register}) y sont légales.
     */
    @SubscribeEvent
    public static void onClientTickPost(ClientTickEvent.Post event) {
        Minecraft mc = Minecraft.getInstance();
        ClientLevel level = mc.level;
        if (level == null) {
            return;
        }
        TextureManager tm = mc.getTextureManager();
        LocalPlayer self = mc.player;

        for (AbstractClientPlayer p : level.players()) {
            if (p == self) {
                continue;   // notre propre skin : géré par le jeu, jamais concerné par le bug
            }
            try {
                PlayerSkin skin = p.getSkin();
                if (skin == null) {
                    continue;
                }
                ResourceLocation loc = skin.texture();
                String url = skin.textureUrl();
                if (loc == null || url == null) {
                    continue;   // skin par défaut (baked-in, non racy) → rien à réparer
                }

                DynamicTexture mine = applied.get(loc);
                // getTexture(loc, null) = getOrDefault sans effet de bord (ne crée pas de texture).
                if (mine != null && tm.getTexture(loc, null) == mine) {
                    continue;   // notre texture est en place → OK
                }

                byte[] bytes = png.get(loc);
                if (bytes != null) {
                    register(tm, loc, bytes);   // (ré)applique — on est sur le render thread
                } else {
                    maybeDownload(loc, url);    // télécharge une fois (async), appliqué au tick suivant
                }
            } catch (Throwable ignore) {
                // joueur individuel raté → on n'interrompt jamais la boucle
            }
        }
    }

    /** Sur le render thread : construit une NativeImage + DynamicTexture (upload immédiat au GPU)
     *  et remplace la HttpTexture racy à la même loc ({@code register} ferme l'ancienne). */
    private static void register(TextureManager tm, ResourceLocation loc, byte[] bytes) {
        NativeImage img = null;
        try {
            img = NativeImage.read(new ByteArrayInputStream(bytes));
            DynamicTexture tex = new DynamicTexture(img);   // possède désormais l'image (l'uploade + la fermera)
            img = null;                                     // transférée à la texture
            tm.register(loc, tex);                          // put + safeClose de l'ancienne HttpTexture
            applied.put(loc, tex);
        } catch (Throwable t) {
            if (img != null) {
                img.close();
            }
            png.remove(loc);                                                    // PNG illisible → on abandonne
            retryAfter.put(loc, System.currentTimeMillis() + RETRY_COOLDOWN_MS);  // (évite de reboucler chaque tick)
            ZigMenu.LOGGER.debug("[ZigMenu] skin-fix register KO {} : {}", loc, t.toString());
        }
    }

    /** Télécharge les octets du skin une seule fois (thread daemon, jamais le render thread),
     *  avec cooldown après échec. Le tick suivant posera la texture depuis {@link #png}. */
    private static void maybeDownload(ResourceLocation loc, String url) {
        long now = System.currentTimeMillis();
        Long after = retryAfter.get(loc);
        if (after != null && now < after) {
            return;   // en cooldown après un échec récent
        }
        if (!fetching.add(loc)) {
            return;   // déjà en cours
        }
        Thread t = new Thread(() -> {
            try {
                byte[] body = httpBytes(url);
                if (body != null && body.length > 16) {
                    png.put(loc, body);
                    retryAfter.remove(loc);
                } else {
                    retryAfter.put(loc, System.currentTimeMillis() + RETRY_COOLDOWN_MS);
                }
            } catch (Exception e) {
                retryAfter.put(loc, System.currentTimeMillis() + RETRY_COOLDOWN_MS);
            } finally {
                fetching.remove(loc);
            }
        }, "zigmenu-skinfix");
        t.setDaemon(true);
        t.start();
    }

    private static byte[] httpBytes(String url) throws Exception {
        HttpRequest req = HttpRequest.newBuilder(URI.create(url.replaceFirst("^http://", "https://")))
                .timeout(Duration.ofSeconds(8))
                .header("User-Agent", "ZigMenu")
                .GET().build();
        HttpResponse<byte[]> resp = HTTP.send(req, HttpResponse.BodyHandlers.ofByteArray());
        if (resp.statusCode() / 100 != 2) {
            return null;
        }
        return resp.body();
    }
}
