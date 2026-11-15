// Coin shop (decision 43): permanent card unlocks and weapon ranks, plus boosts that are consumed by
// the next run (save up coins, then push for a good run). Weapons and roles are never sold.

import { RANK_DAMAGE, WEAPON_ORDER, WEAPON_RANK_PERK, WEAPONS, type WeaponKind } from './weapons';

/** Boosts readied in the shop for the next run only; consumed when that run starts. */
export interface MetaBoosts {
  /** Multiplier on the knight's max HP. */
  knightHpMul: number;
  /** Extra planning points in every town. */
  planningPoints: number;
  /** Level-ups granted at the start of a run (choose cards immediately). */
  startLevels: number;
  /** Multiplier on building max HP. */
  buildingHpMul: number;
}

export function noBoosts(): MetaBoosts {
  return { knightHpMul: 1, planningPoints: 0, startLevels: 0, buildingHpMul: 1 };
}

export type ShopItem =
  | { id: string; kind: 'boost'; name: string; description: string; cost: number[]; apply(b: MetaBoosts): void }
  | { id: string; kind: 'card'; name: string; description: string; cost: number[]; card: string }
  | { id: string; kind: 'rank'; name: string; description: string; cost: number[]; weapon: WeaponKind };

/**
 * `cost[n]` is the price of the (n+1)-th stack; its length is the cap (per run for boosts).
 * Card unlocks are one-off; achievements unlock the same things for free. Weapon ranks (decision 49)
 * need the weapon itself, which, like roles, is earned through achievements only (decision 43, revised).
 */
/** Price of rank I, II, III (same for every weapon). */
export const RANK_COST = [150, 300, 500];

export const SHOP: ShopItem[] = [
  { id: 'boost-hp', kind: 'boost', name: 'Tempered Armour', description: '+10% knight max HP', cost: [100, 100, 100], apply: (b) => { b.knightHpMul += 0.1; } },
  { id: 'boost-walls', kind: 'boost', name: 'Stone Foundations', description: '+10% building HP', cost: [120, 120], apply: (b) => { b.buildingHpMul += 0.1; } },
  { id: 'boost-plan', kind: 'boost', name: 'Town Council', description: '+1 planning point next run', cost: [250], apply: (b) => { b.planningPoints += 1; } },
  { id: 'boost-start', kind: 'boost', name: 'Veteran Knight', description: 'Start next run with a level-up', cost: [180], apply: (b) => { b.startLevels += 1; } },
  // Card unlocks (the rest of the 20 cards; see STARTING_CARDS in upgrades.ts).
  { id: 'card-arc', kind: 'card', name: 'Card: Wide Sweep', description: 'Unlock the Wide Sweep upgrade', cost: [120], card: 'arc' },
  { id: 'card-reach', kind: 'card', name: 'Card: Long Reach', description: 'Unlock the Long Reach upgrade', cost: [120], card: 'reach' },
  { id: 'card-heavy', kind: 'card', name: 'Card: Heavy Blows', description: 'Unlock the Heavy Blows upgrade', cost: [100], card: 'heavy' },
  { id: 'card-dodge', kind: 'card', name: 'Card: Nimble', description: 'Unlock the Nimble upgrade', cost: [100], card: 'dodge' },
  { id: 'card-magnet', kind: 'card', name: 'Card: Gem Magnet', description: 'Unlock the Gem Magnet upgrade', cost: [80], card: 'magnet' },
  { id: 'card-regen', kind: 'card', name: 'Card: Second Wind', description: 'Unlock the Second Wind upgrade', cost: [150], card: 'regen' },
  { id: 'card-drill', kind: 'card', name: 'Card: Drilled Recruits', description: 'Unlock the Drilled Recruits upgrade', cost: [120], card: 'drill' },
  { id: 'card-arms', kind: 'card', name: 'Card: Better Arms', description: 'Unlock the Better Arms upgrade', cost: [150], card: 'arms' },
  { id: 'card-veterans', kind: 'card', name: 'Card: Veteran Volunteers', description: 'Unlock the Veteran Volunteers upgrade', cost: [250], card: 'veterans' },
  { id: 'card-thorns', kind: 'card', name: 'Card: Spiked Doors', description: 'Unlock the Spiked Doors upgrade', cost: [120], card: 'thorns' },
  { id: 'card-crews', kind: 'card', name: 'Card: Repair Crews', description: 'Unlock the Repair Crews upgrade', cost: [180], card: 'crews' },
  { id: 'card-braziers', kind: 'card', name: 'Card: Tar Pits', description: 'Unlock the Tar Pits upgrade', cost: [180], card: 'braziers' },
  // Weapon ranks I-III: small damage bonus plus the weapon's signature perk per rank.
  ...WEAPON_ORDER.map((w): ShopItem => ({
    id: `rank-${w}`, kind: 'rank', name: `${WEAPONS[w].name} ranks`, weapon: w, cost: RANK_COST,
    description: `Per rank: +${Math.round(RANK_DAMAGE * 100)}% damage, ${WEAPON_RANK_PERK[w].text}`,
  })),
];

export const SHOP_BY_ID: Record<string, ShopItem> = Object.fromEntries(SHOP.map((i) => [i.id, i]));
