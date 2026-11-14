// Rookie knights: autonomous allies that join at kill thresholds (plan §3.4).

export type RookieKind = 'swordsman' | 'archer';

export interface RookieDef {
  sheet: string;
  radius: number;
  hp: number;
  speed: number;
  damage: number;
  attackCooldown: number;
  /** Time into the attack when the hit lands / the arrow is loosed. */
  attackHitTime: number;
  attackDuration: number;
  /** Melee: reach from body edge. Ranged: max shooting distance (centre to centre). */
  range: number;
  /** Ranged only: back away when an enemy is closer than this. */
  keepAway: number;
  projectileSpeed: number;
}

export const ROOKIES: Record<RookieKind, RookieDef> = {
  swordsman: {
    sheet: 'swordsman', radius: 0.23, hp: 60, speed: 2.7, damage: 10,
    attackCooldown: 0.8, attackHitTime: 0.15, attackDuration: 0.35, range: 0.9, keepAway: 0, projectileSpeed: 0,
  },
  archer: {
    sheet: 'archer', radius: 0.22, hp: 40, speed: 2.6, damage: 8,
    attackCooldown: 1.2, attackHitTime: 0.3, attackDuration: 0.45, range: 5, keepAway: 1.8, projectileSpeed: 9,
  },
};

export const ARMY = {
  /** Kills at which the n-th rookie is earned (scaled by upgrades). */
  thresholds: [12, 30, 55, 85, 120, 160, 205, 255, 310],
  baseCap: 3,
  /** Delay before a fallen rookie's replacement walks out. */
  respawnDelay: 15,
  /** Class order for successive rookies. */
  order: ['swordsman', 'archer'] as RookieKind[],
  /** Kills needed for veteran and captain. */
  rankKills: [0, 8, 25],
  rankMul: [1, 1.3, 1.7],
  /** Rookies look for building attackers within this range, then any monster within huntRange. */
  defendRange: 10,
  huntRange: 6,
  /** Seconds between target re-evaluations. */
  retargetEvery: 0.25,
};

export const RALLY = {
  duration: 4,
  cooldown: 15,
  /** Rookies within this distance of the knight fight normally while rallying. */
  closeEnough: 1.5,
};

export const XP_DROP: Record<string, number> = { zombie: 1, orc: 2, brute: 6 };

export const GEMS = {
  magnetRadius: 1.6,
  collectRadius: 0.35,
  /** Speed gems fly toward the knight once magnetised (cells/s), accelerating. */
  flySpeed: 7,
};

export const TOWN_ARROWS = {
  range: 3.5,
  /** Seconds between shots per building at arrow-slit level 1; each extra level -0.8 s (min 1.2). */
  interval: 3.5,
  damage: 8,
  speed: 10,
};
