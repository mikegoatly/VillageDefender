// How strongly upgrades and weapon ranks show on screen (pure; no three.js). Every cumulative
// visual reads its strength from fxTier, so one stack is a hint and the last adds a flourish.

import { UPGRADE_BY_ID } from '../data/upgrades';
import { MAX_WEAPON_RANK } from '../data/weapons';
import type { World } from '../sim/world';
import type { TownFort } from './buildings';

/** Strength 0..1 of an upgrade at `level` of `max`, and whether it is maxed (the capstone). */
export function fxTier(level: number, max: number): { t: number; capstone: boolean } {
  const l = Math.max(0, Math.min(max, level));
  return { t: max > 0 ? l / max : 0, capstone: max > 0 && l >= max };
}

/** a at t = 0 to b at t = 1. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** fxTier of an upgrade the player has picked in this run. */
export function upgradeTier(w: Pick<World, 'progression'>, id: string) {
  return fxTier(w.progression.levels[id] ?? 0, UPGRADE_BY_ID[id].max);
}

/** Weapon colour by shop rank: steel, pale cyan, cyan, gold. */
export const RANK_COLORS = [0xf6f2e6, 0xc4f1ff, 0x6fdcff, 0xffc93c];

/** Glow strength per shop rank, before Sharpened Blade adds to it. */
const RANK_GLOW = [0, 0.25, 0.5, 0.75];
/** Glow Sharpened Blade adds at full stacks. */
const BLADE_GLOW = 0.5;

export interface WeaponFx {
  /** Slash, glint and weapon glow colour. */
  color: number;
  /** Emissive strength of the weapon model, 0..1 in quarter steps (each step is its own batch). */
  glow: number;
  /** Top shop rank: embers and the like on top of the colour. */
  flourish: boolean;
  /** Same for equal looks (batch key part). */
  key: string;
}

/** Look of the knight's weapon at shop `rank` with Sharpened Blade at strength `blade` (fxTier t). */
export function weaponFx(rank: number, blade: number): WeaponFx {
  const r = Math.max(0, Math.min(MAX_WEAPON_RANK, Math.floor(rank)));
  const glow = Math.min(4, Math.round((RANK_GLOW[r] + BLADE_GLOW * blade) * 4)) / 4;
  return { color: RANK_COLORS[r], glow, flourish: r >= MAX_WEAPON_RANK, key: `${r}:${glow}` };
}

/** Weapon length per Long Reach stack and body size per Toughness stack. */
const GEAR = { reachScale: 0.08, toughScale: 0.03 };

/** How the knight himself is drawn: his weapon's look and size, and his build. */
export interface KnightGear {
  weapon: WeaponFx;
  /** Sharpened Blade strength (fxTier t). */
  blade: number;
  weaponScale: number;
  bodyScale: number;
  /** Same for equal looks (batch key part). */
  key: string;
}

/** A function that rebuilds its value only when `stamp` changes (asked for every frame, changes rarely). */
function memoLast<A extends unknown[], T>(stamp: (...a: A) => string, build: (...a: A) => T): (...a: A) => T {
  let last: { stamp: string; value: T } | null = null;
  return (...a) => {
    const s = stamp(...a);
    if (last?.stamp !== s) last = { stamp: s, value: build(...a) };
    return last.value;
  };
}

type Levels = Record<string, number>;
const lv = (w: Pick<World, 'progression'>, id: string) => w.progression.levels[id] ?? 0;

/** The knight's gear (rank, Sharpened Blade, Long Reach, Toughness). */
export const knightGear = memoLast(
  (w: Pick<World, 'progression' | 'weaponRank'>) => `${w.weaponRank}:${lv(w, 'blade')}:${lv(w, 'reach')}:${lv(w, 'tough')}`,
  (w): KnightGear => {
    const reach = lv(w, 'reach');
    const tough = lv(w, 'tough');
    const blade = fxTier(lv(w, 'blade'), UPGRADE_BY_ID.blade.max).t;
    const weapon = weaponFx(w.weaponRank, blade);
    return {
      weapon,
      blade,
      weaponScale: 1 + GEAR.reachScale * reach,
      bodyScale: 1 + GEAR.toughScale * tough,
      key: `${weapon.glow > 0 ? weapon.key : 0}:${reach}:${tough}`,
    };
  },
);

/** Upgrade ids behind each TownFort field. */
const FORT_IDS = { walls: 'walls', thorns: 'thorns', slits: 'slits', crews: 'crews', tar: 'braziers', recruit: 'recruit', garrison: 'garrison' } as const;

function fortOf(levels: Levels): TownFort {
  const f = Object.fromEntries(Object.entries(FORT_IDS).map(([k, id]) => [k, levels[id] ?? 0])) as Omit<TownFort, 'key'>;
  return { ...f, key: Object.values(f).join(':') };
}

/** A town with no upgrades. */
export const NO_FORT: TownFort = fortOf({});

/** The town and army upgrade stacks buildings show (one object per distinct fort, so it compares by identity). */
export const townFort = memoLast(
  (w: Pick<World, 'progression'>) => Object.values(FORT_IDS).map((id) => lv(w, id)).join(':'),
  (w) => fortOf(w.progression.levels),
);

/** Rookie size per Drilled Recruits stack and weapon glow per Better Arms stack (army blue). */
const ARMY = { drillScale: 0.05, armsGlow: 0.3, color: 0x7fb3e6 };

/** How rookies are drawn: bigger with Drilled Recruits, weapons lit with Better Arms. */
export interface ArmyGear {
  scale: number;
  glow: number;
  color: number;
}

/** The rookies' gear. */
export const armyGear = memoLast(
  (w: Pick<World, 'progression'>) => `${lv(w, 'drill')}:${lv(w, 'arms')}`,
  (w): ArmyGear => ({ scale: 1 + ARMY.drillScale * lv(w, 'drill'), glow: ARMY.armsGlow * lv(w, 'arms'), color: ARMY.color }),
);
