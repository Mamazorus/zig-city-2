package com.policemod.init;

import com.policemod.PoliceMod;
import com.policemod.gui.FouilleMenu;
import net.minecraft.core.registries.Registries;
import net.minecraft.world.inventory.MenuType;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.neoforge.common.extensions.IMenuTypeExtension;
import net.neoforged.neoforge.registries.DeferredHolder;
import net.neoforged.neoforge.registries.DeferredRegister;

public class ModMenuTypes {

    public static final DeferredRegister<MenuType<?>> MENU_TYPES =
            DeferredRegister.create(Registries.MENU, PoliceMod.MOD_ID);

    public static final DeferredHolder<MenuType<?>, MenuType<FouilleMenu>> FOUILLE_MENU =
            MENU_TYPES.register("fouille_menu",
                    () -> IMenuTypeExtension.create(FouilleMenu::new));

    public static void register(IEventBus eventBus) {
        MENU_TYPES.register(eventBus);
    }
}
