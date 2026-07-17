package net.bogismok.thedirtystuff;

import com.mojang.logging.LogUtils;
import net.bogismok.thedirtystuff.block.ModBlocks;
import net.bogismok.thedirtystuff.block.entity.ModBlockEntities;
import net.bogismok.thedirtystuff.init.ModCreativeTabs;
import net.bogismok.thedirtystuff.init.ModDataComponentTypes;
import net.bogismok.thedirtystuff.init.ModItemProperties;
import net.bogismok.thedirtystuff.item.ModItems;
import net.bogismok.thedirtystuff.recipe.ModRecipes;
import net.bogismok.thedirtystuff.screen.ModMenuTypes;
import net.bogismok.thedirtystuff.screen.custom.DryingRackScreen;
import net.minecraft.client.gui.screens.MenuScreens;
import net.minecraft.world.level.block.ComposterBlock;
import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.ModContainer;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.fml.common.Mod;
import net.neoforged.fml.event.lifecycle.FMLClientSetupEvent;
import net.neoforged.fml.event.lifecycle.FMLCommonSetupEvent;

import org.slf4j.Logger;

@Mod(TheDirtyStuff.MOD_ID)
public class TheDirtyStuff {
    public static final String MOD_ID = "thedirtystuff";

    public static final Logger LOGGER = LogUtils.getLogger();

    public TheDirtyStuff(IEventBus modEventBus, ModContainer modContainer) {
        modEventBus.addListener(this::commonSetup);

        ModCreativeTabs.register(modEventBus);

        ModItems.register(modEventBus);
        ModBlocks.register(modEventBus);

        ModBlockEntities.register(modEventBus);
        ModMenuTypes.register(modEventBus);

        ModDataComponentTypes.register(modEventBus);

        ModRecipes.register(modEventBus);
    }

    private void commonSetup(final FMLCommonSetupEvent event) {
        event.enqueueWork(() -> {
            ComposterBlock.COMPOSTABLES.put(ModItems.TOBACCO_LEAVES.get(), 0.65f);
            ComposterBlock.COMPOSTABLES.put(ModItems.TOBACCO_SEEDS.get(), 0.3f);
        });
    }

    @EventBusSubscriber(modid = MOD_ID, bus = EventBusSubscriber.Bus.MOD, value = Dist.CLIENT)
    public static class ClientModEvents {
        @SubscribeEvent
        public static void onClientSetup(FMLClientSetupEvent event) {
            MenuScreens.register(ModMenuTypes.DRYING_RACK_MENU.get(), DryingRackScreen::new);
            ModItemProperties.addCustomItemProperties();
        }
    }
}
