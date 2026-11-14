// Builds small TownMaps from ASCII art for tests.
// Row index = j, column = i. '.' grass, '#' blocked (no building), ' ' outside the map, '=' road,
// digits '0'-'9' = a cell of building id N (blocked; ids must be contiguous from 0).

import type { Building, TownMap } from '../../src/sim/map';

// Mirrors the Ground const enum (avoids const-enum import under isolatedModules).
const NONE = 0;
const GRASS = 1;
const ROAD = 2;

export function mapFromAscii(rows: string[]): TownMap {
  const cols = Math.max(...rows.map((r) => r.length));
  const size = Math.max(rows.length, cols);
  const ground = new Uint8Array(size * size);
  const blocked = new Uint8Array(size * size);
  const cellsById = new Map<number, [number, number][]>();
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      const idx = j * size + i;
      if (ch === ' ') ground[idx] = NONE;
      else if (ch === '=') ground[idx] = ROAD;
      else {
        ground[idx] = GRASS;
        if (ch === '#') blocked[idx] = 1;
        else if (ch >= '0' && ch <= '9') {
          blocked[idx] = 1;
          const id = Number(ch);
          if (!cellsById.has(id)) cellsById.set(id, []);
          cellsById.get(id)!.push([i, j]);
        }
      }
    }
  });
  const has = (i: number, j: number) => i >= 0 && j >= 0 && i < size && j < size && ground[j * size + i] !== NONE;
  // Spawn cells: every walkable border cell goes to the side whose edge it touches, so any
  // side a wave picks has somewhere to spawn.
  const edges: TownMap['edges'] = { top: [], right: [], bottom: [], left: [] };
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      if (!has(i, j) || blocked[j * size + i]) continue;
      if (j === 0 || !has(i, j - 1)) edges.top.push([i, j]);
      else if (j === size - 1 || !has(i, j + 1)) edges.bottom.push([i, j]);
      else if (i === 0 || !has(i - 1, j)) edges.left.push([i, j]);
      else if (i === size - 1 || !has(i + 1, j)) edges.right.push([i, j]);
    }
  }
  const ids = [...cellsById.keys()].sort((a, b) => a - b);
  ids.forEach((id, k) => {
    if (id !== k) throw new Error(`building ids must be contiguous from 0, got ${ids.join(',')}`);
  });
  const buildings: Building[] = ids.map((id) => {
    const cells = cellsById.get(id)!;
    // One wall block + one roof block per cell: a single storey.
    const blocks = cells.flatMap(([i, j]) => [
      { i, j, level: 0, tile: 'wall' },
      { i, j, level: 1, tile: 'roof' },
    ]);
    return { id, kind: 'cottage' as const, cells, blocks };
  });
  return {
    seed: 0, size, centre: Math.floor(size / 2), ground, blocked, buildings, decor: [],
    edges,
  };
}

/** An open grass field of n x n cells. */
export function openField(n = 40): TownMap {
  return mapFromAscii(Array.from({ length: n }, () => '.'.repeat(n)));
}

export interface BuildingStamp { id: number; i: number; j: number; w?: number; h?: number }

/** ASCII rows for an n x n grass field with rectangular buildings stamped at (i, j). */
export function fieldRows(n: number, stamps: BuildingStamp[] = []): string[] {
  const rows = Array.from({ length: n }, () => Array<string>(n).fill('.'));
  for (const { id, i, j, w = 1, h = 1 } of stamps) {
    for (let dj = 0; dj < h; dj++) for (let di = 0; di < w; di++) rows[j + dj][i + di] = String(id);
  }
  return rows.map((r) => r.join(''));
}
