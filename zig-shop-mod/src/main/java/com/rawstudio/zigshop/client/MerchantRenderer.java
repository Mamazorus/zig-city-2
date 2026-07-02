package com.rawstudio.zigshop.client;

import com.mojang.blaze3d.vertex.PoseStack;
import com.rawstudio.zigshop.MerchantEntity;
import com.rawstudio.zigshop.MerchantSkins;

import net.minecraft.client.model.PlayerModel;
import net.minecraft.client.model.geom.ModelLayers;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.HumanoidMobRenderer;
import net.minecraft.resources.ResourceLocation;

/**
 * Rendu du marchand : modèle JOUEUR vanilla + skin par PNJ.
 *
 * <p>Le skin d'un PNJ peut être :
 * <ul>
 *   <li>un <b>preset embarqué</b> du mod (voir {@link MerchantSkins}), choisi par son nom ;</li>
 *   <li>une <b>URL http(s)</b> d'image PNG 64×64 assignée depuis le launcher, téléchargée et
 *       rendue dynamiquement (voir {@link NpcSkinTextures}).</li>
 * </ul>
 * À défaut (nom vide/inconnu, ou skin distant pas encore chargé) on retombe sur le Steve vanilla.
 *
 * <p>Deux modèles sont bakés — classique (Steve) et fin (Alex) — puis sélectionnés par PNJ selon
 * {@link MerchantEntity#isSlimSkin()} (n'a d'effet que pour un skin par URL).
 */
public class MerchantRenderer extends HumanoidMobRenderer<MerchantEntity, PlayerModel<MerchantEntity>> {

    private static final ResourceLocation STEVE =
            ResourceLocation.withDefaultNamespace("textures/entity/player/wide/steve.png");

    private final PlayerModel<MerchantEntity> wideModel;
    private final PlayerModel<MerchantEntity> slimModel;

    public MerchantRenderer(EntityRendererProvider.Context context) {
        super(context, new PlayerModel<>(context.bakeLayer(ModelLayers.PLAYER), false), 0.5f);
        this.wideModel = this.model; // le modèle classique passé à super()
        this.slimModel = new PlayerModel<>(context.bakeLayer(ModelLayers.PLAYER_SLIM), true);
    }

    @Override
    public void render(MerchantEntity entity, float entityYaw, float partialTicks,
                       PoseStack poseStack, MultiBufferSource buffer, int packedLight) {
        // Sélection du modèle (classique/fin) selon le variant du skin, avant le rendu.
        this.model = entity.isSlimSkin() ? this.slimModel : this.wideModel;
        super.render(entity, entityYaw, partialTicks, poseStack, buffer, packedLight);
    }

    @Override
    public ResourceLocation getTextureLocation(MerchantEntity entity) {
        String skin = entity.getSkin();
        if (skin != null && (skin.startsWith("http://") || skin.startsWith("https://"))) {
            ResourceLocation dynamic = NpcSkinTextures.get(skin);
            return dynamic != null ? dynamic : STEVE; // Steve le temps du téléchargement
        }
        ResourceLocation preset = MerchantSkins.texture(skin);
        return preset != null ? preset : STEVE;
    }
}
