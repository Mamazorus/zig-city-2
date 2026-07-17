package net.bogismok.thedirtystuff.item.custom;

import net.bogismok.thedirtystuff.Config;
import net.minecraft.core.Holder;
import net.minecraft.world.effect.MobEffect;

public class CigarItem extends SmokeItem {
    public final int singleUseDuration() {
        return 16;
    }
    public final int smokeAmplifier() {
        return 3;
    }
    public final Holder<MobEffect> effect() {
        return Config.cigarEffect();
    }
    public final int effectAmplifier() {
        return Config.cigarEffectLevel();
    }
    public int effectDuration() {
        return Config.cigarEffectDuration();
    }

    public CigarItem(Properties pProperties) {
        super(pProperties);
    }
}
