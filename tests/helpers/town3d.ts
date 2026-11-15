// Builders for 3D renderer tests.

import type { Block, Building, BuildingKind, Decor } from '../../src/sim/map';

/**
 * A building on `cells` whose Sketch blocks stack `wallLevels` wall blocks and a roof (towers:
 * two castle blocks, as the map generator emits them).
 */
export function aBuilding(cells: [number, number][], o: { id?: number; kind?: BuildingKind; wallLevels?: number } = {}): Building {
  const kind = o.kind ?? (cells.length === 4 ? 'hall' : cells.length === 2 ? 'long' : 'cottage');
  const levels = o.wallLevels ?? 1;
  const blocks: Block[] = [];
  for (const [i, j] of cells) {
    if (kind === 'tower') {
      blocks.push({ i, j, level: 1, tile: 'st:castle_wall_S' }, { i, j, level: 2, tile: 'st:castle_tower_S' });
      continue;
    }
    for (let l = 1; l <= levels; l++) blocks.push({ i, j, level: l, tile: 'st:building_window_S' });
    blocks.push({ i, j, level: levels + 1, tile: 'st:roof_gableRed_S' });
  }
  return { id: o.id ?? 0, kind, cells, blocks };
}

export function aDecor(tile: string, i = 3, j = 4): Decor {
  return { i, j, tile, blocks: true };
}
