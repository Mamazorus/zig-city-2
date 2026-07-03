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
 * Version corrigée maison (zigcity2) du menu de la machine à sous.
 *
 * Le mod d'origine (slotsmachine 1.1.8) reconstruit ce menu côté client à partir de la
 * position du bloc reçue du serveur, puis déréférence aussitôt {@code blockEntity.inventory}.
 * En multijoueur, le paquet d'ouverture du menu peut arriver avant que le client ait reçu le
 * BlockEntity à cette position (course réseau, bloc fraîchement posé, latence) :
 * {@code getBlockEntity} renvoie alors {@code null} et le NPE coupe la connexion
 * (« Failed to open a screen with advanced data »).
 *
 * Correctif : si le BlockEntity n'est pas (encore) là côté client, on fournit une instance de
 * secours à inventaire vide au lieu de planter. Le protocole de conteneur synchronise ensuite
 * le contenu réel des slots. Les signatures publiques sont conservées à l'identique pour rester
 * binairement compatibles avec le reste du jar (Screen, paquets, BlockEntity, ModMenuTypes).
 */
public class SlotsMachineMenu extends AbstractContainerMenu {
    public static SlotsMachineBlockEntity blockEntity;
    private final Level level;
    private final ContainerData data;

    public SlotsMachineMenu(int containerId, Inventory inv, FriendlyByteBuf extraData) {
        this(containerId, inv, resolve(inv, extraData.readBlockPos()), new SimpleContainerData(2));
    }

    public SlotsMachineMenu(int containerId, Inventory inv, BlockEntity blockEntity, ContainerData data) {
        super(ModMenuTypes.SLOT_MACHINE_MENU.get(), containerId);
        checkContainerSize(inv, 2);
        // Sécurité : le rendu de l'écran déréférence ce champ statique, il ne doit jamais être null.
        SlotsMachineMenu.blockEntity = (blockEntity instanceof SlotsMachineBlockEntity found)
                ? found
                : new SlotsMachineBlockEntity(BlockPos.ZERO, ModBlocks.SLOT_MACHINE.get().defaultBlockState());
        this.level = inv.player.level();
        this.data = data;
        this.addPlayerInventory(inv);
        this.addPlayerHotbar(inv);
        this.addSlot(new SlotItemHandler(SlotsMachineMenu.blockEntity.inventory, 0, 22, 34));
        this.addSlot(new SlotItemHandler(SlotsMachineMenu.blockEntity.inventory, 1, 135, 34));
        this.addDataSlots(data);
    }

    /** Résout le BlockEntity côté client, avec repli à inventaire vide si la synchro n'est pas arrivée. */
    private static BlockEntity resolve(Inventory inv, BlockPos pos) {
        BlockEntity be = inv.player.level().getBlockEntity(pos);
        return (be instanceof SlotsMachineBlockEntity)
                ? be
                : new SlotsMachineBlockEntity(pos, ModBlocks.SLOT_MACHINE.get().defaultBlockState());
    }

    public int[] stopSpin() {
        this.data.set(0, 1);
        return blockEntity.stopSpin();
    }

    public int[] startSpin() {
        this.data.set(0, 0);
        return blockEntity.startSpin();
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
        return stillValid(ContainerLevelAccess.create(this.level, blockEntity.getBlockPos()), player, ModBlocks.SLOT_MACHINE.get());
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
}
