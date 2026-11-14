import { describe, expect, it } from 'vitest';
import { MONSTERS } from '../../src/data/monsters';
import { damageBuilding } from '../../src/sim/combat';
import { generateTown, isWalkable } from '../../src/sim/map';
import type { BuildingState, Unit } from '../../src/sim/model';
import { World } from '../../src/sim/world';
import { fieldRows } from '../helpers/mapBuilder';
import { aWorld, runSeconds } from '../helpers/worldBuilder';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('target preferences', () => {
  it('an orc ignores a knight standing right next to it while a building exists', () => {
    // Building to the west, knight (idle) to the east of the orc.
    const rows = fieldRows(40, [{ id: 0, i: 5, j: 20, w: 2, h: 2 }]);
    const { world, knight, monsters } = aWorld().withMap(rows).withKnightAt(20.5, 20).withMonster('orc', 20, 20).build();
    const orc = monsters[0];
    runSeconds(world, 3);
    expect(knight.hp).toBe(knight.maxHp);
    expect(orc.x).toBeLessThan(18); // heading for the building
  });

  it('an orc keeps wrecking the building rather than switching to the adjacent knight', () => {
    const rows = fieldRows(40, [{ id: 0, i: 10, j: 20 }]);
    const { world, knight } = aWorld().withMap(rows).withKnightAt(8.7, 20).withMonster('orc', 9.2, 20).build();
    runSeconds(world, 3);
    expect(knight.hp).toBe(knight.maxHp);
    expect(world.buildings[0].hp).toBeLessThan(world.buildings[0].maxHp);
  });

  describe('zombie', () => {
    const rows = fieldRows(60, [{ id: 0, i: 8, j: 30, w: 2, h: 2 }]);
    const aggro = MONSTERS.zombie.aggroRange;

    it('chases the knight when within aggroRange', () => {
      // Zombie at x=30, knight 3 cells east (inside aggro); building far west.
      const { world, knight, monsters } = aWorld().withMap(rows).withKnightAt(33, 30).withMonster('zombie', 30, 30).build();
      expect(3).toBeLessThan(aggro);
      const z = monsters[0];
      const before = dist(z, knight);
      runSeconds(world, 1);
      expect(dist(z, knight)).toBeLessThan(before - 0.5);
      expect(z.x).toBeGreaterThan(30);
    });

    it('goes for a building when the knight is beyond aggroRange', () => {
      const { world, knight, monsters } = aWorld().withMap(rows).withKnightAt(45, 30).withMonster('zombie', 30, 30).build();
      expect(dist(monsters[0], knight)).toBeGreaterThan(aggro);
      const z = monsters[0];
      runSeconds(world, 2);
      expect(z.x).toBeLessThan(29); // walking west, away from the knight
      expect(knight.hp).toBe(knight.maxHp);
    });
  });

  it.each(['zombie', 'orc', 'brute'] as const)('with no buildings on the map a %s chases the knight', (kind) => {
    const { world, knight, monsters } = aWorld().withKnightAt(30, 20).withMonster(kind, 20, 20).build();
    const m = monsters[0];
    const before = dist(m, knight);
    runSeconds(world, 2);
    expect(dist(m, knight)).toBeLessThan(before - 1);
  });

  it('an orc with no buildings eventually attacks the knight', () => {
    const { world, knight } = aWorld().withKnightAt(24, 20).withMonster('orc', 20, 20).build();
    runSeconds(world, 6);
    expect(knight.hp).toBeLessThan(knight.maxHp);
  });
});

describe('building flow field on generated maps', () => {
  const buildingFlow = (w: World) => w.buildingFlow;

  function walkableCells(w: World) {
    const out: [number, number][] = [];
    for (let j = 0; j < w.map.size; j++) for (let i = 0; i < w.map.size; i++) if (isWalkable(w.map, i, j)) out.push([i, j]);
    return out;
  }

  it.each([1, 2, 3, 4, 5])('seed %i: reaches every walkable cell', (seed) => {
    const world = new World({ seed, noWaves: true });
    expect(world.buildings.length).toBeGreaterThan(0);
    world.tick([]);
    const flow = buildingFlow(world);
    const unreachable = walkableCells(world).filter(([i, j]) => !Number.isFinite(flow.distanceAt(i, j)));
    expect(unreachable).toEqual([]);
  });

  it.each([1, 2, 3, 4, 5])('seed %i: still reaches every walkable cell with a single building left', (seed) => {
    const world = new World({ seed, noWaves: true });
    const damage = (b: BuildingState, n: number, by: Unit) => damageBuilding(world, b, n, by);
    for (const b of world.buildings.slice(1)) damage(b, b.maxHp, world.players[0]);
    expect(world.standingBuildings()).toBe(1);
    world.tick([]);
    const flow = buildingFlow(world);
    const unreachable = walkableCells(world).filter(([i, j]) => !Number.isFinite(flow.distanceAt(i, j)));
    expect(unreachable).toEqual([]);
  });

  it('sources of the field are the cells next to standing buildings (distance 0)', () => {
    const map = generateTown(1);
    const world = new World({ seed: 1, noWaves: true, map });
    world.tick([]);
    const flow = buildingFlow(world);
    const [i, j] = map.buildings[0].cells[0];
    const next = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([di, dj]) => isWalkable(map, i + di, j + dj));
    expect(next).toBeDefined();
    expect(flow.distanceAt(i + next![0], j + next![1])).toBe(0);
  });
});
