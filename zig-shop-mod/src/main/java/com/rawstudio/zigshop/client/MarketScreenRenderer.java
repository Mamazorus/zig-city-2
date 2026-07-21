package com.rawstudio.zigshop.client;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import com.mojang.math.Axis;
import com.rawstudio.zigshop.MarketScreenEntity;

import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.entity.EntityRendererProvider;
import net.minecraft.client.renderer.entity.EntityRenderer;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.resources.ResourceLocation;

import org.joml.Matrix3f;
import org.joml.Matrix4f;
import org.joml.Vector3f;

/**
 * Dessine {@code MarketScreenEntity} : un simple quad texturé (4 blocs de large × 5 de haut),
 * plaqué à la position/orientation de l'entité, texturé avec la texture DYNAMIQUE du graphique
 * (cf. {@link MarketChartTexture}) — pas de modèle bake, juste 4 sommets bruts, comme un cadre
 * géant orienté vers la direction où pointait l'admin au moment du {@code /zigshop spawn}.
 */
public class MarketScreenRenderer extends EntityRenderer<MarketScreenEntity> {

    private static final float WIDTH_BLOCKS = 4.0f;
    private static final float HEIGHT_BLOCKS = 5.0f;

    public MarketScreenRenderer(EntityRendererProvider.Context context) {
        super(context);
    }

    @Override
    public ResourceLocation getTextureLocation(MarketScreenEntity entity) {
        return MarketChartTexture.location();
    }

    @Override
    public void render(MarketScreenEntity entity, float entityYaw, float partialTicks,
                        PoseStack poseStack, MultiBufferSource buffer, int packedLight) {
        poseStack.pushPose();
        poseStack.mulPose(Axis.YP.rotationDegrees(180.0f - entityYaw));

        float halfWidth = WIDTH_BLOCKS / 2.0f;
        VertexConsumer vc = buffer.getBuffer(RenderType.entityCutoutNoCull(getTextureLocation(entity)));
        Matrix4f mat = poseStack.last().pose();
        Matrix3f nmat = poseStack.last().normal();
        Vector3f normal = new Vector3f(0, 0, 1).mul(nmat);

        quadVertex(vc, mat, -halfWidth, 0.0f, 0.0f, 0.0f, 1.0f, packedLight, normal);
        quadVertex(vc, mat, halfWidth, 0.0f, 0.0f, 1.0f, 1.0f, packedLight, normal);
        quadVertex(vc, mat, halfWidth, HEIGHT_BLOCKS, 0.0f, 1.0f, 0.0f, packedLight, normal);
        quadVertex(vc, mat, -halfWidth, HEIGHT_BLOCKS, 0.0f, 0.0f, 0.0f, packedLight, normal);

        poseStack.popPose();
        super.render(entity, entityYaw, partialTicks, poseStack, buffer, packedLight);
    }

    private static void quadVertex(VertexConsumer vc, Matrix4f mat, float x, float y, float z,
                                    float u, float v, int light, Vector3f normal) {
        vc.addVertex(mat, x, y, z)
                .setColor(255, 255, 255, 255)
                .setUv(u, v)
                .setOverlay(OverlayTexture.NO_OVERLAY)
                .setLight(light)
                .setNormal(normal.x, normal.y, normal.z);
    }
}
