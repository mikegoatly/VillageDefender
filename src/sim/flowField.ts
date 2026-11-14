// Flow field toward a target cell: one Dijkstra pass serves every monster (plan §5.2).
// 8-way movement; diagonals only when both orthogonal neighbours are walkable (no corner cutting).

import { isWalkable, type TownMap } from './map';

const DIRS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

export class FlowField {
  /** Float64 on purpose: the heap holds float64 sums, and a float32 copy that rounds down
   * makes the cell's own heap entry look stale, cutting off whole regions. */
  readonly dist: Float64Array;
  targetI = -1;
  targetJ = -1;

  constructor(private readonly map: TownMap) {
    this.dist = new Float64Array(map.size * map.size).fill(Infinity);
  }

  /** Recomputes distances to (ti, tj). Cheap for ~1000 cells; call when the target changes cell. */
  compute(ti: number, tj: number) {
    const { map, dist } = this;
    const n = map.size;
    dist.fill(Infinity);
    this.targetI = ti;
    this.targetJ = tj;
    if (!isWalkable(map, ti, tj)) return;

    // Binary heap of [dist, index].
    const heap: number[] = [];
    const push = (d: number, idx: number) => {
      heap.push(d, idx);
      let k = heap.length / 2 - 1;
      while (k > 0) {
        const p = ((k - 1) >> 1);
        if (heap[p * 2] <= heap[k * 2]) break;
        swap(heap, p, k);
        k = p;
      }
    };
    const pop = (): [number, number] => {
      const d = heap[0];
      const idx = heap[1];
      const lastD = heap[heap.length - 2];
      const lastI = heap[heap.length - 1];
      heap.length -= 2;
      if (heap.length) {
        heap[0] = lastD;
        heap[1] = lastI;
        let k = 0;
        const size = heap.length / 2;
        for (;;) {
          const l = k * 2 + 1;
          const r = l + 1;
          let s = k;
          if (l < size && heap[l * 2] < heap[s * 2]) s = l;
          if (r < size && heap[r * 2] < heap[s * 2]) s = r;
          if (s === k) break;
          swap(heap, s, k);
          k = s;
        }
      }
      return [d, idx];
    };

    const start = tj * n + ti;
    dist[start] = 0;
    push(0, start);
    while (heap.length) {
      const [d, idx] = pop();
      if (d > dist[idx]) continue;
      const i = idx % n;
      const j = (idx - i) / n;
      for (const [di, dj, cost] of DIRS) {
        const ni = i + di;
        const nj = j + dj;
        if (!isWalkable(map, ni, nj)) continue;
        if (di !== 0 && dj !== 0 && (!isWalkable(map, i + di, j) || !isWalkable(map, i, j + dj))) continue;
        const nd = d + cost;
        const nIdx = nj * n + ni;
        if (nd < dist[nIdx]) {
          dist[nIdx] = nd;
          push(nd, nIdx);
        }
      }
    }
  }

  /** Distance from cell (i, j) to the target, Infinity if unreachable or blocked. */
  distanceAt(i: number, j: number): number {
    if (i < 0 || j < 0 || i >= this.map.size || j >= this.map.size) return Infinity;
    return this.dist[j * this.map.size + i];
  }

  /**
   * Neighbour cell to walk toward from (i, j), or null when already at the target or stuck.
   * Uses the same corner-cutting rule as compute().
   */
  next(i: number, j: number): [number, number] | null {
    const here = this.distanceAt(i, j);
    let best = here;
    let out: [number, number] | null = null;
    for (const [di, dj] of DIRS) {
      const ni = i + di;
      const nj = j + dj;
      if (di !== 0 && dj !== 0 && (!isWalkable(this.map, i + di, j) || !isWalkable(this.map, i, j + dj))) continue;
      const d = this.distanceAt(ni, nj);
      if (d < best) {
        best = d;
        out = [ni, nj];
      }
    }
    return out;
  }
}

function swap(h: number[], a: number, b: number) {
  const d = h[a * 2];
  const i = h[a * 2 + 1];
  h[a * 2] = h[b * 2];
  h[a * 2 + 1] = h[b * 2 + 1];
  h[b * 2] = d;
  h[b * 2 + 1] = i;
}
