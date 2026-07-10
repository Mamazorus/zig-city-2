package com.rawstudio.zigaddiction.item;

import com.rawstudio.zigaddiction.AddictionManager;

import net.minecraft.network.chat.Component;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResultHolder;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.TooltipFlag;
import net.minecraft.world.level.Level;

import java.util.List;

/**
 * Remède de sevrage : au clic droit, met DÉFINITIVEMENT fin à la dépendance du joueur —
 * il n'est plus suivi tant qu'il ne refume pas (équivalent joueur de {@code /zigaddiction
 * reset}). À la différence de refumer — qui ne fait que remettre le compteur à zéro sans
 * jamais guérir — ce remède retire l'addiction elle-même.
 *
 * <p>Item « actif » <b>instantané</b> (même patron que le badge de policemod) : toute la
 * logique est côté serveur, sans animation de consommation (choix de robustesse : aucune
 * API de durée/animation, dont les signatures varient entre versions). Anti-gâchis : le
 * remède n'est PAS consommé s'il est utilisé alors qu'on n'est pas dépendant.
 */
public class DetoxItem extends Item {

    public DetoxItem() {
        super(new Item.Properties().stacksTo(16));
    }

    @Override
    public InteractionResultHolder<ItemStack> use(Level level, Player player, InteractionHand hand) {
        ItemStack stack = player.getItemInHand(hand);

        if (!level.isClientSide() && player instanceof ServerPlayer serverPlayer) {
            boolean etaitDependant = AddictionManager.cure(serverPlayer);
            if (!etaitDependant) {
                serverPlayer.sendSystemMessage(Component.literal(
                        "§8[§2Zig City§8] §7Vous n'êtes pas dépendant : inutile de gâcher ce remède."));
                return InteractionResultHolder.fail(stack); // rien à soigner : non consommé
            }
            serverPlayer.sendSystemMessage(Component.literal(
                    "§8[§2Zig City§8] §aVotre corps se purifie... le manque s'efface. §7Vous n'êtes plus dépendant."));
            if (!serverPlayer.getAbilities().instabuild) {
                stack.shrink(1);
            }
        }
        return InteractionResultHolder.success(stack);
    }

    @Override
    public void appendHoverText(ItemStack stack, TooltipContext context,
                                List<Component> tooltip, TooltipFlag flag) {
        tooltip.add(Component.literal("§7Clic droit : met fin à votre dépendance au joint."));
    }

    @Override
    public boolean isFoil(ItemStack stack) {
        return true; // reflet enchanté : un objet précieux
    }
}
