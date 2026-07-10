package com.rawstudio.zigaddiction;

import com.mojang.logging.LogUtils;
import com.rawstudio.zigaddiction.item.ModItems;

import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.ModContainer;
import net.neoforged.fml.common.Mod;

import org.slf4j.Logger;

/**
 * Point d'entrée du mod. Enregistre un unique item — le {@link ModItems#DETOX remède de
 * sevrage}, qui met fin à la dépendance — et branche la logique d'addiction, qui se
 * contente d'écouter des événements (cf. {@link AddictionEvents}) et n'agit QUE côté
 * serveur. Le joint du mod Nirvana est ciblé par son identifiant ({@code nirvana:joint}),
 * sans jamais dépendre de son code.
 */
@Mod(ZigAddiction.MODID)
public final class ZigAddiction {
    public static final String MODID = "zigaddiction";
    public static final Logger LOGGER = LogUtils.getLogger();

    public ZigAddiction(IEventBus modEventBus, ModContainer modContainer) {
        ModItems.register(modEventBus);
        LOGGER.info("[ZigAddiction] Chargement (modid={}) — addiction RP au joint Nirvana.", MODID);
    }
}
