package net.bogismok.thedirtystuff.event;

import it.unimi.dsi.fastutil.ints.Int2ObjectMap;
import net.bogismok.thedirtystuff.Config;
import net.bogismok.thedirtystuff.TheDirtyStuff;
import net.bogismok.thedirtystuff.item.ModItems;
import net.minecraft.core.registries.Registries;
import net.minecraft.resources.ResourceKey;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.world.entity.npc.VillagerProfession;
import net.minecraft.world.entity.npc.VillagerTrades;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.trading.ItemCost;
import net.minecraft.world.item.trading.MerchantOffer;
import net.minecraft.world.level.storage.loot.LootPool;
import net.minecraft.world.level.storage.loot.LootTable;
import net.minecraft.world.level.storage.loot.entries.LootItem;
import net.minecraft.world.level.storage.loot.providers.number.ConstantValue;
import net.neoforged.bus.api.SubscribeEvent;
import net.neoforged.fml.common.EventBusSubscriber;
import net.neoforged.neoforge.event.LootTableLoadEvent;
import net.neoforged.neoforge.event.server.ServerStartedEvent;
import net.neoforged.neoforge.event.village.VillagerTradesEvent;

import java.util.List;

@EventBusSubscriber(modid = TheDirtyStuff.MOD_ID)
public class ModEvents {

    private static final ResourceKey<LootTable> VILLAGE_PLAINS_HOUSE = ResourceKey.create(
            Registries.LOOT_TABLE, ResourceLocation.withDefaultNamespace("chests/village/village_plains_house"));

    @SubscribeEvent
    public static void addCustomTrades(VillagerTradesEvent event) {
        if(event.getType() == VillagerProfession.FARMER) {
            Int2ObjectMap<List<VillagerTrades.ItemListing>> trades = event.getTrades();

            trades.get(2).add((pTrader, pRandom) -> new MerchantOffer(
                    new ItemCost(ModItems.TOBACCO_LEAVES_PACKAGE.get(), 1),
                    new ItemStack(Items.EMERALD, 2),
                    16, 4, 0.02f));
        }
    }

    // Seule source de graines de tabac en jeu (aucune vente villageois dans l'autre sens) :
    // sans cet ajout, la boucle de culture ne peut jamais demarrer.
    @SubscribeEvent
    public static void addTobaccoSeedsToVillageLoot(LootTableLoadEvent event) {
        if (event.getName().equals(VILLAGE_PLAINS_HOUSE)) {
            LootPool pool = LootPool.lootPool()
                    .setRolls(ConstantValue.exactly(1))
                    .add(LootItem.lootTableItem(ModItems.TOBACCO_SEEDS.get()))
                    .build();

            event.getTable().addPool(pool);
        }
    }

    @SubscribeEvent
    public static void onServerStarted(ServerStartedEvent event) {
        Config.preload();
    }
}
