package com.rawstudio.zigshop;

import net.minecraft.nbt.CompoundTag;
import net.minecraft.network.syncher.SynchedEntityData;
import net.minecraft.world.entity.Entity;
import net.minecraft.world.entity.EntityType;
import net.minecraft.world.entity.player.Player;
import net.minecraft.world.level.Level;
import net.minecraft.world.phys.AABB;

/**
 * Écran mural DÉCORATIF affichant le graphique en bougies du taux RISQUÉ de la banque
 * (cf. {@link BankAccountData#riskyCandles}) en temps réel, en grand format (4 blocs de large ×
 * 5 de haut — cf. {@code MarketScreenRenderer} côté client). Toutes les instances affichent
 * EXACTEMENT la même chose (la série est partagée entre tous les joueurs, comme le tirage
 * lui-même) : aucun état propre à retenir ou persister ici, juste une position + une orientation
 * (déjà gérées par {@link Entity} lui-même — pas de champ synchronisé custom nécessaire).
 *
 * <p>Boîte de collision volontairement PETITE ({@code ModEntities#MARKET_SCREEN}, 0.5×0.5) : le
 * rendu (bien plus grand) dépasse largement cette boîte, comme un faisceau de balise ou un item
 * en cadre — {@link #getBoundingBoxForCulling()} agrandit juste la zone de culling pour que le
 * rendu ne disparaisse pas prématurément quand la caméra n'est plus exactement sur la petite boîte.
 *
 * <p>Statique : pas de physique/IA (pas un {@code Mob}), jamais poussé, invulnérable (constructeur)
 * à tout dégât ordinaire — seul un joueur en créatif le retire (cf. {@link #skipAttackInteraction}),
 * comme les autres fixtures admin de ce mod (cf. {@link MerchantEntity#hurt}).
 */
public class MarketScreenEntity extends Entity {

    /** Demi-largeur/hauteur du rendu (en blocs) pour le calcul de la boîte de culling — cf.
     *  {@code MarketScreenRenderer} pour les dimensions réelles utilisées au dessin (4×5). */
    private static final double RENDER_HALF_WIDTH = 2.5;
    private static final double RENDER_HEIGHT = 5.5;

    public MarketScreenEntity(EntityType<?> type, Level level) {
        super(type, level);
        this.noPhysics = true;
        this.setInvulnerable(true);
    }

    @Override
    protected void defineSynchedData(SynchedEntityData.Builder builder) {
        // Rien à synchroniser : position + orientation (gérées par Entity) suffisent, le contenu
        // affiché est identique pour toutes les instances (cf. doc de classe).
    }

    @Override
    public void tick() {
        // Aucune physique/logique : entité purement décorative, immobile.
    }

    @Override
    public boolean isPickable() {
        return true;
    }

    @Override
    public boolean isPushable() {
        return false;
    }

    /** Intercepte le clic-gauche AVANT tout calcul de dégâts (comme {@code ItemFrame}/
     *  {@code ArmorStand}) : un joueur en créatif retire l'écran d'un coup ; sinon rien ne se
     *  passe (le {@code true} retourné signifie "attaque déjà traitée ici", donc jamais de coup
     *  qui passe par {@link #isInvulnerable()} — double protection avec l'invulnérabilité posée
     *  au constructeur, qui couvre les dégâts non liés à une attaque, ex. explosion/feu). */
    @Override
    public boolean skipAttackInteraction(Entity source) {
        if (source instanceof Player player && player.getAbilities().instabuild && !this.level().isClientSide) {
            this.discard();
        }
        return true;
    }

    /** Zone de culling agrandie à la taille du RENDU (bien plus grand que la boîte de collision)
     *  pour que l'écran ne disparaisse pas de l'affichage tant qu'une partie du rendu est visible. */
    @Override
    public AABB getBoundingBoxForCulling() {
        double x = this.getX();
        double y = this.getY();
        double z = this.getZ();
        return new AABB(
                x - RENDER_HALF_WIDTH, y - 0.5, z - RENDER_HALF_WIDTH,
                x + RENDER_HALF_WIDTH, y + RENDER_HEIGHT, z + RENDER_HALF_WIDTH);
    }

    @Override
    protected void readAdditionalSaveData(CompoundTag tag) {
        // Rien à relire : aucun état propre (cf. doc de classe).
    }

    @Override
    protected void addAdditionalSaveData(CompoundTag tag) {
        // Rien à sauver : aucun état propre (cf. doc de classe).
    }
}
