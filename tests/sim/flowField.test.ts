import { describe, expect, it } from 'vitest';
import { FlowField } from '../../src/sim/flowField';
import { isWalkable } from '../../src/sim/map';
import { mapFromAscii, openField } from '../helpers/mapBuilder';

function walk(flow: FlowField, from: [number, number], maxSteps: number) {
  const path: [number, number][] = [from];
  let cur = from;
  for (let k = 0; k < maxSteps; k++) {
    const n = flow.next(cur[0], cur[1]);
    if (!n) break;
    path.push(n);
    cur = n;
  }
  return path;
}

describe('FlowField', () => {
  const wall = [
    '..........',
    '..........',
    '#####.####',
    '..........',
    '..........',
  ];

  it('gives finite distances on both sides of a wall with a gap', () => {
    const map = mapFromAscii(wall);
    const flow = new FlowField(map);
    flow.compute(1, 4);
    expect(flow.distanceAt(8, 0)).toBeLessThan(Infinity);
    expect(flow.distanceAt(8, 4)).toBeLessThan(Infinity);
    expect(flow.distanceAt(0, 2)).toBe(Infinity); // wall cell
  });

  it('leads from the far side through the gap to the target without touching walls', () => {
    const map = mapFromAscii(wall);
    const flow = new FlowField(map);
    flow.compute(1, 4);
    const path = walk(flow, [8, 0], 40);
    expect(path[path.length - 1]).toEqual([1, 4]);
    expect(path.length).toBeLessThan(20);
    for (const [i, j] of path) expect(isWalkable(map, i, j)).toBe(true);
    expect(path.some(([i, j]) => i === 5 && j === 2)).toBe(true);
  });

  it('does not cut corners between diagonally touching walls', () => {
    const map = mapFromAscii([
      '..#.',
      '.#..',
      '....',
    ]);
    const flow = new FlowField(map);
    flow.compute(2, 1);
    expect(flow.distanceAt(1, 0)).toBeGreaterThanOrEqual(5);
    expect(flow.next(1, 0)).not.toEqual([2, 1]);
    // Every step on every walkable cell's path is a legal move.
    for (let j = 0; j < map.size; j++) {
      for (let i = 0; i < map.size; i++) {
        const n = flow.next(i, j);
        if (!n) continue;
        const [di, dj] = [n[0] - i, n[1] - j];
        if (di !== 0 && dj !== 0) {
          expect(isWalkable(map, i + di, j)).toBe(true);
          expect(isWalkable(map, i, j + dj)).toBe(true);
        }
      }
    }
  });

  it('marks an enclosed pocket unreachable', () => {
    const map = mapFromAscii([
      '.......',
      '.###...',
      '.#.#...',
      '.###...',
      '.......',
    ]);
    const flow = new FlowField(map);
    flow.compute(0, 0);
    expect(flow.distanceAt(2, 2)).toBe(Infinity);
    expect(flow.next(2, 2)).toBeNull();
    expect(flow.distanceAt(6, 4)).toBeLessThan(Infinity);
  });
});

describe('FlowField on open ground', () => {
// BUG in src/sim/flowField.ts: dist is a Float32Array but Dijkstra pushes double-precision distances.
// A stored float32 can round below the double that was pushed, so `if (d > dist[idx]) continue` wrongly
// treats the fresh heap entry as stale and the flood stops. Large parts of open ground end up Infinity,
// so zombies fall back to straight-line steering and get stuck behind buildings. Fix: Float64Array.
  it('reaches every cell of an open field', () => {
    const map = openField(20);
    const flow = new FlowField(map);
    flow.compute(10, 10);
    const unreachable: string[] = [];
    for (let j = 0; j < 20; j++) for (let i = 0; i < 20; i++) if (flow.distanceAt(i, j) === Infinity) unreachable.push(`${i},${j}`);
    expect(unreachable).toEqual([]);
  });
});

