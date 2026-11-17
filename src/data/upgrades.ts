// In-run upgrades offered on level-up (plan §3.6). Pick 1 of 3; each stacks up to `max`.
// Effects are expressed as modifiers recomputed from upgrade levels, so they are easy to test
// and never drift. One-off effects (heals, repairs) use `onPick`.

export type UpgradePool = 'knight' | 'army' | 'town' | 'trap';

/** Powers whose cards are only offered once the power is unlocked (decision 52). */
export type PowerKind = 'trap';

export const POWER_NAMES: Record<PowerKind, string> = { trap: 'Trap power' };

export interface Mods {
  knight: {
    damageMul: number;
    cooldownMul: number;
    arcMul: number;
    rangeMul: number;
    speedMul: number;
    maxHpAdd: number;
    /** HP per second. */
    regen: number;
    magnetMul: number;
    knockbackMul: number;
    dodgeCooldownMul: number;
  };
  army: {
    /** Multiplier on kills needed for the next rookie. */
    thresholdMul: number;
    capAdd: number;
    hpMul: number;
    damageMul: number;
    /** Rank new rookies start at (0 rookie, 1 veteran, 2 captain). */
    startRank: number;
  };
  town: {
    maxHpMul: number;
    /** Damage dealt back to a monster each time it hits a building. */
    thorns: number;
    /** Arrow-slit level: every standing building shoots (0 = off). */
    arrowSlits: number;
    /** Fraction of max HP regenerated per second. */
    regenFrac: number;
    /** Movement slow for monsters next to buildings (0..1). */
    slow: number;
  };
  trap: {
    /** Multiplies the damage budget. */
    budgetMul: number;
    radiusMul: number;
    /** Extra traps allowed on the field at once. */
    capAdd: number;
    /** Multiplies the cooldown. */
    cooldownMul: number;
    /** Fraction of speed monsters lose inside a trap (0..1). */
    slow: number;
  };
}

export function baseMods(): Mods {
  return {
    knight: { damageMul: 1, cooldownMul: 1, arcMul: 1, rangeMul: 1, speedMul: 1, maxHpAdd: 0, regen: 0, magnetMul: 1, knockbackMul: 1, dodgeCooldownMul: 1 },
    army: { thresholdMul: 1, capAdd: 0, hpMul: 1, damageMul: 1, startRank: 0 },
    town: { maxHpMul: 1, thorns: 0, arrowSlits: 0, regenFrac: 0, slow: 0 },
    trap: { budgetMul: 1, radiusMul: 1, capAdd: 0, cooldownMul: 1, slow: 0 },
  };
}

/** What an upgrade can touch when picked (implemented by World). */
export interface UpgradeHost {
  healKnights(amount: number): void;
  repairBuildings(fraction: number): void;
}

export interface UpgradeDef {
  id: string;
  name: string;
  pool: UpgradePool;
  max: number;
  /** Only offered when this power is unlocked for the run. */
  power?: PowerKind;
  /** Text for the card when going from `level` to `level + 1`. */
  describe(level: number): string;
  /** Applies one stack. Called `level` times on fresh base mods. */
  apply(m: Mods): void;
  onPick?(host: UpgradeHost): void;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export const UPGRADES: UpgradeDef[] = [
  // ---- knight
  { id: 'blade', name: 'Sharpened Blade', pool: 'knight', max: 5, describe: () => `+${pct(0.2)} weapon damage`, apply: (m) => { m.knight.damageMul += 0.2; } },
  { id: 'swift', name: 'Swift Strikes', pool: 'knight', max: 5, describe: () => `Swing ${pct(0.1)} faster`, apply: (m) => { m.knight.cooldownMul *= 0.9; } },
  { id: 'arc', name: 'Wide Sweep', pool: 'knight', max: 3, describe: () => `+${pct(0.25)} swing arc`, apply: (m) => { m.knight.arcMul += 0.25; } },
  { id: 'reach', name: 'Long Reach', pool: 'knight', max: 3, describe: () => `+${pct(0.15)} weapon reach`, apply: (m) => { m.knight.rangeMul += 0.15; } },
  { id: 'boots', name: 'Fleet Foot', pool: 'knight', max: 3, describe: () => `+${pct(0.1)} move speed`, apply: (m) => { m.knight.speedMul += 0.1; } },
  { id: 'tough', name: 'Toughness', pool: 'knight', max: 5, describe: () => '+25 max HP and heal 25', apply: (m) => { m.knight.maxHpAdd += 25; } }, // raising max HP also adds the 25 to current HP (World.applyMods)
  { id: 'regen', name: 'Second Wind', pool: 'knight', max: 3, describe: () => 'Regenerate 1 HP per second', apply: (m) => { m.knight.regen += 1; } },
  { id: 'magnet', name: 'Gem Magnet', pool: 'knight', max: 3, describe: () => `+${pct(0.5)} gem pickup range`, apply: (m) => { m.knight.magnetMul += 0.5; } },
  { id: 'heavy', name: 'Heavy Blows', pool: 'knight', max: 3, describe: () => `+${pct(0.5)} knockback`, apply: (m) => { m.knight.knockbackMul += 0.5; } },
  { id: 'dodge', name: 'Nimble', pool: 'knight', max: 3, describe: () => `Dodge recharges ${pct(0.25)} faster`, apply: (m) => { m.knight.dodgeCooldownMul *= 0.75; } },
  // ---- army
  { id: 'recruit', name: 'Recruitment Drive', pool: 'army', max: 3, describe: () => `Rookies join after ${pct(0.2)} fewer kills`, apply: (m) => { m.army.thresholdMul *= 0.8; } },
  { id: 'garrison', name: 'Bigger Garrison', pool: 'army', max: 3, describe: () => '+1 rookie at a time', apply: (m) => { m.army.capAdd += 1; } },
  { id: 'drill', name: 'Drilled Recruits', pool: 'army', max: 3, describe: () => `Rookies have +${pct(0.3)} HP`, apply: (m) => { m.army.hpMul += 0.3; } },
  { id: 'arms', name: 'Better Arms', pool: 'army', max: 3, describe: () => `Rookies deal +${pct(0.3)} damage`, apply: (m) => { m.army.damageMul += 0.3; } },
  { id: 'veterans', name: 'Veteran Volunteers', pool: 'army', max: 2, describe: (l) => (l === 0 ? 'New rookies join as veterans' : 'New rookies join as captains'), apply: (m) => { m.army.startRank += 1; } },
  // ---- town
  { id: 'walls', name: 'Reinforced Walls', pool: 'town', max: 3, describe: () => `Buildings +${pct(0.25)} max HP and repair 25%`, apply: (m) => { m.town.maxHpMul += 0.25; }, onPick: (h) => h.repairBuildings(0.25) },
  { id: 'thorns', name: 'Spiked Doors', pool: 'town', max: 3, describe: () => 'Monsters take 4 damage when they hit a building', apply: (m) => { m.town.thorns += 4; } },
  { id: 'slits', name: 'Arrow Slits', pool: 'town', max: 3, describe: (l) => (l === 0 ? 'Buildings shoot arrows at nearby monsters' : 'Buildings shoot faster'), apply: (m) => { m.town.arrowSlits += 1; } },
  { id: 'crews', name: 'Repair Crews', pool: 'town', max: 3, describe: () => 'Buildings slowly repair (0.4% per second)', apply: (m) => { m.town.regenFrac += 0.004; } },
  { id: 'braziers', name: 'Tar Pits', pool: 'town', max: 2, describe: () => `Monsters next to buildings move ${pct(0.25)} slower`, apply: (m) => { m.town.slow += 0.25; } },
  // ---- trap (only offered with the trap power, decision 52)
  { id: 'trapdmg', name: 'Heavy Jaws', pool: 'trap', power: 'trap', max: 3, describe: () => `Traps last ${pct(0.4)} longer (more damage before they break)`, apply: (m) => { m.trap.budgetMul += 0.4; } },
  { id: 'traprad', name: 'Wide Snare', pool: 'trap', power: 'trap', max: 3, describe: () => `Traps cover ${pct(0.25)} more ground`, apply: (m) => { m.trap.radiusMul += 0.25; } },
  { id: 'trapcap', name: 'Trap Line', pool: 'trap', power: 'trap', max: 3, describe: () => 'Keep one more trap out at a time', apply: (m) => { m.trap.capAdd += 1; } },
  { id: 'trapquick', name: 'Quick Hands', pool: 'trap', power: 'trap', max: 3, describe: () => `Set traps ${pct(0.25)} more often`, apply: (m) => { m.trap.cooldownMul *= 0.75; } },
  { id: 'trapslow', name: 'Tangle Snare', pool: 'trap', power: 'trap', max: 2, describe: () => `Monsters in a trap move ${pct(0.3)} slower`, apply: (m) => { m.trap.slow += 0.3; } },
];

export const UPGRADE_BY_ID: Record<string, UpgradeDef> = Object.fromEntries(UPGRADES.map((u) => [u.id, u]));

/** Cards a new profile can be offered (decision 44); the other 12 unlock via the shop or achievements. */
export const STARTING_CARDS: string[] = ['blade', 'swift', 'tough', 'boots', 'recruit', 'garrison', 'walls', 'slits'];

/** Modifiers for a set of upgrade levels. */
export function computeMods(levels: Record<string, number>): Mods {
  const m = baseMods();
  for (const u of UPGRADES) for (let k = 0; k < (levels[u.id] ?? 0); k++) u.apply(m);
  return m;
}

/** A card offered to the player. */
export interface UpgradeOffer {
  id: string;
  name: string;
  description: string;
  pool: UpgradePool;
  /** Current level before picking. */
  level: number;
  max: number;
}
