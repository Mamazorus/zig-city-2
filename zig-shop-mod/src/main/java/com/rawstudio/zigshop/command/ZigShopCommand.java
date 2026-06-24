package com.rawstudio.zigshop.command;

import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.context.CommandContext;
import com.rawstudio.zigshop.FirebaseClient;
import com.rawstudio.zigshop.MerchantEntity;
import com.rawstudio.zigshop.ModEntities;
import com.rawstudio.zigshop.ShopOffer;
import com.rawstudio.zigshop.ZigShopDate;

import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerLevel;
import net.minecraft.world.entity.MobSpawnType;
import net.minecraft.world.phys.Vec3;

/**
 * Commande de test de la phase 1 : {@code /zigshop today} lit le shop du jour depuis
 * Firebase et affiche les offres dans le chat. Valide la chaîne compile → chargement
 * → lecture Firebase avant d'attaquer l'entité et les échanges.
 */
public final class ZigShopCommand {
    private ZigShopCommand() {}

    public static void register(CommandDispatcher<CommandSourceStack> dispatcher) {
        dispatcher.register(Commands.literal("zigshop")
                .requires(src -> src.hasPermission(2)) // opérateur
                .then(Commands.literal("today").executes(ZigShopCommand::today))
                .then(Commands.literal("spawn").executes(ZigShopCommand::spawn)));
    }

    /** Fait apparaître un marchand à la position de l'exécutant. */
    private static int spawn(CommandContext<CommandSourceStack> ctx) {
        CommandSourceStack src = ctx.getSource();
        ServerLevel level = src.getLevel();
        Vec3 pos = src.getPosition();
        MerchantEntity merchant = ModEntities.MERCHANT.get().spawn(level, BlockPos.containing(pos), MobSpawnType.COMMAND);
        if (merchant == null) {
            src.sendFailure(Component.literal("[Zig Shop] Échec de la création du marchand."));
            return 0;
        }
        merchant.moveTo(pos.x, pos.y, pos.z, src.getRotation().y, 0.0f);
        src.sendSuccess(() -> Component.literal("§a[Zig Shop] Marchand créé. Clique dessus pour voir le shop."), true);
        return 1;
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
