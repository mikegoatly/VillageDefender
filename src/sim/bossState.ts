// Boss-only state, kept on the unit. A leaf module so model and waves need not import the boss AI.

import { BOSS, FROST_GIANT, GRAVEKEEPER, TROLL, type BossKind } from '../data/monsters';

/** Boss-only state, kept on the unit. One shape for every boss; each uses the fields it needs. */
export interface BossState {
  kind: BossKind;
  ability: 'none' | 'slamWindup' | 'chargeWindup' | 'charging' | 'boulderWindup' | 'tollWindup' | 'stompWindup';
  abilityTime: number;
  // Orc Warlord
  slamCd: number;
  chargeIn: number;
  summonIn: number;
  chargeTarget: number;
  chargeDir: { x: number; y: number };
  slamX: number;
  slamY: number;
  // River Troll
  boulderIn: number;
  boulderTarget: number;
  // Gravekeeper
  tollIn: number;
  tollX: number;
  tollY: number;
  raiseIn: number;
  /** How many raises so far (picks which monster kind comes next). */
  raised: number;
  // Frost Giant (also uses boulderIn/boulderTarget, and slamX/slamY for where the stomp lands)
  stompIn: number;
}

export function newBossState(kind: BossKind = 'warlord'): BossState {
  return {
    kind, ability: 'none', abilityTime: 0,
    slamCd: 2, chargeIn: BOSS.charge.every * 0.6, summonIn: BOSS.summon.every * 0.5,
    chargeTarget: -1, chargeDir: { x: 0, y: 0 }, slamX: 0, slamY: 0,
    boulderIn: TROLL.boulder.every * 0.5, boulderTarget: -1,
    tollIn: GRAVEKEEPER.toll.every * 0.4, tollX: 0, tollY: 0, raiseIn: GRAVEKEEPER.raise.first, raised: 0,
    stompIn: FROST_GIANT.stomp.first,
  };
}
