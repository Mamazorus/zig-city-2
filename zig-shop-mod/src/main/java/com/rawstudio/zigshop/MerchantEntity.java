package com.rawstudio.zigshop;

import net.minecraft.network.chat.Component;
import net.minecraft.server.MinecraftServer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;

/**
 * Marchand statique. Phase 2 : un clic affiche les offres du jour (lues sur Firebase)
 * dans le chat du joueur. Phase 3 ouvrira un vrai menu d'échange.
 *
 * <p>NoAI + invulnérable + persistant : ne bouge pas, ne meurt pas, ne despawn pas.
 */
public class MerchantEntity extends PathfinderMob {

    public MerchantEntity(EntityType<? extends PathfinderMob> type, Level level) {
        super(type, level);
        this.setPersistenceRequired();
        this.setNoAi(true);
        this.setInvulnerable(true);
        this.setSilent(true);
    }

    /** Attributs enregistrés via EntityAttributeCreationEvent (cf. ZigShop). */
    public static AttributeSupplier.Builder createAttributes() {
        return Mob.createMobAttributes()
                .add(Attributes.MAX_HEALTH, 20.0)
                .add(Attributes.MOVEMENT_SPEED, 0.0);
    }

    @Override
    protected void registerGoals() {
        // Aucun comportement : PNJ statique.
    }

    @Override
    public boolean removeWhenFarAway(double distanceToClosestPlayer) {
        return false;
    }

    @Override
    public boolean isPushable() {
        return false;
    }

    @Override
    protected InteractionResult mobInteract(Player player, InteractionHand hand) {
        if (this.level().isClientSide) {
            return InteractionResult.SUCCESS;
        }
        MinecraftServer server = this.level().getServer();
        if (server == null) {
            return InteractionResult.CONSUME;
        }
        final String date = ZigShopDate.today();
        player.sendSystemMessage(Component.literal("§6[Zig Shop] Offres du jour :"));
        FirebaseClient.fetchDayOffers(date).whenComplete((offers, err) -> server.execute(() -> {
            if (err != null) {
                player.sendSystemMessage(Component.literal("§c[Zig Shop] Lecture du shop impossible."));
                return;
            }
            if (offers.isEmpty()) {
                player.sendSystemMessage(Component.literal("§7[Zig Shop] Aucune offre aujourd'hui."));
                return;
            }
            for (ShopOffer o : offers) {
                player.sendSystemMessage(Component.literal(
                        "  §a" + o.inputQty() + "× §f" + o.input()
                                + " §7→ §a" + o.outputQty() + "× §f" + o.output()));
            }
        }));
        return InteractionResult.CONSUME;
    }
}
