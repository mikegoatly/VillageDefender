// Towns (stages). "Town" is the playable map; "knight level" is the in-run XP level (decision 37).

import type { MonsterKind } from './monsters';
import type { MapOptions } from '../sim/map';
import { TOWN1_WAVES, TOWN2_WAVES, TOWN3_WAVES, TOWN4_WAVES, TOWN5_WAVES, type WaveDef } from './waves';

export interface TownDef {
  id: string;
  name: string;
  /** One line for the town select screen. */
  blurb: string;
  /** Planning points: how many houses may be turned into role buildings (decision 36). */
  planningPoints: number;
  waves: WaveDef[];
  /** Map generator options (terrain features). */
  map: MapOptions;
  /** Stars needed in the previous town to unlock this one (0 = always open). */
  unlockStars: number;
  /** Name shown on the boss bar. */
  bossName: string;
  /**
   * Night towns: lamp posts out on the approaches start dark; in planning each unit of oil lights one
   * (like planning points turn houses into role buildings). 0 for towns without lamps.
   */
  lampOil: number;
  /**
   * Draws a monster kind with another body in this town (render3d/bodies.ts), so the everyday horde
   * changes from town to town. Looks only: the kind, its stats and its kill count are unchanged.
   */
  looks?: Partial<Record<MonsterKind, string>>;
}

export const TOWNS: TownDef[] = [
  {
    id: 'village', name: 'Medieval Village', blurb: 'A quiet crossroads village. The Orc Warlord is coming.',
    planningPoints: 2, waves: TOWN1_WAVES, map: {}, unlockStars: 0, bossName: 'Orc Warlord', lampOil: 0,
  },
  {
    id: 'riverside', name: 'Riverside Market',
    blurb: 'A river splits the town, but imps swim it and archers shoot over it. The River Troll wades in last.',
    planningPoints: 3, waves: TOWN2_WAVES, map: { river: true }, unlockStars: 1, bossName: 'River Troll', lampOil: 0,
    looks: { zombie: 'drowned', orc: 'frogfolk' },
  },
  {
    id: 'graveyard', name: 'Haunted Hollow',
    blurb: 'Bone knights shrug off blows, banshees wail, and gravediggers tunnel under your defences. The Gravekeeper rises last.',
    planningPoints: 3, waves: TOWN3_WAVES, map: { theme: 'graveyard' }, unlockStars: 1, bossName: 'Gravekeeper', lampOil: 0,
    looks: { orc: 'ghoul' },
  },
  {
    id: 'frostpeak', name: 'Frostpeak Mine',
    blurb: 'Frozen ponds send you skating, dwarves plant powder kegs, and shieldbearers ward the horde. The Frost Giant comes down the mountain last.',
    planningPoints: 3, waves: TOWN4_WAVES, map: { theme: 'frost' }, unlockStars: 1, bossName: 'Frost Giant', lampOil: 0,
    looks: { zombie: 'frostThrall', orc: 'yeti' },
  },
  {
    id: 'lanternwick', name: 'Lanternwick',
    blurb: 'A forest village that lives by its lanterns. Night falls wave by wave, and things come out of the dark. The Pumpkin King rises under the harvest moon.',
    planningPoints: 3, waves: TOWN5_WAVES, map: { theme: 'night' }, unlockStars: 1, bossName: 'Pumpkin King', lampOil: 3,
    looks: { zombie: 'scarecrow', orc: 'werewolf' },
  },
];

export const TOWN_BY_ID: Record<string, TownDef> = Object.fromEntries(TOWNS.map((t) => [t.id, t]));

/** Coins earned during a run (decision 30): wave rewards + kills + star bonus. */
export const COINS = {
  /** Paid when a wave is cleared (next wave starts or the town is won): × wave number. */
  perWaveCleared: 3,
  perStar: 20,
};
