// Builds small TownMaps from ASCII art for tests.
// Row index = j, column = i. '.' grass, '#' blocked building, ' ' outside the map, '=' road.

import type { TownMap } from '../../src/sim/map';

// Mirrors the Ground const enum (avoids const-enum import under isolatedModules).
const NONE = 0;
const GRASS = 1;
const ROAD = 2;

export function mapFromAscii(rows: string[]): TownMap {
  const cols = Math.max(...rows.map((r) => r.length));
  const size = Math.max(rows.length, cols);
  const ground = new Uint8Array(size * size);
  const blocked = new Uint8Array(size * size);
  rows.forEach((row, j) => {
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      const idx = j * size + i;
      if (ch === ' ') ground[idx] = NONE;
      else if (ch === '=') ground[idx] = ROAD;
      else {
        ground[idx] = GRASS;
        if (ch === '#') blocked[idx] = 1;
      }
    }
  });
  const has = (i: number, j: number) => i >= 0 && j >= 0 && i < size && j < size && ground[j * size + i] !== NONE;
  const top: [number, number][] = [];
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      if (!has(i, j) || blocked[j * size + i]) continue;
      if (!has(i + 1, j) || !has(i - 1, j) || !has(i, j + 1) || !has(i, j - 1)) top.push([i, j]);
    }
  }
  return {
    seed: 0, size, centre: Math.floor(size / 2), ground, blocked, buildings: [], decor: [],
    edges: { top, right: [], bottom: [], left: [] },
  };
}

/** An open grass field of n x n cells. */
export function openField(n = 40): TownMap {
  return mapFromAscii(Array.from({ length: n }, () => '.'.repeat(n)));
}
