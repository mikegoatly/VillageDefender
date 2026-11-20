// Night towns: a monster out of the light shows only its eyes. Designed bodies bring their own glowing
// pieces; the plain Kenney models get a pair of glowing eye pieces hung on the head bone (so they
// follow every head movement of every clip), placed over each model's painted eyes. They fade in with
// the unit's darkness (instanceFx.z) and are invisible in the light (unitFx.ts, `nightEyes`).

import type { BodyPiece, BoneName } from './bodies/kit';

export interface EyeSpot {
  /** The bone the eyes ride on (the ghost has no head: its face is on the torso). */
  bone: BoneName;
  /** Centre of the right eye, model space at the rest pose (the left is its mirror image). */
  x: number;
  y: number;
  /** Just proud of the face, so the dots sit on the paint and hide when the head turns away. */
  z: number;
  /** Width and height of each eye. */
  w: number;
  h: number;
}

/** Glowing eye colour (a cold yellow-green: reads as "something out there", not as a lamp). */
export const EYE_COLOR = 0xe8ff7a;

/** Per Kenney model (CHARACTER_MODELS path), the painted eyes. Tuned against close-ups (`&eyes=1`). */
export const NIGHT_EYES: Record<string, EyeSpot> = {
  'graveyard/character-zombie': { bone: 'head', x: 0.072, y: 0.6, z: 0.168, w: 0.05, h: 0.05 },
  'mini-dungeon/character-orc': { bone: 'head', x: 0.069, y: 0.465, z: 0.165, w: 0.05, h: 0.05 },
  'graveyard/character-skeleton': { bone: 'head', x: 0.06, y: 0.58, z: 0.16, w: 0.05, h: 0.05 },
  'graveyard/character-ghost': { bone: 'torso', x: 0.073, y: 0.625, z: 0.25, w: 0.06, h: 0.06 },
  'graveyard/character-vampire': { bone: 'head', x: 0.072, y: 0.6, z: 0.168, w: 0.05, h: 0.05 },
  'graveyard/character-keeper': { bone: 'head', x: 0.072, y: 0.6, z: 0.168, w: 0.05, h: 0.05 },
};

/** The two eye pieces for a model, or none when it has no entry. */
export function eyePieces(model: string): BodyPiece[] {
  const s = NIGHT_EYES[model];
  if (!s) return [];
  return [{ bone: s.bone, shape: 'box', size: [s.w, s.h, 0.012], at: [s.x, s.y, s.z], color: EYE_COLOR, glow: true, mirror: true }];
}
