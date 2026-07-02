package com.rawstudio.zigshop;

import net.minecraft.commands.CommandSourceStack;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.ModList;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.event.entity.player.PlayerEvent;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Applique automatiquement le skin custom d'un joueur (choisi dans le launcher, publié
 * dans Firebase {@code /skins/{pseudo}}) à sa connexion, en s'appuyant sur le mod
 * <b>SkinRestorer</b> (côté serveur).
 *
 * <p>On exécute sa commande {@code /skin set web (classic|slim) "<url>" <pseudo>} UNE
 * seule fois par changement de skin. SkinRestorer télécharge alors la texture (via
 * MineSkin), l'injecte dans le profil de jeu (donc visible par TOUS les clients, même
 * vanilla — rien à faire côté client) et la <b>persiste</b> sur le serveur. Aux
 * connexions suivantes il la ré-applique tout seul depuis le disque (config serveur
 * {@code refreshSkinOnJoin=false}) : aucun appel réseau inutile.
 *
 * <p>La map {@link #APPLIED} évite de ré-exécuter la commande (donc de re-solliciter
 * MineSkin) tant que l'{@code updatedAt} publié n'a pas changé pendant la session.
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
            if (last != null && last == skin.updatedAt()) return;          // déjà appliqué cette session : SkinRestorer le restaure seul

            String variant = "slim".equalsIgnoreCase(skin.variant()) ? "slim" : "classic";
            // Commande exécutée AU NOM DU JOUEUR (source = player) et SANS cible : elle
            // s'applique à l'exécuteur lui-même. Une source « console » + cible par pseudo
            // échouait silencieusement pour un compte hors-ligne (résolution du profil KO).
            String cmd = "skin set web " + variant + " \"" + skin.url() + "\"";
            CommandSourceStack src = player.createCommandSourceStack().withPermission(4).withSuppressedOutput();
            try {
                server.getCommands().performPrefixedCommand(src, cmd);
                APPLIED.put(name, skin.updatedAt());
                ZigShop.LOGGER.info("[ZigShop] Skin custom appliqué pour {} (variant={})", name, variant);
            } catch (Exception e) {
                ZigShop.LOGGER.warn("[ZigShop] Application du skin de {} échouée : {}", name, e.toString());
            }
        }));
    }

    /** Refuse une URL qui casserait le parsing de la commande (guillemet, espace, retour ligne) ou non-HTTP. */
    private static boolean isBadUrl(String url) {
        if (!url.startsWith("https://") && !url.startsWith("http://")) return true;
        return url.indexOf('"') >= 0 || url.indexOf(' ') >= 0 || url.indexOf('\n') >= 0 || url.indexOf('\r') >= 0;
    }
}
