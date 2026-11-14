import { describe, expect, it } from 'vitest';
import { FlowField } from '../src/sim/flowField';
import { generateTown, isWalkable } from '../src/sim/map';

describe('FlowField regressions', () => {
  // Bug: distances were stored in a Float32Array while the heap held float64 sums. When a
  // stored value rounded down, the cell's own heap entry looked stale and was skipped, so
  // whole regions of open ground were reported unreachable.
  it.each([1, 2, 3, 4, 5])('every walkable cell of generated town %i is reachable from the centre road', (seed) => {
    const map = generateTown(seed);
    const f = new FlowField(map);
    f.compute(map.centre, map.centre + 2);
    let unreachable = 0;
    for (let j = 0; j < map.size; j++) {
      for (let i = 0; i < map.size; i++) {
        if (isWalkable(map, i, j) && !Number.isFinite(f.distanceAt(i, j))) unreachable++;
      }
    }
    expect(unreachable).toBe(0);
  });
});
