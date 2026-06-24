package com.rawstudio.zigshop.command;

import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.context.CommandContext;
import com.rawstudio.zigshop.FirebaseClient;
import com.rawstudio.zigshop.ShopOffer;
import com.rawstudio.zigshop.ZigShopDate;

import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.network.chat.Component;
import net.minecraft.server.MinecraftServer;

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
                .then(Commands.literal("today").executes(ZigShopCommand::today)));
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
