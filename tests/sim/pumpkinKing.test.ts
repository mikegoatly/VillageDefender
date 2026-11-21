// Town 5 (Lanternwick), phase 4: the Pumpkin King. He lobs flaming pumpkins at buildings (the burning
// patches they leave hurt friendlies and are lights in the dark), and every so often blacks out the
// town: after a flickering warning every light but the knight's lantern and the fires goes out for a
// few seconds while shades come in from the edge.

import { describe, expect, it } from 'vitest';
import { MONSTERS, PUMPKIN_KING } from '../../src/data/monsters';
import { NIGHT } from '../../src/data/night';
import { TOWN_BY_ID } from '../../src/data/towns';
import { TOWN5_WAVES } from '../../src/data/waves';
import { igniteFire } from '../../src/sim/fire';
import { isLit, lightSpots } from '../../src/sim/light';
import type { SimEvent, World } from '../../src/sim/world';
import { fieldRows } from '../helpers/mapBuilder';
import { aWorld, collectEvents, dummy, runSeconds, runUntil, step, tank } from '../helpers/worldBuilder';

const N = 30;
/** The knight parks in this corner, so his lantern stays out of the way unless a test wants it. */
const FAR = 27;
const P = PUMPKIN_KING;

/** A night field (full night) with the given rows patched in (row j → string), knight in the far corner. */
function night(patch: Record<number, string> = {}) {
  const rows = fieldRows(N);
  for (const [j, row] of Object.entries(patch)) rows[Number(j)] = row.padEnd(N, '.');
  return aWorld().withMap(rows).noRookies().atNight(9).withKnightAt(FAR, FAR);
}

/** A row with `ch` at column i. */
const at = (i: number, ch: string) => '.'.repeat(i) + ch;

/** Runs until an event of `type` fires; returns every event seen on the way. */
function runToEvent(w: World, type: SimEvent['type'], seconds: number): SimEvent[] {
  const seen: SimEvent[] = [];
  runUntil(w, () => { seen.push(...w.events); return w.events.some((e) => e.type === type); }, Math.round(seconds * 60));
  expect(seen.some((e) => e.type === type), `no ${type} within ${seconds}s`).toBe(true);
  return seen;
}

describe('Pumpkin King: data', () => {
  it("is Lanternwick's boss, in wave 10 in place of the stand-in", () => {
    expect(MONSTERS.pumpkinKing.boss).toBe('pumpkinKing');
    expect(MONSTERS.pumpkinKing.name).toBe(TOWN_BY_ID.lanternwick.bossName);
    expect(TOWN5_WAVES[9].monsters.pumpkinKing).toBe(1);
    expect(TOWN5_WAVES[9].monsters.gravekeeper).toBeUndefined();
  });
});

describe('Pumpkin King: flaming pumpkins', () => {
  /** A house at (20, 10), the boss in throwing range of it, nobody else about. */
  const lobWorld = () => {
    const built = night({ 10: at(20, '0') }).withMonster('pumpkinKing', 12, 10).build();
    const boss = dummy(built.monsters[0]);
    boss.boss!.blackoutIn = 1e9;
    return { ...built, boss };
  };

  it('lobs one at a building: telegraphed, then damage, and a fire on the ground beside it, on his side', () => {
    const { world, boss } = lobWorld();
    const b = world.buildings[0];
    const seen = runToEvent(world, 'bossBoulder', P.pumpkin.every + 2);
    const warn = seen.find((e) => e.type === 'bossBoulderWarn');
    expect(warn).toMatchObject({ unit: boss.id, x: 20, y: 10, radius: P.pumpkin.radius, time: P.pumpkin.telegraph, pumpkin: true });
    expect(seen.find((e) => e.type === 'bossBoulder')).toMatchObject({ x: 20, y: 10, pumpkin: true });
    expect(b.maxHp - b.hp).toBe(P.pumpkin.buildingDamage);
    expect(world.fires).toHaveLength(1);
    expect(world.fires[0]).toMatchObject({ x: 19, y: 10, radius: P.fire.radius });
  });

  it('the burning patch hurts a knight and a rookie standing in it, and nobody outside it', () => {
    const { world, knight } = night().withKnightAt(10, 10).withRookie('swordsman', 10.5, 10.4).withRookie('swordsman', 10 + P.fire.radius + 1.5, 10).build();
    const [inside, outside] = world.rookies;
    // Rookies would walk off after the knight: pin everyone where they stand.
    const pinned = [knight, inside, outside].map((u) => [u, u.x, u.y] as const);
    igniteFire(world, 10, 10);
    for (let t = 0; t < 120; t++) {
      step(world);
      for (const [u, x, y] of pinned) [u.x, u.y] = [x, y];
    }
    expect(knight.hp).toBeLessThan(knight.maxHp);
    expect(inside.hp).toBeLessThan(inside.maxHp);
    expect(outside.hp).toBe(outside.maxHp);
  });

  it('lights the dark round it (archers can shoot into it) until it burns out', () => {
    const { world } = night().build();
    expect(isLit(world, 10, 10)).toBe(false);
    igniteFire(world, 10, 10);
    expect(isLit(world, 10, 10)).toBe(true);
    expect(isLit(world, 10 + NIGHT.radius.fire - 0.1, 10)).toBe(true);
    expect(isLit(world, 10 + NIGHT.radius.fire + 0.3, 10)).toBe(false);
    expect(lightSpots(world).some((s) => s.kind === 'fire' && s.x === 10 && s.y === 10)).toBe(true);
    runSeconds(world, P.fire.time + 0.1);
    expect(world.fires).toEqual([]);
    expect(isLit(world, 10, 10)).toBe(false);
  });
});

describe('Pumpkin King: blackout', () => {
  /**
   * A house (window light round (6, 6)), a lit lamp at (10, 15), a still wisp at (20, 4) and the boss
   * out of the way at (20, 22). He throws no pumpkins.
   */
  const blackoutWorld = () => {
    const built = night({ 5: at(5, '0'), 15: at(10, 'L') }).withMonster('pumpkinKing', 20, 22).withMonster('wisp', 20, 4).build();
    const [boss, wisp] = built.monsters;
    dummy(boss);
    dummy(wisp);
    boss.boss!.boulderIn = 1e9;
    return { ...built, boss, wisp };
  };
  const lights = (w: World, wisp: { x: number; y: number }) => ({
    lamp: isLit(w, 11, 15), window: isLit(w, 8, 6), wisp: isLit(w, wisp.x, wisp.y), lantern: isLit(w, FAR - 1, FAR),
  });
  const shades = (w: World) => w.monsters.filter((m) => m.kind === 'shade' && m.state !== 'dead').length;

  it('warns first (lights still on), then puts out lamps, windows and wisps, leaving the lantern', () => {
    const { world, wisp } = blackoutWorld();
    const all = { lamp: true, window: true, wisp: true, lantern: true };
    expect(lights(world, wisp)).toEqual(all);
    const seen = runToEvent(world, 'blackoutWarn', P.blackout.first + 0.5);
    expect(world.time).toBeGreaterThan(P.blackout.first - 0.5);
    expect(seen.find((e) => e.type === 'blackoutWarn')).toMatchObject({ time: P.blackout.telegraph });
    expect(lights(world, wisp)).toEqual(all);

    runToEvent(world, 'blackout', P.blackout.telegraph + 0.2);
    expect(world.blackout).toBeGreaterThan(0);
    expect(lights(world, wisp)).toEqual({ lamp: false, window: false, wisp: false, lantern: true });
    expect(lightSpots(world).map((s) => s.kind)).toEqual(['lantern']);
  });

  it('fire still burns through a blackout', () => {
    const { world } = blackoutWorld();
    runToEvent(world, 'blackout', P.blackout.first + P.blackout.telegraph + 1);
    igniteFire(world, 15, 15);
    expect(isLit(world, 15, 15)).toBe(true);
    expect(lightSpots(world).map((s) => s.kind)).toEqual(['lantern', 'fire']);
  });

  it('sends shades in from the edge of the town in the dark', () => {
    const { world } = blackoutWorld();
    expect(shades(world)).toBe(0);
    runToEvent(world, 'blackout', P.blackout.first + P.blackout.telegraph + 1);
    expect(shades(world)).toBe(P.blackout.shades);
    for (const s of world.monsters.filter((m) => m.kind === 'shade')) {
      expect(Math.min(s.x, s.y, N - 1 - s.x, N - 1 - s.y)).toBeLessThan(1);
    }
  });

  it('the lights come back after the blackout, and it comes round again', () => {
    const { world, wisp } = blackoutWorld();
    runToEvent(world, 'blackout', P.blackout.first + P.blackout.telegraph + 1);
    const out = world.time;
    runToEvent(world, 'lightsBack', P.blackout.time + 0.2);
    expect(world.time - out).toBeCloseTo(P.blackout.time, 1);
    expect(world.blackout).toBe(0);
    expect(lights(world, wisp)).toEqual({ lamp: true, window: true, wisp: true, lantern: true });
    runToEvent(world, 'blackoutWarn', P.blackout.every + 0.5);
  });

  it('the lights come back even if he dies in the dark', () => {
    const { world, boss } = blackoutWorld();
    runToEvent(world, 'blackout', P.blackout.first + P.blackout.telegraph + 1);
    boss.hp = 1;
    boss.state = 'dead';
    runToEvent(world, 'lightsBack', P.blackout.time + 0.2);
    expect(isLit(world, 11, 15)).toBe(true);
  });

  it('keeps its schedule while he is busy smashing a house', () => {
    // Boss right beside a house, swinging at it the whole time.
    const { world, monsters: [boss] } = night({ 10: at(14, '0') }).withMonster('pumpkinKing', 12.9, 10).build();
    tank(boss);
    boss.boss!.boulderIn = 1e9;
    const seen = collectEvents(world, Math.round((P.blackout.first + P.blackout.telegraph + 0.3) * 60));
    expect(seen.some((e) => e.type === 'buildingHit')).toBe(true);
    expect(seen.some((e) => e.type === 'blackout')).toBe(true);
  });

  it('other towns never black out (no pumpkin king there)', () => {
    const { world } = aWorld().withMap(fieldRows(N)).noRookies().withKnightAt(FAR, FAR).build();
    expect(world.blackout).toBe(0);
    expect(world.fires).toEqual([]);
  });
});
