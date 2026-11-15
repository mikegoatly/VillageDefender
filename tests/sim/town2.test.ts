import { describe, expect, it } from 'vitest';
import { TROLL } from '../../src/data/monsters';
import { TOWN_BY_ID } from '../../src/data/towns';
import { FlowField } from '../../src/sim/flowField';
import { bridgeRows, generateTown, Ground, inBounds, isWalkable, riverColumn } from '../../src/sim/map';
import { World } from '../../src/sim/world';
import { emptyInput } from '../../src/sim/types';
import { step } from '../helpers/worldBuilder';

const riverside = TOWN_BY_ID.riverside;

describe('Town 2: river map', () => {
  it.each([1, 2, 3])('seed %i has a river column with walkable bridges', (seed) => {
    const map = generateTown(seed, riverside.map);
    const ri = riverColumn(map.centre);
    let water = 0;
    for (let j = 0; j < map.size; j++) {
      const k = j * map.size + ri;
      if (map.ground[k] === Ground.Water) {
        water++;
        expect(isWalkable(map, ri, j)).toBe(false);
      }
    }
    expect(water).toBeGreaterThan(10);
    for (const j of bridgeRows(map.centre)) {
      if (!inBounds(map, ri, j)) continue;
      expect(map.ground[j * map.size + ri]).toBe(Ground.Bridge);
      expect(isWalkable(map, ri, j)).toBe(true);
    }
  });

  it.each([1, 2, 3])('seed %i: no building sits in the river and no monster spawns in it', (seed) => {
    const map = generateTown(seed, riverside.map);
    for (const b of map.buildings) for (const [i, j] of b.cells) expect(map.ground[j * map.size + i]).not.toBe(Ground.Water);
    for (const side of Object.values(map.edges)) for (const [i, j] of side) expect(map.ground[j * map.size + i]).not.toBe(Ground.Water);
  });

  it.each([1, 2, 3])('seed %i: both banks are connected by the bridges', (seed) => {
    const map = generateTown(seed, riverside.map);
    const f = new FlowField(map);
    f.compute(map.centre, map.centre + 2);
    let unreachable = 0;
    for (let j = 0; j < map.size; j++) for (let i = 0; i < map.size; i++) {
      if (isWalkable(map, i, j) && !Number.isFinite(f.distanceAt(i, j))) unreachable++;
    }
    expect(unreachable).toBe(0);
  });

  it('town 1 maps have no water', () => {
    const map = generateTown(1, TOWN_BY_ID.village.map);
    expect(map.ground.some((g) => g === Ground.Water || g === Ground.Bridge)).toBe(false);
  });
});

describe('River Troll', () => {
  const trollWorld = () => {
    const w = new World({ seed: 2, noWaves: true, noRookies: true, god: true, mapOptions: riverside.map });
    // Park the knight far away so the troll only deals with buildings.
    const k = w.players[0];
    k.x = 2;
    k.y = 2;
    return w;
  };

  it('is a boss: emits bossSpawn and shows as world.boss', () => {
    const w = trollWorld();
    const t = w.addMonster(w.map.centre + 3, w.map.centre - 3, 'troll');
    expect(w.events.some((e) => e.type === 'bossSpawn' && e.unit === t.id)).toBe(true);
    expect(w.boss).toBe(t);
  });

  it('stands in the river without being pushed out, and regenerates there', () => {
    const w = trollWorld();
    const ri = riverColumn(w.map.centre);
    // A water row away from the bridges.
    const j = w.map.centre - 4;
    const t = w.addMonster(ri, j, 'troll');
    t.hp = t.maxHp * 0.5;
    const before = t.hp;
    for (let n = 0; n < 30; n++) step(w, emptyInput());
    expect(t.hp).toBeGreaterThan(before);
    expect(TROLL.waterRegen).toBeGreaterThan(0);
  });

  it('lobs a telegraphed boulder that damages a building', () => {
    const w = trollWorld();
    const t = w.addMonster(w.map.centre, w.map.centre, 'troll');
    t.boss!.boulderIn = 0;
    const events: string[] = [];
    let hit = -1;
    for (let n = 0; n < 60 * 4 && hit < 0; n++) {
      step(w, emptyInput());
      for (const e of w.events) {
        events.push(e.type);
        if (e.type === 'bossBoulder') hit = n;
      }
    }
    const warn = events.indexOf('bossBoulderWarn');
    expect(warn).toBeGreaterThanOrEqual(0);
    expect(events.indexOf('bossBoulder')).toBeGreaterThan(warn);
    expect(events).toContain('buildingHit');
  });
});

describe('Town 2 waves', () => {
  it('ends with the troll', () => {
    const last = riverside.waves[riverside.waves.length - 1];
    expect(last.monsters.troll).toBe(1);
  });
});
