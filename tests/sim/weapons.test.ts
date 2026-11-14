import { describe, expect, it } from 'vitest';
import { DT } from '../../src/data/balance';
import { WEAPON_ORDER, WEAPONS, type WeaponKind } from '../../src/data/weapons';
import type { World, Unit } from '../../src/sim/world';
import { aWorld, collectEvents, dummy, holdAttack, runTicks, type WorldBuilder } from '../helpers/worldBuilder';
import { emptyInput } from '../../src/sim/types';

const K = 20; // knight position (open field, centre)

/** A knight at (K, K) facing +x with a weapon, god mode, and stationary tanky zombies at offsets (dx, dy) from the knight. */
function arena(weapon: WeaponKind, offsets: [number, number][], tweak: (b: WorldBuilder) => WorldBuilder = (b) => b) {
  const b = tweak(aWorld().god().withWeapon(weapon).withKnightAt(K, K));
  for (const [dx, dy] of offsets) b.withZombieAt(K + dx, K + dy);
  const built = b.build();
  built.knight.facing = { x: 1, y: 0 };
  built.zombies.forEach((z) => dummy(z));
  runTicks(built.world, 1); // let the spatial hash see the zombies
  return built;
}

const damageTaken = (z: Unit) => z.maxHp - z.hp;

/** Presses attack for one tick (one swing / throw / pulse), then watches for `seconds`. */
function singleStrike(world: World, seconds = 1.5) {
  const events = collectEvents(world, 1, holdAttack());
  events.push(...collectEvents(world, Math.round(seconds / DT), emptyInput()));
  const hits = (z: Unit) => events.filter((e) => e.type === 'hit' && e.unit === z.id);
  return { events, hits };
}

describe('weapon basics', () => {
  it('defaults to the sword and exposes its definition', () => {
    const { world } = aWorld().build();
    expect(world.weapon).toBe('sword');
    expect(world.weaponDef).toBe(WEAPONS.sword);
  });

  it.each(WEAPON_ORDER)('withWeapon(%s) selects that weapon, and swing events name it', (kind) => {
    const { world, knight } = arena(kind, [[1.0, 0]]);
    expect(world.weapon).toBe(kind);
    const events = collectEvents(world, 3, holdAttack());
    const swing = events.find((e) => e.type === 'swing');
    expect(swing).toMatchObject({ type: 'swing', unit: knight.id, weapon: kind });
  });
});

describe('sword (unchanged)', () => {
  it('hits a zombie in reach for its damage and knocks it back', () => {
    const { world, zombies: [z] } = arena('sword', [[1.0, 0]]);
    singleStrike(world);
    expect(damageTaken(z)).toBe(WEAPONS.sword.damage);
    expect(z.x).toBeGreaterThan(K + 1.0);
  });

  it('cannot reach a zombie 1.9 cells ahead', () => {
    const { world, zombies: [z] } = arena('sword', [[1.9, 0]]);
    const { hits } = singleStrike(world);
    expect(hits(z)).toHaveLength(0);
    expect(z.hp).toBe(z.maxHp);
  });

  it('explicit sword behaves exactly like the default weapon', () => {
    const run = (explicit: boolean) => {
      const b = aWorld().god().withKnightAt(K, K).withZombieAt(K + 1, K).withZombieAt(K + 0.8, K + 0.6);
      const { world, knight, zombies } = (explicit ? b.withWeapon('sword') : b).build();
      knight.facing = { x: 1, y: 0 };
      zombies.forEach((z) => dummy(z));
      for (let k = 0; k < 120; k++) world.tick([holdAttack()]);
      return zombies.map((z) => [z.hp, z.x, z.y]);
    };
    expect(run(true)).toEqual(run(false));
  });
});

describe('spear', () => {
  it('hits a zombie 1.9 cells ahead that the sword cannot reach', () => {
    const { world, zombies: [z] } = arena('spear', [[1.9, 0]]);
    const { hits } = singleStrike(world);
    expect(hits(z)).toHaveLength(1);
    expect(damageTaken(z)).toBe(WEAPONS.spear.damage);
  });

  it('pierces two zombies in a line but misses one 45 degrees off-axis', () => {
    const d = 1.5 / Math.SQRT2;
    const { world, zombies: [near, far, side] } = arena('spear', [[1.0, 0], [1.9, 0], [d, d]]);
    singleStrike(world);
    expect(damageTaken(near)).toBe(WEAPONS.spear.damage);
    expect(damageTaken(far)).toBe(WEAPONS.spear.damage);
    expect(side.hp).toBe(side.maxHp);
  });

  it('does not hit a zombie behind the knight', () => {
    const { world, zombies: [front, behind] } = arena('spear', [[0.9, 0], [-1.3, 0]]);
    singleStrike(world);
    expect(damageTaken(front)).toBeGreaterThan(0);
    expect(behind.hp).toBe(behind.maxHp);
  });
});

describe('warhammer', () => {
  it('damages every zombie within the slam radius ahead, and none outside it', () => {
    // Slam centre is 0.8 ahead; radius 1.2.
    const { world, zombies } = arena('hammer', [[1.0, 0], [0.8, 0.9], [0.8, -0.9], [0.8, 2.2], [4, 0]]);
    singleStrike(world);
    const [a, b, c, outside, far] = zombies;
    for (const z of [a, b, c]) expect(damageTaken(z), 'inside slam').toBe(WEAPONS.hammer.damage);
    expect(outside.hp).toBe(outside.maxHp);
    expect(far.hp).toBe(far.maxHp);
  });

  it('knocks zombies back further than the sword does', () => {
    const push = (weapon: WeaponKind) => {
      const { world, zombies: [z] } = arena(weapon, [[1.3, 0]]);
      singleStrike(world, 1.5);
      expect(damageTaken(z), weapon).toBeGreaterThan(0);
      return z.x - (K + 1.3);
    };
    const sword = push('sword');
    const hammer = push('hammer');
    expect(sword).toBeGreaterThan(0.1);
    expect(hammer).toBeGreaterThan(sword * 1.5);
  });

  it('has a slower swing than the sword', () => {
    expect(WEAPONS.hammer.cooldown).toBeGreaterThan(WEAPONS.sword.cooldown);
  });
});

describe('throwing axes', () => {
  /** Hold one tick then watch the axe: per-tick state plus which leg each hit landed on. */
  function watchAxe(offsets: [number, number][]) {
    const { world, knight, zombies } = arena('axes', offsets);
    const hitLegs = new Map<number, boolean[]>();
    let maxDist = 0;
    let throws = 0;
    let removedAt = -1;
    let sawAxe = false;
    for (let k = 0; k < 300; k++) {
      world.tick([k === 0 ? holdAttack() : emptyInput()]);
      throws += world.events.filter((e) => e.type === 'axeThrow').length;
      const axe = world.projectiles.find((p) => p.kind === 'axe');
      if (axe) {
        sawAxe = true;
        maxDist = Math.max(maxDist, Math.hypot(axe.x - knight.x, axe.y - knight.y));
      } else if (sawAxe && removedAt < 0) removedAt = k * DT;
      for (const e of world.events) {
        if (e.type !== 'hit' || !axe) continue;
        const legs = hitLegs.get(e.unit) ?? [];
        legs.push(axe.returning);
        hitLegs.set(e.unit, legs);
      }
    }
    return { world, knight, zombies, hitLegs, maxDist, throws, removedAt };
  }

  it('flies out about its range, returns to the knight and removes itself', () => {
    const r = watchAxe([[3, 0]]);
    expect(r.throws).toBe(1);
    expect(r.maxDist).toBeGreaterThan(WEAPONS.axes.range - 0.3);
    expect(r.maxDist).toBeLessThan(WEAPONS.axes.range + 0.5);
    expect(r.removedAt).toBeGreaterThan(0);
    expect(r.removedAt).toBeLessThan(2);
    expect(r.world.projectiles.filter((p) => p.kind === 'axe')).toHaveLength(0);
  });

  it('hits a zombie on the way out and again on the way back (2 hits)', () => {
    const r = watchAxe([[3, 0]]);
    const [z] = r.zombies;
    expect(r.hitLegs.get(z.id)).toEqual([false, true]);
    expect(damageTaken(z)).toBe(2 * WEAPONS.axes.damage);
  });

  it('never hits the same zombie twice in one leg, even with several in line', () => {
    const r = watchAxe([[2, 0], [3, 0], [3.5, 0.2]]);
    for (const z of r.zombies) {
      const legs = r.hitLegs.get(z.id) ?? [];
      expect(legs.filter((l) => !l), `outbound hits on ${z.id}`).toHaveLength(1);
      expect(legs.filter((l) => l), `return hits on ${z.id}`).toHaveLength(1);
    }
  });

  it('removes itself even when nothing is hit', () => {
    const r = watchAxe([[9, 0]]);
    expect(r.zombies[0].hp).toBe(r.zombies[0].maxHp);
    expect(r.removedAt).toBeGreaterThan(0);
    expect(r.world.projectiles).toHaveLength(0);
  });
});

describe('flail', () => {
  const pulses = (events: ReturnType<typeof collectEvents>) => events.filter((e) => e.type === 'swing').length;

  it('pulses damage to every zombie in range each cooldown while attack is held', () => {
    const { world, zombies } = arena('flail', [[0.8, 0], [0, 0.9], [-1.0, 0], [4, 0]]);
    const events = collectEvents(world, 60, holdAttack());
    const n = pulses(events);
    expect(n).toBeGreaterThanOrEqual(4);
    expect(n).toBeLessThanOrEqual(5);
    for (const z of zombies.slice(0, 3)) expect(damageTaken(z)).toBe(n * WEAPONS.flail.damage);
    expect(zombies[3].hp).toBe(zombies[3].maxHp);
  });

  it('deals no damage when attack is not held', () => {
    const { world, zombies } = arena('flail', [[0.8, 0], [-0.9, 0]]);
    const events = collectEvents(world, 90, emptyInput());
    expect(pulses(events)).toBe(0);
    for (const z of zombies) expect(z.hp).toBe(z.maxHp);
  });

  it('stops pulsing as soon as attack is released', () => {
    const { world, zombies: [z] } = arena('flail', [[0.8, 0]]);
    collectEvents(world, 20, holdAttack());
    const before = z.hp;
    collectEvents(world, 60, emptyInput());
    expect(z.hp).toBe(before);
  });
});

describe('upgrade mods apply to every weapon', () => {
  const MUL = 1.4; // blade x2

  it.each(WEAPON_ORDER)('blade raises %s damage', (kind) => {
    const hit = (blade: number) => {
      const { world, zombies: [z] } = arena(kind, [[1.0, 0]], (b) => b.withUpgrades({ blade }));
      const first = singleStrike(world).hits(z)[0];
      expect(first, kind).toBeDefined();
      return first.type === 'hit' ? first.damage : 0;
    };
    expect(hit(0)).toBeCloseTo(WEAPONS[kind].damage);
    expect(hit(2)).toBeCloseTo(WEAPONS[kind].damage * MUL);
  });

  // Centre-to-centre distance just beyond the weapon's base reach, but within it after three Long Reach stacks (x1.45).
  const OUT_OF_BASE_REACH: Record<WeaponKind, number> = { sword: 1.6, spear: 2.5, hammer: 2.3, axes: 5.4, flail: 1.9 };

  it.each(WEAPON_ORDER)('reach raises %s range', (kind) => {
    const hitCount = (reach: number) => {
      const { world, zombies: [z] } = arena(kind, [[OUT_OF_BASE_REACH[kind], 0]], (b) => b.withUpgrades({ reach }));
      return singleStrike(world, 2).hits(z).length;
    };
    expect(hitCount(0), 'without reach').toBe(0);
    expect(hitCount(3), 'with reach').toBeGreaterThan(0);
  });
});

describe('choosing a weapon', () => {
  it('works during planning, and only then', () => {
    const { world } = aWorld().inPlanning(2).build();
    expect(world.phase).toBe('planning');
    expect(world.setWeapon('spear')).toBe(true);
    expect(world.weapon).toBe('spear');
    expect(world.weaponDef).toBe(WEAPONS.spear);
    expect(world.setWeapon('flail')).toBe(true);
    world.start();
    expect(world.setWeapon('sword')).toBe(false);
    expect(world.weapon).toBe('flail');
  });

  it('is refused in a world that never planned', () => {
    const { world } = aWorld().withWeapon('hammer').build();
    expect(world.setWeapon('sword')).toBe(false);
    expect(world.weapon).toBe('hammer');
  });
});
