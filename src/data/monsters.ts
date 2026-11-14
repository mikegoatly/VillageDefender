// Monster archetypes. Target preference matters more than stats (plan §3.3).

export type MonsterKind = 'zombie' | 'orc' | 'brute';

/**
 * - nearest: chases the knight when he is within aggroRange, otherwise the nearest building
 * - buildings: ignores the knight entirely and goes for the nearest standing building
 */
export type TargetPreference = 'nearest' | 'buildings';

export interface MonsterDef {
  /** Baked sprite sheet. */
  sheet: string;
  /** Render scale relative to normal characters. */
  scale: number;
  /** Multiply tint (0xffffff = none), so archetypes read apart at a glance (decision 8). */
  tint: number;
  target: TargetPreference;
  /** 'nearest' only: switch to chasing the knight inside this range (cells). */
  aggroRange: number;
  radius: number;
  hp: number;
  speed: number;
  speedJitter: number;
  /** Damage per hit to the knight. */
  damage: number;
  /** Damage per hit to a building. */
  buildingDamage: number;
  attackWindup: number;
  attackCooldown: number;
  /** Extra reach beyond touching. */
  attackReach: number;
  /** 0 = full knockback, 1 = immovable. */
  knockbackResist: number;
  corpseTime: number;
}

export const MONSTERS: Record<MonsterKind, MonsterDef> = {
  zombie: {
    sheet: 'zombie', scale: 1, tint: 0xffffff, target: 'nearest', aggroRange: 4.5,
    radius: 0.22, hp: 24, speed: 1.5, speedJitter: 0.25,
    damage: 6, buildingDamage: 2, attackWindup: 0.4, attackCooldown: 1.1, attackReach: 0.18,
    knockbackResist: 0, corpseTime: 1.2,
  },
  orc: {
    // Raider: runs past the knight to wreck buildings.
    sheet: 'orc', scale: 1, tint: 0xffc49a, target: 'buildings', aggroRange: 0,
    radius: 0.23, hp: 28, speed: 1.85, speedJitter: 0.2,
    damage: 6, buildingDamage: 3, attackWindup: 0.35, attackCooldown: 0.9, attackReach: 0.2,
    knockbackResist: 0.2, corpseTime: 1.2,
  },
  brute: {
    // Slow, tanky building-wrecker. Priority target.
    sheet: 'orc', scale: 1.6, tint: 0xd98a8a, target: 'buildings', aggroRange: 0,
    radius: 0.36, hp: 150, speed: 0.95, speedJitter: 0.05,
    damage: 20, buildingDamage: 20, attackWindup: 0.8, attackCooldown: 1.8, attackReach: 0.25,
    knockbackResist: 0.85, corpseTime: 1.6,
  },
};
