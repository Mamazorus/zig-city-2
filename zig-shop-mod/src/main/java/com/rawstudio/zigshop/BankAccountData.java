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
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
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
 * (cf. {@link QuestState}) : le job périodique ({@link #applyPeriodTick}) doit pouvoir traiter
 * tous les comptes, y compris ceux des joueurs hors-ligne (seule une donnée du MONDE le permet).
 *
 * <p>Deux sous-comptes par joueur : ÉPARGNE (intérêt plafonné) et RISQUÉ (tirage aléatoire), chacun
 * recalculé sur son PROPRE cycle ({@code FirebaseClient.BankConfig#savingsPeriodHours}/
 * {@code riskyPeriodHours}, 24 h par défaut pour les deux). Chacun distingue {@code Eligible} (déjà passé au moins une fois par le job →
 * fructifie/tire) et {@code Pending} (déposé après le dernier passage du job → retirable tout de
 * suite, mais neutre jusqu'au PROCHAIN passage). Ce délai empêche un joueur de déposer juste avant
 * le tirage puis retirer juste après (cf. design validé le 19/07 : garde-fou anti-abus).
 *
 * <p>Le pourcentage RISQUÉ n'est PAS tiré individuellement par joueur : un seul tirage par cycle,
 * PARTAGÉ par tous (cf. {@link #getOrRollRiskyPct}) — une vraie tendance de marché commune que les
 * joueurs peuvent observer et sur laquelle ils peuvent bâtir une stratégie collective, pas une
 * loterie individuelle isolée (design demandé le 21/07).
 */
public final class BankAccountData extends SavedData {

    /** Nom du fichier {@code .dat} sous {@code <world>/data/}. */
    public static final String FILE_ID = "zigshop_bank_accounts";

    /** Historique borné (derniers cycles traités, le plus récent en tête) affiché à l'écran. */
    private static final int MAX_HISTORY = 14;

    /** Historique borné du tirage RISQUÉ PARTAGÉ (cf. {@link #riskyHistory}) — beaucoup plus long
     *  que {@link #MAX_HISTORY} : une seule liste pour TOUS les joueurs (pas par compte), donc bon
     *  marché à garder, et un graphique en bougies a besoin de plus de points qu'une liste texte. */
    private static final int MAX_RISKY_HISTORY = 60;

    /** Valeur de départ de l'indice synthétique du marché RISQUÉ (cf. {@link RiskyCandle}) — un
     *  repère arbitraire (pas une somme réelle), choisi rond pour que les mouvements en points
     *  restent lisibles. */
    private static final double RISKY_INDEX_BASE = 1000.0;

    /** Horodatage lisible d'une entrée d'historique (inclut l'heure : un cycle peut être < 24 h). */
    private static final DateTimeFormatter HISTORY_FMT = DateTimeFormatter.ofPattern("dd/MM HH:mm");

    /** Durée plancher d'un cycle (anti config absurde : periodHours <= 0 bouclerait à chaque tick). */
    private static final long MIN_PERIOD_MS = 60_000L;

    /** Résultat d'un cycle traité, pour l'historique de l'écran. */
    public record HistoryEntry(String date, long savingsDelta, long riskyDelta) {}

    /** Un tirage RISQUÉ passé (un par cycle, PARTAGÉ par tous les comptes) — {@code index} =
     *  valeur de l'indice synthétique APRÈS ce cycle (cf. {@link #riskyCandles()} pour la
     *  conversion en bougies open/close). */
    public record RiskyRollEntry(long period, String date, double pct, double index) {}

    /** Une bougie prête à tracer pour le graphique du taux RISQUÉ : {@code open} = indice à la
     *  fin du cycle précédent, {@code close} = après ce cycle — vert si {@code close >= open}.
     *  Un seul nombre est tiré par cycle (pas de vrai min/haut/bas intra-cycle), donc pas de
     *  wick : la bougie est un simple rectangle open→close, comme une variation de marché. */
    public record RiskyCandle(String date, double pct, double open, double close) {}

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
        /** Numéro du dernier cycle ÉPARGNE/RISQUÉ traité (epoch ms / durée du cycle), chacun
         *  indépendant (cf. {@code FirebaseClient.BankConfig#savingsPeriodHours}/{@code riskyPeriodHours}) ;
         *  -1 = jamais traité. */
        long lastSavingsPeriod = -1;
        long lastRiskyPeriod = -1;
        /** Total mémorisé à la dernière ouverture de l'écran ; -1 = jamais ouvert (pas de delta). */
        long lastSeenTotal = -1;
        final List<HistoryEntry> history = new ArrayList<>();

        long savingsTotal() { return savingsEligible + savingsPending; }
        long riskyTotal() { return riskyEligible + riskyPending; }
        long total() { return savingsTotal() + riskyTotal(); }
    }

    private final Map<UUID, Account> accounts = new HashMap<>();
    private final Random random = new Random();
    /** Tirage RISQUÉ du cycle courant, PARTAGÉ par tous les comptes (pas un tirage par joueur) —
     *  cf. {@link #getOrRollRiskyPct}. Persisté pour que deux joueurs traités à des moments
     *  différents du MÊME cycle (ex. l'un en ligne au passage du cycle, l'autre qui se reconnecte
     *  après un redémarrage serveur survenu entre-temps) voient exactement le même nombre. */
    private long riskyRollPeriod = -1;
    private double riskyRollPct = 0;
    /** Valeur courante de l'indice synthétique du marché RISQUÉ (cf. {@link RiskyCandle}) —
     *  capitalise {@link #riskyRollPct} à chaque NOUVEAU cycle (pas à chaque compte traité). */
    private double riskyIndexValue = RISKY_INDEX_BASE;
    /** Historique borné des tirages RISQUÉS passés, du plus ANCIEN au plus RÉCENT (ordre inverse
     *  de {@code Account.history} : ici on trace une courbe de gauche à droite, pas une liste
     *  d'activité récente). */
    private final List<RiskyRollEntry> riskyHistory = new ArrayList<>();

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
        publishMirror(a);
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
        publishMirror(a);
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
        publishMirror(a);
        setDirty();
    }

    /**
     * Republie le miroir Firebase de TOUS les comptes existants + l'historique RISQUÉ partagé —
     * appelé au démarrage du serveur (cf. {@code BankEvents#onServerStarted}) pour que le
     * dashboard reflète l'état réel dès que le serveur tourne, sans attendre qu'un joueur agisse
     * ou qu'un cycle s'écoule. Couvre les comptes créés depuis la toute première version du
     * banquier : les soldes ne sont jamais perdus entre deux versions du mod (seul le repère de
     * cycle peut être réinitialisé lors d'une migration de schéma NBT, cf. {@link #load}), donc
     * ce rattrapage les republie tous.
     */
    public void publishAllMirrors() {
        for (Account a : accounts.values()) {
            publishMirror(a);
        }
        publishRiskyHistoryMirror();
    }

    /** Publie (best-effort) le miroir Firebase du compte — cf. {@link FirebaseClient#putBankAccount}.
     *  No-op silencieux si le secret serveur n'est pas configuré ou si {@code a.name} est encore
     *  vide (compte jamais associé à un pseudo connu). */
    private void publishMirror(Account a) {
        if (a.name.isBlank()) {
            return;
        }
        String secret = ServerConfig.firebaseSecret();
        if (secret != null) {
            FirebaseClient.putBankAccount(secret, a.name, a.savingsTotal(), a.riskyTotal());
        }
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
     * Traite tous les comptes dont AU MOINS UN sous-compte a un cycle courant différent de son
     * dernier cycle traité — épargne et risqué sont vérifiés et traités INDÉPENDAMMENT (cycles
     * potentiellement différents, cf. {@code FirebaseClient.BankConfig}) : pour le sous-compte dû,
     * les dépôts PENDING deviennent éligibles, PUIS l'intérêt (épargne) ou le tirage (risqué)
     * s'applique sur le nouveau total éligible ; l'autre sous-compte, s'il n'est pas dû, n'est pas
     * touché (son delta d'historique reste à 0 pour ce passage). Le pourcentage RISQUÉ est TIRÉ
     * UNE SEULE FOIS par cycle et PARTAGÉ entre tous les comptes dus ce cycle (cf.
     * {@link #getOrRollRiskyPct}) — pas une loterie individuelle, une vraie tendance commune que
     * les joueurs peuvent observer et anticiper ensemble. Ajoute une entrée d'historique, publie
     * le miroir Firebase et notifie (actionbar) les joueurs actuellement en ligne. Appelé par
     * {@link BankEvents} — jamais sur le chemin chaud d'un dépôt/retrait.
     */
    public void applyPeriodTick(MinecraftServer server, FirebaseClient.BankConfig cfg) {
        long now = System.currentTimeMillis();
        long currentSavingsPeriod = now / periodMs(cfg.savingsPeriodHours());
        long currentRiskyPeriod = now / periodMs(cfg.riskyPeriodHours());
        String stamp = LocalDateTime.now().format(HISTORY_FMT);
        boolean changed = false;
        for (Map.Entry<UUID, Account> e : accounts.entrySet()) {
            Account a = e.getValue();
            boolean savingsDue = currentSavingsPeriod != a.lastSavingsPeriod;
            boolean riskyDue = currentRiskyPeriod != a.lastRiskyPeriod;
            if (!savingsDue && !riskyDue) {
                continue;
            }
            changed = true;

            long savingsDelta = 0;
            if (savingsDue) {
                a.savingsEligible += a.savingsPending;
                a.savingsPending = 0;
                long savingsBase = Math.min(a.savingsEligible, Math.max(0, cfg.savingsCap()));
                savingsDelta = Math.round(savingsBase * cfg.savingsRatePct() / 100.0);
                a.savingsEligible += savingsDelta;
                a.lastSavingsPeriod = currentSavingsPeriod;
            }

            long riskyDelta = 0;
            if (riskyDue) {
                a.riskyEligible += a.riskyPending;
                a.riskyPending = 0;
                double pct = getOrRollRiskyPct(currentRiskyPeriod, cfg);
                riskyDelta = Math.round(a.riskyEligible * pct / 100.0);
                riskyDelta = Math.max(riskyDelta, -a.riskyEligible); // jamais sous zéro (arrondi défavorable)
                a.riskyEligible += riskyDelta;
                a.lastRiskyPeriod = currentRiskyPeriod;
            }

            a.history.add(0, new HistoryEntry(stamp, savingsDelta, riskyDelta));
            while (a.history.size() > MAX_HISTORY) {
                a.history.remove(a.history.size() - 1);
            }
            publishMirror(a);

            ServerPlayer online = server.getPlayerList().getPlayer(e.getKey());
            if (online != null) {
                pingActionbar(online, savingsDelta, riskyDelta);
            }
        }
        if (changed) {
            setDirty();
        }
    }

    /**
     * Pourcentage RISQUÉ du cycle {@code period} : tiré (cf. {@link #rollRiskyPct}) et mémorisé
     * la PREMIÈRE fois qu'un compte de ce cycle est traité, puis simplement relu pour tous les
     * comptes suivants du même cycle — y compris après un redémarrage serveur (le tirage est
     * persisté, pas recalculé à chaque démarrage tant que {@code period} n'a pas changé).
     *
     * <p>C'est aussi ICI (une seule fois par NOUVEAU cycle, jamais par compte) que l'indice
     * synthétique du marché est capitalisé et qu'une entrée est ajoutée à {@link #riskyHistory} +
     * republiée sur Firebase (cf. {@link #publishRiskyHistoryMirror}) — le graphique en bougies
     * (écran en jeu + dashboard) reste donc en phase avec ce que les comptes viennent de subir.
     */
    private double getOrRollRiskyPct(long period, FirebaseClient.BankConfig cfg) {
        if (period != riskyRollPeriod) {
            riskyRollPct = rollRiskyPct(cfg);
            riskyRollPeriod = period;
            riskyIndexValue *= 1.0 + riskyRollPct / 100.0;
            riskyHistory.add(new RiskyRollEntry(period, LocalDateTime.now().format(HISTORY_FMT), riskyRollPct, riskyIndexValue));
            while (riskyHistory.size() > MAX_RISKY_HISTORY) {
                riskyHistory.remove(0);
            }
            publishRiskyHistoryMirror();
        }
        return riskyRollPct;
    }

    /** Bougies open/close prêtes à tracer, dérivées de {@link #riskyHistory} — calcul fait UNE
     *  SEULE fois ici pour que {@code BankServerHandler} (écran en jeu) et
     *  {@link #publishRiskyHistoryMirror} (miroir dashboard) restent forcément d'accord sur
     *  l'{@code open} de chaque bougie (= le {@code close} de la précédente, ou la base pour la
     *  toute première). */
    public List<RiskyCandle> riskyCandles() {
        List<RiskyCandle> out = new ArrayList<>(riskyHistory.size());
        double prev = RISKY_INDEX_BASE;
        for (RiskyRollEntry r : riskyHistory) {
            out.add(new RiskyCandle(r.date(), r.pct(), prev, r.index()));
            prev = r.index();
        }
        return out;
    }

    /** Publie (best-effort) le miroir Firebase de l'historique RISQUÉ PARTAGÉ — cf.
     *  {@link FirebaseClient#putBankRiskyHistory}. No-op silencieux si le secret serveur n'est
     *  pas configuré (même garde-fou que {@link #publishMirror}). */
    private void publishRiskyHistoryMirror() {
        String secret = ServerConfig.firebaseSecret();
        if (secret != null) {
            FirebaseClient.putBankRiskyHistory(secret, riskyCandles());
        }
    }

    /** Durée d'un cycle en ms, avec plancher {@link #MIN_PERIOD_MS} (anti config absurde). */
    private static long periodMs(double hours) {
        return Math.max(MIN_PERIOD_MS, Math.round(hours * 3_600_000.0));
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
            t.putLong("lastSavingsPeriod", a.lastSavingsPeriod);
            t.putLong("lastRiskyPeriod", a.lastRiskyPeriod);
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
        tag.putLong("riskyRollPeriod", riskyRollPeriod);
        tag.putDouble("riskyRollPct", riskyRollPct);
        tag.putDouble("riskyIndexValue", riskyIndexValue);
        ListTag riskyHist = new ListTag();
        for (RiskyRollEntry r : riskyHistory) {
            CompoundTag rt = new CompoundTag();
            rt.putLong("period", r.period());
            rt.putString("date", r.date());
            rt.putDouble("pct", r.pct());
            rt.putDouble("index", r.index());
            riskyHist.add(rt);
        }
        tag.put("riskyHistory", riskyHist);
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
            // Rétrocompat : anciens comptes (avant le passage en cycles configurables, ou avant
            // leur séparation épargne/risqué) sans ces champs -> -1 (jamais traité), retraités au
            // prochain cycle sans perte de données.
            a.lastSavingsPeriod = t.contains("lastSavingsPeriod") ? t.getLong("lastSavingsPeriod") : -1L;
            a.lastRiskyPeriod = t.contains("lastRiskyPeriod") ? t.getLong("lastRiskyPeriod") : -1L;
            a.lastSeenTotal = t.contains("lastSeenTotal") ? t.getLong("lastSeenTotal") : -1L;
            ListTag hist = t.getList("history", net.minecraft.nbt.Tag.TAG_COMPOUND);
            for (int i = 0; i < hist.size(); i++) {
                CompoundTag ht = hist.getCompound(i);
                a.history.add(new HistoryEntry(ht.getString("date"), ht.getLong("savingsDelta"), ht.getLong("riskyDelta")));
            }
            data.accounts.put(id, a);
        }
        data.riskyRollPeriod = tag.contains("riskyRollPeriod") ? tag.getLong("riskyRollPeriod") : -1L;
        data.riskyRollPct = tag.contains("riskyRollPct") ? tag.getDouble("riskyRollPct") : 0.0;
        data.riskyIndexValue = tag.contains("riskyIndexValue") ? tag.getDouble("riskyIndexValue") : RISKY_INDEX_BASE;
        ListTag riskyHist = tag.getList("riskyHistory", net.minecraft.nbt.Tag.TAG_COMPOUND);
        for (int i = 0; i < riskyHist.size(); i++) {
            CompoundTag rt = riskyHist.getCompound(i);
            data.riskyHistory.add(new RiskyRollEntry(rt.getLong("period"), rt.getString("date"), rt.getDouble("pct"), rt.getDouble("index")));
        }
        return data;
    }
}
