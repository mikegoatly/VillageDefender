// Uniform grid of unit ids for neighbour queries. Rebuilt every tick; no per-tick allocation
// beyond bucket array growth.

export interface HasPos {
  x: number;
  y: number;
}

export class SpatialHash<T extends HasPos> {
  private buckets = new Map<number, T[]>();
  private used: T[][] = [];

  constructor(private readonly cellSize = 1) {}

  private key(cx: number, cy: number) {
    return (cx + 1024) * 4096 + (cy + 1024);
  }

  clear() {
    for (const b of this.used) b.length = 0;
    this.used.length = 0;
  }

  insert(item: T) {
    const k = this.key(Math.floor(item.x / this.cellSize), Math.floor(item.y / this.cellSize));
    let b = this.buckets.get(k);
    if (!b) {
      b = [];
      this.buckets.set(k, b);
    }
    if (b.length === 0) this.used.push(b);
    b.push(item);
  }

  /** Calls fn for every item whose bucket overlaps the circle (x, y, r). Caller filters exact distance. */
  query(x: number, y: number, r: number, fn: (item: T) => void) {
    const s = this.cellSize;
    const x0 = Math.floor((x - r) / s);
    const x1 = Math.floor((x + r) / s);
    const y0 = Math.floor((y - r) / s);
    const y1 = Math.floor((y + r) / s);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const b = this.buckets.get(this.key(cx, cy));
        if (b) for (const it of b) fn(it);
      }
    }
  }
}
