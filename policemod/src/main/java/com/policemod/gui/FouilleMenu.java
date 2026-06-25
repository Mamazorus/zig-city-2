package com.policemod.gui;

import com.policemod.init.ModMenuTypes;
import net.minecraft.network.FriendlyByteBuf;
import net.minecraft.network.chat.Component;
import net.minecraft.world.MenuProvider;
import net.minecraft.world.SimpleMenuProvider;
import net.minecraft.world.entity.player.Inventory;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.inventory.AbstractContainerMenu;
import net.minecraft.world.inventory.MenuType;
import net.minecraft.world.inventory.Slot;
import net.minecraft.world.item.ItemStack;

import java.util.UUID;

public class FouilleMenu extends AbstractContainerMenu {

    private final Player cible;

    // Constructeur réseau (appelé côté client via IMenuTypeExtension)
    public FouilleMenu(int windowId, Inventory policierInv, FriendlyByteBuf data) {
        this(windowId, policierInv, findCible(policierInv.player, data.readUUID()));
    }

    // Constructeur principal (serveur)
    public FouilleMenu(int windowId, Inventory policierInv, Player cible) {
        super(ModMenuTypes.FOUILLE_MENU.get(), windowId);
        this.cible = cible;

        // --- Inventaire de la CIBLE en haut ---
        // Hotbar cible (slots 0-8)
        for (int i = 0; i < 9; i++) {
            this.addSlot(new Slot(cible.getInventory(), i, 8 + i * 18, 20));
        }
        // Inventaire principal cible (slots 9-35)
        for (int row = 0; row < 3; row++) {
            for (int col = 0; col < 9; col++) {
                this.addSlot(new Slot(cible.getInventory(),
                        9 + col + row * 9,
                        8 + col * 18,
                        48 + row * 18));
            }
        }

        // --- Inventaire du POLICIER en bas ---
        for (int row = 0; row < 3; row++) {
            for (int col = 0; col < 9; col++) {
                this.addSlot(new Slot(policierInv,
                        col + row * 9 + 9,
                        8 + col * 18,
                        120 + row * 18));
            }
        }
        // Hotbar policier
        for (int i = 0; i < 9; i++) {
            this.addSlot(new Slot(policierInv, i, 8 + i * 18, 178));
        }
    }

    private static Player findCible(Player policier, UUID uuid) {
        return policier.level().getPlayerByUUID(uuid);
    }

    @Override
    public ItemStack quickMoveStack(Player player, int index) {
        ItemStack result = ItemStack.EMPTY;
        Slot slot = this.slots.get(index);

        if (slot.hasItem()) {
            ItemStack item = slot.getItem();
            result = item.copy();

            if (index < 36) {
                // Depuis cible → vers policier
                if (!this.moveItemStackTo(item, 36, 72, false)) {
                    return ItemStack.EMPTY;
                }
            } else {
                // Depuis policier → vers cible
                if (!this.moveItemStackTo(item, 0, 36, false)) {
                    return ItemStack.EMPTY;
                }
            }

            if (item.isEmpty()) {
                slot.set(ItemStack.EMPTY);
            } else {
                slot.setChanged();
            }
        }
        return result;
    }

    @Override
    public boolean stillValid(Player player) {
        // Ferme si la cible est trop loin ou déconnectée
        if (cible == null) return false;
        return player.distanceTo(cible) < 8.0;
    }

    // Fournit le MenuProvider pour openMenu() côté serveur
    public static MenuProvider createProvider(Player cible) {
        return new SimpleMenuProvider(
                (id, inv, player) -> new FouilleMenu(id, inv, cible),
                Component.literal("Fouille : " + cible.getName().getString())
        );
    }
}
