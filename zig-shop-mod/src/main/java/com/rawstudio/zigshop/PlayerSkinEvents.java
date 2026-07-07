package com.rawstudio.zigshop;

import com.mojang.authlib.properties.Property;
import net.minecraft.network.protocol.game.ClientboundPlayerInfoRemovePacket;
import net.minecraft.network.protocol.game.ClientboundPlayerInfoUpdatePacket;
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
 * <p>On appelle DIRECTEMENT l'API de SkinRestorer par réflexion (au lieu de sa commande
 * {@code /skin}) : cela évite tout parsing d'URL / résolution de cible et fournit le
 * {@code GameProfile} du joueur directement (une commande via une source « construite »
 * échouait silencieusement). Deux voies (cf. {@link #applyWebSkin}) : (1) injecter la
 * <b>texture déjà signée</b> par le launcher ({@code SkinRestorer.applySkin}) — instantané et
 * stable, donc idempotent (aucun refresh quand le skin est déjà le bon) ; (2) à défaut, refetch
 * MineSkin via {@code SkinRestorer.setSkinAsync}. Dans les deux cas SkinRestorer injecte la
 * texture dans le profil (visible par TOUS) et la persiste.
 *
 * <p><b>Dé-groupage anti-« skin noir »</b> : quand la texture DIFFÈRE de celle déjà appliquée
 * (changement de skin, ou 1er join avec un persisté ≠ Firebase), SkinRestorer 2.3.1 effectue un
 * {@code refreshPlayer} qui diffuse un {@code ClientboundBundlePacket} groupant
 * {@code PlayerInfoRemove + PlayerInfoUpdate(ADD)} — bundle qu'une partie des clients ne
 * digère pas (texture non re-résolue → joueur en <b>silhouette noire</b> chez EUX seulement).
 * On corrige via {@link #resyncPlayerInfo} (dé-groupage = correctif officiel 2.7.0, issue #96).
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

    /**
     * Applique le skin custom, en deux voies :
     * <ol>
     *   <li><b>Texture signée directe</b> (préférée) : si Firebase fournit {@code textureValue}
     *   (+ signature), on l'injecte TELLE QUELLE via {@code SkinRestorer.applySkin(...)}. C'est
     *   instantané (aucun appel MineSkin au join) et surtout <b>stable</b> donc idempotent :
     *   SkinRestorer compare la texture à celle déjà appliquée ({@code areSkinPropertiesEquals})
     *   et NE re-« refresh » PAS si elle est identique — cas majoritaire, la texture signée étant
     *   stable. Quand elle DIFFÈRE (changement de skin, ou persisté ≠ Firebase), SkinRestorer
     *   déclenche un {@code refreshPlayer} : on renvoie alors le PlayerInfo dé-groupé
     *   ({@link #resyncPlayerInfo}) pour éviter la silhouette noire chez une partie des
     *   observateurs (bundle remove+add groupé de SkinRestorer 2.3.1, issue #96).</li>
     *   <li><b>Repli provider « web »</b> : sans texture signée (ancien enregistrement ou échec
     *   MineSkin côté launcher), on retombe sur {@code setSkinAsync("web", url)}.</li>
     * </ol>
     */
    private static void applyWebSkin(MinecraftServer server, ServerPlayer player, String name, FirebaseClient.PlayerSkin skin) {
        boolean applied = false;
        if (skin.textureValue() != null && !skin.textureValue().isBlank()) {
            applied = applySignedSkin(server, player, name, skin);          // voie 1 (préférée, stable)
        }
        if (!applied) {
            applyViaWebProvider(server, player, name, skin);                // voie 2 (repli MineSkin) — resync inclus à la complétion
        } else {
            scheduleResync(server, player);                                 // filet #96 : dé-groupage INCONDITIONNEL post-join (cf. méthode)
        }
        APPLIED.put(name, skin.updatedAt());                                // évite un re-fetch dans la même session
    }

    /**
     * Injecte la texture signée du launcher via
     * {@code SkinRestorer.applySkin(server, [profil], new SkinValue("web", url, variant,
     * new Property("textures", value, signature)), true)} par réflexion. Synchrone (on est déjà
     * sur le thread serveur via {@code server.execute}). Renvoie {@code false} si l'API de
     * SkinRestorer est indisponible → repli sur {@link #applyViaWebProvider}.
     */
    private static boolean applySignedSkin(MinecraftServer server, ServerPlayer player, String name, FirebaseClient.PlayerSkin skin) {
        try {
            Class<?> srClass = Class.forName("net.lionarius.skinrestorer.SkinRestorer");
            Class<?> skinValueClass = Class.forName("net.lionarius.skinrestorer.skin.SkinValue");
            Class<?> variantClass = Class.forName("net.lionarius.skinrestorer.skin.SkinVariant");
            Object variant = variantClass.getField("slim".equalsIgnoreCase(skin.variant()) ? "SLIM" : "CLASSIC").get(null);
            String sig = (skin.textureSignature() == null || skin.textureSignature().isBlank()) ? null : skin.textureSignature();
            Property texture = new Property("textures", skin.textureValue(), sig);
            // SkinValue(String provider, String argument, SkinVariant variant, Property value)
            Object skinValue = skinValueClass
                    .getConstructor(String.class, String.class, variantClass, Property.class)
                    .newInstance("web", skin.url(), variant, texture);
            // applySkin(MinecraftServer, Iterable<GameProfile>, SkinValue, boolean) -> Collection<ServerPlayer>
            Object accepted = srClass
                    .getMethod("applySkin", MinecraftServer.class, Iterable.class, skinValueClass, boolean.class)
                    .invoke(null, server, List.of(player.getGameProfile()), skinValue, true);
            int refreshed = (accepted instanceof java.util.Collection<?> c) ? c.size() : -1;
            if (refreshed > 0) {
                // SkinRestorer 2.3.1 vient d'émettre (dans applySkin -> refreshPlayer) un
                // ClientboundBundlePacket GROUPANT PlayerInfoRemove + PlayerInfoUpdate(ADD) du
                // joueur. Ce « remove+add groupés » est mal appliqué par une PARTIE des clients
                // (la texture n'est pas re-résolue -> joueur rendu en SILHOUETTE NOIRE chez EUX
                // seulement, les autres voient le bon skin) : c'est l'issue #96 de SkinRestorer,
                // corrigée en 2.7.0 par simple DÉ-GROUPAGE. On reproduit ce correctif ici, sans
                // toucher au mod tiers, en renvoyant nous-mêmes le PlayerInfo dé-groupé.
                resyncPlayerInfo(server, player);
            }
            ZigShop.LOGGER.info("[ZigShop] Skin signé appliqué pour {} (variant={}, refresh={})",
                    name, skin.variant(), refreshed > 0);
            return true;
        } catch (Throwable t) {
            ZigShop.LOGGER.warn("[ZigShop] Application directe du skin de {} échouée ({}) — repli web", name, t.toString());
            return false;
        }
    }

    /** Repli : {@code SkinRestorer.setSkinAsync(server, [profil], new SkinProviderContext("web", url, variant), true)}. */
    private static void applyViaWebProvider(MinecraftServer server, ServerPlayer player, String name, FirebaseClient.PlayerSkin skin) {
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
                cf.thenAccept(result -> {
                      ZigShop.LOGGER.info("[ZigShop] Skin (web) appliqué pour {} -> {}", name, result);
                      // Le refresh de SkinRestorer 2.3.1 est asynchrone ici : on re-synchronise le
                      // PlayerInfo dé-groupé sur le thread serveur (cf. issue #96, voir applySignedSkin).
                      server.execute(() -> resyncPlayerInfo(server, player));
                  })
                  .exceptionally(ex -> {
                      ZigShop.LOGGER.warn("[ZigShop] Skin de {} : échec MineSkin/application : {}", name, ex.toString());
                      return null;
                  });
            }
            ZigShop.LOGGER.info("[ZigShop] setSkinAsync (repli web) lancé pour {} (variant={})", name, skin.variant());
        } catch (Throwable t) {
            ZigShop.LOGGER.warn("[ZigShop] Application (web) du skin de {} échouée : {}", name, t.toString());
        }
    }

    /**
     * Renvoie le {@code PlayerInfo} de {@code player} à TOUS les joueurs en DEUX paquets top-level
     * SÉPARÉS — {@code ClientboundPlayerInfoRemovePacket} puis
     * {@code ClientboundPlayerInfoUpdatePacket.createPlayerInitializing} — au lieu du
     * {@code ClientboundBundlePacket} groupé qu'émet {@code PlayerUtils.refreshPlayer} de
     * SkinRestorer 2.3.1. Ce dé-groupage EST le correctif officiel de SkinRestorer 2.7.0
     * (issue #96) : certains clients ne rafraîchissent pas la texture d'un bundle remove+add
     * groupé et rendent le joueur en silhouette noire. Le {@code remove} force le client à jeter
     * son {@code PlayerInfo} (et la texture associée), l'{@code add} le recrée → re-téléchargement
     * de la texture. Les deux {@code broadcastAll} produisent des paquets top-level (non groupés),
     * traités séquentiellement par le client, même s'ils partent dans le même tick.
     */
    /**
     * Planifie un {@link #resyncPlayerInfo} <b>inconditionnel</b> ~0,5 s après le join. C'est le
     * correctif de fond du bug « certains me voient noir, d'autres non » (vérifié par les logs
     * serveur : la quasi-totalité des joins sont {@code refresh=false}).
     *
     * <p>Avec {@code refreshSkinOnJoin=false}, le profil ne porte PAS encore la texture au moment
     * où le paquet {@code ADD_PLAYER} du join est diffusé → les joueurs <b>déjà connectés</b>
     * rendent le nouvel arrivant en skin par défaut / silhouette noire. La texture signée est
     * ensuite posée sur le profil (SkinRestorer restore + notre {@code applySkin}), mais comme elle
     * est <b>identique</b>, {@code applySkin} renvoie {@code refresh=false} et <b>aucun paquet de
     * correction n'est émis</b> → les observateurs déjà présents restent bloqués sur le rendu noir
     * (ceux qui se connectent APRÈS reçoivent le profil déjà à jour et voient le bon skin, d'où le
     * « dépend de l'observateur »). L'ancien dé-groupage conditionnel ({@code if refreshed > 0}) ne
     * corrigeait donc jamais ce cas majoritaire.
     *
     * <p>On renvoie ici à TOUS, systématiquement, un PlayerInfo <b>dé-groupé</b> (remove + add) :
     * un skin ne pouvant être transmis que par l'action {@code ADD_PLAYER}, ce remove+add force les
     * clients à re-résoudre la texture. C'est aussi le correctif de l'issue #96 (bundle mal digéré)
     * quand un refresh a bien lieu. Le court délai place notre paquet après le tracking d'entité et
     * tout refresh de SkinRestorer. No-op si le joueur s'est déconnecté entre-temps.
     */
    private static void scheduleResync(MinecraftServer server, ServerPlayer player) {
        final java.util.UUID id = player.getUUID();
        CompletableFuture
                .runAsync(() -> {}, CompletableFuture.delayedExecutor(500L, java.util.concurrent.TimeUnit.MILLISECONDS))
                .thenRun(() -> server.execute(() -> {
                    if (!server.isRunning()) return;
                    ServerPlayer p = server.getPlayerList().getPlayer(id);
                    if (p != null) resyncPlayerInfo(server, p);
                }));
    }

    private static void resyncPlayerInfo(MinecraftServer server, ServerPlayer player) {
        var playerList = server.getPlayerList();
        playerList.broadcastAll(new ClientboundPlayerInfoRemovePacket(List.of(player.getUUID())));
        playerList.broadcastAll(ClientboundPlayerInfoUpdatePacket.createPlayerInitializing(List.of(player)));
    }

    /** Refuse une URL non-HTTP ou contenant un caractère qui casserait le traitement (guillemet, espace, retour ligne). */
    private static boolean isBadUrl(String url) {
        if (!url.startsWith("https://") && !url.startsWith("http://")) return true;
        return url.indexOf('"') >= 0 || url.indexOf(' ') >= 0 || url.indexOf('\n') >= 0 || url.indexOf('\r') >= 0;
    }
}
