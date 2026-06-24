package com.rawstudio.zigshop;

import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.MinecraftServer;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.trading.ItemCost;
import net.minecraft.world.item.trading.Merchant;
import net.minecraft.world.item.trading.MerchantOffer;
import net.minecraft.world.item.trading.MerchantOffers;
import net.minecraft.world.level.Level;

import javax.annotation.Nullable;
import java.util.List;

/**
 * Marchand connecté au shop du jour. Au clic, lit les offres du jour (Firebase) et
 * ouvre l'interface de troc VANILLA (système marchand) : donner {@code inputQty × input}
 * → recevoir {@code outputQty × output}. Le retrait des items d'entrée et le don de
 * la sortie sont gérés par le menu marchand de Minecraft. L'apparence de l'UI sera
 * peaufinée plus tard (pour l'instant on réutilise l'écran villageois).
 *
 * <p>NoAI + invulnérable + persistant : ne bouge pas, ne meurt pas, ne despawn pas.
 */
public class MerchantEntity extends PathfinderMob implements Merchant {

    @Nullable
    private Player tradingPlayer;
    private MerchantOffers offers = new MerchantOffers();

    public MerchantEntity(EntityType<? extends PathfinderMob> type, Level level) {
        super(type, level);
        this.setPersistenceRequired();
        this.setNoAi(true);
        this.setInvulnerable(true);
        this.setSilent(true);
    }

    public static AttributeSupplier.Builder createAttributes() {
        return Mob.createMobAttributes()
                .add(Attributes.MAX_HEALTH, 20.0)
                .add(Attributes.MOVEMENT_SPEED, 0.0);
    }

    @Override
    protected void registerGoals() {
        // PNJ statique : aucun comportement.
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
        // Lecture asynchrone des offres du jour, puis ouverture du menu sur le thread serveur.
        FirebaseClient.fetchDayOffers(ZigShopDate.today()).whenComplete((list, err) -> server.execute(() -> {
            if (this.isRemoved() || !player.isAlive()) {
                return;
            }
            if (err != null) {
                player.sendSystemMessage(Component.literal("§c[Zig Shop] Lecture du shop impossible."));
                return;
            }
            this.offers = buildOffers(list);
            if (this.offers.isEmpty()) {
                player.sendSystemMessage(Component.literal("§7[Zig Shop] Aucune offre aujourd'hui."));
                return;
            }
            this.setTradingPlayer(player);
            this.openTradingScreen(player, this.getDisplayName(), 1);
        }));
        return InteractionResult.CONSUME;
    }

    /** Convertit les offres Firebase en offres marchandes. Items introuvables ignorés. */
    private static MerchantOffers buildOffers(List<ShopOffer> list) {
        MerchantOffers result = new MerchantOffers();
        if (list == null) {
            return result;
        }
        for (ShopOffer o : list) {
            Item input = resolveItem(o.input());
            Item output = resolveItem(o.output());
            if (input == null || output == null) {
                continue;
            }
            ItemCost cost = new ItemCost(input, Math.max(1, o.inputQty()));
            ItemStack out = new ItemStack(output, Math.max(1, o.outputQty()));
            // maxUses très élevé = marchand qui ne s'épuise pas ; xp 0 ; pas de variation de prix.
            result.add(new MerchantOffer(cost, out, Integer.MAX_VALUE, 0, 0.0f));
        }
        return result;
    }

    /** Résout un identifiant d'item ; null si introuvable (le registre ITEM est defaulté sur AIR). */
    @Nullable
    private static Item resolveItem(String id) {
        if (id == null || id.isBlank()) {
            return null;
        }
        ResourceLocation rl = ResourceLocation.tryParse(id);
        if (rl == null) {
            return null;
        }
        Item item = BuiltInRegistries.ITEM.get(rl);
        return (item == Items.AIR && !"minecraft:air".equals(id)) ? null : item;
    }

    // ─── Merchant ───────────────────────────────────────────────────────────────
    @Override
    public void setTradingPlayer(@Nullable Player player) {
        this.tradingPlayer = player;
    }

    @Nullable
    @Override
    public Player getTradingPlayer() {
        return this.tradingPlayer;
    }

    @Override
    public MerchantOffers getOffers() {
        return this.offers;
    }

    @Override
    public void overrideOffers(MerchantOffers newOffers) {
        this.offers = newOffers;
    }

    @Override
    public void notifyTrade(MerchantOffer offer) {
        offer.increaseUses();
    }

    @Override
    public void notifyTradeUpdated(ItemStack stack) {
        // rien
    }

    @Override
    public int getVillagerXp() {
        return 0;
    }

    @Override
    public void overrideXp(int xp) {
        // pas d'XP
    }

    @Override
    public boolean showProgressBar() {
        return false;
    }

    @Override
    public SoundEvent getNotifyTradeSound() {
        return SoundEvents.VILLAGER_YES;
    }

    @Override
    public boolean isClientSide() {
        return this.level().isClientSide;
    }
}
