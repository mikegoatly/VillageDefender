// Directional selection for controllers: from the current item, pick the nearest item that lies
// roughly in the pushed direction (screen space), like focus moving between tiles on a console.

import type { Vec2 } from '../sim/types';

export interface PickItem {
  id: number;
  pos: Vec2;
}

/** Items further than this many radians off the pushed direction are never picked (~65°). */
const MAX_ANGLE = 1.13;
/** Sideways distance counts this much more than distance along the direction. */
const SIDE_WEIGHT = 2;

/**
 * The id to select after pushing `dir` from `fromId`. With nothing selected (or `fromId` unknown)
 * this is the item nearest `centre`. Returns `fromId` when nothing lies in that direction.
 */
export function pickInDirection(items: readonly PickItem[], fromId: number, dir: Vec2, centre: Vec2): number {
  const from = items.find((it) => it.id === fromId);
  if (!from) {
    let best = -1;
    let bestD = Infinity;
    for (const it of items) {
      const d = Math.hypot(it.pos.x - centre.x, it.pos.y - centre.y);
      if (d < bestD) { bestD = d; best = it.id; }
    }
    return best;
  }
  const len = Math.hypot(dir.x, dir.y) || 1;
  const ux = dir.x / len;
  const uy = dir.y / len;
  const maxSide = Math.tan(MAX_ANGLE);
  let best = fromId;
  let bestScore = Infinity;
  for (const it of items) {
    if (it.id === fromId) continue;
    const dx = it.pos.x - from.pos.x;
    const dy = it.pos.y - from.pos.y;
    const along = dx * ux + dy * uy;
    if (along <= 0) continue;
    const side = Math.abs(dx * uy - dy * ux);
    if (side > along * maxSide) continue;
    const score = along + side * SIDE_WEIGHT;
    if (score < bestScore) { bestScore = score; best = it.id; }
  }
  return best;
}
