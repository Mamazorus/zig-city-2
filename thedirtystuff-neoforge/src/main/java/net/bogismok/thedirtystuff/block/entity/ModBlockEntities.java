package net.bogismok.thedirtystuff.block.entity;

import net.bogismok.thedirtystuff.TheDirtyStuff;
import net.bogismok.thedirtystuff.block.ModBlocks;
import net.bogismok.thedirtystuff.block.entity.custom.DryingRackBlockEntity;
import net.minecraft.core.registries.Registries;
import net.minecraft.world.level.block.entity.BlockEntityType;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.registries.DeferredHolder;
import net.neoforged.neoforge.registries.DeferredRegister;

public class ModBlockEntities {
    public static final DeferredRegister<BlockEntityType<?>> BLOCK_ENTITIES =
            DeferredRegister.create(Registries.BLOCK_ENTITY_TYPE, TheDirtyStuff.MOD_ID);

    public static final DeferredHolder<BlockEntityType<?>, BlockEntityType<DryingRackBlockEntity>> DRYING_RACK_BE =
            BLOCK_ENTITIES.register("drying_rack", () -> BlockEntityType.Builder.of(
                    DryingRackBlockEntity::new, ModBlocks.DRYING_RACK.get()).build(null));

    public static void register(IEventBus eventBus) {
        BLOCK_ENTITIES.register(eventBus);
    }
}
