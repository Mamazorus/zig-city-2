package com.rawstudio.zigshop.command;

import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.StringArgumentType;
import com.mojang.brigadier.context.CommandContext;
import com.mojang.brigadier.suggestion.SuggestionProvider;
import com.rawstudio.zigshop.FirebaseClient;
import com.rawstudio.zigshop.MerchantEntity;
import com.rawstudio.zigshop.MerchantSkins;
import com.rawstudio.zigshop.ModEntities;
import com.rawstudio.zigshop.ShopOffer;
import com.rawstudio.zigshop.ZigShopDate;

import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.commands.SharedSuggestionProvider;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.entity.projectile.ProjectileUtil;
import net.minecraft.world.phys.AABB;
import net.minecraft.world.phys.EntityHitResult;
import net.minecraft.world.phys.Vec3;

/**
 * Commande de test de la phase 1 : {@code /zigshop today} lit le shop du jour depuis
 * Firebase et affiche les offres dans le chat. Valide la chaîne compile → chargement
 * → lecture Firebase avant d'attaquer l'entité et les échanges.
 */
public final class ZigShopCommand {
    private ZigShopCommand() {}

    /** Autocomplétion de /zigshop skin <nom> : propose les skins embarqués connus. */
    private static final SuggestionProvider<CommandSourceStack> SKIN_SUGGESTIONS =
            (ctx, builder) -> SharedSuggestionProvider.suggest(MerchantSkins.NAMES, builder);

    public static void register(CommandDispatcher<CommandSourceStack> dispatcher) {
        dispatcher.register(Commands.literal("zigshop")
                .requires(src -> src.hasPermission(2)) // opérateur
                .then(Commands.literal("today").executes(ZigShopCommand::today))
                .then(Commands.literal("spawn")
                        .executes(ctx -> spawn(ctx, "daily"))
                        .then(Commands.literal("daily").executes(ctx -> spawn(ctx, "daily")))
                        .then(Commands.literal("store").executes(ctx -> spawn(ctx, "store")))
                        .then(Commands.literal("race").executes(ctx -> spawn(ctx, "race")))
                        .then(Commands.literal("quest").executes(ctx -> spawn(ctx, "quest")))
                        .then(Commands.literal("questspecial").executes(ctx -> spawn(ctx, "questspecial"))))
                .then(Commands.literal("skin")
                        .then(Commands.argument("nom", StringArgumentType.word())
                                .suggests(SKIN_SUGGESTIONS)
                                .executes(ZigShopCommand::setSkin))));
    }

    /** Fait apparaître un marchand ("daily" = shop du jour, "store" = boutique) à la position de l'exécutant. */
    private static int spawn(CommandContext<CommandSourceStack> ctx, String kind) {
        CommandSourceStack src = ctx.getSource();
        ServerLevel level = src.getLevel();
        Vec3 pos = src.getPosition();
        MerchantEntity merchant = ModEntities.MERCHANT.get().spawn(level, BlockPos.containing(pos), MobSpawnType.COMMAND);
        if (merchant == null) {
            src.sendFailure(Component.literal("[Zig Shop] Échec de la création du marchand."));
            return 0;
        }
        merchant.setShopKind(kind);
        merchant.moveTo(pos.x, pos.y, pos.z, src.getRotation().y, 0.0f);
        String label = "questspecial".equals(kind) ? "PNJ de quetes speciales" : "quest".equals(kind) ? "PNJ de quetes" : "race".equals(kind) ? "Marchand course" : "store".equals(kind) ? "Boutique" : "Marchand du jour";
        src.sendSuccess(() -> Component.literal("§a[Zig Shop] " + label + " créé. Clique dessus."), true);
        return 1;
    }

    /**
     * /zigshop skin <nom> : applique un skin embarqué au PNJ marchand visé (≤ 8 blocs).
     * À exécuter en jeu par un joueur. Le nom doit exister dans {@link MerchantSkins}.
     */
    private static int setSkin(CommandContext<CommandSourceStack> ctx) {
        CommandSourceStack src = ctx.getSource();
        String name = StringArgumentType.getString(ctx, "nom");
        if (!(src.getEntity() instanceof ServerPlayer player)) {
            src.sendFailure(Component.literal("[Zig Shop] À exécuter en jeu, en visant un PNJ."));
            return 0;
        }
        if (!MerchantSkins.exists(name)) {
            src.sendFailure(Component.literal("[Zig Shop] Skin inconnu : " + name));
            return 0;
        }
        MerchantEntity target = targetedMerchant(player);
        if (target == null) {
            src.sendFailure(Component.literal("[Zig Shop] Aucun PNJ visé (regarde un marchand à 8 blocs max)."));
            return 0;
        }
        target.setSkin(name);
        src.sendSuccess(() -> Component.literal("§a[Zig Shop] Skin du PNJ → " + name), true);
        return 1;
    }

    /** Le MerchantEntity dans la ligne de visée du joueur (portée 8 blocs), ou null. */
    private static MerchantEntity targetedMerchant(ServerPlayer player) {
        double reach = 8.0;
        Vec3 eye = player.getEyePosition();
        Vec3 look = player.getViewVector(1.0f);
        Vec3 end = eye.add(look.scale(reach));
        AABB box = player.getBoundingBox().expandTowards(look.scale(reach)).inflate(1.0);
        EntityHitResult hit = ProjectileUtil.getEntityHitResult(
                player, eye, end, box, e -> e instanceof MerchantEntity, reach * reach);
        return (hit != null && hit.getEntity() instanceof MerchantEntity m) ? m : null;
    }

    private static int today(CommandContext<CommandSourceStack> ctx) {
        CommandSourceStack src = ctx.getSource();
        MinecraftServer server = src.getServer();
        String date = ZigShopDate.today();
        src.sendSuccess(() -> Component.literal("§7[ZigShop] Shop du " + date + " — lecture…"), false);

        FirebaseClient.fetchDayOffers(date).whenComplete((offers, err) -> server.execute(() -> {
            if (err != null) {
                src.sendFailure(Component.literal("[ZigShop] Erreur : " + err.getMessage()));
                return;
            }
            if (offers.isEmpty()) {
                src.sendSuccess(() -> Component.literal("§7[ZigShop] Aucune offre pour ce jour."), false);
                return;
            }
            src.sendSuccess(() -> Component.literal("§6[ZigShop] " + offers.size() + " offre(s) :"), false);
            for (ShopOffer o : offers) {
                src.sendSuccess(() -> Component.literal(
                        "  §a" + o.inputQty() + "× §f" + o.input()
                                + " §7→ §a" + o.outputQty() + "× §f" + o.output()), false);
            }
        }));
        return 1;
    }
}
