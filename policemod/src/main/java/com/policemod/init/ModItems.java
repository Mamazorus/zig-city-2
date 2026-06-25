package com.policemod.init;

import com.policemod.PoliceMod;
import com.policemod.item.BadgePolicierItem;
import net.minecraft.core.registries.Registries;
import net.minecraft.world.item.Item;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.registries.DeferredHolder;
import net.neoforged.neoforge.registries.DeferredRegister;

public class ModItems {

    public static final DeferredRegister<Item> ITEMS =
            DeferredRegister.create(Registries.ITEM, PoliceMod.MOD_ID);

    public static final DeferredHolder<Item, BadgePolicierItem> BADGE_POLICIER =
            ITEMS.register("badge_policier", BadgePolicierItem::new);

    public static void register(IEventBus eventBus) {
        ITEMS.register(eventBus);
    }
}
