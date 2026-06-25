package com.rawstudio.zigshop.client;

import com.rawstudio.zigshop.MerchantEntity;
import com.rawstudio.zigshop.MerchantSkins;

import net.minecraft.client.model.PlayerModel;
import net.minecraft.client.model.geom.ModelLayers;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.HumanoidMobRenderer;
import net.minecraft.resources.ResourceLocation;

/**
 * Rendu du marchand : modèle JOUEUR vanilla + skin choisi par PNJ. Le skin provient des
 * textures embarquées du mod (voir {@link MerchantSkins}, dossier
 * {@code assets/zigshop/textures/entity/}) ; à défaut (nom vide ou inconnu) on retombe sur
 * le Steve vanilla.
 */
public class MerchantRenderer extends HumanoidMobRenderer<MerchantEntity, PlayerModel<MerchantEntity>> {

    private static final ResourceLocation STEVE =
            ResourceLocation.withDefaultNamespace("textures/entity/player/wide/steve.png");

    public MerchantRenderer(EntityRendererProvider.Context context) {
        super(context, new PlayerModel<>(context.bakeLayer(ModelLayers.PLAYER), false), 0.5f);
    }

    @Override
    public ResourceLocation getTextureLocation(MerchantEntity entity) {
        ResourceLocation custom = MerchantSkins.texture(entity.getSkin());
        return custom != null ? custom : STEVE;
    }
}
