package com.policemod.item;

import com.policemod.gui.FouilleMenu;
import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResultHolder;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.AABB;

import java.util.Comparator;
import java.util.List;

public class BadgePolicierItem extends Item {

    private static final double PORTEE = 4.0;

    public BadgePolicierItem() {
        super(new Item.Properties().stacksTo(1));
    }

    @Override
    public InteractionResultHolder<ItemStack> use(Level level, Player player, InteractionHand hand) {
        ItemStack stack = player.getItemInHand(hand);

        if (!level.isClientSide()) {
            ServerPlayer policier = (ServerPlayer) player;

            // Cherche tous les joueurs proches sauf le policier lui-même
            List<Player> proches = level.getEntitiesOfClass(
                    Player.class,
                    new AABB(
                            player.getX() - PORTEE, player.getY() - PORTEE, player.getZ() - PORTEE,
                            player.getX() + PORTEE, player.getY() + PORTEE, player.getZ() + PORTEE
                    ),
                    p -> !p.getUUID().equals(player.getUUID())
            );

            if (proches.isEmpty()) {
                player.sendSystemMessage(Component.literal("§c[Police] Aucun joueur à portée."));
                return InteractionResultHolder.fail(stack);
            }

            // Prend le joueur le plus proche
            Player cible = proches.stream()
                    .min(Comparator.comparingDouble(p -> p.distanceTo(player)))
                    .orElse(null);

            if (cible != null) {
                player.sendSystemMessage(
                        Component.literal("§a[Police] Fouille de §e" + cible.getName().getString())
                );
                cible.sendSystemMessage(
                        Component.literal("§c[Police] Vous êtes fouillé par §e" + player.getName().getString())
                );

                // Ouvre le menu de fouille en passant l'UUID de la cible
                policier.openMenu(
                        FouilleMenu.createProvider(cible),
                        buf -> buf.writeUUID(cible.getUUID())
                );
            }
        }

        return InteractionResultHolder.success(stack);
    }

    @Override
    public void appendHoverText(ItemStack stack, TooltipContext context,
                                List<Component> tooltip, TooltipFlag flag) {
        tooltip.add(Component.literal("§7Clic droit : fouiller le joueur le plus proche"));
        tooltip.add(Component.literal("§7Portée : " + (int) PORTEE + " blocs"));
    }

    @Override
    public boolean isFoil(ItemStack stack) {
        return true; // effet brillant / enchanté
    }
}
