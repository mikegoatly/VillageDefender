// Which Kenney model, attachments, tint and animation clips each unit uses.
// All Mini characters share one rig and one set of clip names.

import { MONSTERS, type MonsterKind } from '../data/monsters';
import { ROOKIES, type RookieKind } from '../data/rookies';
import type { WeaponKind } from '../data/weapons';
import { Ground, inBounds, type TownMap } from '../sim/map';
import type { ArmyGear, KnightGear } from './upgradeFx';
import type { BodyPiece } from './bodies/kit';
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
  sapper: 'mini-dungeon/character-orc',
  boneKnight: 'graveyard/character-skeleton',
  banshee: 'graveyard/character-ghost',
  gravedigger: 'graveyard/character-keeper',
  gravekeeper: 'graveyard/character-keeper',
  kobold: 'mini-dungeon/character-orc',
  shieldbearer: 'mini-dungeon/character-orc',
  frostShaman: 'graveyard/character-vampire',
  iceGolem: 'graveyard/character-zombie',
  iceShard: 'graveyard/character-zombie',
  iceling: 'graveyard/character-zombie',
  // Bosses: designed bodies (render3d/bodies/bosses.ts) on the rig whose clips suit them.
  warlord: 'mini-dungeon/character-orc',
  troll: 'graveyard/character-zombie',
  frostGiant: 'mini-dungeon/character-orc',
  // Lanternwick's night monsters float, so they ride the ghost's rig (no legs; the moth's wings on its arms).
  shade: 'graveyard/character-ghost',
  gloomMoth: 'graveyard/character-ghost',
  wisp: 'graveyard/character-ghost',
  // Town looks (data/towns.ts): bodies from render3d/bodies/, on the rig whose clips suit them.
  drowned: 'graveyard/character-zombie',
  frogfolk: 'mini-dungeon/character-orc',
  ghoul: 'mini-dungeon/character-orc',
  frostThrall: 'graveyard/character-zombie',
  yeti: 'mini-dungeon/character-orc',
  scarecrow: 'graveyard/character-zombie',
  werewolf: 'mini-dungeon/character-orc',
  // The villager who sets traps is the same recruit model, unarmed.
  villager: 'mini-characters/character-male-f',
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
  recruitSwordsman: [{ ...RIGHT, model: 'mini-dungeon/weapon-sword' }],
  recruitArcher: [BOW],
  skeletonArcher: [BOW],
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

export type AnimName = 'idle' | 'walk' | 'sprint' | 'attack' | 'die' | 'work';

/**
 * Clip for each animation the game plays: the model's own, or one built in code (clips.ts).
 * `attack` overrides the attack clip.
 */
export function clipNames(sheet: string, attack?: string): Record<Exclude<AnimName, 'work'>, string> & { work?: string } {
  return {
    idle: 'idle', walk: 'walk', sprint: 'sprint', die: 'die',
    attack: attack ?? (BOW_SHEETS.has(sheet) ? 'holding-both-shoot' : 'attack-melee-right'),
    // Only the trap villager works (building), so no other sheet bakes the clip.
    ...(sheet === 'villager' ? { work: 'interact-right' } : {}),
  };
}

/** Knight weapons that stab rather than swing, and the attack clip they play. */
const KNIGHT_THRUSTS: Partial<Record<WeaponKind, string>> = { spear: 'thrust' };

/** Whether the knight stabs with this weapon (thrust effect instead of a slash). */
export function isThrust(weapon: WeaponKind): boolean {
  return weapon in KNIGHT_THRUSTS;
}

/** Death and attacks play once and hold their last pose; the rest loop. */
export function animLoops(anim: AnimName): boolean {
  return anim !== 'die' && anim !== 'attack';
}

export function animFor(u: Pick<Unit, 'state' | 'moving'> & { working?: boolean }): AnimName {
  if (u.state === 'dead') return 'die';
  if (u.working) return 'work';
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
  // Translucent phasers (ghosts, banshees) flicker; solid fliers that phase over things (moths, wisps) don't.
  const def = u.team === 'enemy' ? MONSTERS[u.kind as MonsterKind] : undefined;
  if (def?.phasing && def.alpha < 1) {
    alpha = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(clock * 2.2 + u.id * 1.7));
  }
  if (u.state === 'dead') sink = Math.min(1, Math.max(0, u.stateTime - CORPSE_SINK.after) / CORPSE_SINK.time) * CORPSE_SINK.depth;
  else if (u.invuln > 0 && u.team === 'player' && u.state !== 'dodge' && !flashing) flash = Math.sin(clock * 30) > 0 ? 0.35 : 0;
  else if (!flashing && def?.explodes) flash = -sapperPulse(u.abilityIn, clock, u.id);
  return { flash, alpha, sink };
}

/** A shade at full dark is unseen; while it strikes, a faint shimmer of it shows (peak opacity). */
export const SHADE_SHIMMER = 0.22;

/**
 * Opacity factor for a monster drawn unseen in the dark (MonsterDef.shade): fades out with its
 * darkness (0 in light, 1 out of it), every piece and glow with it, except for a brief shimmer while
 * it attacks (rising and falling over the swing).
 */
export function shadeAlpha(dark: number, state: Unit['state'], stateTime: number): number {
  const seen = 1 - Math.min(1, Math.max(0, dark));
  if (state !== 'attack') return seen;
  const shimmer = SHADE_SHIMMER * Math.sin(Math.min(1, stateTime / 0.6) * Math.PI);
  return Math.max(seen, shimmer);
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
  /** Attack clip in place of the sheet's usual one (the knight's spear thrust). */
  attackClip?: string;
  /** Body-kit pieces hung on the rig beside its own meshes (the knight's night lantern). */
  pieces?: readonly BodyPiece[];
  /** Unseen out of the light (shades): fades out with its darkness (shadeAlpha) and casts no shadow. */
  unseen?: boolean;
}

/**
 * Night towns: a small iron lantern on the knight's left hip with a glowing pane, so his light
 * visibly comes from him (model space at the rest pose; the rig's left is +x, front +z).
 */
export const KNIGHT_LANTERN: BodyPiece[] = [
  { bone: 'torso', shape: 'cylinder', size: [0.016, 0.05, 0.016], at: [0.08, 0.25, 0.125], color: 0x3b3e4a, sides: 4 },
  { bone: 'torso', shape: 'cone', size: [0.1, 0.04, 0.1], at: [0.08, 0.215, 0.125], color: 0x464650, sides: 4, rot: [0, Math.PI / 4, 0] },
  { bone: 'torso', shape: 'box', size: [0.078, 0.016, 0.078], at: [0.08, 0.193, 0.125], color: 0x353539 },
  { bone: 'torso', shape: 'box', size: [0.062, 0.08, 0.062], at: [0.08, 0.145, 0.125], color: 0xffe08a, glow: true },
  { bone: 'torso', shape: 'box', size: [0.084, 0.018, 0.084], at: [0.08, 0.098, 0.125], color: 0x353539 },
];

/** The trap villager: a recruit without a weapon. */
export const VILLAGER_LOOK: UnitLook = { key: 'villager', sheet: 'villager', attachments: [], tint: 0xffffff, alpha: 1, pallor: 0, scale: 1 };

/** `townLooks`: the town's per-kind body swaps (TownDef.looks); a swapped-in body brings its own colours, so no tint or pallor. */
export function lookFor(
  u: Unit, weapon: WeaponKind, gear?: KnightGear, army?: ArmyGear, townLooks?: Partial<Record<string, string>>, lantern = false,
): UnitLook {
  if (u.team === 'enemy') {
    const def = MONSTERS[u.kind as MonsterKind];
    const swap = townLooks?.[u.kind];
    const sheet = swap ?? def.sheet;
    const tint = swap ? 0xffffff : def.tint;
    const pallor = swap ? 0 : def.pallor ?? 0;
    return {
      key: `${sheet}:${def.alpha}:${pallor}`, sheet, attachments: ATTACHMENTS[sheet] ?? [], tint, alpha: def.alpha, pallor, scale: def.scale,
      unseen: !!def.shade,
    };
  }
  if (u.kind === 'knight') return knightLook(weapon, gear, lantern);
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

/** The knight's look per weapon and gear, with a lantern at night (cached: it is asked for every frame). */
function knightLook(weapon: WeaponKind, gear: KnightGear | undefined, lantern: boolean): UnitLook {
  const key = `knight:${weapon}:${gear?.key ?? 0}${lantern ? ':lantern' : ''}`;
  let look = knightLooks.get(key);
  if (!look) {
    const [held, ...rest] = KNIGHT_WEAPONS[weapon];
    const wfx = gear?.weapon;
    const scale = (held.scale ?? 1) * (gear?.weaponScale ?? 1);
    const attachments = [{ ...held, scale, glow: wfx && wfx.glow > 0 ? { color: wfx.color, amount: wfx.glow } : undefined }, ...rest];
    const attackClip = KNIGHT_THRUSTS[weapon];
    knightLooks.set(key, (look = {
      key, sheet: 'knight', attachments, tint: 0xffffff, alpha: 1, pallor: 0, scale: gear?.bodyScale ?? 1, attackClip,
      pieces: lantern ? KNIGHT_LANTERN : undefined,
    }));
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
