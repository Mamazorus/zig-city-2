package com.rawstudio.zigshop.client;

import com.rawstudio.zigshop.ModEntities;
import com.rawstudio.zigshop.ZigShop;

import net.neoforged.api.distmarker.Dist;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.client.event.EntityRenderersEvent;

/**
 * Setup client-only (chargé uniquement côté CLIENT). Enregistre le rendu du marchand
 * sur le bus du mod.
 */
@EventBusSubscriber(modid = ZigShop.MODID, bus = EventBusSubscriber.Bus.MOD, value = Dist.CLIENT)
public final class ZigShopClient {
    private ZigShopClient() {}

    @SubscribeEvent
    public static void onRegisterRenderers(EntityRenderersEvent.RegisterRenderers event) {
        event.registerEntityRenderer(ModEntities.MERCHANT.get(), MerchantRenderer::new);
    }
}
