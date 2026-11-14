import { describe, expect, it } from 'vitest';
import { MONSTERS } from '../../src/data/monsters';
import type { WaveDef } from '../../src/data/waves';
import type { SimEvent, World } from '../../src/sim/world';
import { fieldRows } from '../helpers/mapBuilder';
import { aWorld, collectEvents, runSeconds, runUntil } from '../helpers/worldBuilder';

const ONE_WAVE: WaveDef[] = [{ monsters: { zombie: 2 }, sides: 1 }];

/** `n` single-cell buildings in a row across the top of a 30x30 field, far from the knight. */
const rowOfBuildings = (n: number) =>
  fieldRows(30, Array.from({ length: n }, (_, k) => ({ id: k, i: 2 + k * 3, j: 5 })));

const levelEnds = (events: SimEvent[]) => events.filter((e) => e.type === 'levelEnd');

/** Ticks until the single wave has fully spawned. */
function runToSpawned(world: World) {
  runUntil(world, (w) => w.wave === 1 && w.monsters.length === 2, 600);
  expect(world.monsters).toHaveLength(2);
}

/** Stands in for the knight killing everything: marks every monster dead. */
function killAll(world: World) {
  for (const m of world.monsters) m.state = 'dead';
}

describe('winning', () => {
  function waveWorld(buildings = 3) {
    return aWorld().withMap(rowOfBuildings(buildings)).withKnightAt(15, 27).withWaves(ONE_WAVE).build();
  }

  it('does not win before the wave has spawned, even with no monsters alive', () => {
    const { world } = waveWorld();
    runSeconds(world, 2);
    expect(world.status).toBe('playing');
  });

  it('does not win while a monster is alive', () => {
    const { world } = waveWorld();
    runToSpawned(world);
    world.monsters[0].state = 'dead';
    runSeconds(world, 0.1);
    expect(world.status).toBe('playing');
  });

  it('wins with 3 stars when every monster is dead and nothing was damaged', () => {
    const { world } = waveWorld();
    runToSpawned(world);
    killAll(world);
    const events = collectEvents(world, 2);
    expect(world.status).toBe('won');
    expect(world.lossReason).toBeNull();
    expect(world.stars).toBe(3);
    expect(levelEnds(events)).toEqual([{ type: 'levelEnd', won: true, stars: 3, reason: null }]);
  });

  it('awards stars by buildings left standing at the win', () => {
    const { world } = waveWorld(7);
    runToSpawned(world);
    world.buildings[0].ruined = true;
    world.buildings[1].ruined = true; // 5 of 7 standing -> 2 stars
    killAll(world);
    runSeconds(world, 0.1);
    expect(world.status).toBe('won');
    expect(world.stars).toBe(2);
  });

  it('never wins with noWaves', () => {
    const { world } = aWorld().withMap(rowOfBuildings(3)).withKnightAt(15, 27).build();
    runSeconds(world, 5);
    expect(world.status).toBe('playing');
  });
});

describe('starsFor thresholds', () => {
  it.each([
    [3, [[3, 3], [2, 2], [1, 1], [0, 0]]],
    [6, [[6, 3], [5, 2], [4, 2], [3, 1], [1, 1], [0, 0]]],
    [7, [[7, 3], [6, 2], [5, 2], [4, 1], [1, 1], [0, 0]]],
  ] as [number, [number, number][]][])('map with %i buildings', (total, cases) => {
    const { world } = aWorld().withMap(rowOfBuildings(total)).build();
    expect(world.buildings).toHaveLength(total);
    for (const [standing, stars] of cases) expect(world.starsFor(standing), `${standing}/${total}`).toBe(stars);
  });
});

describe('losing', () => {
  it('when the knight dies: lossReason knight, 0 stars', () => {
    const { world, knight } = aWorld().withMap(rowOfBuildings(3)).withKnightAt(15, 20).withMonster('zombie', 15.5, 20).build();
    knight.hp = 1;
    const events = collectEvents(world, 60);
    expect(world.status).toBe('lost');
    expect(world.lossReason).toBe('knight');
    expect(world.stars).toBe(0);
    expect(levelEnds(events)).toEqual([{ type: 'levelEnd', won: false, stars: 0, reason: 'knight' }]);
  });

  it('when every building is ruined: lossReason town, 0 stars', () => {
    const map = fieldRows(30, [{ id: 0, i: 10, j: 10 }, { id: 1, i: 20, j: 10 }]);
    const { world } = aWorld().withMap(map).withKnightAt(15, 27)
      .withMonster('orc', 9.2, 10).withMonster('orc', 19.2, 10).build();
    for (const b of world.buildings) b.hp = MONSTERS.orc.buildingDamage;
    const events = collectEvents(world, 90);
    expect(world.status).toBe('lost');
    expect(world.lossReason).toBe('town');
    expect(world.stars).toBe(0);
    expect(world.standingBuildings()).toBe(0);
    expect(levelEnds(events)).toEqual([{ type: 'levelEnd', won: false, stars: 0, reason: 'town' }]);
  });

  it('a map without buildings is not lost for want of a town', () => {
    const { world } = aWorld().build();
    runSeconds(world, 1);
    expect(world.status).toBe('playing');
  });
});

describe('after the end', () => {
  it('emits levelEnd exactly once and ticking does nothing', () => {
    const { world, knight } = aWorld().withMap(rowOfBuildings(3)).withKnightAt(15, 20).withMonster('zombie', 15.5, 20).build();
    knight.hp = 1;
    const all = collectEvents(world, 60);
    expect(world.status).toBe('lost');
    const snapshot = { time: world.time, ticks: world.tickCount, kills: world.kills, mx: world.monsters.map((m) => [m.x, m.y]) };
    const after = collectEvents(world, 120);
    expect(after).toEqual([]);
    expect(levelEnds(all)).toHaveLength(1);
    expect(world.time).toBe(snapshot.time);
    expect(world.tickCount).toBe(snapshot.ticks);
    expect(world.kills).toBe(snapshot.kills);
    expect(world.monsters.map((m) => [m.x, m.y])).toEqual(snapshot.mx);
    expect(world.status).toBe('lost');
  });
});
