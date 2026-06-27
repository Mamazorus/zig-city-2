package com.rawstudio.zigmenu;

import com.mojang.logging.LogUtils;

import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.IEventBus;
import net.neoforged.fml.ModContainer;
import net.neoforged.fml.common.Mod;

import org.slf4j.Logger;

/**
 * Point d'entree du mod Zig City Menu : remplace l'ecran-titre de Minecraft par
 * le menu principal personnalise Zig City 2.
 *
 * <p>Mod CLIENT uniquement ({@code dist = Dist.CLIENT}) : il ne charge rien cote
 * serveur et n'intervient pas dans le handshake (cf. {@code displayTest} dans le
 * neoforge.mods.toml). Tout le rendu vit dans le package {@code client}, active par
 * {@link com.rawstudio.zigmenu.client.ZigMenuClient} ({@code @EventBusSubscriber}).
 */
@Mod(value = ZigMenu.MODID, dist = Dist.CLIENT)
public class ZigMenu {
    public static final String MODID = "zigmenu";
    public static final Logger LOGGER = LogUtils.getLogger();

    public ZigMenu(IEventBus modEventBus, ModContainer modContainer) {
        LOGGER.info("[ZigMenu] Menu Zig City 2 charge (client-only).");
    }
}
