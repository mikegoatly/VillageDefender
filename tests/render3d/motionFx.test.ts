import { describe, expect, it } from 'vitest';
import { MONSTERS } from '../../src/data/monsters';
import { dashSize, DUST_SPACING, DustTrails, sparkNormal } from '../../src/render3d/motionFx';
import type { Unit } from '../../src/sim/world';
import { aWorld } from '../helpers/worldBuilder';

interface Puff { x: number; z: number; dirX: number; dirZ: number; size: number }

/** Moves `u` by (dx, dy) and runs one trail update, returning the puffs it made. */
function step(trails: DustTrails, u: Unit, dx: number, dy: number): Puff[] {
  u.x += dx;
  u.y += dy;
  const out: Puff[] = [];
  trails.update([[u]], (x, z, dirX, dirZ, size) => out.push({ x, z, dirX, dirZ, size }));
  return out;
}

describe('dashSize', () => {
  it('is zero for a walking knight and positive while he dodges', () => {
    const { knight } = aWorld().build();
    knight.state = 'walk';
    expect(dashSize(knight)).toBe(0);
    knight.state = 'dodge';
    expect(dashSize(knight)).toBeGreaterThan(0);
  });

  it('kicks up dust for a lunging monster, scaled by its size', () => {
    const { monsters } = aWorld().withMonster('vampire', 3, 3).withMonster('brute', 5, 5).build();
    const [vamp, brute] = monsters;
    expect(dashSize(vamp)).toBe(0);
    vamp.burstTime = 0.2;
    brute.burstTime = 0.2;
    expect(dashSize(vamp)).toBeCloseTo(MONSTERS.vampire.scale);
    expect(dashSize(brute)).toBeGreaterThan(dashSize(vamp));
  });

  it('gives a charging boss a heavy wake, and none to the dead', () => {
    const { monsters } = aWorld().withMonster('warlord', 3, 3).build();
    const boss = monsters[0];
    expect(dashSize(boss)).toBe(0);
    boss.boss!.ability = 'charging';
    expect(dashSize(boss)).toBeGreaterThan(MONSTERS.warlord.scale);
    boss.state = 'dead';
    expect(dashSize(boss)).toBe(0);
  });
});

describe('DustTrails', () => {
  it('drops a kick-off puff and then one puff per spacing travelled', () => {
    const { knight } = aWorld().build();
    const trails = new DustTrails();
    knight.state = 'dodge';
    expect(step(trails, knight, 0, 0)).toHaveLength(1);
    const puffs = [...step(trails, knight, DUST_SPACING * 2.5, 0), ...step(trails, knight, DUST_SPACING * 2.5, 0)];
    expect(puffs).toHaveLength(5);
    // Evenly spaced along the path, behind the knight.
    for (let k = 1; k < puffs.length; k++) expect(puffs[k].x - puffs[k - 1].x).toBeCloseTo(DUST_SPACING);
    expect(puffs.every((p) => p.x <= knight.x)).toBe(true);
    // Drifting back the way he came.
    expect(puffs[0].dirX).toBeLessThan(0);
  });

  it('emits nothing while walking', () => {
    const { knight } = aWorld().build();
    const trails = new DustTrails();
    knight.state = 'walk';
    expect(step(trails, knight, 0, 0)).toHaveLength(0);
    expect(step(trails, knight, 2, 0)).toHaveLength(0);
  });

  it('starts each dash fresh rather than filling the gap since the last one', () => {
    const { knight } = aWorld().build();
    const trails = new DustTrails();
    knight.state = 'dodge';
    step(trails, knight, 0, 0);
    step(trails, knight, 1, 0);
    knight.state = 'walk';
    step(trails, knight, 4, 0);
    knight.state = 'dodge';
    // Only the kick-off puff, not a line of dust back to where the last dash ended.
    expect(step(trails, knight, 0, 0)).toHaveLength(1);
  });

  it('forgets units that are no longer passed in', () => {
    const { knight } = aWorld().build();
    const trails = new DustTrails();
    knight.state = 'dodge';
    step(trails, knight, 0, 0);
    expect(trails.tracked).toBe(1);
    trails.update([], () => {});
    expect(trails.tracked).toBe(0);
    step(trails, knight, 0, 0);
    trails.update([[]], () => {});
    expect(trails.tracked).toBe(0);
  });
});

describe('sparkNormal', () => {
  const camera = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
  const len = (v: { x: number; y: number }) => Math.hypot(v.x, v.y);

  it('points between the attacker and the camera', () => {
    const n = sparkNormal({ x: 5, y: 5 }, { x: 4, y: 5 }, camera);
    expect(len(n)).toBeCloseTo(1);
    expect(n.x).toBeLessThan(camera.x);
    expect(n.y).toBeGreaterThan(0);
  });

  it('faces the camera when nobody is credited with the hit', () => {
    const n = sparkNormal({ x: 5, y: 5 }, null, camera);
    expect(n.x).toBeCloseTo(camera.x);
    expect(n.y).toBeCloseTo(camera.y);
  });
});
