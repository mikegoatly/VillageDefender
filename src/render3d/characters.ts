// Which Kenney model, attachments, tint and animation clips each unit uses.
// All Mini characters share one rig and one set of clip names.

import { MONSTERS, type MonsterKind } from '../data/monsters';
import { ROOKIES, type RookieKind } from '../data/rookies';
import type { WeaponKind } from '../data/weapons';
import { Ground, inBounds, type TownMap } from '../sim/map';
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

export type AnimName = 'idle' | 'walk' | 'sprint' | 'attack' | 'die';

/** Clip in the model's GLB for each animation the game plays. */
export function clipNames(sheet: string): Record<AnimName, string> {
  return {
    idle: 'idle', walk: 'walk', sprint: 'sprint', die: 'die',
    attack: sheet === 'archer' || sheet === 'skeletonArcher' ? 'holding-both-shoot' : 'attack-melee-right',
  };
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
export function unitFx(u: Pick<Unit, 'id' | 'team' | 'kind' | 'state' | 'stateTime' | 'invuln' | 'burrowed'>, flashing: boolean, clock: number) {
  let flash = flashing ? 1 : 0;
  let alpha = 1;
  let sink = u.burrowed ? BURROW_SINK : 0;
  if (u.team === 'enemy' && MONSTERS[u.kind as MonsterKind].phasing) {
    alpha = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(clock * 2.2 + u.id * 1.7));
  }
  if (u.state === 'dead') sink = Math.min(1, Math.max(0, u.stateTime - CORPSE_SINK.after) / CORPSE_SINK.time) * CORPSE_SINK.depth;
  else if (u.invuln > 0 && u.team === 'player' && u.state !== 'dodge' && !flashing) flash = Math.sin(clock * 30) > 0 ? 0.35 : 0;
  return { flash, alpha, sink };
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
  /** Size relative to a normal character. */
  scale: number;
}

export function lookFor(u: Unit, weapon: WeaponKind): UnitLook {
  if (u.team === 'enemy') {
    const def = MONSTERS[u.kind as MonsterKind];
    const pallor = def.pallor ?? 0;
    return { key: `${def.sheet}:${def.alpha}:${pallor}`, sheet: def.sheet, attachments: ATTACHMENTS[def.sheet] ?? [], tint: def.tint, alpha: def.alpha, pallor, scale: def.scale };
  }
  if (u.kind === 'knight') {
    return { key: `knight:${weapon}`, sheet: 'knight', attachments: KNIGHT_WEAPONS[weapon], tint: 0xffffff, alpha: 1, pallor: 0, scale: 1 };
  }
  const sheet = ROOKIES[u.kind as RookieKind].sheet;
  // Promotions: slightly bigger body (same as the sprite renderer).
  return { key: sheet, sheet, attachments: ATTACHMENTS[sheet] ?? [], tint: 0xffffff, alpha: 1, pallor: 0, scale: 1 + 0.06 * u.rank };
}
