import { describe, expect, it } from 'vitest';
import { FlowField } from '../../src/sim/flowField';
import { generateTown, inBounds } from '../../src/sim/map';
import type { Side } from '../../src/sim/map';

const SIDES: Side[] = ['top', 'right', 'bottom', 'left'];

describe('generateTown', () => {
  it('is deterministic for a seed', () => {
    const a = generateTown(7);
    const b = generateTown(7);
    expect(Array.from(a.ground)).toEqual(Array.from(b.ground));
    expect(Array.from(a.blocked)).toEqual(Array.from(b.blocked));
    expect(a.buildings).toEqual(b.buildings);
  });

  it('differs between seeds', () => {
    expect(Array.from(generateTown(1).blocked)).not.toEqual(Array.from(generateTown(2).blocked));
  });

  it.each(SIDES)('has spawn cells on the %s edge', (side) => {
    for (const seed of [1, 2, 3]) expect(generateTown(seed).edges[side].length).toBeGreaterThan(0);
  });

  it('keeps the road axes free of buildings', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const map = generateTown(seed);
      for (const b of map.buildings) {
        for (const [i, j] of b.cells) {
          expect(i === map.centre || j === map.centre, `seed ${seed} building cell ${i},${j}`).toBe(false);
        }
      }
    }
  });

// BUG in src/sim/flowField.ts: dist is a Float32Array but Dijkstra pushes double-precision distances.
// A stored float32 can round below the double that was pushed, so `if (d > dist[idx]) continue` wrongly
// treats the fresh heap entry as stale and the flood stops. Large parts of open ground end up Infinity,
// so zombies fall back to straight-line steering and get stuck behind buildings. Fix: Float64Array.
  // (Symptom here: most diagonal edge cells report Infinity distance from the knight start.)
  it('keeps every edge cell reachable from the knight start', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const map = generateTown(seed);
      const flow = new FlowField(map);
      flow.compute(map.centre, map.centre + 2);
      for (const side of SIDES) {
        for (const [i, j] of map.edges[side]) {
          expect(flow.distanceAt(i, j), `seed ${seed} ${side} ${i},${j}`).toBeLessThan(Infinity);
        }
      }
    }
  });

  it('places no decor on edge cells', () => {
    for (const seed of [1, 2, 3]) {
      const map = generateTown(seed);
      const edge = new Set<string>();
      for (const side of SIDES) for (const [i, j] of map.edges[side]) edge.add(`${i},${j}`);
      for (const d of map.decor) expect(edge.has(`${d.i},${d.j}`)).toBe(false);
    }
  });

  it('starts the knight on a walkable cell', () => {
    const map = generateTown(1);
    expect(inBounds(map, map.centre, map.centre + 2)).toBe(true);
  });
});

