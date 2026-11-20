// Town 5 (Lanternwick), phase 3: the night monsters. Shades hunt the knight and shrug off half of
// every blow out of the light, gloom moths put out lamp posts, will-o'-wisps are lights themselves and
// lure rookies out into the dark.

import { describe, expect, it } from 'vitest';
import { KNIGHT } from '../../src/data/balance';
import { MONSTERS } from '../../src/data/monsters';
import { NIGHT } from '../../src/data/night';
import { damageUnit } from '../../src/sim/combat';
import { isLit, lightSpots } from '../../src/sim/light';
import type { World } from '../../src/sim/world';
import { fieldRows } from '../helpers/mapBuilder';
import { aWorld, collectEvents, dummy, runSeconds, runUntil, step, tank } from '../helpers/worldBuilder';

const N = 30;
/** The knight parks in this corner, so his lantern stays out of the way unless a test wants it. */
const FAR = 27;

/** A night field with the given rows patched in (row j → string), knight in the far corner. */
function night(patch: Record<number, string> = {}, wave = 3) {
  const rows = fieldRows(N);
  for (const [j, row] of Object.entries(patch)) rows[Number(j)] = row.padEnd(N, '.');
  return aWorld().withMap(rows).noRookies().atNight(wave).withKnightAt(FAR, FAR);
}

/** A row with `ch` at column i. */
const at = (i: number, ch: string) => '.'.repeat(i) + ch;

describe('shade', () => {
  it('takes half damage standing out of the light and full damage in it', () => {
    const { world, monsters: [shade] } = night({ 10: at(10, 'L') }).withMonster('shade', 20, 20).build();
    tank(shade, 1000);
    expect(isLit(world, shade.x, shade.y)).toBe(false);
    damageUnit(world, shade, 20, -1);
    expect(shade.hp).toBe(1000 - 20 * MONSTERS.shade.shade!.darkDamage);
    // Into the lamp's light.
    shade.x = 11;
    shade.y = 10;
    expect(isLit(world, shade.x, shade.y)).toBe(true);
    damageUnit(world, shade, 20, -1);
    expect(shade.hp).toBe(1000 - 20 * MONSTERS.shade.shade!.darkDamage - 20);
  });

  it('takes full damage at dusk, when everything counts as lit', () => {
    const { world, monsters: [shade] } = night({}, 2).withMonster('shade', 20, 20).build();
    tank(shade, 1000);
    damageUnit(world, shade, 20, -1);
    expect(shade.hp).toBe(980);
  });

  it('hunts the knight, walking past a nearer house', () => {
    const { world, knight, monsters: [shade] } = night({ 12: at(12, '0') }).withMonster('shade', 10, 10).build();
    tank(shade);
    const start = Math.hypot(knight.x - shade.x, knight.y - shade.y);
    runSeconds(world, 3);
    expect(Math.hypot(knight.x - shade.x, knight.y - shade.y)).toBeLessThan(start - 4);
    expect(world.buildings[0].hp).toBe(world.buildings[0].maxHp);
  });
});

describe('gloom moth', () => {
  it('flies to the nearest lit lamp (not a nearer dark one), drains it and puts it out', () => {
    // Dark post at (6, 10) is nearest; lit posts at (14, 10) and (24, 10).
    const { world, monsters: [moth] } = night({ 10: at(6, 'l') + '.......L' + '.........L' }).withMonster('gloomMoth', 4, 10).build();
    tank(moth);
    const lamp = world.lamps[1];
    expect(lamp).toMatchObject({ x: 14, lit: true });
    expect(isLit(world, 15, 10)).toBe(true);
    const events = collectEvents(world, 60 * 25);
    expect(lamp).toMatchObject({ hp: 0, lit: false });
    expect(world.lamps[0].hp).toBe(NIGHT.lampHp);
    expect(events.some((e) => e.type === 'lampSnuffed' && e.lamp === 1)).toBe(true);
    expect(isLit(world, 15, 10)).toBe(false);
    // Then on to the next lit one.
    expect(Math.hypot(moth.x - 24, moth.y - 10)).toBeLessThan(Math.hypot(moth.x - 14, moth.y - 10));
  });

  it('a snuffed post stays standing (not knocked over), so the renderer can tell', () => {
    const { world } = night({ 10: at(10, 'L') }).withMonster('gloomMoth', 10.4, 10).build();
    tank(world.monsters[0]);
    runUntil(world, () => world.lamps[0].hp <= 0, 60 * 20);
    expect(world.lamps[0]).toMatchObject({ hp: 0, lit: false, snuffed: true });
  });

  it('flies over buildings, like a ghost', () => {
    // A wall of house between the moth and the lamp.
    const rows: Record<number, string> = {};
    for (let j = 6; j <= 14; j++) rows[j] = at(8, '0');
    rows[10] = at(8, '0') + '...L';
    const { world, monsters: [moth] } = night(rows).withMonster('gloomMoth', 5, 10).build();
    tank(moth);
    runSeconds(world, 6);
    // At the lamp (12, 10), straight through the wall.
    expect(Math.hypot(moth.x - 12, moth.y - 10)).toBeLessThan(0.7);
    expect(world.lamps[0].hp).toBeLessThan(NIGHT.lampHp);
    expect(MONSTERS.gloomMoth.flying).toBe(true);
  });

  it('with no lit lamp left, it goes for the knight', () => {
    const { world, knight, monsters: [moth] } = night({ 10: at(10, 'l') }).withMonster('gloomMoth', 15, 15).build();
    tank(moth);
    runSeconds(world, 4);
    expect(Math.hypot(knight.x - moth.x, knight.y - moth.y)).toBeLessThan(Math.hypot(FAR - 15, FAR - 15) - 3);
  });

  it('is fragile: one knight blow kills it', () => {
    expect(MONSTERS.gloomMoth.hp).toBeLessThanOrEqual(KNIGHT.attackDamage);
  });
});

describe("will-o'-wisp", () => {
  it('is a light source: the ground round it is lit, and it shows in the light list', () => {
    const { world, monsters: [wisp] } = night().withMonster('wisp', 10, 10).build();
    dummy(wisp);
    step(world);
    expect(isLit(world, 10 + MONSTERS.wisp.light! - 0.2, 10)).toBe(true);
    expect(isLit(world, 10 + MONSTERS.wisp.light! + 0.5, 10)).toBe(false);
    expect(lightSpots(world).some((s) => s.kind === 'wisp' && s.x === wisp.x && s.y === wisp.y)).toBe(true);
    wisp.hp = 0;
    wisp.state = 'dead';
    expect(isLit(world, 10, 10)).toBe(false);
  });

  it('lures a rookie within its radius away from a nearer monster', () => {
    // House far off keeps the rookie at its post otherwise.
    const { world, rookies: [r], monsters: [zombie, wisp] } = night({ 2: at(2, '0') })
      .withRookie('swordsman', 15, 15)
      .withMonster('zombie', 16.5, 15)
      .withMonster('wisp', 15, 15 + MONSTERS.wisp.lure!.radius - 0.5)
      .build();
    dummy(zombie);
    dummy(wisp);
    step(world);
    expect(r.targetId).toBe(wisp.id);
  });

  it('drifts away from a rookie that closes in, out towards the edge, and bursts in one hit', () => {
    const { world, rookies: [r], monsters: [wisp] } = night({ 2: at(2, '0') })
      .withRookie('swordsman', 15, 15)
      .withMonster('wisp', 16.5, 16.5)
      .build();
    tank(r);
    const centre = world.map.centre;
    const out0 = Math.hypot(wisp.x - centre, wisp.y - centre);
    runSeconds(world, 0.6);
    expect(Math.hypot(wisp.x - centre, wisp.y - centre)).toBeGreaterThan(out0);
    expect(Math.hypot(wisp.x - 15, wisp.y - 15)).toBeGreaterThan(Math.hypot(1.5, 1.5));
    // Harmless itself.
    expect(MONSTERS.wisp.damage).toBe(0);
    damageUnit(world, wisp, 1, -1);
    expect(wisp.state).toBe('dead');
  });

  it('rookies chase it into the dark', () => {
    const { world, rookies: [r], monsters: [wisp] } = night({ 2: at(2, '0') })
      .withRookie('swordsman', 15, 15)
      .withMonster('wisp', 17.5, 17.5)
      .build();
    tank(r);
    runSeconds(world, 2);
    expect(Math.hypot(r.x - 15, r.y - 15)).toBeGreaterThan(1.5);
    // Moved out; whatever happened, the wisp did not hurt it.
    expect(r.hp).toBe(r.maxHp);
    void wisp;
  });
});

describe('the night monsters are in the game', () => {
  it.each(['shade', 'gloomMoth', 'wisp'] as const)('%s can be debug-spawned', (kind) => {
    const { world } = night().build();
    const before = world.monsters.length;
    world.debugSpawn(kind, 1, { x: 10, y: 10 });
    expect(world.monsters.length).toBe(before + 1);
    expect(world.monsters.at(-1)!.kind).toBe(kind);
  });

  it('monsters with no lit lamp nearby never touch the lamps', () => {
    const w: World = night({ 10: at(10, 'L') }).withMonster('shade', 10.3, 10).build().world;
    tank(w.monsters[0]);
    runSeconds(w, 2);
    expect(w.lamps[0]).toMatchObject({ hp: NIGHT.lampHp, lit: true });
  });
});
