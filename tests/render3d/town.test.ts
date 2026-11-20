import { describe, expect, it } from 'vitest';
import { buildingPieces, decorPiece, LAMP_MODEL, ROCK, TOWN_MODELS, wallLevels, type Piece } from '../../src/render3d/buildings';
import { aBuilding, aDecor } from '../helpers/town3d';

const walls = (ps: Piece[]) => ps.filter((p) => p.model.includes('/wall'));
const roofs = (ps: Piece[]) => ps.filter((p) => p.model.includes('/roof'));
const doors = (ps: Piece[]) => ps.filter((p) => p.model.endsWith('-door'));

describe('wallLevels', () => {
  it('is the number of wall blocks under the roof', () => {
    expect(wallLevels(aBuilding([[5, 5]], { wallLevels: 1 }))).toBe(1);
    expect(wallLevels(aBuilding([[5, 5]], { wallLevels: 2 }))).toBe(2);
  });

  it('counts both castle blocks of a tower as wall', () => {
    expect(wallLevels(aBuilding([[5, 5]], { kind: 'tower' }))).toBe(2);
  });
});

describe('buildingPieces', () => {
  it('gives a cottage four walls per level, one roof above them and one door', () => {
    const ps = buildingPieces(aBuilding([[5, 5]], { wallLevels: 2 }));
    expect(walls(ps)).toHaveLength(8);
    expect(roofs(ps)).toEqual([expect.objectContaining({ x: 5, y: 2, z: 5 })]);
    expect(doors(ps)).toHaveLength(1);
  });

  it('puts the door on the ground floor of the front cell, facing the camera (+X edge)', () => {
    const ps = buildingPieces(aBuilding([[5, 5], [6, 5]]));
    expect(doors(ps)).toEqual([expect.objectContaining({ x: 6, y: 0, z: 5, rotY: 0 })]);
  });

  it('builds no walls between a building’s own cells', () => {
    const hall = buildingPieces(aBuilding([[5, 5], [6, 5], [5, 6], [6, 6]], { wallLevels: 1 }));
    // A 2×2 footprint has 8 outside edges.
    expect(walls(hall)).toHaveLength(8);
    expect(roofs(hall)).toHaveLength(4);
    for (const w of walls(hall)) {
      // An outside wall's neighbour across its edge is not part of the building.
      const [di, dj] = w.rotY === 0 ? [1, 0] : w.rotY === Math.PI ? [-1, 0] : w.rotY < 0 ? [0, 1] : [0, -1];
      const ni = w.x + di, nj = w.z + dj;
      expect(ni >= 5 && ni <= 6 && nj >= 5 && nj <= 6).toBe(false);
    }
  });

  it('gives towers plain walls and a pointed roof', () => {
    const ps = buildingPieces(aBuilding([[5, 5]], { kind: 'tower' }));
    expect(ps.some((p) => p.model.includes('window'))).toBe(false);
    expect(roofs(ps).map((p) => p.model)).toEqual(['fantasy-town/roof-high-point']);
  });
});

describe('decorPiece', () => {
  it('maps each decor kind to a kit model at the decor cell', () => {
    expect(decorPiece(aDecor('tree', 3, 4))).toMatchObject({ model: 'fantasy-town/tree', x: 3, z: 4 });
    expect(decorPiece(aDecor('well')).model).toBe('fantasy-town/stall-red');
    expect(decorPiece(aDecor('rock')).model).toBe(ROCK);
  });

  it('is stable for the same cell (no randomness between sessions)', () => {
    expect(decorPiece(aDecor('tree', 7, 2))).toEqual(decorPiece(aDecor('tree', 7, 2)));
  });
});

describe('decorPiece at night', () => {
  it('draws lamp posts as the kit lantern post, and trees from the dark forest set', () => {
    expect(decorPiece({ i: 3, j: 4, kind: 'lamp', blocks: false }, 'night')).toMatchObject({ model: LAMP_MODEL, x: 3, z: 4 });
    const trees = new Set(Array.from({ length: 30 }, (_, k) => decorPiece(aDecor('tree', k, k * 7), 'night').model));
    expect(trees.size).toBeGreaterThan(2);
    for (const m of trees) expect(TOWN_MODELS).toContain(m);
  });
});
