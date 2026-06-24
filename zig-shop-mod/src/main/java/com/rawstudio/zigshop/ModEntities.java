package com.rawstudio.zigshop;

import net.minecraft.core.registries.Registries;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.MobCategory;
import net.neoforged.neoforge.registries.DeferredRegister;

import java.util.function.Supplier;

/** Registre des entités du mod. */
public final class ModEntities {
    private ModEntities() {}

    public static final DeferredRegister<EntityType<?>> ENTITIES =
            DeferredRegister.create(Registries.ENTITY_TYPE, ZigShop.MODID);

    /** Le marchand : un PNJ statique qu'on clique pour voir/réaliser les échanges. */
    public static final Supplier<EntityType<MerchantEntity>> MERCHANT = ENTITIES.register(
            "merchant",
            () -> EntityType.Builder.<MerchantEntity>of(MerchantEntity::new, MobCategory.MISC)
                    .sized(0.6f, 1.95f)
                    .clientTrackingRange(10)
                    .build("merchant"));
}
