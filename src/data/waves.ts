// Wave tables per town. Town 1 (medieval village): 8 waves (~3 minutes).

import type { MonsterKind } from './monsters';

export interface WaveDef {
  /** Monsters to spawn, in this order (interleaved across sides). */
  monsters: Partial<Record<MonsterKind, number>>;
  /** Number of map edges the wave arrives from. */
  sides: 1 | 2 | 3;
}

export const TOWN1_WAVES: WaveDef[] = [
  { monsters: { zombie: 5 }, sides: 1 },
  { monsters: { zombie: 6, orc: 2 }, sides: 1 },
  { monsters: { zombie: 7, orc: 4 }, sides: 1 },
  { monsters: { zombie: 8, orc: 5, brute: 1 }, sides: 2 },
  { monsters: { zombie: 10, orc: 7 }, sides: 2 },
  { monsters: { zombie: 12, orc: 8, brute: 1 }, sides: 2 },
  { monsters: { zombie: 14, orc: 8, brute: 2 }, sides: 2 },
  { monsters: { zombie: 16, orc: 10, brute: 2 }, sides: 3 },
];

/** Flattens a wave into a spawn order that mixes kinds rather than sending them in blocks. */
export function spawnOrder(w: WaveDef): MonsterKind[] {
  const left = { ...w.monsters } as Record<MonsterKind, number>;
  const out: MonsterKind[] = [];
  const kinds = Object.keys(left) as MonsterKind[];
  let any = true;
  while (any) {
    any = false;
    for (const k of kinds) {
      if ((left[k] ?? 0) > 0) {
        out.push(k);
        left[k]--;
        any = true;
      }
    }
  }
  return out;
}
