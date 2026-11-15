// XP, knight level and upgrade choices for one run. Pure and deterministic (uses the world's Rng).

import { computeMods, UPGRADE_BY_ID, UPGRADES, type Mods, type UpgradeHost, type UpgradeOffer } from '../data/upgrades';
import type { Rng } from './rng';

/** XP for level 1→2 and growth per level (retune 2026-11-14: ~6 level-ups per level-1 run). */
export const XP_CURVE = { base: 8, growth: 1.4 };

/** XP needed to go from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  return Math.round(XP_CURVE.base * Math.pow(XP_CURVE.growth, level - 1));
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

  /** llowed: card ids that may be offered (unlocked cards); all cards when omitted. */
  constructor(private readonly rng: Rng, private readonly allowed?: readonly string[]) {}

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

  /** Grants whole levels (shop 'start with a level-up'): each opens a card choice. */
  grantLevels(n: number) {
    if (n <= 0) return;
    this.level += n;
    this.pending += n;
    if (!this.offers) this.roll();
  }

  /** Debug: takes one stack of an upgrade directly, without spending a level. */
  grant(id: string, host: UpgradeHost): boolean {
    const def = UPGRADE_BY_ID[id];
    if (!def || (this.levels[id] ?? 0) >= def.max) return false;
    this.levels[id] = (this.levels[id] ?? 0) + 1;
    this.mods = computeMods(this.levels);
    def.onPick?.(host);
    return true;
  }

  private roll() {
    const available = UPGRADES.filter((u) => (this.levels[u.id] ?? 0) < u.max && (!this.allowed || this.allowed.includes(u.id)));
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
