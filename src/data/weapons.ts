// Basic attacks (plan §3.5). One is chosen before a town starts; the sword is always available,
// the rest are unlocked by achievements (decision 38).

export type WeaponKind = 'sword' | 'spear' | 'hammer' | 'axes' | 'flail';

export interface WeaponDef {
  kind: WeaponKind;
  name: string;
  description: string;
  /** Knight sprite sheet holding this weapon. */
  sheet: string;
  /** How the attack works. */
  style: 'arc' | 'area' | 'boomerang' | 'spin';
  damage: number;
  /** Seconds between attacks ('spin': between damage pulses). */
  cooldown: number;
  /** Seconds into the attack when the hit lands. */
  hitTime: number;
  /** Attack animation length. */
  duration: number;
  /** Auto-target acquire range. */
  acquireRange: number;
  /** arc: reach from body edge; area: distance of the slam centre ahead; boomerang: max throw distance; spin: ring radius. */
  range: number;
  /** arc: half-angle (radians). area: slam radius. */
  arc: number;
  knockback: number;
  /** Move speed multiplier while attacking. */
  moveFactor: number;
  /** boomerang only. */
  projectileSpeed: number;
}

const deg = (d: number) => (d * Math.PI) / 180;

export const WEAPONS: Record<WeaponKind, WeaponDef> = {
  sword: {
    kind: 'sword', name: 'Sword', description: 'Balanced sweep in front of the knight',
    sheet: 'knight', style: 'arc', damage: 15, cooldown: 0.45, hitTime: 0.12, duration: 0.35,
    acquireRange: 1.8, range: 1.15, arc: deg(70), knockback: 3.2, moveFactor: 0.6, projectileSpeed: 0,
  },
  spear: {
    kind: 'spear', name: 'Spear', description: 'Long thrust that pierces a line of enemies',
    sheet: 'knight-spear', style: 'arc', damage: 17, cooldown: 0.45, hitTime: 0.14, duration: 0.35,
    acquireRange: 2.6, range: 2.1, arc: deg(16), knockback: 2.4, moveFactor: 0.65, projectileSpeed: 0,
  },
  hammer: {
    kind: 'hammer', name: 'Warhammer', description: 'Slow ground slam: area damage and huge knockback',
    sheet: 'knight-hammer', style: 'area', damage: 26, cooldown: 0.95, hitTime: 0.3, duration: 0.55,
    acquireRange: 1.9, range: 0.8, arc: 1.2, knockback: 6.5, moveFactor: 0.4, projectileSpeed: 0,
  },
  axes: {
    kind: 'axes', name: 'Throwing Axes', description: 'Thrown axe flies out and returns, hitting everything twice',
    sheet: 'knight-axe', style: 'boomerang', damage: 9, cooldown: 0.75, hitTime: 0.15, duration: 0.35,
    acquireRange: 4.5, range: 4.2, arc: 0, knockback: 1.2, moveFactor: 0.85, projectileSpeed: 9,
  },
  flail: {
    kind: 'flail', name: 'Flail', description: 'Hold to spin: constant damage all around the knight',
    sheet: 'knight-flail', style: 'spin', damage: 6, cooldown: 0.25, hitTime: 0, duration: 0.25,
    acquireRange: 1.6, range: 1.35, arc: 0, knockback: 1.6, moveFactor: 0.75, projectileSpeed: 0,
  },
};

export const WEAPON_ORDER: WeaponKind[] = ['sword', 'spear', 'hammer', 'axes', 'flail'];
export const STARTING_WEAPONS: WeaponKind[] = ['sword'];

// ---------------------------------------------------------------- ranks (decision 49)

/** Ranks bought in the shop per weapon; rank 0 is the base weapon. */
export const MAX_WEAPON_RANK = 3;
/** Damage bonus per rank (small, so Town 1 balance holds). */
export const RANK_DAMAGE = 0.08;

/** Each weapon's signature improvement per rank, on top of the damage bonus. */
export const WEAPON_RANK_PERK: Record<WeaponKind, { text: string; apply(d: WeaponDef): void }> = {
  sword: { text: 'wider sweep', apply: (d) => { d.arc += deg(8); } },
  spear: { text: 'longer thrust', apply: (d) => { d.range += 0.2; d.acquireRange += 0.2; } },
  hammer: { text: 'bigger slam', apply: (d) => { d.arc += 0.12; } },
  axes: { text: 'longer, faster throw', apply: (d) => { d.range += 0.35; d.acquireRange += 0.35; d.projectileSpeed += 0.6; } },
  flail: { text: 'wider spin', apply: (d) => { d.range += 0.1; d.acquireRange += 0.1; } },
};

/** The weapon at a rank (0 returns the base definition itself). */
export function rankedWeapon(kind: WeaponKind, rank: number): WeaponDef {
  const base = WEAPONS[kind];
  const r = Math.max(0, Math.min(MAX_WEAPON_RANK, Math.floor(rank)));
  if (r === 0) return base;
  const d: WeaponDef = { ...base, damage: base.damage * (1 + RANK_DAMAGE * r) };
  for (let k = 0; k < r; k++) WEAPON_RANK_PERK[kind].apply(d);
  return d;
}

export const RANK_NUMERALS = ['', 'I', 'II', 'III'];
