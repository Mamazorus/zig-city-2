package net.bogismok.thedirtystuff.item.custom;

import net.bogismok.thedirtystuff.Config;
import net.minecraft.core.Holder;
import net.minecraft.world.effect.MobEffect;

public class CigaretteItem extends SmokeItem {
    public final int singleUseDuration() {
        return 16;
    }
    public final int smokeAmplifier() {
        return 2;
    }
    public final Holder<MobEffect> effect() {
        return Config.cigaretteEffect();
    }
    public final int effectAmplifier() {
        return Config.cigaretteEffectLevel();
    }
    public int effectDuration() {
        return Config.cigaretteEffectDuration();
    }

    public CigaretteItem(Properties pProperties) {
        super(pProperties);
    }
}
