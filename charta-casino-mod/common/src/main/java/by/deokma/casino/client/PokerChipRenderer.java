package by.deokma.casino.client;

import com.mojang.blaze3d.vertex.PoseStack;
import com.mojang.blaze3d.vertex.VertexConsumer;
import by.deokma.casino.CasinoAddon;
import dev.lucaargolo.charta.client.ChartaModClient;
import dev.lucaargolo.charta.common.block.entity.CardTableBlockEntity;
import dev.lucaargolo.charta.common.game.api.GameSlot;
import net.minecraft.client.renderer.RenderType;
import net.minecraft.client.renderer.LightTexture;
import net.minecraft.client.renderer.MultiBufferSource;
import net.minecraft.client.renderer.texture.OverlayTexture;
import net.minecraft.core.BlockPos;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.util.Mth;

/**
 * Renders poker chip stacks on the card table block for Texas Hold'em.
 * Ported from the Deokma/charta fork's CardTableBlockEntityRenderer.
 */
public final class PokerChipRenderer {

    private PokerChipRenderer() {}

    private static final int[][] CHIP_COLORS = {
            { 0xFFAAAAAA, 0xFF888888 }, // 0 white
            { 0xFFCC2222, 0xFFAA1111 }, // 1 red
            { 0xFF228822, 0xFF117711 }, // 2 green
            { 0xFF222222, 0xFF111111 }, // 3 black
            { 0xFF7722CC, 0xFF6611BB }, // 4 purple
            { 0xFF2255CC, 0xFF1144AA }, // 5 blue
    };
    private static final int[] CHIP_ALLIN  = { 0xFFFFCC00, 0xFFFFAA00 };
    private static final int[] CHIP_FOLDED = { 0xFF555555, 0xFF444444 };
    private static final ResourceLocation WHITE_TEXTURE =
            ResourceLocation.fromNamespaceAndPath("minecraft", "textures/misc/white.png");

    public static void register() {
        ChartaModClient.registerExtraRenderer(
                gameType -> gameType == CasinoAddon.TEXAS_HOLDEM_GAME.get(),
                (blockEntity, partialTick, poseStack, bufferSource, packedLight, packedOverlay) ->
                        render(blockEntity, partialTick, poseStack, bufferSource, packedLight, packedOverlay)
        );
    }

    private static void render(CardTableBlockEntity blockEntity, float partialTick,
                               PoseStack poseStack, MultiBufferSource bufferSource,
                               int packedLight, int packedOverlay) {
        BlockPos tablePos = blockEntity.getBlockPos();
        // Only render chips if we have poker chip data for this table
        // (data is only populated by TexasHoldemScreen, not Blackjack)
        int[] chips = CasinoClientData.TABLE_POKER_CHIPS.get(tablePos);
        Integer gameSlotCountObj = CasinoClientData.TABLE_POKER_GAME_SLOT_COUNT.get(tablePos);
        if (chips == null || gameSlotCountObj == null) return;

        int gameSlotCount = gameSlotCountObj;
        int gameSlots     = blockEntity.getSlotCount();
        int foldedMask    = CasinoClientData.TABLE_POKER_FOLDED.getOrDefault(tablePos, 0);
        int allInMask     = CasinoClientData.TABLE_POKER_ALLIN.getOrDefault(tablePos, 0);
        int startingChips = CasinoClientData.TABLE_POKER_STARTING_CHIPS.getOrDefault(tablePos, 1000);
        if (startingChips <= 0) startingChips = 1000;

        final int[]   STACK_COLORS     = { 1, 5, 2 };
        final float[] SIDE_OFF         = { -11f, 11f, 0f };
        final float[] SIDE_OFF_DEPTH   = { -5f,  5f,  0f };
        final float[] fractions        = { 1.0f, 0.85f, 0.70f };
        final int     MAX_DISCS        = 12;

        for (int pi = 0; pi < chips.length; pi++) {
            int handSlotIndex = gameSlotCount + pi;
            if (handSlotIndex >= gameSlots) break;

            int totalChips = chips[pi];
            boolean isFolded = (foldedMask & (1 << pi)) != 0;
            boolean isAllIn  = (allInMask  & (1 << pi)) != 0;
            if (totalChips <= 0) continue;

            float pct      = (float) totalChips / startingChips;
            int baseDiscs  = Math.max(1, Math.round(pct * MAX_DISCS));

            GameSlot handSlot = blockEntity.getSlot(handSlotIndex);
            float hx = handSlot.lerpX(partialTick);
            float hy = handSlot.lerpY(partialTick);

            final float HAND_TO_EDGE = 147.5f;
            final float DEPTH_INSET  = 2f;

            float tableCX = 80f + blockEntity.centerOffset.x * 160f;
            float tableCY = 80f + blockEntity.centerOffset.y * 160f;

            float dx = tableCX - hx;
            float dy = tableCY - hy;
            float dist = (float) Math.sqrt(dx * dx + dy * dy);
            float nx = dx / dist;
            float ny = dy / dist;
            float sideX = -ny;
            float sideY =  nx;

            float anchorX = hx + nx * (HAND_TO_EDGE + DEPTH_INSET);
            float anchorY = hy + ny * (HAND_TO_EDGE + DEPTH_INSET);

            for (int s = 0; s < STACK_COLORS.length; s++) {
                int discs = Math.max(1, Math.round(baseDiscs * fractions[s]));
                float cx  = anchorX + sideX * SIDE_OFF[s];
                float cy  = anchorY + sideY * SIDE_OFF[s];
                if (Math.abs(sideX) >= Math.abs(sideY)) {
                    cy += SIDE_OFF_DEPTH[s];
                } else {
                    cx += SIDE_OFF_DEPTH[s];
                }
                drawChipStack3D(poseStack, bufferSource, packedLight,
                        cx, cy, discs, isFolded, isAllIn, STACK_COLORS[s]);
            }
        }
    }

    private static void drawChipStack3D(PoseStack poseStack, MultiBufferSource bufferSource, int packedLight,
                                        float px, float py, int numDiscs,
                                        boolean folded, boolean allIn, int colorIndex) {
        if (numDiscs <= 0) return;

        int[] colorPair = folded ? CHIP_FOLDED
                : allIn  ? CHIP_ALLIN
                : CHIP_COLORS[Mth.clamp(colorIndex, 0, CHIP_COLORS.length - 1)];

        final float DISC_R   = 8f;
        final float DISC_H   = 2.5f;
        final float DISC_GAP = 0.4f;
        final float STEP     = DISC_H + DISC_GAP;

        poseStack.pushPose();
        poseStack.scale(1f / 160f, 1f / 160f, 1f / 160f);

        VertexConsumer consumer = bufferSource.getBuffer(
                RenderType.entityTranslucent(WHITE_TEXTURE));

        float x0 = px - DISC_R, x1 = px + DISC_R;
        float y0 = py - DISC_R, y1 = py + DISC_R;

        for (int d = 0; d < numDiscs; d++) {
            float zb = d * STEP;
            float zt = zb + DISC_H;

            int bodyColor = (d % 2 == 0) ? colorPair[0] : colorPair[1];
            float r  = ((bodyColor >> 16) & 0xFF) / 255f;
            float gr = ((bodyColor >>  8) & 0xFF) / 255f;
            float b  = ( bodyColor        & 0xFF) / 255f;

            PoseStack.Pose e = poseStack.last();

            drawQuad(e, consumer, x0, y0, zb, x1, y0, zb, x1, y0, zt, x0, y0, zt, r*.7f, gr*.7f, b*.7f, 1f, LightTexture.FULL_BRIGHT);
            drawQuad(e, consumer, x1, y0, zb, x1, y1, zb, x1, y1, zt, x1, y0, zt, r*.7f, gr*.7f, b*.7f, 1f, LightTexture.FULL_BRIGHT);
            drawQuad(e, consumer, x1, y1, zb, x0, y1, zb, x0, y1, zt, x1, y1, zt, r*.7f, gr*.7f, b*.7f, 1f, LightTexture.FULL_BRIGHT);
            drawQuad(e, consumer, x0, y1, zb, x0, y0, zb, x0, y0, zt, x0, y1, zt, r*.7f, gr*.7f, b*.7f, 1f, LightTexture.FULL_BRIGHT);
            drawQuad(e, consumer, x0, y0, zt, x1, y0, zt, x1, y1, zt, x0, y1, zt, r, gr, b, 1f, LightTexture.FULL_BRIGHT);
        }

        poseStack.popPose();
    }

    private static void drawQuad(PoseStack.Pose e, VertexConsumer vc,
                                 float x0, float y0, float z0,
                                 float x1, float y1, float z1,
                                 float x2, float y2, float z2,
                                 float x3, float y3, float z3,
                                 float r, float g, float b, float a, int light) {
        float ux = x1 - x0;
        float uy = y1 - y0;
        float uz = z1 - z0;
        float vx = x2 - x0;
        float vy = y2 - y0;
        float vz = z2 - z0;
        float nx = uy * vz - uz * vy;
        float ny = uz * vx - ux * vz;
        float nz = ux * vy - uy * vx;
        float len = Mth.sqrt(nx * nx + ny * ny + nz * nz);
        if (len > 1.0e-6f) {
            nx /= len;
            ny /= len;
            nz /= len;
        } else {
            nx = 0f;
            ny = 0f;
            nz = 1f;
        }

        addVertex(e, vc, x0, y0, z0, 0f, 0f, r, g, b, a, light, nx, ny, nz);
        addVertex(e, vc, x1, y1, z1, 1f, 0f, r, g, b, a, light, nx, ny, nz);
        addVertex(e, vc, x2, y2, z2, 1f, 1f, r, g, b, a, light, nx, ny, nz);
        addVertex(e, vc, x3, y3, z3, 0f, 1f, r, g, b, a, light, nx, ny, nz);
    }

    private static void addVertex(PoseStack.Pose pose, VertexConsumer vc,
                                  float x, float y, float z,
                                  float u, float v,
                                  float r, float g, float b, float a,
                                  int light,
                                  float nx, float ny, float nz) {
        vc.addVertex(pose.pose(), x, y, z)
                .setColor(r, g, b, a)
                .setUv(u, v)
                .setOverlay(OverlayTexture.NO_OVERLAY)
                .setLight(light)
                .setNormal(pose, nx, ny, nz);
    }
}
