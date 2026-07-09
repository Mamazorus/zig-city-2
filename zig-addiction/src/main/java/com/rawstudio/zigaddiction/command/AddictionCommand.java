package com.rawstudio.zigaddiction.command;

import com.mojang.brigadier.CommandDispatcher;
import com.mojang.brigadier.arguments.IntegerArgumentType;
import com.mojang.brigadier.context.CommandContext;
import com.mojang.brigadier.exceptions.CommandSyntaxException;

import com.rawstudio.zigaddiction.AddictionData;
import com.rawstudio.zigaddiction.AddictionManager;

import net.minecraft.commands.CommandSourceStack;
import net.minecraft.commands.Commands;
import net.minecraft.commands.arguments.EntityArgument;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;

/**
 * Commande d'admin (opérateur, permission 2) pour PILOTER et TESTER l'addiction sans
 * attendre les vraies durées :
 * <ul>
 *   <li>{@code /zigaddiction status [joueur]} — état courant.</li>
 *   <li>{@code /zigaddiction smoke [joueur]} — simule une taffe (reset + soulagement).</li>
 *   <li>{@code /zigaddiction advance <minutes> [joueur]} — avance le compteur de jeu ; le
 *       manque / l'escalade se déclenchent au prochain tick. Marque le joueur accro au besoin.</li>
 *   <li>{@code /zigaddiction cure [joueur]} — dissipe les effets de manque (sans reset).</li>
 *   <li>{@code /zigaddiction reset [joueur]} — le joueur n'est plus accro du tout.</li>
 * </ul>
 * Sans argument {@code [joueur]}, la cible est l'exécutant.
 */
public final class AddictionCommand {
    private AddictionCommand() {}

    public static void register(CommandDispatcher<CommandSourceStack> dispatcher) {
        dispatcher.register(Commands.literal("zigaddiction")
                .requires(src -> src.hasPermission(2))
                .then(Commands.literal("status")
                        .executes(ctx -> status(ctx, self(ctx)))
                        .then(Commands.argument("joueur", EntityArgument.player())
                                .executes(ctx -> status(ctx, EntityArgument.getPlayer(ctx, "joueur")))))
                .then(Commands.literal("smoke")
                        .executes(ctx -> smoke(ctx, self(ctx)))
                        .then(Commands.argument("joueur", EntityArgument.player())
                                .executes(ctx -> smoke(ctx, EntityArgument.getPlayer(ctx, "joueur")))))
                .then(Commands.literal("advance")
                        .then(Commands.argument("minutes", IntegerArgumentType.integer(1))
                                .executes(ctx -> advance(ctx, self(ctx), IntegerArgumentType.getInteger(ctx, "minutes")))
                                .then(Commands.argument("joueur", EntityArgument.player())
                                        .executes(ctx -> advance(ctx, EntityArgument.getPlayer(ctx, "joueur"),
                                                IntegerArgumentType.getInteger(ctx, "minutes"))))))
                .then(Commands.literal("cure")
                        .executes(ctx -> cure(ctx, self(ctx)))
                        .then(Commands.argument("joueur", EntityArgument.player())
                                .executes(ctx -> cure(ctx, EntityArgument.getPlayer(ctx, "joueur")))))
                .then(Commands.literal("reset")
                        .executes(ctx -> reset(ctx, self(ctx)))
                        .then(Commands.argument("joueur", EntityArgument.player())
                                .executes(ctx -> reset(ctx, EntityArgument.getPlayer(ctx, "joueur"))))));
    }

    private static ServerPlayer self(CommandContext<CommandSourceStack> ctx) throws CommandSyntaxException {
        return ctx.getSource().getPlayerOrException();
    }

    private static String name(ServerPlayer p) {
        return p.getGameProfile().getName();
    }

    private static int status(CommandContext<CommandSourceStack> ctx, ServerPlayer target) {
        AddictionData.Entry e = AddictionData.get(target.getServer()).get(target.getUUID());
        if (e == null || !e.addicted) {
            ctx.getSource().sendSuccess(() -> Component.literal("§7" + name(target) + " n'est pas accro."), false);
            return 1;
        }
        long minutes = e.onlineTicks / AddictionManager.TPM;
        int computed = AddictionManager.targetStage(e.onlineTicks);
        ctx.getSource().sendSuccess(() -> Component.literal(String.format(
                "§7%s — accro, temps de jeu depuis la taffe=§f%d min§7, palier=§f%d§7 (calculé=%d), manque annoncé=%b",
                name(target), minutes, e.stage, computed, e.cravingSent)), false);
        return 1;
    }

    private static int smoke(CommandContext<CommandSourceStack> ctx, ServerPlayer target) {
        AddictionManager.onSmoke(target);
        ctx.getSource().sendSuccess(
                () -> Component.literal("§a[ZigAddiction] Taffe simulée pour " + name(target) + " (compteur remis à zéro)."), true);
        return 1;
    }

    private static int advance(CommandContext<CommandSourceStack> ctx, ServerPlayer target, int minutes) {
        AddictionData data = AddictionData.get(target.getServer());
        AddictionData.Entry e = data.getOrCreate(target.getUUID());
        e.addicted = true;
        e.onlineTicks += (long) minutes * AddictionManager.TPM;
        data.setDirty();
        ctx.getSource().sendSuccess(
                () -> Component.literal("§a[ZigAddiction] +" + minutes + " min de jeu pour " + name(target) + " (effet au prochain tick)."), true);
        return 1;
    }

    private static int cure(CommandContext<CommandSourceStack> ctx, ServerPlayer target) {
        AddictionManager.clearWithdrawalEffects(target);
        ctx.getSource().sendSuccess(
                () -> Component.literal("§a[ZigAddiction] Effets de manque dissipés pour " + name(target) + "."), true);
        return 1;
    }

    private static int reset(CommandContext<CommandSourceStack> ctx, ServerPlayer target) {
        AddictionData.get(target.getServer()).clear(target.getUUID());
        AddictionManager.clearWithdrawalEffects(target);
        ctx.getSource().sendSuccess(
                () -> Component.literal("§a[ZigAddiction] " + name(target) + " n'est plus accro."), true);
        return 1;
    }
}
