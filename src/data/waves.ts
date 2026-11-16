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
 * Town 2 (riverside market): bigger waves from more sides, and four monsters that break
 * "just hold the bridges": imps swim the river (1), skeleton archers shoot over it (3),
 * sappers blow up buildings (4) and necromancers raise zombies from outside the town (5).
 * The River Troll wades in with wave 10.
 */
export const TOWN2_WAVES: WaveDef[] = [
  { monsters: { zombie: 7, imp: 3 }, sides: 1 },
  { monsters: { zombie: 7, orc: 3, imp: 4, ghost: 1 }, sides: 2 },
  { monsters: { zombie: 8, orc: 4, skeletonArcher: 3, imp: 3 }, sides: 2 },
  { monsters: { zombie: 9, orc: 5, sapper: 2, brute: 1, ghost: 2 }, sides: 2 },
  { monsters: { zombie: 8, orc: 5, necromancer: 1, skeleton: 3, imp: 4 }, sides: 3 },
  { monsters: { zombie: 8, orc: 6, skeletonArcher: 3, vampire: 2, sapper: 2 }, sides: 3 },
  { monsters: { zombie: 10, orc: 6, necromancer: 1, ghost: 3, imp: 5, brute: 1 }, sides: 2 },
  { monsters: { zombie: 10, orc: 7, sapper: 3, skeletonArcher: 3, vampire: 2, brute: 1 }, sides: 3 },
  { monsters: { zombie: 10, orc: 7, necromancer: 1, imp: 6, skeleton: 3, brute: 2 }, sides: 3 },
  { monsters: { troll: 1, zombie: 6, orc: 3, sapper: 2, skeletonArcher: 2, imp: 4 }, sides: 3 },
];

/**
 * Town 3 (haunted graveyard): plated bone knights (1), banshees whose wail stuns (3),
 * gravediggers that tunnel past every chokepoint (4), then the older Town 2 threats mixed back in.
 * The Gravekeeper raises the dead from the gravestones in wave 10.
 */
export const TOWN3_WAVES: WaveDef[] = [
  { monsters: { zombie: 8, skeleton: 3, boneKnight: 1 }, sides: 1 },
  { monsters: { zombie: 7, orc: 3, boneKnight: 2, ghost: 2 }, sides: 2 },
  { monsters: { zombie: 8, orc: 3, skeleton: 3, boneKnight: 1, banshee: 1 }, sides: 2 },
  { monsters: { zombie: 8, orc: 4, gravedigger: 3, skeletonArcher: 2 }, sides: 2 },
  { monsters: { zombie: 8, orc: 4, boneKnight: 2, banshee: 2, necromancer: 1 }, sides: 3 },
  { monsters: { zombie: 9, orc: 5, gravedigger: 3, vampire: 2, sapper: 2 }, sides: 3 },
  { monsters: { zombie: 10, boneKnight: 3, banshee: 2, skeletonArcher: 3, ghost: 2 }, sides: 3 },
  { monsters: { zombie: 10, orc: 6, gravedigger: 4, necromancer: 1, brute: 1, boneKnight: 2 }, sides: 3 },
  { monsters: { zombie: 10, orc: 6, banshee: 3, gravedigger: 3, vampire: 2, boneKnight: 3, brute: 1 }, sides: 3 },
  { monsters: { gravekeeper: 1, zombie: 6, boneKnight: 3, banshee: 2, gravedigger: 3, skeletonArcher: 2 }, sides: 3 },
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
