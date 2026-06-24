package com.rawstudio.zigshop.client;

import com.rawstudio.zigshop.MerchantEntity;

import net.minecraft.client.model.PlayerModel;
import net.minecraft.client.model.geom.ModelLayers;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.HumanoidMobRenderer;
import net.minecraft.resources.ResourceLocation;

/**
 * Rendu du marchand. Pour la phase 2 on réutilise le modèle JOUEUR vanilla et la
 * texture par défaut (Steve) — aucun modèle/texture custom à créer. L'apparence
 * sera peaufinée plus tard (texture dédiée, accessoires…).
 */
public class MerchantRenderer extends HumanoidMobRenderer<MerchantEntity, PlayerModel<MerchantEntity>> {

    private static final ResourceLocation TEXTURE =
            ResourceLocation.withDefaultNamespace("textures/entity/player/wide/steve.png");

    public MerchantRenderer(EntityRendererProvider.Context context) {
        super(context, new PlayerModel<>(context.bakeLayer(ModelLayers.PLAYER), false), 0.5f);
    }

    @Override
    public ResourceLocation getTextureLocation(MerchantEntity entity) {
        return TEXTURE;
    }
}
