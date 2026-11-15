// Wave tables per town. Town 1 (medieval village): 10 waves + the Orc Warlord (~5 minutes, decision 40).

import type { MonsterKind } from './monsters';

export interface WaveDef {
  /** Monsters to spawn, in this order (interleaved across sides). */
  monsters: Partial<Record<MonsterKind, number>>;
  /** Number of map edges the wave arrives from. */
  sides: 1 | 2 | 3;
}

/** New archetypes are introduced one at a time: skeletons (3), ghosts (5), vampires (7), boss (10). */
export const TOWN1_WAVES: WaveDef[] = [
  { monsters: { zombie: 5 }, sides: 1 },
  { monsters: { zombie: 6, orc: 2 }, sides: 1 },
  { monsters: { zombie: 6, orc: 3, skeleton: 3 }, sides: 1 },
  { monsters: { zombie: 8, orc: 4, brute: 1 }, sides: 2 },
  { monsters: { zombie: 8, orc: 4, skeleton: 3, ghost: 3 }, sides: 2 },
  { monsters: { zombie: 10, orc: 6, brute: 1, ghost: 2 }, sides: 2 },
  { monsters: { zombie: 10, orc: 6, skeleton: 4, vampire: 2 }, sides: 2 },
  { monsters: { zombie: 12, orc: 7, brute: 2, ghost: 3 }, sides: 2 },
  { monsters: { zombie: 10, orc: 7, skeleton: 3, vampire: 2, brute: 1 }, sides: 3 },
  // Boss wave: the Warlord arrives with an escort; the town is saved when he falls and the field is clear.
  { monsters: { warlord: 1, zombie: 6, orc: 4, skeleton: 2 }, sides: 2 },
];

/**
 * Town 2 (riverside market): monsters arrive from more sides and lean on ghosts and vampires,
 * which ignore or exploit the river's chokepoints. The River Troll wades in with wave 10.
 */
export const TOWN2_WAVES: WaveDef[] = [
  { monsters: { zombie: 6, skeleton: 2 }, sides: 1 },
  { monsters: { zombie: 6, orc: 3, ghost: 1 }, sides: 2 },
  { monsters: { zombie: 8, orc: 4, skeleton: 3 }, sides: 2 },
  { monsters: { zombie: 8, orc: 5, brute: 1, ghost: 2 }, sides: 2 },
  { monsters: { zombie: 10, orc: 5, skeleton: 3, vampire: 2 }, sides: 2 },
  { monsters: { zombie: 10, orc: 6, brute: 1, ghost: 3 }, sides: 3 },
  { monsters: { zombie: 12, orc: 7, skeleton: 4, vampire: 2, brute: 1 }, sides: 2 },
  { monsters: { zombie: 12, orc: 8, ghost: 4, brute: 2 }, sides: 3 },
  { monsters: { zombie: 10, orc: 7, skeleton: 3, vampire: 2, brute: 1 }, sides: 3 },
  { monsters: { troll: 1, zombie: 6, orc: 3, ghost: 2 }, sides: 2 },
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
