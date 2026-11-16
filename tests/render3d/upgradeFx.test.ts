import { describe, expect, it } from 'vitest';
import { MAX_WEAPON_RANK } from '../../src/data/weapons';
import { fxTier, knightWeaponFx, RANK_COLORS, weaponFx } from '../../src/render3d/upgradeFx';
import { aWorld } from '../helpers/worldBuilder';

describe('fxTier', () => {
  it('grows from nothing to full strength as an upgrade stacks', () => {
    expect(fxTier(0, 5)).toEqual({ t: 0, capstone: false });
    expect(fxTier(1, 5).t).toBeCloseTo(0.2);
    expect(fxTier(4, 5).t).toBeGreaterThan(fxTier(3, 5).t);
    expect(fxTier(5, 5)).toEqual({ t: 1, capstone: true });
  });

  it('clamps out-of-range levels', () => {
    expect(fxTier(9, 3)).toEqual({ t: 1, capstone: true });
    expect(fxTier(-1, 3).t).toBe(0);
  });
});

describe('weaponFx', () => {
  it('colours the weapon by shop rank, gold at the top rank', () => {
    expect(RANK_COLORS).toHaveLength(MAX_WEAPON_RANK + 1);
    expect(weaponFx(0, 0).color).toBe(RANK_COLORS[0]);
    expect(weaponFx(MAX_WEAPON_RANK, 0).color).toBe(RANK_COLORS[MAX_WEAPON_RANK]);
    expect(weaponFx(MAX_WEAPON_RANK, 0).flourish).toBe(true);
    expect(weaponFx(MAX_WEAPON_RANK - 1, 0).flourish).toBe(false);
  });

  it('glows brighter with each rank and each Sharpened Blade stack, in a few fixed steps', () => {
    expect(weaponFx(0, 0).glow).toBe(0);
    const glows = [weaponFx(1, 0), weaponFx(2, 0), weaponFx(2, 0.4), weaponFx(3, 1)].map((f) => f.glow);
    for (let k = 1; k < glows.length; k++) expect(glows[k]).toBeGreaterThan(glows[k - 1]);
    expect(glows[3]).toBeLessThanOrEqual(1);
    // Quantised so a few batches cover every combination.
    for (const g of glows) expect(Math.round(g * 4)).toBeCloseTo(g * 4);
  });

  it('keys equal looks equally', () => {
    expect(weaponFx(2, 0.4).key).toBe(weaponFx(2, 0.4).key);
    expect(weaponFx(2, 0.4).key).not.toBe(weaponFx(3, 0.4).key);
  });
});

describe('knightWeaponFx', () => {
  it('reads the shop rank and Sharpened Blade stacks from the world', () => {
    const plain = knightWeaponFx(aWorld().build().world);
    const { world } = aWorld().withWeaponRanks({ sword: 2 }).withUpgrades({ blade: 5 }).build();
    expect(plain).toEqual(weaponFx(0, 0));
    expect(knightWeaponFx(world)).toEqual(weaponFx(2, 1));
  });
});
