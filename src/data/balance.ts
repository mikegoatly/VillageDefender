// Tunable numbers. Units: cells, seconds, hit points.

export const SIM_HZ = 60;
export const DT = 1 / SIM_HZ;

export const MAP = {
  /** Diamonds across the full map width (decision 11: 18 across at 0.65× tiles). */
  across: 18,
  /** Map width / height in screen space. */
  aspect: 1.9,
  tileScale: 0.65,
  /** Fraction of the map (per axis, screen space) given to the town. */
  townExtent: 0.6,
  /** Chance an eligible lattice slot stays empty (open squares). */
  emptySlotChance: 0.15,
  treeChance: 0.03,
  rockChance: 0.01,
};

export const KNIGHT = {
  radius: 0.25,
  hp: 100,
  speed: 3.4,
  /** Move speed multiplier while swinging. */
  attackMoveFactor: 0.6,
  attackCooldown: 0.55,
  attackDuration: 0.35,
  /** Time into the swing when the hit lands. */
  attackHitTime: 0.12,
  /** Enemies within this range get auto-targeted. */
  acquireRange: 1.8,
  /** Reach of the swing measured from the knight's centre to the enemy's edge. */
  attackRange: 1.15,
  /** Half-angle of the swing arc, radians. */
  attackArc: (70 * Math.PI) / 180,
  attackDamage: 12,
  knockback: 3.2,
  dodgeSpeed: 8.5,
  dodgeDuration: 0.26,
  dodgeCooldown: 0.8,
  /** Invulnerability after taking a hit. */
  hurtInvuln: 0.5,
};

export const ZOMBIE = {
  radius: 0.22,
  hp: 24,
  speed: 1.5,
  speedJitter: 0.25,
  damage: 8,
  /** Wind-up before the hit lands; the knight can dodge out of range. */
  attackWindup: 0.4,
  attackCooldown: 1.1,
  /** Extra reach beyond touching. */
  attackReach: 0.18,
  corpseTime: 1.2,
};

export const WAVES = {
  /** First wave lands here; its warning shows `warning` seconds earlier. */
  firstAt: 6,
  interval: 14,
  warning: 3,
  baseCount: 5,
  perWave: 3,
  spawnSpacing: 0.12,
  /** From this wave on, monsters arrive from two sides. */
  twoSidesFrom: 4,
  maxAlive: 300,
};

/** Knockback velocity decays by this factor per second. */
export const KNOCKBACK_DAMPING = 10;
/** Fraction of the overlap between two units resolved per tick (0..1). */
export const SEPARATION = 0.35;
