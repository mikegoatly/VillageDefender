// Towns (stages). "Town" is the playable map; "knight level" is the in-run XP level (decision 37).

import { TOWN1_WAVES, type WaveDef } from './waves';

export interface TownDef {
  id: string;
  name: string;
  /** Planning points: how many houses may be turned into role buildings (decision 36). */
  planningPoints: number;
  waves: WaveDef[];
}

export const TOWNS: TownDef[] = [
  { id: 'village', name: 'Medieval Village', planningPoints: 2, waves: TOWN1_WAVES },
];

export const TOWN_BY_ID: Record<string, TownDef> = Object.fromEntries(TOWNS.map((t) => [t.id, t]));

/** Coins earned during a run (decision 30): wave rewards + kills + star bonus. */
export const COINS = {
  /** Paid when a wave is cleared (next wave starts or the town is won): × wave number. */
  perWaveCleared: 3,
  perKill: { zombie: 1, orc: 1, brute: 5 } as Record<string, number>,
  perStar: 20,
};
