package com.rawstudio.zigshop;

import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.MinecraftServer;
import net.minecraft.sounds.SoundEvent;
import net.minecraft.sounds.SoundEvents;
import net.minecraft.tags.DamageTypeTags;
import net.minecraft.world.InteractionHand;
import net.minecraft.world.InteractionResult;
import net.minecraft.world.damagesource.DamageSource;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.Mob;
import net.minecraft.world.entity.PathfinderMob;
import net.minecraft.world.entity.ai.attributes.AttributeSupplier;
import net.minecraft.world.entity.ai.attributes.Attributes;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.item.Item;
import net.minecraft.world.item.ItemStack;
import net.minecraft.world.item.Items;
import net.minecraft.world.item.trading.ItemCost;
import net.minecraft.world.item.trading.Merchant;
import net.minecraft.world.item.trading.MerchantOffer;
import net.minecraft.world.item.trading.MerchantOffers;
import net.minecraft.world.level.Level;

import javax.annotation.Nullable;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Marchand connecté au shop du launcher. Au clic, lit les offres (shop du jour OU
 * boutique selon {@link #shopKind}) depuis Firebase et ouvre l'interface de troc
 * VANILLA : donner inputQty × input → recevoir outputQty × output.
 *
 * <p><b>Limite par joueur</b> : chaque offre porte un {@code maxUses} (0 = illimité).
 * Le nombre d'échanges déjà faits est mémorisé PAR JOUEUR et PAR identifiant d'offre
 * ({@link #tradeCounts}, persisté en NBT). Comme le shop du jour change d'identifiants
 * chaque jour, la limite y repart à zéro chaque jour ; en boutique (identifiants
 * fixes) c'est une limite à vie. Limite atteinte ⇒ l'offre apparaît grisée (rupture).
 *
 * <p>NoAI + persistant : ne bouge pas, ne despawn pas. Indestructible en survie (aucun
 * dégât ordinaire ne passe) ; un joueur en créatif le supprime d'un seul coup (clic
 * gauche), ce qui sert à replacer/retirer les PNJ pendant le build. Voir {@link #hurt}.
 */
public class MerchantEntity extends PathfinderMob implements Merchant {

    /** Nom du skin embarqué de ce PNJ ("" = skin par défaut) ; voir {@link MerchantSkins}.
     *  Synchronisé client↔serveur (le rendu est côté client) et persisté en NBT. */
    private static final EntityDataAccessor<String> DATA_SKIN =
            SynchedEntityData.defineId(MerchantEntity.class, EntityDataSerializers.STRING);

    @Nullable
    private Player tradingPlayer;
    private MerchantOffers offers = new MerchantOffers();
    /** Identifiants d'offre Firebase, dans le MÊME ordre que {@link #offers} (mappe une offre marchande → son id). */
    private final List<String> offerIds = new ArrayList<>();
    /** Source du marchand : "daily" = shop du jour (calendrier), "store" = boutique (offres fixes). */
    private String shopKind = "daily";
    /** Échanges déjà effectués : joueur (UUID) → (identifiant d'offre → nombre d'utilisations). */
    private final Map<UUID, Map<String, Integer>> tradeCounts = new HashMap<>();
    /** Limite par offre du dernier menu construit (identifiant d'offre → maxUses, 0 = illimité). */
    private final Map<String, Integer> offerMaxUses = new HashMap<>();
    /** Compteur GLOBAL (mode "race") : identifiant d'offre → nombre total d'échanges (tous joueurs confondus). */
    private final Map<String, Integer> raceCounts = new HashMap<>();
    /** Identifiant du PNJ configurable (null = PNJ générique historique). Filtre le contenu affiché. */
    @Nullable
    private String npcId = null;

    public MerchantEntity(EntityType<? extends PathfinderMob> type, Level level) {
        super(type, level);
        this.setPersistenceRequired();
        this.setNoAi(true);
        this.setSilent(true);
        // Pas de setInvulnerable(true) : l'invulnérabilité est gérée dans hurt() pour
        // rester destructible par un joueur en créatif. Voir hurt().
    }

    public static AttributeSupplier.Builder createAttributes() {
        return Mob.createMobAttributes()
                .add(Attributes.MAX_HEALTH, 20.0)
                .add(Attributes.MOVEMENT_SPEED, 0.0);
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {
        super.defineSynchedData(builder);
        builder.define(DATA_SKIN, "");
    }

    @Override
    protected void registerGoals() {
        // PNJ statique : aucun comportement.
    }

    @Override
    public boolean removeWhenFarAway(double distanceToClosestPlayer) {
        return false;
    }

    @Override
    public boolean isPushable() {
        return false;
    }

    /**
     * Indestructible en survie : aucun dégât ordinaire ne passe. Exception 1 : un joueur
     * en mode créatif le supprime d'un seul coup (pratique pour replacer/retirer les PNJ
     * en build). Exception 2 : les dégâts qui ignorent l'invulnérabilité ({@code /kill},
     * le vide…) restent applicables pour l'administration.
     */
    @Override
    public boolean hurt(DamageSource source, float amount) {
        if (source.is(DamageTypeTags.BYPASSES_INVULNERABILITY)) {
            return super.hurt(source, amount);
        }
        if (source.getEntity() instanceof Player player && player.getAbilities().instabuild) {
            if (!this.level().isClientSide) {
                this.discard();
            }
            return true;
        }
        return false;
    }

    /** Définit le type de PNJ (daily/store/race/quest/questspecial). Appelé à la création via la commande. */
    public void setShopKind(String kind) {
        this.shopKind = ("store".equals(kind) || "race".equals(kind) || "quest".equals(kind)
                || "questspecial".equals(kind)) ? kind : "daily";
    }

    /** Identifiant du PNJ configurable ; null = PNJ générique (contenu global sans tag npc). */
    @Nullable
    public String getNpcId() {
        return this.npcId;
    }

    public void setNpcId(@Nullable String id) {
        this.npcId = (id != null && !id.isBlank()) ? id : null;
    }

    /**
     * Vrai si un contenu de tag {@code itemNpc} doit être affiché par CE PNJ : un PNJ nommé
     * ne montre que SON contenu ({@code npcId} == tag) ; un PNJ générique ne montre que le
     * contenu global (tag vide). Rétrocompat : contenu sans tag → global.
     */
    public boolean matchesNpc(String itemNpc) {
        String tag = (itemNpc == null) ? "" : itemNpc;
        return this.npcId != null ? this.npcId.equals(tag) : tag.isBlank();
    }

    /** Skin embarqué de ce PNJ ("" = défaut). Voir {@link MerchantSkins}. */
    public String getSkin() {
        return this.entityData.get(DATA_SKIN);
    }

    /** Applique un skin embarqué ; null/"" ⇒ skin par défaut. La validation du nom (qu'il
     *  existe vraiment) revient à l'appelant (commande) via {@link MerchantSkins#exists}. */
    public void setSkin(String name) {
        this.entityData.set(DATA_SKIN, name == null ? "" : name);
    }

    @Override
    public void addAdditionalSaveData(CompoundTag tag) {
        super.addAdditionalSaveData(tag);
        tag.putString("ShopKind", this.shopKind);
        if (this.npcId != null) {
            tag.putString("NpcId", this.npcId);
        }
        tag.putString("Skin", this.getSkin());
        // Compteurs d'échanges par joueur : { <uuid>: { <offerId>: count } }.
        CompoundTag counts = new CompoundTag();
        for (Map.Entry<UUID, Map<String, Integer>> byPlayer : this.tradeCounts.entrySet()) {
            CompoundTag perOffer = new CompoundTag();
            for (Map.Entry<String, Integer> e : byPlayer.getValue().entrySet()) {
                if (e.getValue() != null && e.getValue() > 0) {
                    perOffer.putInt(e.getKey(), e.getValue());
                }
            }
            if (!perOffer.isEmpty()) {
                counts.put(byPlayer.getKey().toString(), perOffer);
            }
        }
        tag.put("TradeCounts", counts);
        // Compteur global (mode course) : { <offerId>: count }.
        CompoundTag race = new CompoundTag();
        for (Map.Entry<String, Integer> e : this.raceCounts.entrySet()) {
            if (e.getValue() != null && e.getValue() > 0) {
                race.putInt(e.getKey(), e.getValue());
            }
        }
        tag.put("RaceCounts", race);
    }

    @Override
    public void readAdditionalSaveData(CompoundTag tag) {
        super.readAdditionalSaveData(tag);
        if (tag.contains("ShopKind")) {
            // setShopKind valide tous les types (daily/store/race/quest). Bug historique :
            // l'ancienne lecture ne reconnaissait que "store", donc un PNJ race ou quest
            // redevenait "daily" (shop du jour) après un rechargement du monde.
            this.setShopKind(tag.getString("ShopKind"));
        }
        this.npcId = tag.contains("NpcId") ? tag.getString("NpcId") : null;
        if (tag.contains("Skin")) {
            this.setSkin(tag.getString("Skin"));
        }
        this.tradeCounts.clear();
        if (tag.contains("TradeCounts")) {
            CompoundTag counts = tag.getCompound("TradeCounts");
            for (String uuid : counts.getAllKeys()) {
                CompoundTag perOffer = counts.getCompound(uuid);
                Map<String, Integer> map = new HashMap<>();
                for (String offerId : perOffer.getAllKeys()) {
                    map.put(offerId, perOffer.getInt(offerId));
                }
                try {
                    this.tradeCounts.put(UUID.fromString(uuid), map);
                } catch (IllegalArgumentException ignored) {
                    // uuid corrompu : ignoré
                }
            }
        }
        this.raceCounts.clear();
        if (tag.contains("RaceCounts")) {
            CompoundTag race = tag.getCompound("RaceCounts");
            for (String offerId : race.getAllKeys()) {
                this.raceCounts.put(offerId, race.getInt(offerId));
            }
        }
    }

    @Override
    protected InteractionResult mobInteract(Player player, InteractionHand hand) {
        if (this.level().isClientSide) {
            return InteractionResult.SUCCESS;
        }
        MinecraftServer server = this.level().getServer();
        if (server == null) {
            return InteractionResult.CONSUME;
        }
        // PNJ de quêtes : ouvre l'écran de quêtes (pas le menu marchand). Le PNJ "questspecial"
        // n'affiche que les quêtes UNIQUE (1 gagnant / serveur) ; le PNJ "quest" affiche les autres.
        if ("quest".equals(this.shopKind) || "questspecial".equals(this.shopKind)) {
            boolean uniqueOnly = "questspecial".equals(this.shopKind);
            if (player instanceof net.minecraft.server.level.ServerPlayer sp) {
                FirebaseClient.fetchQuests().whenComplete((list, err) -> server.execute(() -> {
                    if (this.isRemoved() || !sp.isAlive()) {
                        return;
                    }
                    if (err != null) {
                        sp.sendSystemMessage(Component.literal("§c[Zig Shop] Lecture des quetes impossible."));
                        return;
                    }
                    QuestServerHandler.openFor(sp, list, uniqueOnly, this.getNpcId());
                }));
            }
            return InteractionResult.CONSUME;
        }
        boolean isStore = "store".equals(this.shopKind);
        boolean isRace = "race".equals(this.shopKind);
        // Lecture asynchrone des offres (course OU boutique OU shop du jour), puis ouverture
        // du menu sur le thread serveur.
        var future = isRace ? FirebaseClient.fetchRaceOffers()
                : isStore ? FirebaseClient.fetchStoreOffers()
                : FirebaseClient.fetchDayOffers(ZigShopDate.today());
        future.whenComplete((list, err) -> server.execute(() -> {
            if (this.isRemoved() || !player.isAlive()) {
                return;
            }
            if (err != null) {
                player.sendSystemMessage(Component.literal("§c[Zig Shop] Lecture du shop impossible."));
                return;
            }
            this.rebuildOffers(list, player);
            if (this.offers.isEmpty()) {
                player.sendSystemMessage(Component.literal(isRace
                        ? "§7[Zig Shop] Aucune course en cours."
                        : isStore ? "§7[Zig Shop] La boutique est vide pour le moment."
                        : "§7[Zig Shop] Aucune offre aujourd'hui."));
                return;
            }
            this.setTradingPlayer(player);
            Component title = Component.literal(isRace ? "Course" : isStore ? "Boutique" : "Shop du jour");
            this.openTradingScreen(player, title, 1);
        }));
        return InteractionResult.CONSUME;
    }

    /**
     * (Re)construit les offres marchandes pour {@code player}. Items introuvables ignorés.
     * Pour chaque offre limitée, on pré-consomme le nombre d'échanges déjà faits par ce
     * joueur (via {@code increaseUses}) : une fois la limite atteinte, l'offre est en rupture.
     */
    private void rebuildOffers(List<ShopOffer> list, Player player) {
        MerchantOffers result = new MerchantOffers();
        this.offerIds.clear();
        this.offerMaxUses.clear();
        if (list != null) {
            // mode course : compteur GLOBAL partagé ; sinon, compteur propre au joueur.
            Map<String, Integer> used = "race".equals(this.shopKind)
                    ? this.raceCounts
                    : this.tradeCounts.getOrDefault(player.getUUID(), Map.of());
            for (ShopOffer o : list) {
                if (!this.matchesNpc(o.npc())) {
                    continue; // offre d'un autre PNJ (ou globale vs PNJ nommé)
                }
                Item input = resolveItem(o.input());
                Item output = resolveItem(o.output());
                if (input == null || output == null) {
                    continue;
                }
                ItemCost cost = new ItemCost(input, Math.max(1, o.inputQty()));
                ItemStack out = new ItemStack(output, Math.max(1, o.outputQty()));
                int maxUses = o.maxUses() > 0 ? o.maxUses() : Integer.MAX_VALUE;
                MerchantOffer mo = new MerchantOffer(cost, out, maxUses, 0, 0.0f);
                if (o.maxUses() > 0) {
                    int uses = Math.min(Math.max(0, used.getOrDefault(o.id(), 0)), maxUses);
                    for (int i = 0; i < uses; i++) {
                        mo.increaseUses();
                    }
                }
                result.add(mo);
                this.offerIds.add(o.id());
                this.offerMaxUses.put(o.id(), o.maxUses());
            }
        }
        this.offers = result;
    }

    /** Résout un identifiant d'item ; null si introuvable (le registre ITEM est defaulté sur AIR). */
    @Nullable
    private static Item resolveItem(String id) {
        if (id == null || id.isBlank()) {
            return null;
        }
        ResourceLocation rl = ResourceLocation.tryParse(id);
        if (rl == null) {
            return null;
        }
        Item item = BuiltInRegistries.ITEM.get(rl);
        return (item == Items.AIR && !"minecraft:air".equals(id)) ? null : item;
    }

    // ─── Merchant ───────────────────────────────────────────────────────────────
    @Override
    public void setTradingPlayer(@Nullable Player player) {
        this.tradingPlayer = player;
    }

    @Nullable
    @Override
    public Player getTradingPlayer() {
        return this.tradingPlayer;
    }

    @Override
    public MerchantOffers getOffers() {
        return this.offers;
    }

    @Override
    public void overrideOffers(MerchantOffers newOffers) {
        this.offers = newOffers;
    }

    @Override
    public void notifyTrade(MerchantOffer offer) {
        offer.increaseUses();
        // Mémorise l'échange pour le joueur en cours (limite par joueur, persistée en NBT).
        Player player = this.tradingPlayer;
        if (player == null) {
            return;
        }
        int idx = this.offers.indexOf(offer);
        if (idx < 0 || idx >= this.offerIds.size()) {
            return;
        }
        String offerId = this.offerIds.get(idx);
        if ("race".equals(this.shopKind)) {
            // Course : compteur GLOBAL partagé — une fois la limite atteinte, bloqué pour tous.
            this.raceCounts.merge(offerId, 1, Integer::sum);
            return;
        }
        int count = this.tradeCounts
                .computeIfAbsent(player.getUUID(), k -> new HashMap<>())
                .merge(offerId, 1, Integer::sum);
        // Publie le compteur dans Firebase (SERVEUR uniquement) pour l'affichage launcher.
        if (!this.level().isClientSide) {
            String secret = ServerConfig.firebaseSecret();
            if (secret != null) {
                FirebaseClient.putTradeCount(secret, player.getGameProfile().getName(), offerId, count);
            }
        }
    }

    @Override
    public void notifyTradeUpdated(ItemStack stack) {
        // rien
    }

    @Override
    public int getVillagerXp() {
        return 0;
    }

    @Override
    public void overrideXp(int xp) {
        // pas d'XP
    }

    @Override
    public boolean showProgressBar() {
        return false;
    }

    @Override
    public SoundEvent getNotifyTradeSound() {
        return SoundEvents.VILLAGER_YES;
    }

    @Override
    public boolean isClientSide() {
        return this.level().isClientSide;
    }
}
