package net.micaxs.slotsmachine.screen;

import net.micaxs.slotsmachine.block.ModBlocks;
import net.micaxs.slotsmachine.block.entity.SlotsMachineBlockEntity;
import net.minecraft.core.BlockPos;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.ContainerData;
import net.minecraft.world.inventory.ContainerLevelAccess;
import net.minecraft.world.inventory.SimpleContainerData;
import net.minecraft.world.inventory.Slot;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.block.entity.BlockEntity;
import net.neoforged.neoforge.items.SlotItemHandler;

/**
 * Version corrigée maison (zigcity2) du menu propriétaire de la machine à sous.
 * Même défaut et même correctif que {@link SlotsMachineMenu} : repli sur un BlockEntity de
 * secours si la synchro client n'est pas arrivée, au lieu de couper la connexion.
 */
public class SlotsMachineOwnerMenu extends AbstractContainerMenu {
    public static SlotsMachineBlockEntity blockEntity;
    private final Level level;
    private final ContainerData data;

    public SlotsMachineOwnerMenu(int pContainerId, Inventory inv, FriendlyByteBuf extraData) {
        this(pContainerId, inv, resolve(inv, extraData.readBlockPos()), new SimpleContainerData(2));
    }

    public SlotsMachineOwnerMenu(int pContainerId, Inventory inv, BlockEntity entity, SimpleContainerData data) {
        super(ModMenuTypes.SLOT_MACHINE_OWNER_MENU.get(), pContainerId);
        checkContainerSize(inv, 2);
        blockEntity = (entity instanceof SlotsMachineBlockEntity found)
                ? found
                : new SlotsMachineBlockEntity(BlockPos.ZERO, ModBlocks.SLOT_MACHINE.get().defaultBlockState());
        this.level = inv.player.level();
        this.data = data;
        this.addPlayerInventory(inv);
        this.addPlayerHotbar(inv);
        blockEntity.getOwnerItemHandler().ifPresent(handler -> {
            for (int i = 0; i < 9; ++i) {
                this.addSlot(new SlotItemHandler(handler, i, 62 + i % 3 * 18, 16 + i / 3 * 18));
            }
        });
        this.addDataSlots(data);
    }

    private static BlockEntity resolve(Inventory inv, BlockPos pos) {
        BlockEntity be = inv.player.level().getBlockEntity(pos);
        return (be instanceof SlotsMachineBlockEntity)
                ? be
                : new SlotsMachineBlockEntity(pos, ModBlocks.SLOT_MACHINE.get().defaultBlockState());
    }

    public boolean isSpinning() {
        return this.data.get(0) > 0;
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
            if (!this.moveItemStackTo(sourceStack, 36, 45, false)) {
                return ItemStack.EMPTY;
            }
        } else if (index < 45) {
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
        return stillValid(ContainerLevelAccess.create(this.level, blockEntity.getBlockPos()), player, ModBlocks.SLOT_MACHINE.get());
    }

    private void addPlayerInventory(Inventory playerInventory) {
        for (int i = 0; i < 3; ++i) {
            for (int l = 0; l < 9; ++l) {
                this.addSlot(new Slot(playerInventory, l + i * 9 + 9, 8 + l * 18, 84 + i * 18));
            }
        }
    }

    private void addPlayerHotbar(Inventory playerInventory) {
        for (int i = 0; i < 9; ++i) {
            this.addSlot(new Slot(playerInventory, i, 8 + i * 18, 142));
        }
    }
}
