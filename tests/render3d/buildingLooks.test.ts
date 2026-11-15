import { describe, expect, it } from 'vitest';
import type { RoleKind } from '../../src/data/roles';
import {
  auraCells, buildingPieces, decorPiece, ROCK, ruinPieces, smokeSources, TOWN_MODELS, wallLevels,
  type BuildingLook, type Piece,
} from '../../src/render3d/buildings';
import { aBuilding, aDecor } from '../helpers/town3d';

const ROLES: RoleKind[] = ['barracks', 'chapel', 'smithy', 'watchtower'];
const hall = () => aBuilding([[5, 5], [6, 5], [5, 6], [6, 6]], { id: 2, wallLevels: 1 });
const look = (o: Partial<BuildingLook>): BuildingLook => ({ role: null, damage: 'intact', ...o });
const models = (ps: Piece[]) => ps.map((p) => p.model);
const topModels = (ps: Piece[]) => {
  const top = Math.max(...ps.filter((p) => !p.model.includes('wall')).map((p) => p.y));
  return new Set(ps.filter((p) => p.y === top).map((p) => p.model));
};

describe('role buildings', () => {
  it('give every role a different roof line', () => {
    const roofs = [null, ...ROLES].map((role) => [...topModels(buildingPieces(hall(), look({ role })))].sort().join());
    expect(new Set(roofs).size).toBe(roofs.length);
  });

  it('crown the barracks with battlements and hang banners on its camera-facing walls', () => {
    const ps = buildingPieces(hall(), look({ role: 'barracks' }));
    expect(ps.filter((p) => p.model === 'castle/tower-square-top')).toHaveLength(4);
    const banners = ps.filter((p) => p.model.endsWith('banner-red'));
    expect(banners.length).toBeGreaterThan(0);
    // Hung outside the wall, not inside it.
    for (const b of banners) expect(b.out).toBeGreaterThan(0);
  });

  it('put a cross on the chapel roof', () => {
    const ps = buildingPieces(hall(), look({ role: 'chapel' }));
    const cross = ps.find((p) => p.model === 'graveyard/cross')!;
    expect(cross.y).toBeGreaterThan(wallLevels(hall()));
  });

  it('give the smithy a chimney that smokes', () => {
    const b = hall();
    const ps = buildingPieces(b, look({ role: 'smithy' }));
    const chimney = ps.find((p) => p.model.endsWith('chimney'))!;
    const smoke = smokeSources(b, look({ role: 'smithy' }));
    expect(smoke).toEqual([expect.objectContaining({ kind: 'chimney' })]);
    expect(Math.hypot(smoke[0].x - chimney.x, smoke[0].z - chimney.z)).toBeLessThan(0.5);
  });

  it('raise the watchtower by a storey', () => {
    const b = hall();
    expect(wallLevels(b, 'watchtower')).toBe(wallLevels(b) + 1);
    const ps = buildingPieces(b, look({ role: 'watchtower' }));
    expect(Math.max(...ps.filter((p) => p.model.includes('wall')).map((p) => p.y))).toBe(1);
  });
});

describe('damage states', () => {
  it('break some walls of a damaged building but keep its shape and door', () => {
    const b = hall();
    const intact = buildingPieces(b);
    const damaged = buildingPieces(b, look({ damage: 'damaged' }));
    expect(damaged).toHaveLength(intact.length);
    const broken = damaged.filter((p) => p.model.endsWith('-broken'));
    expect(broken.length).toBeGreaterThan(0);
    expect(broken.length).toBeLessThan(damaged.filter((p) => p.model.includes('wall')).length);
    expect(damaged.filter((p) => p.model.endsWith('-door'))).toHaveLength(1);
  });

  it('damage the same walls every time (no flicker on rebuild)', () => {
    expect(buildingPieces(hall(), look({ damage: 'damaged' }))).toEqual(buildingPieces(hall(), look({ damage: 'damaged' })));
  });

  it('smoke from the roof of a damaged building only', () => {
    expect(smokeSources(hall(), look({}))).toEqual([]);
    expect(smokeSources(hall(), look({ damage: 'damaged' }))).toEqual([expect.objectContaining({ kind: 'fire' })]);
    expect(smokeSources(hall(), look({ role: 'smithy', damage: 'ruined' }))).toEqual([]);
  });

  it('leave only rubble on every cell of a ruin, whatever its role', () => {
    const b = hall();
    const ruin = buildingPieces(b, look({ role: 'barracks', damage: 'ruined' }));
    expect(ruin).toEqual(ruinPieces(b));
    expect(ruin.some((p) => p.model.includes('roof') || p.model.startsWith('castle/'))).toBe(false);
    for (const [i, j] of b.cells) {
      expect(ruin.some((p) => p.model === 'graveyard/debris' && Math.abs(p.x - i) < 0.5 && Math.abs(p.z - j) < 0.5)).toBe(true);
    }
    expect(Math.max(...ruin.map((p) => p.y))).toBe(0);
  });
});

describe('auraCells', () => {
  it('covers cells whose centre is within the radius of the building centre', () => {
    const b = aBuilding([[10, 10]]);
    const cells = auraCells(b, 2);
    expect(cells).toContainEqual([12, 10]);
    expect(cells).not.toContainEqual([12, 12]);
    for (const [i, j] of cells) expect(Math.hypot(i - 10, j - 10)).toBeLessThanOrEqual(2);
    expect(auraCells(b, 0)).toEqual([]);
  });
});

describe('TOWN_MODELS', () => {
  it('lists every model the town can place, so all of them are preloaded', () => {
    const used = new Set<string>();
    for (const b of [hall(), aBuilding([[3, 3]], { id: 1 }), aBuilding([[8, 8]], { kind: 'tower' })]) {
      for (const role of [null, ...ROLES]) {
        for (const damage of ['intact', 'damaged', 'ruined'] as const) models(buildingPieces(b, { role, damage })).forEach((m) => used.add(m));
      }
    }
    for (const k of ['tree', 'well'] as const) used.add(decorPiece(aDecor(k)).model);
    used.delete(ROCK);
    for (const m of used) expect(TOWN_MODELS).toContain(m);
  });
});
