package com.policemod;

import com.policemod.init.ModItems;
import com.policemod.init.ModMenuTypes;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.common.Mod;
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;

@Mod(PoliceMod.MOD_ID)
public class PoliceMod {

    public static final String MOD_ID = "policemod";
    public static final Logger LOGGER = LogManager.getLogger(MOD_ID);

    public PoliceMod(IEventBus modEventBus) {
        ModItems.register(modEventBus);
        ModMenuTypes.register(modEventBus);
        LOGGER.info("Police Mod chargé !");
    }
}
