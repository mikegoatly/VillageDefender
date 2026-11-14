/** Small deterministic PRNG (mulberry32). Same seed → same game. */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9;
  }

  /** Float in [0, 1). */
  frac(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max] inclusive. */
  between(min: number, max: number): number {
    return min + Math.floor(this.frac() * (max - min + 1));
  }

  range(min: number, max: number): number {
    return min + this.frac() * (max - min);
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.frac() * items.length)];
  }
}
