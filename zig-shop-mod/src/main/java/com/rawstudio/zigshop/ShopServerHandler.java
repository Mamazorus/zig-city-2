package com.rawstudio.zigshop;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.rawstudio.zigshop.net.OpenShopPayload;

import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.neoforged.neoforge.network.PacketDistributor;
import net.neoforged.neoforge.network.handling.IPayloadContext;

import javax.annotation.Nullable;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Logique SERVEUR de la BOUTIQUE (remplace le troc villageois natif) : construit le JSON des
 * offres du PNJ envoyé à l'écran, et traite l'achat en un clic.
 *
 * <p><b>Pourquoi une boutique custom&nbsp;?</b> Le troc natif plafonne le paiement à une pile
 * (64) par case de coût, donc un prix supérieur (ex. 150&nbsp;Zig Coins pour une arme) était
 * impossible. Ici, le prix est débité de l'inventaire ENTIER du joueur (toutes les piles),
 * sans aucune limite de quantité.
 *
 * <p>Le prix et le quota font AUTORITÉ côté serveur : {@link com.rawstudio.zigshop.net.BuyOfferPayload}
 * n'envoie que l'identifiant de l'offre ; le serveur relit l'offre depuis Firebase (comme les quêtes) pour
 * que le client ne puisse pas fausser le prix. Les compteurs par joueur / globaux (course)
 * restent portés par {@link MerchantEntity} (persistés en NBT + miroir Firebase pour le launcher).
 */
public final class ShopServerHandler {
    private ShopServerHandler() {}

    /** Portée d'achat autorisée (au carré) : ~8 blocs, marge sur la portée d'interaction. */
    private static final double MAX_DIST_SQR = 64.0;

    /** S→C : ouvre/rafraîchit l'écran de boutique du PNJ pour le joueur. */
    public static void open(ServerPlayer player, MerchantEntity entity, List<ShopOffer> offers) {
        PacketDistributor.sendToPlayer(player, new OpenShopPayload(buildJson(player, entity, offers)));
    }

    /** Sérialise les offres du PNJ + l'état du joueur (soldes, quotas) en JSON pour l'écran. */
    public static String buildJson(ServerPlayer player, MerchantEntity entity, List<ShopOffer> offers) {
        Map<String, Integer> ownedCache = new HashMap<>();
        Map<String, Integer> freq = new HashMap<>();
        JsonArray arr = new JsonArray();
        for (ShopOffer o : offers) {
            int owned = ownedCache.computeIfAbsent(o.input(), id -> countItem(player, id));
            JsonObject j = new JsonObject();
            j.addProperty("id", o.id());
            j.addProperty("input", o.input());
            j.addProperty("inputQty", o.inputQty());
            j.addProperty("output", o.output());
            j.addProperty("outputQty", o.outputQty());
            j.addProperty("maxUses", o.maxUses());
            j.addProperty("usesDone", entity.usesDoneFor(player, o.id()));
            j.addProperty("owned", owned);
            arr.add(j);
            freq.merge(o.input(), 1, Integer::sum);
        }
        // Monnaie « principale » du PNJ = l'item d'entrée le plus fréquent (pour le solde affiché
        // en bas de l'écran). La plupart des offres coûtent la même monnaie (Zig Coin).
        String currency = "";
        int best = -1;
        for (Map.Entry<String, Integer> e : freq.entrySet()) {
            if (e.getValue() > best) {
                best = e.getValue();
                currency = e.getKey();
            }
        }
        JsonObject root = new JsonObject();
        root.addProperty("kind", entity.getShopKind());
        root.addProperty("title", title(entity.getShopKind()));
        root.addProperty("entityId", entity.getId());
        root.addProperty("currency", currency);
        root.addProperty("currencyOwned", currency.isBlank() ? 0 : ownedCache.getOrDefault(currency, 0));
        root.add("offers", arr);
        return root.toString();
    }

    private static String title(String kind) {
        return switch (kind) {
            case "race" -> "Course";
            case "store" -> "Boutique";
            default -> "Shop du jour";
        };
    }

    /**
     * C→S : le joueur achète 1× l'offre {@code offerId} au PNJ {@code entityId}. Résolution de
     * l'entité + portée sur le thread serveur ({@code enqueueWork}), puis relecture asynchrone
     * des offres, puis traitement (vérif quota + fonds, débit, remise) sur le thread serveur.
     */
    public static void buy(IPayloadContext context, int entityId, String offerId) {
        if (!(context.player() instanceof ServerPlayer player)) {
            return;
        }
        context.enqueueWork(() -> {
            MinecraftServer server = player.getServer();
            if (server == null) {
                return;
            }
            Entity e = player.level().getEntity(entityId);
            if (!(e instanceof MerchantEntity entity) || entity.isRemoved()) {
                return; // PNJ disparu (ex. retiré en créatif) : on ignore silencieusement
            }
            if (player.distanceToSqr(entity) > MAX_DIST_SQR) {
                player.sendSystemMessage(Component.literal("§c[Zig Shop] Trop loin du marchand."));
                return;
            }
            String kind = entity.getShopKind();
            var future = "race".equals(kind) ? FirebaseClient.fetchRaceOffers()
                    : "store".equals(kind) ? FirebaseClient.fetchStoreOffers()
                    : FirebaseClient.fetchDayOffers(ZigShopDate.today());
            future.whenComplete((list, err) -> server.execute(() -> {
                if (entity.isRemoved() || !player.isAlive()) {
                    return;
                }
                if (err != null) {
                    player.sendSystemMessage(Component.literal("§c[Zig Shop] Lecture du shop impossible."));
                    return;
                }
                List<ShopOffer> mine = entity.filterOffers(list);
                ShopOffer offer = find(mine, offerId);
                if (offer == null) {
                    player.sendSystemMessage(Component.literal("§c[Zig Shop] Cette offre n'est plus disponible."));
                    open(player, entity, mine);
                    return;
                }
                // Quota (par joueur, ou global en mode course) : le serveur fait autorité.
                int max = offer.maxUses();
                if (max > 0 && entity.usesDoneFor(player, offerId) >= max) {
                    player.sendSystemMessage(Component.literal("§c[Zig Shop] Tu as atteint la limite pour cette offre."));
                    open(player, entity, mine);
                    return;
                }
                Item input = resolveItem(offer.input());
                Item output = resolveItem(offer.output());
                if (input == null || output == null) {
                    player.sendSystemMessage(Component.literal("§c[Zig Shop] Offre invalide."));
                    open(player, entity, mine);
                    return;
                }
                int price = Math.max(1, offer.inputQty());
                int owned = countItem(player, offer.input());
                if (owned < price) {
                    player.sendSystemMessage(Component.literal("§c[Zig Shop] Fonds insuffisants : il te faut " + price + " ")
                            .append(new ItemStack(input).getHoverName())
                            .append(Component.literal(" §7(tu en as " + owned + ")")));
                    open(player, entity, mine);
                    return;
                }
                // Paiement : on débite le prix de l'inventaire ENTIER (aucune limite de pile),
                // puis on remet l'article (drop au sol si l'inventaire est plein).
                removeItems(player, input, price);
                ItemStack out = new ItemStack(output, Math.max(1, offer.outputQty()));
                Component bought = out.getHoverName();
                if (!player.getInventory().add(out)) {
                    player.drop(out, false);
                }
                entity.recordPurchase(player, offerId);
                player.playSound(SoundEvents.VILLAGER_YES, 1.0f, 1.0f);
                player.sendSystemMessage(Component.literal("§a[Zig Shop] Achat : " + Math.max(1, offer.outputQty()) + "× ")
                        .append(bought)
                        .append(Component.literal(" §7pour " + price + " ")).append(new ItemStack(input).getHoverName()));
                open(player, entity, mine); // rafraîchit l'écran (solde + quota à jour)
            }));
        });
    }

    /** Nombre total d'exemplaires de {@code itemId} dans l'inventaire principal + main secondaire. */
    private static int countItem(Player player, String itemId) {
        Item item = resolveItem(itemId);
        if (item == null) {
            return 0;
        }
        int total = 0;
        Inventory inv = player.getInventory();
        for (int i = 0; i < inv.items.size(); i++) {
            ItemStack s = inv.items.get(i);
            if (s.is(item)) {
                total += s.getCount();
            }
        }
        for (int i = 0; i < inv.offhand.size(); i++) {
            ItemStack s = inv.offhand.get(i);
            if (s.is(item)) {
                total += s.getCount();
            }
        }
        return total;
    }

    /** Retire {@code qty} exemplaires de {@code item} (inventaire principal puis main secondaire). */
    private static void removeItems(Player player, Item item, int qty) {
        int remaining = qty;
        Inventory inv = player.getInventory();
        for (int i = 0; i < inv.items.size() && remaining > 0; i++) {
            ItemStack s = inv.items.get(i);
            if (s.is(item)) {
                int take = Math.min(s.getCount(), remaining);
                s.shrink(take); // met la pile à EMPTY quand elle tombe à 0
                remaining -= take;
            }
        }
        for (int i = 0; i < inv.offhand.size() && remaining > 0; i++) {
            ItemStack s = inv.offhand.get(i);
            if (s.is(item)) {
                int take = Math.min(s.getCount(), remaining);
                s.shrink(take);
                remaining -= take;
            }
        }
        inv.setChanged();
    }

    @Nullable
    private static ShopOffer find(List<ShopOffer> list, String offerId) {
        if (list == null) {
            return null;
        }
        for (ShopOffer o : list) {
            if (o.id().equals(offerId)) {
                return o;
            }
        }
        return null;
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
}
