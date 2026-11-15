// Which Kenney model, attachments, tint and animation clips each unit uses.
// All Mini characters share one rig and one set of clip names.

import { MONSTERS, type MonsterKind } from '../data/monsters';
import { ROOKIES, type RookieKind } from '../data/rookies';
import type { WeaponKind } from '../data/weapons';
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
  archer: [{ ...LEFT, model: 'mini-forest/weapon-bow' }],
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
    attack: sheet === 'archer' ? 'holding-both-shoot' : 'attack-melee-right',
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

/** How far a corpse sinks, starting after its death animation (0.7 s) and taking 0.5 s. */
export const CORPSE_SINK = { after: 0.7, time: 0.5, depth: 0.9 };

/**
 * Per-frame effects for a unit: hit flash (towards white), opacity and how far it has sunk.
 * Ghosts flicker (decision 48); hurt friendlies blink; corpses sink into the ground (instances
 * cannot fade unless their material is transparent, and only ghosts' is).
 */
export function unitFx(u: Pick<Unit, 'id' | 'team' | 'kind' | 'state' | 'stateTime' | 'invuln'>, flashing: boolean, clock: number) {
  let flash = flashing ? 1 : 0;
  let alpha = 1;
  let sink = 0;
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
  /** Size relative to a normal character. */
  scale: number;
}

export function lookFor(u: Unit, weapon: WeaponKind): UnitLook {
  if (u.team === 'enemy') {
    const def = MONSTERS[u.kind as MonsterKind];
    return { key: `${def.sheet}:${def.alpha}`, sheet: def.sheet, attachments: ATTACHMENTS[def.sheet] ?? [], tint: def.tint, alpha: def.alpha, scale: def.scale };
  }
  if (u.kind === 'knight') {
    return { key: `knight:${weapon}`, sheet: 'knight', attachments: KNIGHT_WEAPONS[weapon], tint: 0xffffff, alpha: 1, scale: 1 };
  }
  const sheet = ROOKIES[u.kind as RookieKind].sheet;
  // Promotions: slightly bigger body (same as the sprite renderer).
  return { key: sheet, sheet, attachments: ATTACHMENTS[sheet] ?? [], tint: 0xffffff, alpha: 1, scale: 1 + 0.06 * u.rank };
}
