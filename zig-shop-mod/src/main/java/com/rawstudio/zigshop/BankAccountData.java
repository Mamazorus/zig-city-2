package com.rawstudio.zigshop;

import com.mojang.authlib.GameProfile;

import net.minecraft.core.HolderLookup;
import net.minecraft.nbt.CompoundTag;
import net.minecraft.nbt.ListTag;
import net.minecraft.network.chat.Component;
import net.minecraft.server.MinecraftServer;
import net.minecraft.server.level.ServerPlayer;
import net.minecraft.world.level.saveddata.SavedData;

import javax.annotation.Nullable;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.UUID;

/**
 * Comptes de la BANQUE, persistés dans les données du monde (overworld) sous
 * {@code <world>/data/zigshop_bank_accounts.dat} — un {@link SavedData}, PAS le NBT du joueur
 * (cf. {@link QuestState}) : le job quotidien ({@link #applyDailyTick}) doit pouvoir traiter tous
 * les comptes, y compris ceux des joueurs hors-ligne (seule une donnée du MONDE le permet).
 *
 * <p>Deux sous-comptes par joueur : ÉPARGNE (intérêt journalier plafonné) et RISQUÉ (tirage
 * journalier aléatoire). Chacun distingue {@code Eligible} (déjà passé au moins une fois par le
 * job → fructifie/tire) et {@code Pending} (déposé après le dernier passage du job → retirable
 * tout de suite, mais neutre jusqu'au PROCHAIN passage). Ce délai empêche un joueur de déposer
 * juste avant le tirage puis retirer juste après (cf. design validé le 19/07 : garde-fou anti-abus).
 */
public final class BankAccountData extends SavedData {

    /** Nom du fichier {@code .dat} sous {@code <world>/data/}. */
    public static final String FILE_ID = "zigshop_bank_accounts";

    /** Historique borné (derniers jours traités, le plus récent en tête) affiché à l'écran. */
    private static final int MAX_HISTORY = 14;

    /** Résultat d'un jour traité, pour l'historique de l'écran. */
    public record HistoryEntry(String date, long savingsDelta, long riskyDelta) {}

    /** Résultat d'un retrait : {@code net} remis au joueur, {@code fee} prélevé (cf. {@link #creditFee}). */
    public record WithdrawResult(long net, long fee) {}

    /** État complet d'un joueur. Champs en visibilité paquet : lus directement par
     *  {@link BankServerHandler} (même paquet), pas d'API publique nécessaire hors du mod. */
    public static final class Account {
        String name = "";
        long savingsEligible;
        long savingsPending;
        long riskyEligible;
        long riskyPending;
        String lastProcessedDay = "";
        /** Total mémorisé à la dernière ouverture de l'écran ; -1 = jamais ouvert (pas de delta). */
        long lastSeenTotal = -1;
        final List<HistoryEntry> history = new ArrayList<>();

        long savingsTotal() { return savingsEligible + savingsPending; }
        long riskyTotal() { return riskyEligible + riskyPending; }
        long total() { return savingsTotal() + riskyTotal(); }
    }

    private final Map<UUID, Account> accounts = new HashMap<>();
    private final Random random = new Random();

    public BankAccountData() {}

    /** Instance persistée du monde (crée le fichier si absent). À appeler sur le thread serveur. */
    public static BankAccountData get(MinecraftServer server) {
        return server.overworld().getDataStorage().computeIfAbsent(
                new SavedData.Factory<>(BankAccountData::new, BankAccountData::load),
                FILE_ID);
    }

    /** Compte de {@code id} (créé vide au premier accès). {@code name} rafraîchit le pseudo
     *  mémorisé (utile hors-ligne pour {@link #creditFee}) sans jamais l'écraser par du vide. */
    public Account account(UUID id, @Nullable String name) {
        Account a = accounts.computeIfAbsent(id, k -> new Account());
        if (name != null && !name.isBlank()) {
            a.name = name;
        }
        return a;
    }

    /** Dépose {@code amount} sur le sous-compte {@code savings ? épargne : risqué}. Va en
     *  "pending" : ne fructifie/tire qu'à partir du PROCHAIN passage du job (cf. classe). */
    public void deposit(UUID id, String name, boolean savings, long amount) {
        if (amount <= 0) {
            return;
        }
        Account a = account(id, name);
        if (savings) {
            a.savingsPending += amount;
        } else {
            a.riskyPending += amount;
        }
        setDirty();
    }

    /**
     * Retire {@code amount} du sous-compte demandé (pending d'abord, puis eligible — l'ordre est
     * sans effet économique). {@code null} si le solde est insuffisant (rien n'est modifié).
     * Le montant NET (après frais) est à remettre au joueur ; le {@code fee} est à créditer
     * séparément via {@link #creditFee} — ce n'est PAS fait ici pour garder cette méthode pure
     * (aucun besoin du {@link MinecraftServer}/cache de profils juste pour retirer).
     */
    @Nullable
    public WithdrawResult withdraw(UUID id, boolean savings, long amount, double feePct) {
        if (amount <= 0) {
            return null;
        }
        Account a = accounts.get(id);
        long avail = a == null ? 0 : (savings ? a.savingsTotal() : a.riskyTotal());
        if (avail < amount) {
            return null;
        }
        long remaining = amount;
        if (savings) {
            long fromPending = Math.min(a.savingsPending, remaining);
            a.savingsPending -= fromPending;
            remaining -= fromPending;
            a.savingsEligible -= remaining;
        } else {
            long fromPending = Math.min(a.riskyPending, remaining);
            a.riskyPending -= fromPending;
            remaining -= fromPending;
            a.riskyEligible -= remaining;
        }
        setDirty();
        long fee = Math.round(amount * Math.max(0.0, feePct) / 100.0);
        return new WithdrawResult(amount - fee, fee);
    }

    /**
     * Crédite {@code amount} DIRECTEMENT en éligible (pas de délai) sur le compte épargne de
     * {@code recipientName} — c'est la marge du banquier (cf. {@link #withdraw}). Résolu via le
     * cache de profils du serveur, qui connaît un pseudo dès sa toute première connexion (marche
     * donc même si {@code recipientName} est hors-ligne). Best-effort et silencieux si introuvable
     * (config {@code feeRecipient} incorrecte, ou banquier jamais connecté) : un crédit de frais
     * raté ne doit jamais bloquer le retrait du joueur.
     */
    public void creditFee(MinecraftServer server, @Nullable String recipientName, long amount) {
        if (amount <= 0 || recipientName == null || recipientName.isBlank()) {
            return;
        }
        Optional<GameProfile> profile = server.getProfileCache() != null
                ? server.getProfileCache().get(recipientName)
                : Optional.empty();
        if (profile.isEmpty()) {
            ZigShop.LOGGER.warn("[ZigShop] Frais bancaires non credites : \"{}\" introuvable (jamais connecte au serveur ?).", recipientName);
            return;
        }
        Account a = account(profile.get().getId(), recipientName);
        a.savingsEligible += amount;
        setDirty();
    }

    /**
     * Delta (total actuel − dernier total vu) pour l'affichage (flèche ▲/▼ depuis la dernière
     * visite) — LECTURE SEULE, appelable à chaque (re)construction de l'écran sans faire bouger
     * le repère. 0 tant que le joueur n'a jamais ouvert l'écran (rien à comparer).
     */
    public long peekSeenDelta(UUID id, String name) {
        Account a = account(id, name);
        return a.lastSeenTotal < 0 ? 0 : a.total() - a.lastSeenTotal;
    }

    /** Avance le repère de « dernière visite » sur le total ACTUEL. À appeler à la FERMETURE de
     *  l'écran (pas à l'ouverture ni aux rafraîchissements) : si le joueur se déconnecte sans
     *  fermer proprement, le delta continue de s'accumuler jusqu'à sa prochaine vraie visite —
     *  c'est le comportement voulu, pas un bug. */
    public void markSeen(UUID id, String name) {
        Account a = account(id, name);
        a.lastSeenTotal = a.total();
        setDirty();
    }

    /**
     * Traite tous les comptes dont {@code lastProcessedDay != today} : les dépôts PENDING
     * deviennent éligibles, PUIS l'intérêt épargne et le tirage risqué s'appliquent sur les
     * nouveaux totaux éligibles. Ajoute une entrée d'historique et notifie (actionbar) les
     * joueurs actuellement en ligne. Appelé par {@link BankEvents} au changement de jour
     * ({@link ZigShopDate#today()}) — jamais sur le chemin chaud d'un dépôt/retrait.
     */
    public void applyDailyTick(MinecraftServer server, String today, FirebaseClient.BankConfig cfg) {
        boolean changed = false;
        for (Map.Entry<UUID, Account> e : accounts.entrySet()) {
            Account a = e.getValue();
            if (today.equals(a.lastProcessedDay)) {
                continue;
            }
            changed = true;

            a.savingsEligible += a.savingsPending;
            a.savingsPending = 0;
            a.riskyEligible += a.riskyPending;
            a.riskyPending = 0;

            long savingsBase = Math.min(a.savingsEligible, Math.max(0, cfg.savingsCap()));
            long savingsDelta = Math.round(savingsBase * cfg.savingsRatePct() / 100.0);
            a.savingsEligible += savingsDelta;

            long riskyDelta = Math.round(a.riskyEligible * rollRiskyPct(cfg) / 100.0);
            riskyDelta = Math.max(riskyDelta, -a.riskyEligible); // jamais sous zéro (arrondi défavorable)
            a.riskyEligible += riskyDelta;

            a.lastProcessedDay = today;
            a.history.add(0, new HistoryEntry(today, savingsDelta, riskyDelta));
            while (a.history.size() > MAX_HISTORY) {
                a.history.remove(a.history.size() - 1);
            }

            ServerPlayer online = server.getPlayerList().getPlayer(e.getKey());
            if (online != null) {
                pingActionbar(online, savingsDelta, riskyDelta);
            }
        }
        if (changed) {
            setDirty();
        }
    }

    private void pingActionbar(ServerPlayer player, long savingsDelta, long riskyDelta) {
        if (savingsDelta == 0 && riskyDelta == 0) {
            return;
        }
        StringBuilder msg = new StringBuilder("§b[Banque] ");
        boolean any = false;
        if (savingsDelta != 0) {
            msg.append(savingsDelta > 0 ? "§aEpargne +" : "§cEpargne ").append(savingsDelta);
            any = true;
        }
        if (riskyDelta != 0) {
            if (any) {
                msg.append("  §7| ");
            }
            msg.append(riskyDelta > 0 ? "§aRisque +" : "§cRisque ").append(riskyDelta);
        }
        player.displayClientMessage(Component.literal(msg.toString()), true);
    }

    /**
     * Tirage biaisé dans [{@code riskyMinPct}, {@code riskyMaxPct}] dont la MOYENNE vise
     * {@code riskyAvgPct} : {@code min + u^k * span} avec {@code u} uniforme sur [0,1) et
     * {@code k} choisi pour que l'espérance retombe sur {@code riskyAvgPct}
     * ({@code E[u^k] = 1/(k+1)}, donc {@code k = span / (avg - min) - 1}). Repli sur un tirage
     * uniforme si la config est incohérente ({@code riskyAvgPct} hors de l'intervalle ouvert).
     */
    private double rollRiskyPct(FirebaseClient.BankConfig cfg) {
        double min = cfg.riskyMinPct();
        double max = cfg.riskyMaxPct();
        double avg = cfg.riskyAvgPct();
        double span = max - min;
        double u = random.nextDouble();
        if (span <= 0 || avg <= min || avg >= max) {
            return min + u * Math.max(0, span);
        }
        double k = span / (avg - min) - 1.0;
        if (k <= 0) {
            k = 1.0;
        }
        return min + Math.pow(u, k) * span;
    }

    @Override
    public CompoundTag save(CompoundTag tag, HolderLookup.Provider registries) {
        CompoundTag map = new CompoundTag();
        for (Map.Entry<UUID, Account> e : accounts.entrySet()) {
            Account a = e.getValue();
            CompoundTag t = new CompoundTag();
            t.putString("name", a.name);
            t.putLong("savingsEligible", a.savingsEligible);
            t.putLong("savingsPending", a.savingsPending);
            t.putLong("riskyEligible", a.riskyEligible);
            t.putLong("riskyPending", a.riskyPending);
            t.putString("lastProcessedDay", a.lastProcessedDay);
            t.putLong("lastSeenTotal", a.lastSeenTotal);
            ListTag hist = new ListTag();
            for (HistoryEntry h : a.history) {
                CompoundTag ht = new CompoundTag();
                ht.putString("date", h.date());
                ht.putLong("savingsDelta", h.savingsDelta());
                ht.putLong("riskyDelta", h.riskyDelta());
                hist.add(ht);
            }
            t.put("history", hist);
            map.put(e.getKey().toString(), t);
        }
        tag.put("accounts", map);
        return tag;
    }

    /** Recharge l'instance depuis le NBT persisté. */
    public static BankAccountData load(CompoundTag tag, HolderLookup.Provider registries) {
        BankAccountData data = new BankAccountData();
        CompoundTag map = tag.getCompound("accounts");
        for (String uuid : map.getAllKeys()) {
            UUID id;
            try {
                id = UUID.fromString(uuid);
            } catch (IllegalArgumentException ignored) {
                continue; // uuid corrompu : ignoré
            }
            CompoundTag t = map.getCompound(uuid);
            Account a = new Account();
            a.name = t.getString("name");
            a.savingsEligible = t.getLong("savingsEligible");
            a.savingsPending = t.getLong("savingsPending");
            a.riskyEligible = t.getLong("riskyEligible");
            a.riskyPending = t.getLong("riskyPending");
            a.lastProcessedDay = t.getString("lastProcessedDay");
            a.lastSeenTotal = t.contains("lastSeenTotal") ? t.getLong("lastSeenTotal") : -1L;
            ListTag hist = t.getList("history", net.minecraft.nbt.Tag.TAG_COMPOUND);
            for (int i = 0; i < hist.size(); i++) {
                CompoundTag ht = hist.getCompound(i);
                a.history.add(new HistoryEntry(ht.getString("date"), ht.getLong("savingsDelta"), ht.getLong("riskyDelta")));
            }
            data.accounts.put(id, a);
        }
        return data;
    }
}
