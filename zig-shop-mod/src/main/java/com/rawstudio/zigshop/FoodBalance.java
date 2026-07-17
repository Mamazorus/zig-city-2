package com.rawstudio.zigshop;

import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.item.FoodProperties;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.component.DataComponents;
import net.neoforged.neoforge.event.ModifyDefaultComponentsEvent;

/**
 * Rééquilibrage économique : la nourriture trop simple à obtenir (buisson AFK, zéro
 * effort) ne doit plus rivaliser avec le restaurant/la boulangerie du serveur. On
 * écrase le composant minecraft:food par défaut de ces items pour les rendre quasi
 * inutiles nutritionnellement (le datapack zigcity-junk-food ajoute en plus Poison +
 * Faim à la consommation).
 */
public final class FoodBalance {
    private FoodBalance() {}

    public static void onModifyDefaultComponents(ModifyDefaultComponentsEvent event) {
        nerf(event, "kawaiidishes:coffee_berries", 1, 0.1f);
    }

    private static void nerf(ModifyDefaultComponentsEvent event, String itemId, int nutrition, float saturationModifier) {
        Item item = BuiltInRegistries.ITEM.get(ResourceLocation.parse(itemId));
        if (item == Items.AIR) {
            ZigShop.LOGGER.warn("[ZigShop] FoodBalance: item introuvable, ignoré ({})", itemId);
            return;
        }
        event.modify(item, patch -> patch.set(DataComponents.FOOD, new FoodProperties.Builder()
                .nutrition(nutrition)
                .saturationModifier(saturationModifier)
                .build()));
    }
}
