// Monster archetypes. Target preference matters more than stats (plan §3.3).

export type MonsterKind =
  | 'zombie' | 'orc' | 'brute' | 'skeleton' | 'ghost' | 'vampire'
  | 'imp' | 'necromancer' | 'skeletonArcher' | 'sapper'
  | 'boneKnight' | 'banshee' | 'gravedigger'
  | 'warlord' | 'troll' | 'gravekeeper';

/** Boss ability sets (sim/boss.ts). */
export type BossKind = 'warlord' | 'troll' | 'gravekeeper';

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
  /** 0..1: drains colour towards a cold grey in the shader (a tint can only multiply, not desaturate). */
  pallor?: number;
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
  /** Crosses river water (troll). */
  wades?: boolean;
  /** Boss ability set; bosses get a health bar and arrival banner. */
  boss?: BossKind;
  /** Display name (bosses). */
  name?: string;
  /** Big building-wreckers swat a knight or rookie standing in their way (play-test note). */
  swatsBlockers?: boolean;
  /** Sprints at its target when close (vampire): lands the first bite if you're not careful. */
  lunge?: { range: number; speedMul: number; duration: number; cooldown: number };
  /** Heals this fraction of damage dealt (vampire). */
  lifesteal?: number;
  /**
   * Shoots instead of striking (skeleton archer): lobbed arrows land where the target was heading,
   * so they fly over the river. Uses `damage` / `buildingDamage` per arrow.
   */
  ranged?: { range: number; projectileSpeed: number };
  /** Sprints away from a knight who comes within `range` (necromancer); shares the lunge's sprint timers. */
  flee?: { range: number; speedMul: number; duration: number; cooldown: number };
  /** Stops this far (cells) from the nearest standing building and works from there (necromancer). */
  standoff?: number;
  /** Raises `kind` around itself every `every` s while fewer than `maxAlive` of its raised are alive (necromancer). */
  raise?: { every: number; first: number; count: number; kind: MonsterKind; maxAlive: number; radius: number };
  /**
   * Powder keg (sapper): lights a fuse next to a building, then blows up, wrecking buildings and
   * hurting friendlies in `radius`. Killed first, the keg goes off among the monsters instead.
   */
  explodes?: { fuse: number; radius: number; buildingDamage: number; unitDamage: number; deathDamage: number; deathKnockback: number };
  /**
   * Plate (bone knight): damage from a friendly standing in front of it is cut by `front` (0–1).
   * Area hits (hammer, flail, blasts) ignore it, and so does anything from behind.
   */
  armor?: { front: number };
  /**
   * Wail (banshee): when a friendly is within `range` and the wail is ready, stands still for
   * `telegraph` s, then hurts and stuns every friendly within `radius`. Ready `first` s after spawning, then every `every` s.
   */
  wail?: { range: number; every: number; first: number; telegraph: number; radius: number; damage: number; stun: number };
  /**
   * Burrow (gravedigger): travels underground, untouchable and unseen by weapons, straight to the
   * nearest building, and surfaces for good within `surfaceRange` cells of it.
   */
  burrows?: { surfaceRange: number; speedMul: number };
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
    knockbackResist: 0.85, corpseTime: 1.6, xp: 6, coins: 5, swatsBlockers: true,
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
    lunge: { range: 3, speedMul: 2.6, duration: 0.45, cooldown: 4 },
  },
  imp: {
    // River imp (town 2): small, quick raider that swims straight across the river to the buildings.
    sheet: 'orc', scale: 0.7, tint: 0x6f9cff, alpha: 1, target: 'buildings', aggroRange: 0,
    radius: 0.18, hp: 16, speed: 2.2, speedJitter: 0.2,
    damage: 4, buildingDamage: 3, attackWindup: 0.3, attackCooldown: 0.8, attackReach: 0.18,
    knockbackResist: 0, corpseTime: 1.0, wades: true, xp: 1, coins: 1,
  },
  necromancer: {
    // Hangs back out of the town and raises zombies until someone goes out to deal with him.
    sheet: 'necromancer', scale: 1.1, tint: 0x8f6fd8, alpha: 1, target: 'buildings', aggroRange: 0,
    radius: 0.24, hp: 70, speed: 1.2, speedJitter: 0.1,
    damage: 6, buildingDamage: 2, attackWindup: 0.45, attackCooldown: 1.2, attackReach: 0.2,
    knockbackResist: 0.3, corpseTime: 1.4, swatsBlockers: true, xp: 6, coins: 5,
    standoff: 6,
    flee: { range: 3, speedMul: 2.5, duration: 2, cooldown: 6 },
    raise: { every: 7, first: 2, count: 2, kind: 'zombie', maxAlive: 4, radius: 1.2 },
  },
  skeletonArcher: {
    // Stops in range and lobs arrows at friendlies (preferred) or buildings, across the river too.
    sheet: 'skeletonArcher', scale: 1, tint: 0xe8dcc0, alpha: 1, target: 'nearest', aggroRange: 5,
    radius: 0.2, hp: 20, speed: 1.6, speedJitter: 0.15,
    damage: 5, buildingDamage: 2, attackWindup: 0.5, attackCooldown: 1.8, attackReach: 0,
    knockbackResist: 0, corpseTime: 1.0, xp: 2, coins: 2,
    ranged: { range: 5, projectileSpeed: 7 },
  },
  sapper: {
    // Runs a powder keg to the nearest building. Kill it on the way, ideally among other monsters.
    sheet: 'sapper', scale: 0.95, tint: 0xd8b48a, alpha: 1, target: 'buildings', aggroRange: 0,
    radius: 0.22, hp: 30, speed: 2.0, speedJitter: 0.1,
    damage: 0, buildingDamage: 0, attackWindup: 0, attackCooldown: 0, attackReach: 0.2,
    knockbackResist: 0.1, corpseTime: 0.8, xp: 3, coins: 2,
    explodes: { fuse: 1.0, radius: 1.6, buildingDamage: 70, unitDamage: 15, deathDamage: 30, deathKnockback: 4 },
  },
  boneKnight: {
    // Town 3: plated skeleton. Shrugs off blows from the front, so flank it or use area weapons.
    sheet: 'boneKnight', scale: 1.2, tint: 0x9fb4d8, alpha: 1, target: 'nearest', aggroRange: 4,
    radius: 0.27, hp: 80, speed: 1.25, speedJitter: 0.1,
    damage: 9, buildingDamage: 4, attackWindup: 0.5, attackCooldown: 1.2, attackReach: 0.2,
    knockbackResist: 0.6, corpseTime: 1.4, xp: 5, coins: 4,
    armor: { front: 0.7 },
  },
  banshee: {
    // Town 3: drifts through buildings and wails, hurting and stunning anyone close. Kill her first.
    sheet: 'banshee', scale: 1.1, tint: 0xd6b0ff, alpha: 0.7, target: 'buildings', aggroRange: 0,
    radius: 0.22, hp: 30, speed: 1.25, speedJitter: 0.1,
    damage: 4, buildingDamage: 3, attackWindup: 0.45, attackCooldown: 1.0, attackReach: 0.2,
    knockbackResist: 0.5, corpseTime: 1.0, phasing: true, xp: 4, coins: 3,
    wail: { range: 2.6, every: 8, first: 3, telegraph: 1.1, radius: 2.4, damage: 6, stun: 1.2 },
  },
  gravedigger: {
    // Town 3: tunnels under the town and pops up beside a building, skipping every chokepoint.
    sheet: 'gravedigger', scale: 1.05, tint: 0xffffff, pallor: 0.8, alpha: 1, target: 'buildings', aggroRange: 0,
    radius: 0.24, hp: 60, speed: 1.7, speedJitter: 0.1,
    damage: 8, buildingDamage: 12, attackWindup: 0.6, attackCooldown: 1.3, attackReach: 0.2,
    knockbackResist: 0.3, corpseTime: 1.2, xp: 4, coins: 3,
    burrows: { surfaceRange: 2, speedMul: 1.3 },
  },
  warlord: {
    // Town 1 boss (decision 41). Abilities live in BOSS below.
    sheet: 'orc', scale: 2.5, tint: 0xb06060, alpha: 1, target: 'buildings', aggroRange: 0,
    radius: 0.55, hp: 1400, speed: 0.85, speedJitter: 0,
    damage: 25, buildingDamage: 35, attackWindup: 0.9, attackCooldown: 1.6, attackReach: 0.3,
    knockbackResist: 1, corpseTime: 3, xp: 40, coins: 50, boss: 'warlord', name: 'Orc Warlord', // no swat: his ground slam already punishes melee
  },
  troll: {
    // Town 2 boss (decision 46): wades the river, lobs boulders at buildings, regenerates in water.
    sheet: 'zombie', scale: 2.8, tint: 0x7f9fd8, alpha: 1, target: 'buildings', aggroRange: 0,
    radius: 0.58, hp: 1000, speed: 0.8, speedJitter: 0,
    damage: 8, buildingDamage: 30, attackWindup: 1.0, attackCooldown: 1.8, attackReach: 0.3,
    knockbackResist: 1, corpseTime: 3, xp: 50, coins: 60, wades: true, boss: 'troll', name: 'River Troll', swatsBlockers: true,
  },
  gravekeeper: {
    // Town 3 boss: rings a death toll on the knight and raises the dead from the gravestones.
    sheet: 'gravekeeper', scale: 2.4, tint: 0xffffff, pallor: 0.8, alpha: 1, target: 'buildings', aggroRange: 0,
    radius: 0.5, hp: 1100, speed: 0.8, speedJitter: 0,
    damage: 10, buildingDamage: 28, attackWindup: 1.0, attackCooldown: 1.8, attackReach: 0.3,
    knockbackResist: 1, corpseTime: 3, xp: 55, coins: 70, boss: 'gravekeeper', name: 'Gravekeeper', swatsBlockers: true,
  },
};

/** Gravekeeper abilities. */
export const GRAVEKEEPER = {
  /** Death toll: a telegraphed circle on the knight, then damage and a stun to everyone in it. */
  toll: { every: 9, telegraph: 1.4, radius: 1.8, damage: 14, stun: 1.0 },
  /** Raises the dead beside random gravestones (no xp or coins), up to `maxAlive` at once; kinds cycle. */
  raise: { every: 12, first: 3, count: 3, maxAlive: 8, kinds: ['skeleton', 'skeleton', 'boneKnight'] as MonsterKind[] },
};

/** River Troll abilities. */
export const TROLL = {
  /** Lobs a boulder at a standing building within range: telegraphed, then hits the building and anyone nearby. */
  boulder: { every: 5, range: 9, telegraph: 1.2, radius: 1.3, buildingDamage: 90, unitDamage: 12 },
  /** Fraction of max HP regenerated per second while standing in the river. */
  waterRegen: 0.008,
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
