// Boss-only state, kept on the unit. A leaf module so model and waves need not import the boss AI.

import { BOSS } from '../data/monsters';

/** Boss-only state, kept on the unit. */
export interface BossState {
  ability: 'none' | 'slamWindup' | 'chargeWindup' | 'charging';
  abilityTime: number;
  slamCd: number;
  chargeIn: number;
  summonIn: number;
  chargeTarget: number;
  chargeDir: { x: number; y: number };
  slamX: number;
  slamY: number;
}

export function newBossState(): BossState {
  return {
    ability: 'none', abilityTime: 0, slamCd: 2, chargeIn: BOSS.charge.every * 0.6, summonIn: BOSS.summon.every * 0.5,
    chargeTarget: -1, chargeDir: { x: 0, y: 0 }, slamX: 0, slamY: 0,
  };
}
