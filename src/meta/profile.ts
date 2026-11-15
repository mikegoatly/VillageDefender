// Persistent player profile (decision 31): coin wallet, unlocks, achievements, best stars.
// Storage is injectable so tests (and the debug panel) can use memory instead of localStorage.

import { ACHIEVEMENTS, type LifetimeStats, type RunResult } from '../data/achievements';
import { STARTING_ROLES, type RoleKind } from '../data/roles';
import { STARTING_WEAPONS, WEAPON_ORDER, type WeaponKind } from '../data/weapons';
import { STARTING_CARDS } from '../data/upgrades';
import { noBoosts, SHOP_BY_ID, type MetaBoosts } from '../data/shop';
import { TOWNS } from '../data/towns';

export interface ProfileData {
  version: 1;
  coins: number;
  roles: RoleKind[];
  weapons: WeaponKind[];
  /** Weapon picked last time (pre-selected when planning). */
  weapon: WeaponKind;
  /** Level-up cards that can be offered (decision 44). */
  cards: string[];
  /** Unlock item id → times bought (one-off unlocks). */
  purchases: Record<string, number>;
  /** Boost item id → stacks readied for the next run (consumed when it starts). */
  boostsReady: Record<string, number>;
  achievements: string[];
  bestStars: Record<string, number>;
  stats: LifetimeStats;
}

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

const KEY = 'village-defender.profile';

/** localStorage when available, falling back to memory (private mode, tests). */
export function browserStore(): KeyValueStore {
  const mem = new Map<string, string>();
  return {
    get: (k) => {
      try {
        return localStorage.getItem(k);
      } catch {
        return mem.get(k) ?? null;
      }
    },
    set: (k, v) => {
      try {
        localStorage.setItem(k, v);
      } catch {
        mem.set(k, v);
      }
    },
  };
}

export function freshProfile(): ProfileData {
  return { version: 1, coins: 0, roles: [...STARTING_ROLES], weapons: [...STARTING_WEAPONS], weapon: 'sword', cards: [...STARTING_CARDS], purchases: {}, boostsReady: {}, achievements: [], bestStars: {}, stats: { runs: 0, wins: 0, kills: {} } };
}

export interface RunOutcome {
  coins: number;
  newAchievements: { id: string; name: string; description: string }[];
  unlockedRoles: RoleKind[];
  unlockedWeapons: WeaponKind[];
  unlockedCards: string[];
  newBest: boolean;
}

export class Profile {
  data: ProfileData;

  constructor(private readonly store: KeyValueStore = browserStore()) {
    this.data = this.load();
  }

  private load(): ProfileData {
    const raw = this.store.get(KEY);
    if (!raw) return freshProfile();
    try {
      const d = JSON.parse(raw) as Partial<ProfileData>;
      const base = freshProfile();
      return {
        ...base,
        ...d,
        roles: Array.from(new Set([...(d.roles ?? []), ...STARTING_ROLES])) as RoleKind[],
        weapons: Array.from(new Set([...(d.weapons ?? []), ...STARTING_WEAPONS])) as WeaponKind[],
        cards: Array.from(new Set([...(d.cards ?? []), ...STARTING_CARDS])),
        purchases: { ...(d.purchases ?? {}) },
        boostsReady: { ...(d.boostsReady ?? {}) },
        stats: { ...base.stats, ...(d.stats ?? {}), kills: { ...(d.stats?.kills ?? {}) } },
      };
    } catch {
      return freshProfile();
    }
  }

  save() {
    this.store.set(KEY, JSON.stringify(this.data));
  }

  hasRole(r: RoleKind): boolean {
    return this.data.roles.includes(r);
  }

  /** Records a finished run: coins, lifetime stats, best stars, achievements and their unlocks. */
  recordRun(run: RunResult): RunOutcome {
    const d = this.data;
    d.coins += run.coins;
    d.stats.runs++;
    if (run.won) d.stats.wins++;
    for (const [k, n] of Object.entries(run.kills)) d.stats.kills[k] = (d.stats.kills[k] ?? 0) + n;
    const newBest = run.stars > (d.bestStars[run.townId] ?? 0);
    if (newBest) d.bestStars[run.townId] = run.stars;

    const newAchievements: RunOutcome['newAchievements'] = [];
    const unlockedRoles: RoleKind[] = [];
    const unlockedWeapons: WeaponKind[] = [];
    const unlockedCards: string[] = [];
    for (const a of ACHIEVEMENTS) {
      if (d.achievements.includes(a.id) || !a.check(run, d.stats)) continue;
      d.achievements.push(a.id);
      newAchievements.push({ id: a.id, name: a.name, description: a.description });
      const role = a.reward?.role;
      if (role && !d.roles.includes(role)) {
        d.roles.push(role);
        unlockedRoles.push(role);
      }
      const weapon = a.reward?.weapon;
      if (weapon && !d.weapons.includes(weapon)) {
        d.weapons.push(weapon);
        unlockedWeapons.push(weapon);
      }
      const card = a.reward?.card;
      if (card && !d.cards.includes(card)) {
        d.cards.push(card);
        unlockedCards.push(card);
      }
    }
    this.save();
    return { coins: run.coins, newAchievements, unlockedRoles, unlockedWeapons, unlockedCards, newBest };
  }

  // ---------------------------------------------------------------- shop (decision 43)

  /** Times an unlock has been bought, or boost stacks readied for the next run. */
  bought(itemId: string): number {
    const item = SHOP_BY_ID[itemId];
    return (item?.kind === 'boost' ? this.data.boostsReady[itemId] : this.data.purchases[itemId]) ?? 0;
  }

  /** Price of the next purchase, or null when the item is maxed, already owned, or (ranks) its weapon is locked. */
  priceOf(itemId: string): number | null {
    const item = SHOP_BY_ID[itemId];
    if (!item) return null;
    if (item.kind === 'card' && this.data.cards.includes(item.card)) return null;
    if (item.kind === 'rank' && !this.data.weapons.includes(item.weapon)) return null;
    return item.cost[this.bought(itemId)] ?? null;
  }

  /** Buys one stack of an item. */
  buy(itemId: string): { ok: true } | { ok: false; reason: 'unknown' | 'maxed' | 'coins' } {
    const item = SHOP_BY_ID[itemId];
    if (!item) return { ok: false, reason: 'unknown' };
    const price = this.priceOf(itemId);
    if (price === null) return { ok: false, reason: 'maxed' };
    if (this.data.coins < price) return { ok: false, reason: 'coins' };
    this.data.coins -= price;
    if (item.kind === 'boost') this.data.boostsReady[itemId] = this.bought(itemId) + 1;
    else this.data.purchases[itemId] = this.bought(itemId) + 1;
    if (item.kind === 'card') this.data.cards.push(item.card);
    this.save();
    return { ok: true };
  }

  /** Shop rank of a weapon (decision 49). */
  weaponRank(kind: WeaponKind): number {
    return this.bought(`rank-${kind}`);
  }

  /** Ranks of every weapon, for WorldOptions.weaponRanks. */
  weaponRanks(): Partial<Record<WeaponKind, number>> {
    return Object.fromEntries(WEAPON_ORDER.map((w) => [w, this.weaponRank(w)]));
  }

  /** Boosts readied for the next run (not consumed; see consumeBoosts). */
  boosts(): MetaBoosts {
    const b = noBoosts();
    for (const [id, n] of Object.entries(this.data.boostsReady)) {
      const item = SHOP_BY_ID[id];
      if (item?.kind === 'boost') for (let k = 0; k < n; k++) item.apply(b);
    }
    return b;
  }

  /** Uses up the readied boosts (call when a run starts). */
  consumeBoosts() {
    if (Object.keys(this.data.boostsReady).length === 0) return;
    this.data.boostsReady = {};
    this.save();
  }

  /** A town is open when the previous town has at least its unlockStars (decision 47). */
  townUnlocked(townId: string): boolean {
    const i = TOWNS.findIndex((t) => t.id === townId);
    if (i <= 0) return i === 0;
    return (this.data.bestStars[TOWNS[i - 1].id] ?? 0) >= TOWNS[i].unlockStars;
  }

  // Debug helpers.
  reset() {
    this.data = freshProfile();
    this.save();
  }

  unlockAll(roles: RoleKind[]) {
    this.data.roles = Array.from(new Set([...this.data.roles, ...roles]));
    this.save();
  }

  unlockAllWeapons(weapons: WeaponKind[]) {
    this.data.weapons = Array.from(new Set([...this.data.weapons, ...weapons]));
    this.save();
  }

  setWeapon(w: WeaponKind) {
    if (!this.data.weapons.includes(w)) return;
    this.data.weapon = w;
    this.save();
  }

  addCoins(n: number) {
    this.data.coins += n;
    this.save();
  }
}
