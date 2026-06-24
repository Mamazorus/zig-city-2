package com.rawstudio.zigshop;

import com.mojang.logging.LogUtils;
import com.rawstudio.zigshop.command.ZigShopCommand;

import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.ModContainer;
import net.neoforged.fml.common.Mod;
import net.neoforged.neoforge.common.NeoForge;
import net.neoforged.neoforge.event.RegisterCommandsEvent;

import org.slf4j.Logger;

/**
 * Point d'entrée du mod Zig Shop : un marchand en jeu connecté au « shop du jour »
 * du launcher (Firebase). Phase 1 = lecture du shop + commande de test ; l'entité
 * marchande, l'échange et la création in-game viendront dans les phases suivantes.
 */
@Mod(ZigShop.MODID)
public class ZigShop {
    public static final String MODID = "zigshop";
    public static final Logger LOGGER = LogUtils.getLogger();

    public ZigShop(IEventBus modEventBus, ModContainer modContainer) {
        LOGGER.info("[ZigShop] Chargement du mod (modid={})", MODID);
        // RegisterCommandsEvent est diffusé sur le bus de JEU (NeoForge.EVENT_BUS),
        // pas sur le bus du mod.
        NeoForge.EVENT_BUS.addListener(this::onRegisterCommands);
    }

    private void onRegisterCommands(RegisterCommandsEvent event) {
        ZigShopCommand.register(event.getDispatcher());
    }
}
