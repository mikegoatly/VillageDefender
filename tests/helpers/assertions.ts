// Shared assertion helpers for sim tests.

import type { TownMap } from '../../src/sim/map';
import { isWalkable } from '../../src/sim/map';

/** Distance from a point to the nearest edge of the nearest non-walkable cell within range 3. */
export function distanceToNearestBlocked(map: TownMap, x: number, y: number): number {
  let best = Infinity;
  const ci = Math.round(x);
  const cj = Math.round(y);
  for (let j = cj - 3; j <= cj + 3; j++) {
    for (let i = ci - 3; i <= ci + 3; i++) {
      if (isWalkable(map, i, j)) continue;
      const nx = Math.min(Math.max(x, i - 0.5), i + 0.5);
      const ny = Math.min(Math.max(y, j - 0.5), j + 0.5);
      best = Math.min(best, Math.hypot(x - nx, y - ny));
    }
  }
  return best;
}

export function angleOf(v: { x: number; y: number }): number {
  return Math.atan2(v.y, v.x);
}

/** Smallest absolute difference between two angles. */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
}
