// XP, knight level and upgrade choices for one run. Pure and deterministic (uses the world's Rng).

import { computeMods, UPGRADE_BY_ID, UPGRADES, type Mods, type UpgradeHost, type UpgradeOffer } from '../data/upgrades';
import type { Rng } from './rng';

/** XP needed to go from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  return Math.round(5 * Math.pow(1.3, level - 1));
}

export class Progression {
  xp = 0;
  level = 1;
  /** Upgrade id → stacks taken. */
  readonly levels: Record<string, number> = {};
  mods: Mods = computeMods({});
  /** Cards currently offered; non-null means the game is paused for a choice. */
  offers: UpgradeOffer[] | null = null;
  /** Level-ups earned but not yet chosen (several can queue from one big pickup). */
  private pending = 0;

  constructor(private readonly rng: Rng) {}

  get xpToNext(): number {
    return xpToNext(this.level);
  }

  /** Adds XP; returns how many levels were gained. Opens a choice if none is open. */
  addXp(amount: number): number {
    this.xp += amount;
    let gained = 0;
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level++;
      gained++;
    }
    this.pending += gained;
    if (this.pending > 0 && !this.offers) this.roll();
    return gained;
  }

  /** Applies the chosen card. Returns the upgrade id, or null if there was nothing to choose. */
  choose(index: number, host: UpgradeHost): string | null {
    const offer = this.offers?.[index];
    if (!offer) return null;
    const def = UPGRADE_BY_ID[offer.id];
    this.levels[def.id] = (this.levels[def.id] ?? 0) + 1;
    this.mods = computeMods(this.levels);
    def.onPick?.(host);
    this.pending--;
    this.offers = null;
    if (this.pending > 0) this.roll();
    return def.id;
  }

  private roll() {
    const available = UPGRADES.filter((u) => (this.levels[u.id] ?? 0) < u.max);
    if (available.length === 0) {
      // Everything maxed: nothing to offer; drop the pending level-ups.
      this.pending = 0;
      return;
    }
    const picks: typeof available = [];
    const pool = [...available];
    while (picks.length < 3 && pool.length) {
      const k = Math.floor(this.rng.frac() * pool.length);
      picks.push(pool.splice(k, 1)[0]);
    }
    this.offers = picks.map((u) => {
      const level = this.levels[u.id] ?? 0;
      return { id: u.id, name: u.name, description: u.describe(level), pool: u.pool, level, max: u.max };
    });
  }
}
