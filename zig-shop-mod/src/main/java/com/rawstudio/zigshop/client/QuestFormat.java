package com.rawstudio.zigshop.client;

import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.level.block.Blocks;

/**
 * Formatage LISIBLE (côté client) d'un objectif de quête : verbe selon le type + nom de la
 * cible (entité / bloc / item). Partagé par l'écran du PNJ ({@link QuestScreen}) et le journal
 * des quêtes actives ({@link ActiveQuestsScreen}) pour éviter la duplication.
 */
public final class QuestFormat {
    private QuestFormat() {}

    /** Verbe d'action selon le type de quête (kill par défaut : rétrocompat). */
    public static String verb(String type) {
        return switch (type) {
            case "break" -> "Casser";
            case "place" -> "Poser";
            case "craft" -> "Fabriquer";
            case "smelt" -> "Cuire";
            case "fish" -> "Pecher";
            case "breed" -> "Elever";
            default -> "Tuer";
        };
    }

    /** Nom lisible de la cible selon le type ; « (tout) » si joker (cible vide/"*"). */
    public static String targetName(String type, String target) {
        if (target == null || target.isBlank() || "*".equals(target)) {
            return "(tout)";
        }
        ResourceLocation rl = ResourceLocation.tryParse(target);
        if (rl == null) {
            return shortId(target);
        }
        return switch (type) {
            case "kill", "breed" -> {
                EntityType<?> et = BuiltInRegistries.ENTITY_TYPE.get(rl);
                yield et != null ? et.getDescription().getString() : shortId(target);
            }
            case "break", "place" -> {
                var block = BuiltInRegistries.BLOCK.get(rl);
                yield block != Blocks.AIR ? block.getName().getString() : shortId(target);
            }
            default -> {
                Item it = BuiltInRegistries.ITEM.get(rl);
                yield (it != Items.AIR || "minecraft:air".equals(target))
                        ? new ItemStack(it).getHoverName().getString() : shortId(target);
            }
        };
    }

    /** Chemin d'un identifiant (sans le namespace). */
    public static String shortId(String id) {
        int i = id.indexOf(':');
        return i >= 0 ? id.substring(i + 1) : id;
    }
}
