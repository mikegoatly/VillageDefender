// Which Kenney model, attachments, tint and animation clips each unit uses.
// All Mini characters share one rig and one set of clip names.

import { MONSTERS, type MonsterKind } from '../data/monsters';
import { ROOKIES, type RookieKind } from '../data/rookies';
import { WEAPONS, type WeaponKind } from '../data/weapons';
import { Ground, inBounds, type TownMap } from '../sim/map';
import type { ArmyGear, KnightGear } from './upgradeFx';
import type { Unit } from '../sim/world';

export const CHARACTER_MODELS: Record<string, string> = {
  knight: 'mini-dungeon/character-human',
  orc: 'mini-dungeon/character-orc',
  zombie: 'graveyard/character-zombie',
  skeleton: 'graveyard/character-skeleton',
  ghost: 'graveyard/character-ghost',
  vampire: 'graveyard/character-vampire',
  swordsman: 'mini-arena/character-soldier',
  archer: 'mini-forest/character-archer',
  // Unranked rookies are the same scowling recruit; promotion swaps in the kitted-out model.
  recruitSwordsman: 'mini-characters/character-male-f',
  recruitArcher: 'mini-characters/character-male-f',
  necromancer: 'graveyard/character-vampire',
  skeletonArcher: 'graveyard/character-skeleton',
  sapper: 'mini-characters/character-male-a',
  boneKnight: 'graveyard/character-skeleton',
  banshee: 'graveyard/character-ghost',
  gravedigger: 'graveyard/character-keeper',
  gravekeeper: 'graveyard/character-keeper',
};

export interface Attachment {
  bone: string;
  model: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale?: number;
  /** Emissive light on the model (the knight's weapon by rank and Sharpened Blade). */
  glow?: { color: number; amount: number };
}

// Same offsets as tools/bake/specs.mjs (the bind pose is a T-pose).
type Hand = Omit<Attachment, 'model'>;
const RIGHT: Hand = { bone: 'arm-right', position: [-0.27, 0, 0.02], rotation: [Math.PI / 2, 0, 0] };
const LEFT: Hand = { bone: 'arm-left', position: [0.24, 0, 0], rotation: [0, Math.PI / 2, 0] };
const SHIELD: Attachment = { ...LEFT, model: 'mini-dungeon/shield-round', scale: 0.8 };
/** The bow model's origin is its bottom tip (it spans y 0–0.48): drop it by half so the hand holds the grip. */
const BOW: Attachment = { ...LEFT, position: [0.24, -0.24, 0], model: 'mini-forest/weapon-bow' };

export const KNIGHT_WEAPONS: Record<WeaponKind, Attachment[]> = {
  sword: [{ ...RIGHT, model: 'mini-dungeon/weapon-sword' }, SHIELD],
  spear: [{ ...RIGHT, model: 'mini-dungeon/weapon-spear' }, SHIELD],
  hammer: [{ ...RIGHT, model: 'medieval-weapons/hammer-a', scale: 0.15 }],
  axes: [{ ...RIGHT, model: 'medieval-weapons/axe-single', scale: 0.14 }, SHIELD],
  flail: [{ ...RIGHT, model: 'medieval-weapons/club-a', scale: 0.13 }, SHIELD],
};

const ATTACHMENTS: Record<string, Attachment[]> = {
  orc: [{ ...RIGHT, model: 'mini-dungeon/weapon-spear' }],
  swordsman: [{ ...RIGHT, model: 'mini-arena/weapon-sword' }, { ...SHIELD, scale: 0.6 }],
  archer: [BOW],
  recruitSwordsman: [{ ...RIGHT, model: 'medieval-weapons/club-a', scale: 0.13 }],
  recruitArcher: [BOW],
  skeletonArcher: [BOW],
  sapper: [{ ...RIGHT, model: 'mini-dungeon/barrel', scale: 0.45 }],
  necromancer: [{ ...RIGHT, model: 'mini-dungeon/weapon-spear' }],
  boneKnight: [{ ...RIGHT, model: 'mini-dungeon/weapon-sword' }, { ...SHIELD, model: 'mini-dungeon/shield-rectangle', scale: 0.9 }],
  gravedigger: [{ ...RIGHT, model: 'mini-dungeon/weapon-spear' }],
};

/** Every character and attachment model, for preloading. */
export function characterModelPaths(): string[] {
  const attached = [...Object.values(KNIGHT_WEAPONS), ...Object.values(ATTACHMENTS)].flat().map((a) => a.model);
  return [...new Set([...Object.values(CHARACTER_MODELS), ...attached])];
}

/** Sheets that shoot (play the bow clip instead of a melee swing). */
const BOW_SHEETS = new Set(['archer', 'recruitArcher', 'skeletonArcher']);

export type AnimName = 'idle' | 'walk' | 'sprint' | 'attack' | 'die';

/** Clip in the model's GLB for each animation the game plays (`attack` overrides the attack clip). */
export function clipNames(sheet: string, attack?: string): Record<AnimName, string> {
  return {
    idle: 'idle', walk: 'walk', sprint: 'sprint', die: 'die',
    attack: attack ?? (BOW_SHEETS.has(sheet) ? 'holding-both-shoot' : 'attack-melee-right'),
  };
}

/** A weapon that stabs rather than swings: the arm-forward clip and how far the body lunges. */
interface Thrust { clip: string; lunge: number; hitTime: number; duration: number }

/** Spear: the rig has no thrust clip, so the one-hand shot (arm straight out) plus a lunge. */
const KNIGHT_THRUSTS: Partial<Record<WeaponKind, Omit<Thrust, 'hitTime' | 'duration'>>> = {
  spear: { clip: 'holding-right-shoot', lunge: 0.28 },
};

/** Whether the knight stabs with this weapon (thrust effect instead of a slash). */
export function isThrust(weapon: WeaponKind): boolean {
  return weapon in KNIGHT_THRUSTS;
}

/**
 * How far forward a thrusting unit is drawn `t` seconds into its attack: it drives out to the full
 * lunge by the hit (eased out), holds a moment, then eases back by the end of the attack.
 */
export function lungeOffset(thrust: Pick<Thrust, 'lunge' | 'hitTime' | 'duration'>, t: number): number {
  const { lunge, hitTime, duration } = thrust;
  if (t <= 0 || t >= duration) return 0;
  if (t < hitTime) {
    const k = t / hitTime;
    return lunge * (1 - (1 - k) * (1 - k));
  }
  const hold = hitTime + (duration - hitTime) * 0.3;
  if (t < hold) return lunge;
  const k = (t - hold) / (duration - hold);
  return lunge * (1 - k * k * (3 - 2 * k));
}

/** Death and attacks play once and hold their last pose; the rest loop. */
export function animLoops(anim: AnimName): boolean {
  return anim !== 'die' && anim !== 'attack';
}

export function animFor(u: Pick<Unit, 'state' | 'moving'>): AnimName {
  if (u.state === 'dead') return 'die';
  if (u.state === 'attack') return 'attack';
  if (u.state === 'dodge') return 'sprint';
  return u.moving ? 'walk' : 'idle';
}

/**
 * River wading (imps, River Troll): standing in water sinks a wader by `depth` × its model scale,
 * at most `max`; UnitBatches eases towards it at `rate` per second so units dip in rather than pop.
 */
export const WADE = { depth: 0.3, max: 0.75, rate: 6 };

/** How far a unit should be sunk into the river where it stands (0 on land, and for non-waders). */
export function wadeDepth(map: TownMap, u: Pick<Unit, 'kind' | 'team' | 'x' | 'y'>, scale: number): number {
  if (u.team !== 'enemy' || !MONSTERS[u.kind as MonsterKind].wades) return 0;
  const i = Math.round(u.x);
  const j = Math.round(u.y);
  if (!inBounds(map, i, j) || map.ground[j * map.size + i] !== Ground.Water) return 0;
  return Math.min(WADE.max, WADE.depth * scale);
}

/** How far a burrowed gravedigger is sunk into the ground (only its head shows). */
const BURROW_SINK = 0.7;

/** How far a corpse sinks, starting after its death animation (0.7 s) and taking 0.5 s. */
export const CORPSE_SINK = { after: 0.7, time: 0.5, depth: 0.9 };

/**
 * Per-frame effects for a unit: hit flash (towards white), opacity and how far it has sunk.
 * Ghosts flicker (decision 48); hurt friendlies blink; corpses sink into the ground (instances
 * cannot fade unless their material is transparent, and only ghosts' is).
 */
export function unitFx(u: Pick<Unit, 'id' | 'team' | 'kind' | 'state' | 'stateTime' | 'invuln' | 'burrowed' | 'abilityIn'>, flashing: boolean, clock: number) {
  let flash = flashing ? 1 : 0;
  let alpha = 1;
  let sink = u.burrowed ? BURROW_SINK : 0;
  if (u.team === 'enemy' && MONSTERS[u.kind as MonsterKind].phasing) {
    alpha = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(clock * 2.2 + u.id * 1.7));
  }
  if (u.state === 'dead') sink = Math.min(1, Math.max(0, u.stateTime - CORPSE_SINK.after) / CORPSE_SINK.time) * CORPSE_SINK.depth;
  else if (u.invuln > 0 && u.team === 'player' && u.state !== 'dodge' && !flashing) flash = Math.sin(clock * 30) > 0 ? 0.35 : 0;
  else if (!flashing && u.team === 'enemy' && MONSTERS[u.kind as MonsterKind].explodes) flash = -sapperPulse(u.abilityIn, clock, u.id);
  return { flash, alpha, sink };
}

/** Red pulse strength (0..1) of a sapper's keg: slow and faint on approach, fast and strong once the fuse is lit. */
export function sapperPulse(fuseLeft: number, clock: number, id: number): number {
  const lit = fuseLeft > 0;
  const rate = lit ? 18 : 5;
  const peak = lit ? 0.7 : 0.3;
  return peak * (0.5 + 0.5 * Math.sin(clock * rate + id * 1.3));
}

/** How one unit is drawn. Units with the same `key` share an instanced batch. */
export interface UnitLook {
  key: string;
  sheet: string;
  attachments: Attachment[];
  /** Multiply colour (monster archetype tint). */
  tint: number;
  alpha: number;
  /** Colour drained towards grey, 0..1 (MonsterDef.pallor). */
  pallor: number;
  /** Colour pushed towards gold, 0..1 (captains). */
  gild?: number;
  /** Size relative to a normal character. */
  scale: number;
  /** Stabbing attack (the knight's spear): its clip and lunge. */
  thrust?: Thrust;
}

export function lookFor(u: Unit, weapon: WeaponKind, gear?: KnightGear, army?: ArmyGear): UnitLook {
  if (u.team === 'enemy') {
    const def = MONSTERS[u.kind as MonsterKind];
    const pallor = def.pallor ?? 0;
    return { key: `${def.sheet}:${def.alpha}:${pallor}`, sheet: def.sheet, attachments: ATTACHMENTS[def.sheet] ?? [], tint: def.tint, alpha: def.alpha, pallor, scale: def.scale };
  }
  if (u.kind === 'knight') return knightLook(weapon, gear);
  return rookieLook(u.kind as RookieKind, u.rank, army);
}

const rookieLooks = new Map<string, UnitLook>();

/**
 * Rank 0 is an unarmoured recruit, veterans get the full kit and captains are gilded; promotions
 * and Drilled Recruits make them bigger, and Better Arms lights their weapons (cached per look).
 */
function rookieLook(kind: RookieKind, rank: number, army: ArmyGear | undefined): UnitLook {
  const sheet = rank === 0 ? RECRUIT_SHEETS[kind] : ROOKIES[kind].sheet;
  const gild = rank >= 2 ? CAPTAIN_GILD : 0;
  const glow = army?.glow ?? 0;
  const key = `${sheet}:${gild}:${glow}`;
  const scale = (1 + 0.06 * rank) * (army?.scale ?? 1);
  // Scale is per instance, so looks that differ only in scale share a batch (same key).
  const cacheKey = `${key}:${scale}`;
  let look = rookieLooks.get(cacheKey);
  if (!look) {
    const [held, ...rest] = ATTACHMENTS[sheet] ?? [];
    const attachments = held && glow > 0 ? [{ ...held, glow: { color: army!.color, amount: glow } }, ...rest] : (ATTACHMENTS[sheet] ?? []);
    rookieLooks.set(cacheKey, (look = { key, sheet, attachments, tint: 0xffffff, alpha: 1, pallor: 0, gild, scale }));
  }
  return look;
}

const knightLooks = new Map<string, UnitLook>();

/** The knight's look per weapon and gear (cached: it is asked for every frame). */
function knightLook(weapon: WeaponKind, gear: KnightGear | undefined): UnitLook {
  const key = `knight:${weapon}:${gear?.key ?? 0}`;
  let look = knightLooks.get(key);
  if (!look) {
    const [held, ...rest] = KNIGHT_WEAPONS[weapon];
    const wfx = gear?.weapon;
    const scale = (held.scale ?? 1) * (gear?.weaponScale ?? 1);
    const attachments = [{ ...held, scale, glow: wfx && wfx.glow > 0 ? { color: wfx.color, amount: wfx.glow } : undefined }, ...rest];
    const t = KNIGHT_THRUSTS[weapon];
    const thrust = t && { ...t, hitTime: WEAPONS[weapon].hitTime, duration: WEAPONS[weapon].duration };
    knightLooks.set(key, (look = { key, sheet: 'knight', attachments, tint: 0xffffff, alpha: 1, pallor: 0, scale: gear?.bodyScale ?? 1, thrust }));
  }
  return look;
}

const echoLooks = new Map<string, UnitLook>();

/** A see-through copy of a look (dash afterimages); each instance's opacity multiplies `alpha`. */
export function echoLook(look: UnitLook, alpha: number): UnitLook {
  const key = `${look.key}:echo${alpha}`;
  let echo = echoLooks.get(key);
  if (!echo) echoLooks.set(key, (echo = { ...look, key, alpha }));
  return echo;
}

/** Sheet an unranked rookie of each class is drawn with. */
const RECRUIT_SHEETS: Record<RookieKind, string> = { swordsman: 'recruitSwordsman', archer: 'recruitArcher' };

/** How far a captain's colours are pushed to gold, 0..1 (see withUnitFx). */
export const CAPTAIN_GILD = 0.8;
