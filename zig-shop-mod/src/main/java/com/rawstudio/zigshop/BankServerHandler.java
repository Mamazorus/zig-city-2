package com.rawstudio.zigshop;

import com.google.gson.JsonArray;
import com.google.gson.JsonObject;
import com.rawstudio.zigshop.net.OpenBankPayload;

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

/**
 * Logique SERVEUR de la BANQUE : construit le JSON envoyé à l'écran, traite dépôt / retrait /
 * fermeture. Comme {@link ShopServerHandler}, le prix (ici : les frais de retrait) et les taux
 * font AUTORITÉ côté serveur — la config Firebase est relue à chaque action ; le client n'envoie
 * que l'action et le montant demandé, jamais un solde ou un taux.
 */
public final class BankServerHandler {
    private BankServerHandler() {}

    /** Portée d'action autorisée (au carré) : ~8 blocs, comme la boutique. */
    private static final double MAX_DIST_SQR = 64.0;

    /** S→C : ouvre/rafraîchit l'écran de banque pour le joueur. {@code entityId} = identifiant
     *  réseau du PNJ banquier qui a servi à ouvrir l'écran, renvoyé tel quel par le client dans
     *  chaque action suivante (cf. {@link #handle}) pour la revérification de portée ; -1 = accès
     *  SANS PNJ (raccourci Zig Phone, cf. {@code BankPhoneEvents}) — aucune portée à vérifier. */
    public static void open(ServerPlayer player, int entityId, FirebaseClient.BankConfig cfg) {
        PacketDistributor.sendToPlayer(player, new OpenBankPayload(buildJson(player, entityId, cfg)));
    }

    /** Sérialise les soldes du joueur + l'historique + les réglages affichables en JSON pour l'écran.
     *  Le delta « depuis la dernière visite » est lu SANS être consommé ici (cf. {@code close}
     *  dans {@link #handle}) : il reste stable tant que l'écran reste ouvert, y compris après
     *  un rafraîchissement suite à un dépôt/retrait. */
    public static String buildJson(ServerPlayer player, int entityId, FirebaseClient.BankConfig cfg) {
        MinecraftServer server = player.getServer();
        BankAccountData data = BankAccountData.get(server);
        String name = player.getGameProfile().getName();
        BankAccountData.Account acc = data.account(player.getUUID(), name);

        JsonObject root = new JsonObject();
        root.addProperty("entityId", entityId);
        root.addProperty("currencyItem", cfg.currencyItem());
        root.addProperty("currencyOwned", countItem(player, cfg.currencyItem()));
        root.addProperty("savingsEligible", acc.savingsEligible);
        root.addProperty("savingsPending", acc.savingsPending);
        root.addProperty("riskyEligible", acc.riskyEligible);
        root.addProperty("riskyPending", acc.riskyPending);
        root.addProperty("seenDelta", data.peekSeenDelta(player.getUUID(), name));
        root.addProperty("savingsRatePct", cfg.savingsRatePct());
        root.addProperty("savingsCap", cfg.savingsCap());
        root.addProperty("savingsPeriodHours", cfg.savingsPeriodHours());
        root.addProperty("riskyMinPct", cfg.riskyMinPct());
        root.addProperty("riskyMaxPct", cfg.riskyMaxPct());
        root.addProperty("riskyPeriodHours", cfg.riskyPeriodHours());
        root.addProperty("withdrawFeePct", cfg.withdrawFeePct());
        JsonArray hist = new JsonArray();
        for (BankAccountData.HistoryEntry h : acc.history) {
            JsonObject ho = new JsonObject();
            ho.addProperty("date", h.date());
            ho.addProperty("savingsDelta", h.savingsDelta());
            ho.addProperty("riskyDelta", h.riskyDelta());
            hist.add(ho);
        }
        root.add("history", hist);
        root.add("riskyHistory", data.riskyCandlesJson());
        return root.toString();
    }

    /**
     * C→S : dépôt, retrait ou fermeture de l'écran. Relit la config Firebase à jour avant de
     * traiter un dépôt/retrait (comme {@link ShopServerHandler#buy}), puis renvoie l'écran
     * rafraîchi. "close" ne renvoie rien (l'écran est déjà fermé côté client) : il se contente
     * d'avancer le repère « dernière visite » ({@link BankAccountData#markSeen}).
     *
     * <p>{@code entityId < 0} (accès Zig Phone, sans PNJ) saute la vérification de portée —
     * voir {@link #open}.
     */
    public static void handle(IPayloadContext context, int entityId, String action, String accountType, int amount) {
        if (!(context.player() instanceof ServerPlayer player)) {
            return;
        }
        context.enqueueWork(() -> {
            MinecraftServer server = player.getServer();
            if (server == null) {
                return;
            }
            BankAccountData data = BankAccountData.get(server);
            if ("close".equals(action)) {
                data.markSeen(player.getUUID(), player.getGameProfile().getName());
                return;
            }
            if (entityId >= 0) {
                Entity e = player.level().getEntity(entityId);
                if (!(e instanceof MerchantEntity entity) || entity.isRemoved()) {
                    return; // PNJ disparu (ex. retiré en créatif) : on ignore silencieusement
                }
                if (player.distanceToSqr(entity) > MAX_DIST_SQR) {
                    // "refresh" = ping silencieux périodique (cf. BankScreen#tick) : pas de message
                    // d'erreur si le joueur s'est simplement éloigné entre deux pings.
                    if (!"refresh".equals(action)) {
                        player.sendSystemMessage(Component.literal("§c[Banque] Trop loin du banquier."));
                    }
                    return;
                }
            }
            boolean savings = !"risky".equals(accountType);
            FirebaseClient.fetchBankConfig().whenComplete((cfg0, err) -> server.execute(() -> {
                if (!player.isAlive()) {
                    return;
                }
                FirebaseClient.BankConfig cfg = (err != null || cfg0 == null) ? FirebaseClient.BankConfig.DEFAULT : cfg0;
                if ("deposit".equals(action)) {
                    doDeposit(player, data, cfg, savings, amount);
                } else if ("withdraw".equals(action)) {
                    doWithdraw(server, player, data, cfg, savings, amount);
                }
                open(player, entityId, cfg); // rafraîchit l'écran (soldes à jour)
            }));
        });
    }

    private static void doDeposit(ServerPlayer player, BankAccountData data, FirebaseClient.BankConfig cfg, boolean savings, int amount) {
        if (amount <= 0) {
            return;
        }
        Item currency = resolveItem(cfg.currencyItem());
        if (currency == null) {
            player.sendSystemMessage(Component.literal("§c[Banque] Monnaie introuvable (config)."));
            return;
        }
        int give = Math.min(countItem(player, cfg.currencyItem()), amount);
        if (give <= 0) {
            player.sendSystemMessage(Component.literal("§c[Banque] Tu n'as pas de ")
                    .append(new ItemStack(currency).getHoverName()).append(Component.literal(".")));
            return;
        }
        removeItems(player, currency, give);
        data.deposit(player.getUUID(), player.getGameProfile().getName(), savings, give);
        player.playSound(SoundEvents.VILLAGER_YES, 1.0f, 1.0f);
        player.sendSystemMessage(Component.literal("§a[Banque] Depot : " + give + " ")
                .append(new ItemStack(currency).getHoverName())
                .append(Component.literal(savings ? " §7(epargne)" : " §7(risque)")));
    }

    private static void doWithdraw(MinecraftServer server, ServerPlayer player, BankAccountData data, FirebaseClient.BankConfig cfg, boolean savings, int amount) {
        if (amount <= 0) {
            return;
        }
        Item currency = resolveItem(cfg.currencyItem());
        if (currency == null) {
            player.sendSystemMessage(Component.literal("§c[Banque] Monnaie introuvable (config)."));
            return;
        }
        BankAccountData.WithdrawResult result = data.withdraw(player.getUUID(), savings, amount, cfg.withdrawFeePct());
        if (result == null) {
            player.sendSystemMessage(Component.literal("§c[Banque] Solde insuffisant."));
            return;
        }
        if (result.net() > 0) {
            // (int) sans risque : net <= amount, et amount est deja un int (parametre reseau).
            ItemStack out = new ItemStack(currency, (int) result.net());
            if (!player.getInventory().add(out)) {
                player.drop(out, false);
            }
        }
        data.creditFee(server, cfg.feeRecipient(), result.fee());
        player.playSound(SoundEvents.VILLAGER_YES, 1.0f, 1.0f);
        Component feeMsg = result.fee() > 0 ? Component.literal(" §7(frais : " + result.fee() + ")") : Component.literal("");
        player.sendSystemMessage(Component.literal("§a[Banque] Retrait : " + result.net() + " ")
                .append(new ItemStack(currency).getHoverName())
                .append(Component.literal(savings ? " §7(epargne)" : " §7(risque)"))
                .append(feeMsg));
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
                s.shrink(take);
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
