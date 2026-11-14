// Per-unit pathing for friendly AI: straight line when clear, otherwise a flow field toward the
// target cell, recomputed only when the target changes cell (and at most every `minInterval`).

import { FlowField } from './flowField';
import { isWalkable, type TownMap } from './map';
import type { Vec2 } from './types';

const LINE_OFFSETS = [0, 1, -1];

/** True when a circle of `radius` can travel straight between the points without hitting blocked cells. */
export function clearLine(map: TownMap, x0: number, y0: number, x1: number, y1: number, radius: number): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return true;
  const px = (-dy / len) * radius;
  const py = (dx / len) * radius;
  const steps = Math.ceil(len / 0.2);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = x0 + dx * t;
    const y = y0 + dy * t;
    for (const o of LINE_OFFSETS) {
      if (!isWalkable(map, Math.round(x + px * o), Math.round(y + py * o))) return false;
    }
  }
  return true;
}

export class Pather {
  private readonly field: FlowField;
  private lastCompute = -Infinity;

  constructor(private readonly map: TownMap, private readonly minInterval = 0.4) {
    this.field = new FlowField(map);
  }

  /** Unit direction to move from (x, y) toward (tx, ty), or zero when already there / stuck. */
  dirTo(x: number, y: number, tx: number, ty: number, radius: number, now: number): Vec2 {
    if (clearLine(this.map, x, y, tx, ty, radius)) return norm(tx - x, ty - y);
    let ti = Math.round(tx);
    let tj = Math.round(ty);
    if (!isWalkable(this.map, ti, tj)) {
      // Target hugs a wall: aim for the nearest walkable neighbour.
      let best: [number, number] | null = null;
      let bestD = Infinity;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          if (!isWalkable(this.map, ti + di, tj + dj)) continue;
          const d = Math.hypot(ti + di - tx, tj + dj - ty);
          if (d < bestD) {
            bestD = d;
            best = [ti + di, tj + dj];
          }
        }
      }
      if (!best) return norm(tx - x, ty - y);
      [ti, tj] = best;
    }
    if ((ti !== this.field.targetI || tj !== this.field.targetJ) && now - this.lastCompute >= this.minInterval) {
      this.field.compute(ti, tj);
      this.lastCompute = now;
    }
    const next = this.field.next(Math.round(x), Math.round(y));
    return next ? norm(next[0] - x, next[1] - y) : norm(tx - x, ty - y);
  }
}

function norm(x: number, y: number): Vec2 {
  const l = Math.hypot(x, y);
  return l > 1e-6 ? { x: x / l, y: y / l } : { x: 0, y: 0 };
}
