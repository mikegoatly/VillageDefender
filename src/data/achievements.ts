// Achievements: persistent goals that unlock content (decision 33/35). Checked after every run.

import type { RoleKind } from './roles';

/** What a finished run reports to the profile. */
export interface RunResult {
  townId: string;
  won: boolean;
  stars: number;
  standing: number;
  totalBuildings: number;
  knightLevel: number;
  kills: Record<string, number>;
  coins: number;
}

/** Cumulative stats across all runs (kept in the profile). */
export interface LifetimeStats {
  runs: number;
  wins: number;
  kills: Record<string, number>;
}

export interface AchievementDef {
  id: string;
  name: string;
  description: string;
  /** True once earned; sees this run and lifetime stats (already including this run). */
  check(run: RunResult, life: LifetimeStats): boolean;
  reward?: { role?: RoleKind };
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: 'first-win', name: 'Defender', description: 'Save a town',
    check: (r) => r.won, reward: { role: 'smithy' },
  },
  {
    id: 'three-stars', name: 'Not a scratch', description: 'Save a town with every building standing',
    check: (r) => r.won && r.stars === 3, reward: { role: 'watchtower' },
  },
  {
    id: 'brute-slayer', name: 'Brute slayer', description: 'Defeat 10 brutes',
    check: (_r, l) => (l.kills.brute ?? 0) >= 10,
  },
  {
    id: 'seasoned', name: 'Seasoned', description: 'Reach knight level 8 in one run',
    check: (r) => r.knightLevel >= 8,
  },
];
