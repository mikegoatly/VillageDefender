// Tunable numbers. Units: cells, seconds, hit points.

import { MONSTERS } from './monsters';

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
  hp: 150,
  speed: 3.4,
  /** Move speed multiplier while swinging. */
  attackMoveFactor: 0.6,
  attackCooldown: 0.45,
  attackDuration: 0.35,
  /** Time into the swing when the hit lands. */
  attackHitTime: 0.12,
  /** Enemies within this range get auto-targeted. */
  acquireRange: 1.8,
  /** Reach of the swing measured from the knight's centre to the enemy's edge. */
  attackRange: 1.15,
  /** Half-angle of the swing arc, radians. */
  attackArc: (70 * Math.PI) / 180,
  attackDamage: 15,
  knockback: 3.2,
  dodgeSpeed: 8.5,
  dodgeDuration: 0.26,
  dodgeCooldown: 0.8,
  /** Invulnerability after taking a hit. */
  hurtInvuln: 0.5,
};

/** Zombie stats live with the other archetypes in data/monsters.ts. */
export const ZOMBIE = MONSTERS.zombie;

export const BUILDING = {
  /** HP of a one-block cottage. */
  baseHp: 300,
  /** Extra HP per additional wall block (a 2x2 two-storey hall has 7 extra → 1140). */
  hpPerExtraBlock: 120,
  /** Damaged look below this HP fraction. */
  damagedAt: 0.5,
};

/** Star thresholds by fraction of buildings left standing (plan section 3.2). */
export const STARS = {
  three: 1,
  two: 2 / 3,
};

export const WAVES = {
  /** First wave lands here; its warning shows `warning` seconds earlier. */
  firstAt: 6,
  interval: 18,
  warning: 3,
  spawnSpacing: 0.12,
  maxAlive: 300,
};
/** Knockback velocity decays by this factor per second. */
export const KNOCKBACK_DAMPING = 10;
/** Fraction of the overlap between two units resolved per tick (0..1). */
export const SEPARATION = 0.35;
