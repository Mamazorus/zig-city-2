package com.rawstudio.zigshop;

import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.ModList;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.event.entity.player.PlayerEvent;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Applique automatiquement le skin custom d'un joueur (choisi dans le launcher, publié
 * dans Firebase {@code /skins/{pseudo}}) à sa connexion, via le mod <b>SkinRestorer</b>.
 *
 * <p>On appelle DIRECTEMENT l'API de SkinRestorer par réflexion
 * ({@code net.lionarius.skinrestorer.SkinRestorer#setSkinAsync}) au lieu de passer par sa
 * commande {@code /skin} : cela évite tout parsing d'URL / résolution de cible et fournit
 * le {@code GameProfile} du joueur directement (une commande lancée via une source
 * « construite » échouait silencieusement). SkinRestorer télécharge la texture (via
 * MineSkin), l'injecte dans le profil de jeu (visible par TOUS les clients) et la persiste.
 *
 * <p>La réflexion évite une dépendance de compilation sur SkinRestorer (mod optionnel).
 */
@EventBusSubscriber(modid = ZigShop.MODID)
public final class PlayerSkinEvents {
    private PlayerSkinEvents() {}

    private static final Map<String, Long> APPLIED = new ConcurrentHashMap<>();

    @SubscribeEvent
    public static void onPlayerLoggedIn(PlayerEvent.PlayerLoggedInEvent event) {
        if (!(event.getEntity() instanceof ServerPlayer player)) return;   // client-side : ignore
        if (!ModList.get().isLoaded("skinrestorer")) return;               // SkinRestorer absent : rien à faire

        final MinecraftServer server = player.getServer();
        if (server == null) return;
        final String name = player.getGameProfile().getName();

        FirebaseClient.fetchPlayerSkin(name).whenComplete((skin, err) -> server.execute(() -> {
            if (err != null) {
                ZigShop.LOGGER.warn("[ZigShop] Lecture du skin de {} impossible : {}", name, err.toString());
                return;
            }
            if (skin == null) return;                                      // pas de skin custom : skin auto (pseudo) conservé
            if (isBadUrl(skin.url())) {
                ZigShop.LOGGER.warn("[ZigShop] URL de skin ignorée pour {} (format invalide)", name);
                return;
            }
            Long last = APPLIED.get(name);
            if (last != null && last == skin.updatedAt()) return;          // déjà appliqué cette session

            applyWebSkin(server, player, name, skin);
        }));
    }

    /** Appelle SkinRestorer.setSkinAsync(server, [profil], new SkinProviderContext("web", url, variant), true) par réflexion. */
    private static void applyWebSkin(MinecraftServer server, ServerPlayer player, String name, FirebaseClient.PlayerSkin skin) {
        try {
            Class<?> srClass = Class.forName("net.lionarius.skinrestorer.SkinRestorer");
            Class<?> ctxClass = Class.forName("net.lionarius.skinrestorer.skin.provider.SkinProviderContext");
            Class<?> variantClass = Class.forName("net.lionarius.skinrestorer.skin.SkinVariant");
            Object variant = variantClass.getField("slim".equalsIgnoreCase(skin.variant()) ? "SLIM" : "CLASSIC").get(null);
            Object ctx = ctxClass.getConstructor(String.class, String.class, variantClass).newInstance("web", skin.url(), variant);
            Object future = srClass
                    .getMethod("setSkinAsync", MinecraftServer.class, java.util.Collection.class, ctxClass, boolean.class)
                    .invoke(null, server, List.of(player.getGameProfile()), ctx, true);
            if (future instanceof CompletableFuture<?> cf) {
                cf.thenAccept(result -> ZigShop.LOGGER.info("[ZigShop] Skin custom appliqué pour {} -> {}", name, result))
                  .exceptionally(ex -> {
                      ZigShop.LOGGER.warn("[ZigShop] Skin de {} : échec MineSkin/application : {}", name, ex.toString());
                      return null;
                  });
            }
            APPLIED.put(name, skin.updatedAt());
            ZigShop.LOGGER.info("[ZigShop] setSkinAsync lancé pour {} (variant={})", name, skin.variant());
        } catch (Throwable t) {
            ZigShop.LOGGER.warn("[ZigShop] Application du skin de {} échouée : {}", name, t.toString());
        }
    }

    /** Refuse une URL non-HTTP ou contenant un caractère qui casserait le traitement (guillemet, espace, retour ligne). */
    private static boolean isBadUrl(String url) {
        if (!url.startsWith("https://") && !url.startsWith("http://")) return true;
        return url.indexOf('"') >= 0 || url.indexOf(' ') >= 0 || url.indexOf('\n') >= 0 || url.indexOf('\r') >= 0;
    }
}
