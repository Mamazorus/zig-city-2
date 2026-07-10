package com.rawstudio.zigaddiction;

import net.minecraft.core.Holder;
import net.minecraft.core.registries.BuiltInRegistries;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.ResourceLocation;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.effect.MobEffect;
import net.minecraft.world.effect.MobEffectInstance;
import net.minecraft.world.effect.MobEffects;
import net.minecraft.world.item.ItemStack;

/**
 * Cœur du système d'addiction. Sans état propre : tout vit dans {@link AddictionData}
 * (persisté). Appelé exclusivement sur le thread serveur.
 *
 * <p><b>Cycle</b> (durées configurables, cf. {@link AddictionConfig}) :
 * <ol>
 *   <li>Le joueur finit de fumer le joint ⇒ {@link #onSmoke} : compteur remis à zéro,
 *       joueur marqué « accro », effets de manque en cours dissipés.</li>
 *   <li>Après {@code craving_minutes} de jeu ⇒ <b>palier 1</b> : message de manque (une fois).</li>
 *   <li>Après {@code + poison_delay_minutes} ⇒ <b>palier 2</b> : poison léger, qui
 *       s'aggrave d'un cran tous les {@code escalation_step_minutes} (poison plus fort,
 *       puis faim, nausée, faiblesse) jusqu'au palier {@link #MAX_STAGE}.</li>
 *   <li>Refumer ⇒ retour à l'étape 1 : soulagement immédiat. Le seul remède.</li>
 * </ol>
 */
public final class AddictionManager {
    private AddictionManager() {}

    /** Ticks par minute de jeu (20 tick/s × 60 s). */
    public static final long TPM = 20L * 60L;
    /** Palier de manque maximal (plafond de l'escalade). */
    static final int MAX_STAGE = 5;
    /** Durée d'une (ré)application d'effet, renouvelée chaque seconde ⇒ continu, sans clignotement. */
    private static final int EFFECT_DURATION = 100; // 5 s
    /** La nausée frappe par vagues (sinon l'écran déformé en continu est injouable). */
    private static final long NAUSEA_INTERVAL = 30L * 20L; // toutes les 30 s
    private static final int NAUSEA_DURATION = 180;        // ~9 s de nausée par vague
    /** Avertissement envoyé ~2 min avant la mort par overdose de manque. */
    private static final long WARN_BEFORE_DEATH = 2L * TPM;

    // ─── Événements de gameplay ───────────────────────────────────────────────

    /** Le joueur a fini de fumer le joint : (re)démarre le cycle et dissipe le manque. */
    public static void onSmoke(ServerPlayer player) {
        if (!AddictionConfig.enabled()) {
            return;
        }
        AddictionData data = AddictionData.get(player.getServer());
        AddictionData.Entry e = data.getOrCreate(player.getUUID());

        boolean wasSuffering = e.cravingSent || e.stage >= 1;
        boolean wasPoisoned = e.stage >= 2;

        e.onlineTicks = 0L;
        e.addicted = true;
        e.cravingSent = false;
        e.stage = 0;
        data.setDirty();

        if (wasPoisoned) {
            clearWithdrawalEffects(player); // soulagement net et immédiat
        }
        if (wasSuffering) {
            player.sendSystemMessage(Component.literal(
                    "§8[§2Zig City§8] §aVous tirez une longue bouffée. Le manque reflue, le soulagement vous envahit."));
        }
    }

    /**
     * Guérit TOTALEMENT la dépendance : le joueur n'est plus suivi (il redevient « propre »
     * jusqu'à sa prochaine taffe) et ses effets de manque en cours sont dissipés. C'est
     * l'équivalent de {@code /zigaddiction reset}, mais déclenché en jeu par le remède
     * consommable ({@link com.rawstudio.zigaddiction.item.DetoxItem}).
     *
     * <p>Note : contrairement à {@link #onSmoke} (qui remet le compteur à zéro mais laisse
     * le joueur accro), la cure supprime l'addiction elle-même.
     *
     * @return {@code true} si le joueur était réellement dépendant (le remède a donc agi) ;
     *         {@code false} s'il n'y avait rien à soigner.
     */
    public static boolean cure(ServerPlayer player) {
        AddictionData data = AddictionData.get(player.getServer());
        AddictionData.Entry e = data.get(player.getUUID());
        clearWithdrawalEffects(player);
        if (e == null || !e.addicted) {
            return false;
        }
        data.clear(player.getUUID());
        return true;
    }

    /** Appelé chaque tick serveur pour chaque joueur en ligne. */
    public static void onServerPlayerTick(ServerPlayer player) {
        if (!AddictionConfig.enabled()) {
            return;
        }
        AddictionData data = AddictionData.get(player.getServer());
        AddictionData.Entry e = data.get(player.getUUID());
        if (e == null || !e.addicted) {
            return; // jamais fumé ⇒ pas suivi, aucun effet
        }
        e.onlineTicks++;
        if (e.onlineTicks % 20L != 0L) {
            return; // on n'évalue qu'une fois par seconde
        }
        data.setDirty();
        evaluate(player, data, e);
    }

    /** (Re)prévient un joueur qui se (re)connecte alors qu'il est déjà en plein manque. */
    public static void onLogin(ServerPlayer player) {
        if (!AddictionConfig.enabled()) {
            return;
        }
        AddictionData.Entry e = AddictionData.get(player.getServer()).get(player.getUUID());
        if (e != null && e.addicted && e.stage >= 1) {
            player.sendSystemMessage(Component.literal(
                    "§8[§2Zig City§8] §7Le manque vous tenaille toujours... §oil vous faudrait un joint."));
        }
    }

    // ─── Évaluation périodique (1×/s) ─────────────────────────────────────────

    private static void evaluate(ServerPlayer player, AddictionData data, AddictionData.Entry e) {
        // Point culminant : la mort par overdose de manque (configurable, 0 = jamais létal).
        long deathTicks = (long) AddictionConfig.deathMinutes() * TPM;
        if (deathTicks > 0L) {
            long warnAt = deathTicks - WARN_BEFORE_DEATH;
            if (e.onlineTicks >= warnAt && e.onlineTicks < warnAt + 20L && e.onlineTicks < deathTicks) {
                player.sendSystemMessage(Component.literal(
                        "§8[§2Zig City§8] §4§lVotre cœur s'emballe... §r§cvous ne tiendrez plus longtemps sans une taffe."));
            }
            if (e.onlineTicks >= deathTicks && player.isAlive()) {
                killFromWithdrawal(player, data, e);
                return;
            }
        }

        int target = targetStage(e.onlineTicks);

        // Palier 1 : message de manque, une seule fois par cycle.
        if (target >= 1 && !e.cravingSent) {
            e.cravingSent = true;
            player.sendSystemMessage(message(1));
        }
        // Aggravation : message à chaque nouveau palier franchi (≥ 2).
        if (target > e.stage) {
            if (target >= 2) {
                player.sendSystemMessage(message(target));
            }
            e.stage = target;
        } else if (target < e.stage) {
            e.stage = target; // sécurité : ne devrait pas arriver hors refume
        }

        // Effets de manque, réappliqués tant qu'on est dans la zone « poison ».
        if (e.stage >= 2) {
            applyWithdrawalEffects(player, e);
        }
    }

    /** Palier de manque correspondant à un temps de jeu donné (depuis la dernière taffe). */
    public static int targetStage(long onlineTicks) {
        long craving = (long) AddictionConfig.cravingMinutes() * TPM;
        long poisonStart = craving + (long) AddictionConfig.poisonDelayMinutes() * TPM;
        long step = Math.max(1L, (long) AddictionConfig.escalationStepMinutes() * TPM);
        if (onlineTicks < craving) {
            return 0;
        }
        if (onlineTicks < poisonStart) {
            return 1;
        }
        int stage = 2 + (int) ((onlineTicks - poisonStart) / step);
        return Math.min(stage, MAX_STAGE);
    }

    private static Component message(int stage) {
        return switch (stage) {
            case 1 -> Component.literal("§8[§2Zig City§8] §7Vous ne vous sentez pas très bien... §oune envie pressante de tirer sur un joint vous tenaille.");
            case 2 -> Component.literal("§8[§2Zig City§8] §cLe manque vous ronge — votre corps réclame sa dose. §7Trouvez un joint, et vite.");
            case 3 -> Component.literal("§8[§2Zig City§8] §cÇa empire... §7la tête vous tourne et l'estomac se noue.");
            case 4 -> Component.literal("§8[§2Zig City§8] §4En pleine descente. §cTremblements et nausées vous submergent — il vous faut un joint.");
            default -> Component.literal("§8[§2Zig City§8] §4§lMANQUE CRITIQUE. §r§cVotre corps vous lâche. Un joint. Tout de suite.");
        };
    }

    /**
     * Le manque atteint son terme : le joueur meurt. On recule ensuite son compteur d'un cran
     * d'escalade pour éviter toute boucle de morts au respawn — il ressuscite en manque critique,
     * avec un sursis avant la prochaine échéance (la mort ne « soigne » donc pas l'addiction).
     */
    private static void killFromWithdrawal(ServerPlayer player, AddictionData data, AddictionData.Entry e) {
        long deathTicks = (long) AddictionConfig.deathMinutes() * TPM;
        long relief = (long) AddictionConfig.escalationStepMinutes() * TPM;
        e.onlineTicks = Math.max(0L, deathTicks - relief);
        e.stage = targetStage(e.onlineTicks);
        data.setDirty();
        player.sendSystemMessage(Component.literal(
                "§8[§2Zig City§8] §4§lLe manque a eu raison de vous. §r§7Votre corps s'effondre."));
        player.hurt(player.damageSources().magic(), Float.MAX_VALUE);
    }

    private static void applyWithdrawalEffects(ServerPlayer player, AddictionData.Entry e) {
        // Le manque seul ne DOIT pas tuer avant l'heure : le poison plafonne déjà à 1 cœur ;
        // on empêche en plus la famine (effet Faim). Seule la mort scriptée (death_minutes) tue.
        if (player.getFoodData().getFoodLevel() < 1) {
            player.getFoodData().setFoodLevel(1);
        }
        int poison;
        int hunger = -1;
        int weakness = -1;
        boolean nausea = false;
        switch (e.stage) {
            case 2 -> poison = 0;                                             // Poison I
            case 3 -> { poison = 0; hunger = 0; }                             // + Faim I
            case 4 -> { poison = 1; hunger = 0; nausea = true; }              // Poison II + Faim I + nausée
            default -> { poison = 1; hunger = 1; weakness = 0; nausea = true; } // stage ≥ 5 : + Faim II + Faiblesse I
        }
        apply(player, MobEffects.POISON, poison);
        if (hunger >= 0) {
            apply(player, MobEffects.HUNGER, hunger);
        }
        if (weakness >= 0) {
            apply(player, MobEffects.WEAKNESS, weakness);
        }
        if (nausea && e.onlineTicks % NAUSEA_INTERVAL == 0L) {
            player.addEffect(new MobEffectInstance(MobEffects.CONFUSION, NAUSEA_DURATION, 0, false, false, true));
        }
    }

    private static void apply(ServerPlayer player, Holder<MobEffect> effect, int amplifier) {
        // ambient=false, showParticles=false (discret), showIcon=true (visible dans l'inventaire).
        player.addEffect(new MobEffectInstance(effect, EFFECT_DURATION, amplifier, false, false, true));
    }

    /** Dissipe les effets que MON mod applique (au refume ou via /zigaddiction cure). */
    public static void clearWithdrawalEffects(ServerPlayer player) {
        player.removeEffect(MobEffects.POISON);
        player.removeEffect(MobEffects.HUNGER);
        player.removeEffect(MobEffects.WEAKNESS);
        player.removeEffect(MobEffects.CONFUSION);
    }

    // ─── Détection de l'item ──────────────────────────────────────────────────

    /** L'item consommé est-il le joint configuré (par défaut {@code nirvana:joint}) ? */
    public static boolean isConfiguredJoint(ItemStack stack) {
        if (stack == null || stack.isEmpty()) {
            return false;
        }
        ResourceLocation key = BuiltInRegistries.ITEM.getKey(stack.getItem());
        return key != null && key.toString().equals(AddictionConfig.jointItemId());
    }
}
