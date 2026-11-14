// Persistent player profile (decision 31): coin wallet, unlocks, achievements, best stars.
// Storage is injectable so tests (and the debug panel) can use memory instead of localStorage.

import { ACHIEVEMENTS, type LifetimeStats, type RunResult } from '../data/achievements';
import { STARTING_ROLES, type RoleKind } from '../data/roles';
import { STARTING_WEAPONS, type WeaponKind } from '../data/weapons';

export interface ProfileData {
  version: 1;
  coins: number;
  roles: RoleKind[];
  weapons: WeaponKind[];
  /** Weapon picked last time (pre-selected when planning). */
  weapon: WeaponKind;
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
  return { version: 1, coins: 0, roles: [...STARTING_ROLES], weapons: [...STARTING_WEAPONS], weapon: 'sword', achievements: [], bestStars: {}, stats: { runs: 0, wins: 0, kills: {} } };
}

export interface RunOutcome {
  coins: number;
  newAchievements: { id: string; name: string; description: string }[];
  unlockedRoles: RoleKind[];
  unlockedWeapons: WeaponKind[];
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
    }
    this.save();
    return { coins: run.coins, newAchievements, unlockedRoles, unlockedWeapons, newBest };
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
