package com.rawstudio.zigshop;

import net.minecraft.resources.ResourceLocation;

import java.util.List;

/**
 * Registre des skins embarqués pour les PNJ marchands ({@link MerchantEntity}).
 *
 * <p>Les textures sont des skins JOUEUR au format moderne (64×64), rendus sur le modèle
 * joueur vanilla. Elles sont fournies par le pack du mod (côté ressources) et choisies
 * en jeu par leur nom via {@code /zigshop skin <nom>}.
 *
 * <p><b>Pour AJOUTER un skin :</b>
 * <ol>
 *   <li>dépose le PNG (skin 64×64) dans
 *       {@code src/main/resources/assets/zigshop/textures/entity/<nom>.png} ;</li>
 *   <li>ajoute {@code "<nom>"} à la liste {@link #NAMES} ci-dessous.</li>
 * </ol>
 * Le {@code <nom>} en jeu = le nom du fichier sans {@code .png}. Il doit respecter le
 * format ResourceLocation : minuscules, chiffres, {@code _ - .} uniquement (pas d'espace
 * ni de majuscule).
 */
public final class MerchantSkins {
    private MerchantSkins() {}

    /**
     * Noms des skins disponibles (= nom de fichier sans {@code .png}). Sert à la fois à
     * l'autocomplétion / validation de la commande (serveur) et au rendu (client) ; les
     * deux côtés DOIVENT partager cette liste, d'où la classe commune (pas client-only).
     */
    public static final List<String> NAMES = List.of(
            // Aucun skin embarqué pour l'instant — dépose tes PNG dans
            // assets/zigshop/textures/entity/ puis liste leurs noms ici, ex :
            //   "garde", "marchand_robe", "banquier"
    );

    /** Vrai si {@code name} correspond à un skin embarqué connu. */
    public static boolean exists(String name) {
        return name != null && NAMES.contains(name);
    }

    /**
     * ResourceLocation de la texture pour {@code name}, ou {@code null} si le nom est vide
     * ou inconnu (le rendu retombe alors sur le skin par défaut).
     */
    public static ResourceLocation texture(String name) {
        if (!exists(name)) {
            return null;
        }
        return ResourceLocation.fromNamespaceAndPath(ZigShop.MODID, "textures/entity/" + name + ".png");
    }
}
