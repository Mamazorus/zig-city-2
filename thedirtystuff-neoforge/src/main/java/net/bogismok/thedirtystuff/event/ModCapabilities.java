package net.bogismok.thedirtystuff.event;

import net.bogismok.thedirtystuff.TheDirtyStuff;
import net.bogismok.thedirtystuff.block.entity.ModBlockEntities;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.capabilities.Capabilities;
import net.neoforged.neoforge.capabilities.RegisterCapabilitiesEvent;

/**
 * Expose l'inventaire du sechoir aux mods externes (hopper, pipes...) via le systeme de
 * capacites NeoForge, qui remplace {@code ForgeCapabilities}/{@code LazyOptional} de Forge.
 */
@EventBusSubscriber(modid = TheDirtyStuff.MOD_ID, bus = EventBusSubscriber.Bus.MOD)
public class ModCapabilities {
    @SubscribeEvent
    public static void register(RegisterCapabilitiesEvent event) {
        event.registerBlockEntity(Capabilities.ItemHandler.BLOCK, ModBlockEntities.DRYING_RACK_BE.get(),
                (be, side) -> be.itemHandler);
    }
}
