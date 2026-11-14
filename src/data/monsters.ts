// Monster archetypes. Target preference matters more than stats (plan §3.3).

export type MonsterKind = 'zombie' | 'orc' | 'brute' | 'skeleton' | 'ghost' | 'vampire' | 'warlord';

/**
 * - nearest: chases the nearest knight/rookie within aggroRange, otherwise the nearest building
 * - buildings: ignores knight and rookies and goes for the nearest standing building
 * - knight: always hunts the knight (stalker)
 * - rookies: hunts rookies; falls back to the knight, then buildings, when there are none
 */
export type TargetPreference = 'nearest' | 'buildings' | 'knight' | 'rookies';

export interface MonsterDef {
  /** Baked sprite sheet. */
  sheet: string;
  /** Render scale relative to normal characters. */
  scale: number;
  /** Multiply tint (0xffffff = none), so archetypes read apart at a glance (decision 8). */
  tint: number;
  /** Render alpha (ghosts are translucent). */
  alpha: number;
  target: TargetPreference;
  /** 'nearest' only: switch to chasing a friendly inside this range (cells). */
  aggroRange: number;
  radius: number;
  hp: number;
  speed: number;
  speedJitter: number;
  /** Damage per hit to the knight or a rookie. */
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
  /** Walks straight through buildings and trees (ghost). */
  phasing?: boolean;
  /** Heals this fraction of damage dealt (vampire). */
  lifesteal?: number;
  /** XP gem value dropped on death. */
  xp: number;
  /** Coins on death. */
  coins: number;
}

export const MONSTERS: Record<MonsterKind, MonsterDef> = {
  zombie: {
    sheet: 'zombie', scale: 1, tint: 0xffffff, alpha: 1, target: 'nearest', aggroRange: 4.5,
    radius: 0.22, hp: 24, speed: 1.5, speedJitter: 0.25,
    damage: 6, buildingDamage: 2, attackWindup: 0.4, attackCooldown: 1.1, attackReach: 0.18,
    knockbackResist: 0, corpseTime: 1.2, xp: 1, coins: 1,
  },
  orc: {
    // Raider: runs past the knight to wreck buildings.
    sheet: 'orc', scale: 1, tint: 0xffc49a, alpha: 1, target: 'buildings', aggroRange: 0,
    radius: 0.23, hp: 28, speed: 1.85, speedJitter: 0.2,
    damage: 6, buildingDamage: 3, attackWindup: 0.35, attackCooldown: 0.9, attackReach: 0.2,
    knockbackResist: 0.2, corpseTime: 1.2, xp: 2, coins: 1,
  },
  brute: {
    // Slow, tanky building-wrecker. Priority target.
    sheet: 'orc', scale: 1.6, tint: 0xd98a8a, alpha: 1, target: 'buildings', aggroRange: 0,
    radius: 0.36, hp: 150, speed: 0.95, speedJitter: 0.05,
    damage: 20, buildingDamage: 20, attackWindup: 0.8, attackCooldown: 1.8, attackReach: 0.25,
    knockbackResist: 0.85, corpseTime: 1.6, xp: 6, coins: 5,
  },
  skeleton: {
    // Stalker: fast, fragile, always hunts the knight. Pressure on the player.
    sheet: 'skeleton', scale: 1, tint: 0xffffff, alpha: 1, target: 'knight', aggroRange: 0,
    radius: 0.2, hp: 18, speed: 2.4, speedJitter: 0.2,
    damage: 5, buildingDamage: 1, attackWindup: 0.3, attackCooldown: 1.0, attackReach: 0.18,
    knockbackResist: 0, corpseTime: 1.0, xp: 1, coins: 1,
  },
  ghost: {
    // Phaser: drifts through buildings straight to its target. Punishes guarding one lane.
    sheet: 'ghost', scale: 1, tint: 0xd8e8ff, alpha: 0.75, target: 'buildings', aggroRange: 0,
    radius: 0.22, hp: 22, speed: 1.3, speedJitter: 0.15,
    damage: 5, buildingDamage: 4, attackWindup: 0.45, attackCooldown: 1.0, attackReach: 0.2,
    knockbackResist: 0.4, corpseTime: 1.0, phasing: true, xp: 2, coins: 2,
  },
  vampire: {
    // Leech: hunts rookies and heals by biting. Threatens your army.
    sheet: 'vampire', scale: 1.05, tint: 0xffffff, alpha: 1, target: 'rookies', aggroRange: 0,
    radius: 0.23, hp: 55, speed: 2.0, speedJitter: 0.15,
    damage: 10, buildingDamage: 3, attackWindup: 0.35, attackCooldown: 0.9, attackReach: 0.2,
    knockbackResist: 0.3, corpseTime: 1.2, lifesteal: 1, xp: 4, coins: 3,
  },
  warlord: {
    // Town 1 boss (decision 41). Abilities live in BOSS below.
    sheet: 'orc', scale: 2.5, tint: 0xb06060, alpha: 1, target: 'buildings', aggroRange: 0,
    radius: 0.55, hp: 1400, speed: 0.85, speedJitter: 0,
    damage: 25, buildingDamage: 35, attackWindup: 0.9, attackCooldown: 1.6, attackReach: 0.3,
    knockbackResist: 1, corpseTime: 3, xp: 40, coins: 50,
  },
};

/** Orc Warlord abilities. */
export const BOSS = {
  /** Ground slam when a friendly is within triggerRange: telegraphed, then damages within radius. */
  slam: { triggerRange: 2.2, telegraph: 1.3, radius: 2.3, damage: 22, knockback: 8, cooldown: 7 },
  /** Charge: sprints at the nearest building, smashing it on arrival. */
  charge: { every: 14, speedMul: 4, maxTime: 3, buildingDamage: 120, windup: 1.0 },
  /** Calls raiders from the map edges. */
  summon: { every: 16, count: 4, kind: 'orc' as MonsterKind },
};
