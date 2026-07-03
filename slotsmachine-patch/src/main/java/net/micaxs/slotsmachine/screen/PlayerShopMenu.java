package net.micaxs.slotsmachine.screen;

import net.micaxs.slotsmachine.block.ModBlocks;
import net.micaxs.slotsmachine.block.entity.PlayerShopBlockEntity;
import net.minecraft.core.BlockPos;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.ContainerLevelAccess;
import net.minecraft.world.inventory.Slot;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.neoforged.neoforge.items.SlotItemHandler;

/**
 * Version corrigée maison (zigcity2) du menu de la boutique joueur.
 * Même défaut et même correctif que {@link SlotsMachineMenu} : repli sur un BlockEntity de
 * secours si la synchro client n'est pas arrivée, au lieu de couper la connexion.
 */
public class PlayerShopMenu extends AbstractContainerMenu {
    public static PlayerShopBlockEntity blockEntity;
    private final Level level;

    public PlayerShopMenu(int containerId, Inventory inv, FriendlyByteBuf extraData) {
        this(containerId, inv, resolve(inv, extraData.readBlockPos()));
    }

    public PlayerShopMenu(int containerId, Inventory inv, BlockEntity blockEntity) {
        super(ModMenuTypes.PLAYER_SHOP_MENU.get(), containerId);
        PlayerShopMenu.blockEntity = (blockEntity instanceof PlayerShopBlockEntity found)
                ? found
                : new PlayerShopBlockEntity(BlockPos.ZERO, ModBlocks.PLAYER_SHOP.get().defaultBlockState());
        checkContainerSize(inv, 2);
        this.level = inv.player.level();
        this.addPlayerInventory(inv);
        this.addPlayerHotbar(inv);
        this.addSlot(new SlotItemHandler(PlayerShopMenu.blockEntity.inventory, 0, 80, 13));
        this.addSlot(new SlotItemHandler(PlayerShopMenu.blockEntity.inventory, 1, 80, 53));
    }

    private static BlockEntity resolve(Inventory inv, BlockPos pos) {
        BlockEntity be = inv.player.level().getBlockEntity(pos);
        return (be instanceof PlayerShopBlockEntity)
                ? be
                : new PlayerShopBlockEntity(pos, ModBlocks.PLAYER_SHOP.get().defaultBlockState());
    }

    private void addPlayerInventory(Inventory playerInventory) {
        for (int i = 0; i < 3; ++i) {
            for (int j = 0; j < 9; ++j) {
                this.addSlot(new Slot(playerInventory, j + i * 9 + 9, 8 + j * 18, 84 + i * 18));
            }
        }
    }

    private void addPlayerHotbar(Inventory playerInventory) {
        for (int i = 0; i < 9; ++i) {
            this.addSlot(new Slot(playerInventory, i, 8 + i * 18, 142));
        }
    }

    @Override
    public ItemStack quickMoveStack(Player player, int index) {
        Slot sourceSlot = this.slots.get(index);
        if (sourceSlot == null || !sourceSlot.hasItem()) {
            return ItemStack.EMPTY;
        }
        ItemStack sourceStack = sourceSlot.getItem();
        ItemStack copyOfSourceStack = sourceStack.copy();
        if (index < 36) {
            if (!this.moveItemStackTo(sourceStack, 36, 38, false)) {
                return ItemStack.EMPTY;
            }
        } else if (index < 38) {
            if (!this.moveItemStackTo(sourceStack, 0, 36, false)) {
                return ItemStack.EMPTY;
            }
        } else {
            return ItemStack.EMPTY;
        }
        if (sourceStack.getCount() == 0) {
            sourceSlot.set(ItemStack.EMPTY);
        } else {
            sourceSlot.setChanged();
        }
        sourceSlot.onTake(player, sourceStack);
        return copyOfSourceStack;
    }

    @Override
    public boolean stillValid(Player player) {
        if (blockEntity == null) {
            return false;
        }
        return stillValid(ContainerLevelAccess.create(this.level, blockEntity.getBlockPos()), player, ModBlocks.PLAYER_SHOP.get());
    }
}
