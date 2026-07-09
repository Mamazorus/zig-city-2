package com.rawstudio.zigaddiction;

import com.mojang.logging.LogUtils;

import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.ModContainer;
import net.neoforged.fml.common.Mod;

import org.slf4j.Logger;

/**
 * Point d'entrée du mod. Aucun registre custom (ni item, ni entité, ni réseau) : le mod
 * se contente d'écouter des événements (cf. {@link AddictionEvents}) et n'agit QUE côté
 * serveur. Il cible le joint du mod Nirvana par son identifiant ({@code nirvana:joint}),
 * sans jamais dépendre de son code.
 */
@Mod(ZigAddiction.MODID)
public final class ZigAddiction {
    public static final String MODID = "zigaddiction";
    public static final Logger LOGGER = LogUtils.getLogger();

    public ZigAddiction(IEventBus modEventBus, ModContainer modContainer) {
        LOGGER.info("[ZigAddiction] Chargement (modid={}) — addiction RP au joint Nirvana.", MODID);
    }
}
