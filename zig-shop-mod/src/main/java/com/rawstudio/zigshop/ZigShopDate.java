package com.rawstudio.zigshop;

import java.time.LocalDate;

/**
 * Clé de jour (YYYY-MM-DD) en heure LOCALE du serveur — doit correspondre au calcul
 * du launcher ({@code dayKeyFromOffset}), qui utilise lui aussi la date civile locale.
 * La bascule du shop se fait donc à minuit local.
 */
public final class ZigShopDate {
    private ZigShopDate() {}

    public static String today() {
        return atOffset(0);
    }

    public static String atOffset(int days) {
        LocalDate d = LocalDate.now().plusDays(days);
        return String.format("%04d-%02d-%02d", d.getYear(), d.getMonthValue(), d.getDayOfMonth());
    }
}
