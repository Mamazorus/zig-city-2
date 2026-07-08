package com.rawstudio.zigshop;

import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.chat.Component;
import net.minecraft.network.syncher.EntityDataAccessor;
import net.minecraft.network.syncher.EntityDataSerializers;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
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
import net.minecraft.world.item.Items;
import net.minecraft.world.level.Level;

import javax.annotation.Nullable;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Marchand connecté au shop du launcher. Au clic, lit les offres (shop du jour OU boutique OU
 * course selon {@link #shopKind}) depuis Firebase et ouvre l'interface de BOUTIQUE custom
 * ({@code ShopScreen} via {@link ShopServerHandler}) : donner inputQty × input → recevoir
 * outputQty × output, payé en un clic depuis l'inventaire.
 *
 * <p><b>Pourquoi une boutique custom (et plus le troc villageois natif)&nbsp;?</b> Le troc natif
 * plafonnait le paiement à une pile (64) par case de coût, rendant tout prix supérieur (armes à
 * 150+ Zig Coins) impossible. La boutique débite le prix de l'inventaire ENTIER, sans limite.
 *
 * <p><b>Limite par joueur</b> : chaque offre porte un {@code maxUses} (0 = illimité). Le nombre
 * d'échanges déjà faits est mémorisé PAR JOUEUR et PAR identifiant d'offre ({@link #tradeCounts},
 * persisté en NBT). Comme le shop du jour change d'identifiants chaque jour, la limite y repart à
 * zéro chaque jour ; en boutique (identifiants fixes) c'est une limite à vie. En mode course, le
 * compteur est GLOBAL ({@link #raceCounts}, partagé entre tous les joueurs).
 *
 * <p>NoAI + persistant : ne bouge pas, ne despawn pas. Indestructible en survie (aucun dégât
 * ordinaire ne passe) ; un joueur en créatif le supprime d'un seul coup (clic gauche), ce qui sert
 * à replacer/retirer les PNJ pendant le build. Voir {@link #hurt}.
 */
public class MerchantEntity extends PathfinderMob {

    /** Skin de ce PNJ ("" = skin par défaut Steve) ; synchronisé client↔serveur (le rendu est
     *  côté client) et persisté en NBT. Contient SOIT un nom de skin embarqué (voir
     *  {@link MerchantSkins}), SOIT une URL http(s) d'image PNG 64×64 choisie depuis le launcher
     *  (téléchargée et rendue dynamiquement, cf. {@code client.NpcSkinTextures}). */
    private static final EntityDataAccessor<String> DATA_SKIN =
            SynchedEntityData.defineId(MerchantEntity.class, EntityDataSerializers.STRING);
    /** Variant d'un skin par URL : vrai = modèle fin (Alex, bras 3 px), faux = classique (Steve).
     *  Sans effet sur les presets embarqués. Synchronisé pour le rendu client. */
    private static final EntityDataAccessor<Boolean> DATA_SLIM =
            SynchedEntityData.defineId(MerchantEntity.class, EntityDataSerializers.BOOLEAN);

    /** Source du marchand : "daily" = shop du jour (calendrier), "store" = boutique (offres fixes). */
    private String shopKind = "daily";
    /** Échanges déjà effectués : joueur (UUID) → (identifiant d'offre → nombre d'utilisations). */
    private final Map<UUID, Map<String, Integer>> tradeCounts = new HashMap<>();
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
        builder.define(DATA_SLIM, false);
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

    /** Type de PNJ courant (daily/store/race/quest/questspecial). */
    public String getShopKind() {
        return this.shopKind;
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

    /** Applique un skin : soit un NOM de preset embarqué (validé par l'appelant via
     *  {@link MerchantSkins#exists}), soit une URL http(s) d'image 64×64 (skin du launcher).
     *  null/"" ⇒ skin par défaut (Steve). */
    public void setSkin(String name) {
        this.entityData.set(DATA_SKIN, name == null ? "" : name);
    }

    /** Variant du skin custom par URL : vrai = modèle fin (Alex). */
    public boolean isSlimSkin() {
        return this.entityData.get(DATA_SLIM);
    }

    public void setSlimSkin(boolean slim) {
        this.entityData.set(DATA_SLIM, slim);
    }

    @Override
    public void addAdditionalSaveData(CompoundTag tag) {
        super.addAdditionalSaveData(tag);
        tag.putString("ShopKind", this.shopKind);
        if (this.npcId != null) {
            tag.putString("NpcId", this.npcId);
        }
        tag.putString("Skin", this.getSkin());
        tag.putBoolean("SkinSlim", this.isSlimSkin());
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
        if (tag.contains("SkinSlim")) {
            this.setSlimSkin(tag.getBoolean("SkinSlim"));
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
        // PNJ de quêtes : ouvre l'écran de quêtes (pas la boutique). Le PNJ "questspecial"
        // n'affiche que les quêtes UNIQUE (1 gagnant / serveur) ; le PNJ "quest" affiche les autres.
        if ("quest".equals(this.shopKind) || "questspecial".equals(this.shopKind)) {
            boolean uniqueOnly = "questspecial".equals(this.shopKind);
            if (player instanceof ServerPlayer sp) {
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
        // de la boutique custom sur le thread serveur.
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
            List<ShopOffer> mine = this.filterOffers(list);
            if (mine.isEmpty()) {
                player.sendSystemMessage(Component.literal(isRace
                        ? "§7[Zig Shop] Aucune course en cours."
                        : isStore ? "§7[Zig Shop] La boutique est vide pour le moment."
                        : "§7[Zig Shop] Aucune offre aujourd'hui."));
                return;
            }
            if (player instanceof ServerPlayer sp) {
                ShopServerHandler.open(sp, this, mine);
            }
        }));
        return InteractionResult.CONSUME;
    }

    /**
     * Offres de CE PNJ (filtrées par {@link #matchesNpc}) parmi la liste lue, dont l'input ET
     * l'output se résolvent en items connus. Une offre à item introuvable est ignorée.
     */
    public List<ShopOffer> filterOffers(@Nullable List<ShopOffer> list) {
        List<ShopOffer> out = new ArrayList<>();
        if (list != null) {
            for (ShopOffer o : list) {
                if (!this.matchesNpc(o.npc())) {
                    continue; // offre d'un autre PNJ (ou globale vs PNJ nommé)
                }
                if (resolveItem(o.input()) == null || resolveItem(o.output()) == null) {
                    continue; // item introuvable
                }
                out.add(o);
            }
        }
        return out;
    }

    /**
     * Nombre d'échanges déjà effectués pour {@code offerId} : compteur GLOBAL en mode course,
     * sinon compteur propre à {@code player}. Sert au calcul du quota (affichage + blocage).
     */
    public int usesDoneFor(Player player, String offerId) {
        if ("race".equals(this.shopKind)) {
            return Math.max(0, this.raceCounts.getOrDefault(offerId, 0));
        }
        Map<String, Integer> m = this.tradeCounts.get(player.getUUID());
        return m == null ? 0 : Math.max(0, m.getOrDefault(offerId, 0));
    }

    /**
     * Enregistre un achat : incrémente le bon compteur (global en course, sinon par joueur) et,
     * hors course, publie le total dans Firebase (miroir pour l'affichage du quota côté launcher).
     * Renvoie le nouveau total. Le contrôle du quota est fait EN AMONT par {@link ShopServerHandler}.
     */
    public int recordPurchase(ServerPlayer player, String offerId) {
        if ("race".equals(this.shopKind)) {
            // Course : compteur GLOBAL partagé — une fois la limite atteinte, bloqué pour tous.
            return this.raceCounts.merge(offerId, 1, Integer::sum);
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
        return count;
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
}
