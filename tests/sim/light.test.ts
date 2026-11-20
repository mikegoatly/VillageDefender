// Town 5 (Lanternwick), phase 2: light as a rule. What is lit, ranged attacks needing light, lamp
// posts (oil while planning, knocked over by big monsters) and the dusk grace.

import { describe, expect, it } from 'vitest';
import { NIGHT } from '../../src/data/night';
import { TOWN_BY_ID, TOWNS } from '../../src/data/towns';
import { breakLamp, isLit, lightSpots } from '../../src/sim/light';
import { generateTown } from '../../src/sim/map';
import { World } from '../../src/sim/world';
import { fieldRows, mapFromAscii } from '../helpers/mapBuilder';
import { aWorld, collectEvents, dummy, runSeconds } from '../helpers/worldBuilder';

const N = 30;
/** The knight parks in this corner, so his lantern stays out of the way unless a test wants it. */
const FAR = 27;

/** A night field with the given rows patched in (row j → string), knight in the far corner. */
function night(patch: Record<number, string> = {}, wave = 3) {
  const rows = fieldRows(N);
  for (const [j, row] of Object.entries(patch)) rows[Number(j)] = row.padEnd(N, '.');
  return aWorld().withMap(rows).noRookies().atNight(wave).withKnightAt(FAR, FAR);
}

/** A row of N cells with `ch` at column i. */
const at = (i: number, ch: string) => '.'.repeat(i) + ch;

const shots = (w: World, seconds: number) => collectEvents(w, Math.round(seconds * 60)).filter((e) => e.type === 'shot').length;

describe('isLit', () => {
  it("the knight's lantern lights its radius (the largest of the lights)", () => {
    const { world, knight } = night().withKnightAt(10, 10).build();
    expect(isLit(world, 10 + NIGHT.radius.lantern - 0.1, 10)).toBe(true);
    expect(isLit(world, 10 + NIGHT.radius.lantern + 0.6, 10)).toBe(false);
    expect(NIGHT.radius.lantern).toBeGreaterThan(Math.max(NIGHT.radius.window, NIGHT.radius.lamp));
    knight.state = 'dead';
    expect(isLit(world, 10, 10)).toBe(false);
  });

  it("a standing building lights round its window corner; a ruined one gives no light", () => {
    const { world } = night({ 5: at(5, '0') }).build();
    // Window light falls just outside the camera-facing corner: (6, 6).
    expect(isLit(world, 6 + 3, 6)).toBe(true);
    expect(isLit(world, 6 + 4, 6)).toBe(false);
    world.debugSetBuildingHp(0, 0);
    expect(world.buildings[0].ruined).toBe(true);
    expect(isLit(world, 6 + 1, 6)).toBe(false);
  });

  it('a lit lamp post lights its radius; a dark one does not, and a broken one goes dark', () => {
    const { world } = night({ 10: at(10, 'L') + '.....' + 'l' }).build();
    expect(world.lamps.map((l) => [l.x, l.y, l.lit])).toEqual([[10, 10, true], [16, 10, false]]);
    expect(isLit(world, 13, 10)).toBe(true);
    expect(isLit(world, 10, 14)).toBe(false);
    expect(isLit(world, 17, 10)).toBe(false);
    breakLamp(world, world.lamps[0]);
    expect(world.lamps[0]).toMatchObject({ hp: 0, lit: false });
    expect(isLit(world, 11, 10)).toBe(false);
  });

  it('dusk grace: waves 1 and 2 are all lit, darkness counts from wave 3', () => {
    const at1 = night({}, 1).build().world;
    const at2 = night({}, 2).build().world;
    const at3 = night({}, 3).build().world;
    expect(isLit(at1, 3, 3)).toBe(true);
    expect(isLit(at2, 3, 3)).toBe(true);
    expect(isLit(at3, 3, 3)).toBe(false);
  });

  it('other towns are always lit, even deep into the waves', () => {
    const { world } = aWorld().withMap(fieldRows(N)).noRookies().withKnightAt(FAR, FAR).build();
    world.wave = 9;
    expect(isLit(world, 3, 3)).toBe(true);
    expect(world.lamps).toEqual([]);
  });

  it('render and sim share one source list (lantern first, windows, lit lamps only)', () => {
    const { world } = night({ 5: at(5, '0'), 10: at(10, 'L') + '..l' }).withKnightAt(20, 20).build();
    expect(lightSpots(world).map((s) => [s.kind, s.x, s.y, s.radius])).toEqual([
      ['lantern', 20, 20, NIGHT.radius.lantern], ['window', 6, 6, NIGHT.radius.window], ['lamp', 10, 10, NIGHT.radius.lamp],
    ]);
  });
});

describe('ranged attacks need light', () => {
  it('an archer ignores a monster in the dark and shoots one in light', () => {
    // A house far off keeps the archer at its post (with none standing, rookies follow the knight).
    const dark = night({ 2: at(2, '0'), 15: at(18, 'l') }).withRookie('archer', 15, 15).build();
    dummy(dark.world.addMonster(18, 15, 'zombie'));
    expect(shots(dark.world, 3)).toBe(0);
    // Archers don't wander into the dark after it either.
    expect(Math.hypot(dark.rookies[0].x - 15, dark.rookies[0].y - 15)).toBeLessThan(0.7);

    const lit = night({ 15: at(18, 'L') }).withRookie('archer', 15, 15).build();
    dummy(lit.world.addMonster(18, 15, 'zombie'));
    expect(shots(lit.world, 3)).toBeGreaterThan(0);
  });

  it('a watchtower ignores an unlit monster until its lamp is lit', () => {
    const b = night({ 5: at(1, 'l') + '...0' }).withPlan({ 0: 'watchtower' }).build();
    const w = b.world;
    w.wave = 3;
    // In tower range (centre (4, 5)), but out of its own window light at (5, 6).
    dummy(w.addMonster(1.6, 5, 'zombie'));
    expect(isLit(w, 1.6, 5)).toBe(false);
    expect(shots(w, 3)).toBe(0);
    w.debugSetLamp(0, true);
    expect(shots(w, 3)).toBeGreaterThan(0);
  });

  it('arrow slits only shoot into light too', () => {
    const b = night({ 5: at(1, 'l') + '...0' }).withUpgrades({ slits: 1 }).build();
    const w = b.world;
    dummy(w.addMonster(1.6, 5, 'zombie'));
    expect(shots(w, 4)).toBe(0);
    w.debugSetLamp(0, true);
    expect(shots(w, 4)).toBeGreaterThan(0);
  });

  it('a swordsman still fights in the dark', () => {
    const { world, rookies } = night().withRookie('swordsman', 15, 15).build();
    const m = dummy(world.addMonster(15.8, 15, 'zombie'));
    expect(isLit(world, m.x, m.y)).toBe(false);
    runSeconds(world, 2);
    expect(rookies[0].state).not.toBe('dead');
    expect(m.hp).toBeLessThan(m.maxHp);
  });
});

describe('lamp oil', () => {
  const rows = { 10: at(5, 'l') + '....l' + '....L' };

  it('lighting a dark post in planning spends oil; it can not go past the oil or touch lit posts', () => {
    const { world } = night(rows).inPlanning(0).withLampOil(1).build();
    expect(world.lampOilLeft).toBe(1);
    expect(world.setLamp(0, true)).toBe(true);
    expect(world.lampOilLeft).toBe(0);
    expect(world.setLamp(1, true)).toBe(false);
    expect(world.setLamp(2, false)).toBe(false); // lit from the start: not the player's to put out
    expect(world.setLamp(0, false)).toBe(true); // oil back
    expect(world.setLamp(1, true)).toBe(true);
    expect(world.lamps.map((l) => l.lit)).toEqual([false, true, true]);
    world.start();
    expect(world.setLamp(0, true)).toBe(false);
  });

  it('a post lit with oil lights the cells round it once darkness counts', () => {
    const { world } = night(rows).inPlanning(0).withLampOil(1).build();
    world.setLamp(0, true);
    world.start();
    world.wave = 3;
    expect(isLit(world, 5, 12)).toBe(true);
    expect(isLit(world, 10, 12)).toBe(false);
  });

  it('Lanternwick has oil, and its posts out on the approaches start dark while the ones in town start lit', () => {
    const town = TOWN_BY_ID.lanternwick;
    expect(town.lampOil).toBe(3);
    for (const t of TOWNS) if (t !== town) expect(t.lampOil).toBe(0);
    const w = new World({ seed: 1, mapOptions: town.map, waves: town.waves, lampOil: town.lampOil, planning: true });
    const dark = w.lamps.filter((l) => !l.startsLit);
    const lit = w.lamps.filter((l) => l.startsLit);
    expect(dark.length).toBeGreaterThan(town.lampOil);
    expect(lit.length).toBeGreaterThan(0);
    const c = w.map.centre;
    const reach = (l: { x: number; y: number }) => Math.max(Math.abs(l.x - c), Math.abs(l.y - c));
    expect(Math.min(...dark.map(reach))).toBeGreaterThan(Math.max(...lit.map(reach)));
    expect(generateTown(1, town.map).decor.filter((d) => d.kind === 'lamp').map((d) => !!d.lit)).toEqual(w.lamps.map((l) => l.lit));
  });
});

describe('lamp posts get knocked over', () => {
  it('a boss walking through a lamp breaks it', () => {
    const { world } = night({ 10: at(10, 'L') }).build();
    world.addMonster(10.3, 10, 'warlord');
    const events = collectEvents(world, 2);
    expect(world.lamps[0]).toMatchObject({ hp: 0, lit: false });
    expect(events.filter((e) => e.type === 'lampBroken')).toHaveLength(1);
    expect(isLit(world, 11, 10)).toBe(false);
  });

  it('so does a brute, but a zombie walks past it', () => {
    const brute = night({ 10: at(10, 'L') }).build().world;
    brute.addMonster(10.2, 10, 'brute');
    collectEvents(brute, 2);
    expect(brute.lamps[0].hp).toBe(0);

    const zombie = night({ 10: at(10, 'L') }).build().world;
    zombie.addMonster(10.2, 10, 'zombie');
    collectEvents(zombie, 2);
    expect(zombie.lamps[0]).toMatchObject({ hp: NIGHT.lampHp, lit: true });
  });
});

describe('mapFromAscii lamps', () => {
  it("'L' and 'l' are lamp posts on grass that never block", () => {
    const map = mapFromAscii(['.L.l']);
    expect(map.decor).toEqual([{ i: 1, j: 0, kind: 'lamp', blocks: false, lit: true }, { i: 3, j: 0, kind: 'lamp', blocks: false, lit: false }]);
    expect(map.blocked[1]).toBe(0);
  });
});
