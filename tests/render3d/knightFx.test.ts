import { describe, expect, it } from 'vitest';
import { GEMS } from '../../src/data/rookies';
import { DashEchoes } from '../../src/render3d/motionFx';
import { knightGear, weaponFx } from '../../src/render3d/upgradeFx';
import { lookFor } from '../../src/render3d/characters';
import { magnetRadius } from '../../src/sim/gems';
import { aWorld } from '../helpers/worldBuilder';

describe('knightGear', () => {
  it('is the plain knight with no upgrades', () => {
    const gear = knightGear(aWorld().build().world);
    expect(gear.weapon).toEqual(weaponFx(0, 0));
    expect(gear.weaponScale).toBe(1);
    expect(gear.bodyScale).toBe(1);
  });

  it('lengthens the weapon with Long Reach and bulks the knight up with Toughness', () => {
    const { world, knight } = aWorld().withUpgrades({ reach: 3, tough: 5 }).build();
    const gear = knightGear(world);
    expect(gear.weaponScale).toBeGreaterThan(1.15);
    expect(gear.bodyScale).toBeGreaterThan(1.1);
    const plain = lookFor(knight, 'sword', knightGear(aWorld().build().world));
    const look = lookFor(knight, 'sword', gear);
    expect(look.key).not.toBe(plain.key);
    expect(look.scale).toBeCloseTo(gear.bodyScale);
    expect(look.attachments[0].scale ?? 1).toBeCloseTo(gear.weaponScale);
    // The shield stays as it is.
    expect(look.attachments[1]).toEqual(plain.attachments[1]);
  });
});

describe('magnetRadius', () => {
  it('grows with Gem Magnet', () => {
    expect(magnetRadius(aWorld().build().world)).toBe(GEMS.magnetRadius);
    expect(magnetRadius(aWorld().withUpgrades({ magnet: 2 }).build().world)).toBeCloseTo(GEMS.magnetRadius * 2);
  });
});

describe('DashEchoes', () => {
  /** Dodges the knight along +x for `seconds` at 60 fps from x = 0, then runs `after` seconds standing. */
  function dash(seconds: number, after = 0) {
    const { knight } = aWorld().build();
    const echoes = new DashEchoes();
    knight.x = 0;
    let clock = 0;
    for (let t = 0; t < seconds; t += 1 / 60) {
      knight.state = 'dodge';
      knight.x += 8.5 / 60;
      clock += 1 / 60;
      echoes.update(knight, clock);
    }
    knight.state = 'idle';
    for (let t = 0; t < after; t += 1 / 60) {
      clock += 1 / 60;
      echoes.update(knight, clock);
    }
    return { knight, echoes, clock };
  }

  it('shows nothing without a dash', () => {
    const { echoes, clock } = dash(0);
    expect(echoes.echoes(3, clock)).toHaveLength(0);
  });

  it('trails up to `count` fading copies behind a dodging knight', () => {
    const { knight, echoes, clock } = dash(0.25);
    const list = echoes.echoes(3, clock);
    expect(list).toHaveLength(3);
    for (let k = 0; k < list.length; k++) {
      expect(list[k].x).toBeLessThan(k === 0 ? knight.x : list[k - 1].x);
      if (k > 0) expect(list[k].alpha).toBeLessThan(list[k - 1].alpha);
    }
    expect(echoes.echoes(1, clock)).toHaveLength(1);
  });

  it('fades out shortly after the dash ends', () => {
    const soon = dash(0.25, 0.05);
    const later = dash(0.25, 0.5);
    expect(soon.echoes.echoes(2, soon.clock).length).toBeGreaterThan(0);
    expect(later.echoes.echoes(2, later.clock)).toHaveLength(0);
  });
});
