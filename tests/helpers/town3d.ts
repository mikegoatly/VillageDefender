// Builders for 3D renderer tests.

import type { Block, Building, BuildingKind, Decor, DecorKind } from '../../src/sim/map';

/**
 * A building on `cells` whose blocks stack `wallLevels` wall blocks and a roof (towers: two wall
 * blocks, as the map generator emits them).
 */
export function aBuilding(cells: [number, number][], o: { id?: number; kind?: BuildingKind; wallLevels?: number } = {}): Building {
  const kind = o.kind ?? (cells.length === 4 ? 'hall' : cells.length === 2 ? 'long' : 'cottage');
  const levels = o.wallLevels ?? 1;
  const blocks: Block[] = [];
  for (const [i, j] of cells) {
    if (kind === 'tower') {
      blocks.push({ i, j, level: 1, part: 'wall' }, { i, j, level: 2, part: 'wall' });
      continue;
    }
    for (let l = 1; l <= levels; l++) blocks.push({ i, j, level: l, part: 'wall' });
    blocks.push({ i, j, level: levels + 1, part: 'roof' });
  }
  return { id: o.id ?? 0, kind, cells, blocks };
}

export function aDecor(kind: DecorKind, i = 3, j = 4): Decor {
  return { i, j, kind, blocks: true };
}
