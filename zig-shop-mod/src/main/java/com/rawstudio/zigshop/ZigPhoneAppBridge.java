package com.rawstudio.zigshop;

import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.player.Player;

/**
 * Pont appelé par le patch bytecode du jar {@code crazythings} qui ajoute une icône "Banque" sur
 * l'écran d'accueil du Zig Phone (cf. javadoc de {@link BankPhoneEvents}) — {@code crazythings}
 * (mod MCreator) n'a pas de système de plugin, donc le patch se contente d'appeler CETTE méthode
 * statique plutôt que de dupliquer la logique réseau/Firebase directement dans le bytecode injecté.
 *
 * <p>⚠️ Le point d'injection ({@code CrazyphoneHomeScreenButtonMessage#handleButtonAction}) tourne
 * pour TOUS les boutons de l'écran d'accueil (pas juste le nôtre), et des DEUX côtés : cliquer
 * dessus appelle la méthode immédiatement côté CLIENT (retour visuel), puis le message réseau
 * rappelle la MÊME méthode côté SERVEUR à sa réception. D'où les deux filtres ci-dessous :
 * {@code buttonId} ignore les 4 boutons natifs (0-3), {@code instanceof ServerPlayer} ignore
 * l'appel côté client (un {@code LocalPlayer} n'est jamais un {@code ServerPlayer}) — même
 * garde-fou que {@link BankPhoneEvents#onRightClickItem}. Package RACINE (pas {@code .client}) :
 * doit rester chargeable sur un serveur dédié, qui exécute aussi ce chemin.
 */
public final class ZigPhoneAppBridge {
    private ZigPhoneAppBridge() {}

    /** Identifiant du bouton "Banque" injecté par le patch (les 4 boutons natifs de
     *  {@code crazythings} utilisent 0-3) — cf. {@code CrazyPhonePatcher}, côté outillage. */
    private static final int BUTTON_ID = 42;

    public static void onHomeScreenButton(Player entity, int buttonId) {
        if (buttonId != BUTTON_ID || !(entity instanceof ServerPlayer sp)) {
            return;
        }
        BankPhoneEvents.openBankFor(sp);
    }
}
