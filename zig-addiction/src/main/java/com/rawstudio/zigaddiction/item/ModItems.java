package com.rawstudio.zigaddiction.item;

import com.rawstudio.zigaddiction.ZigAddiction;

import net.minecraft.core.registries.Registries;
import net.minecraft.world.item.Item;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.registries.DeferredHolder;
import net.neoforged.neoforge.registries.DeferredRegister;

/**
 * Registre des items du mod. Unique item : le {@link DetoxItem remède de sevrage}, qui
 * met fin à la dépendance. Enregistré sur le bus du mod depuis {@link ZigAddiction}.
 *
 * <p>Sa clé de traduction {@code item.zigaddiction.detox} (cf. {@code lang/fr_fr.json})
 * le rend aussi découvrable dans le sélecteur d'items de l'admin du shop, qui liste les
 * items en scannant les fichiers lang des jars — le remède peut donc être mis en vente à
 * l'Échoppe sans code supplémentaire côté launcher.
 */
public final class ModItems {
    private ModItems() {}

    public static final DeferredRegister<Item> ITEMS =
            DeferredRegister.create(Registries.ITEM, ZigAddiction.MODID);

    /** Remède qui met DÉFINITIVEMENT fin à la dépendance (cf. {@link DetoxItem}). */
    public static final DeferredHolder<Item, DetoxItem> DETOX =
            ITEMS.register("detox", DetoxItem::new);

    public static void register(IEventBus modEventBus) {
        ITEMS.register(modEventBus);
    }
}
