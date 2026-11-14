// Role buildings (decision 29): before a town starts, the player spends planning points to turn
// chosen houses into role buildings. A role works while its building stands.

export type RoleKind = 'barracks' | 'chapel' | 'smithy' | 'watchtower';

export interface RoleDef {
  kind: RoleKind;
  name: string;
  /** One-line effect for the planning menu. */
  description: string;
  /** Planning points it costs. */
  cost: number;
  /** Aura radius in cells (chapel, smithy) or shooting range (watchtower); 0 = none. */
  radius: number;
  /** Roof tile drawn on every cell of the building (Sketch Town). */
  roof: string;
  /** Glyph shown above the roof. */
  icon: string;
}

export const ROLES: Record<RoleKind, RoleDef> = {
  barracks: {
    kind: 'barracks', name: 'Barracks', description: '+1 rookie at a time; rookies step out here',
    cost: 1, radius: 0, roof: 'roof_gablePurple', icon: '⛨',
  },
  chapel: {
    kind: 'chapel', name: 'Chapel', description: 'Heals the knight and rookies nearby',
    cost: 1, radius: 3, roof: 'roof_churchBrown', icon: '✚',
  },
  smithy: {
    kind: 'smithy', name: 'Smithy', description: '+25% damage for the knight and rookies nearby',
    cost: 1, radius: 3, roof: 'roof_slantBrown', icon: '⚒',
  },
  watchtower: {
    kind: 'watchtower', name: 'Watchtower', description: 'Shoots arrows at monsters; waves are announced 2 s earlier',
    cost: 1, radius: 4, roof: 'roof_pointPurple', icon: '➶',
  },
};

export const ROLE_ORDER: RoleKind[] = ['barracks', 'chapel', 'smithy', 'watchtower'];

/** Roles every new profile starts with (decision 35: others are unlocked by achievements). */
export const STARTING_ROLES: RoleKind[] = ['barracks', 'chapel'];

export const ROLE_EFFECTS = {
  chapelHealPerSecond: 3,
  smithyDamageMul: 1.25,
  watchtower: { interval: 2, damage: 8, speed: 10 },
  watchtowerExtraWarning: 2,
};
