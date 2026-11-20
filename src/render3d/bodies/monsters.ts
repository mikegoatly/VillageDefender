// Bodies for monster kinds that replace a Kenney model outright (not a town look): the shieldbearer
// and the goblin blasters (sapper, kobold). Designed with `node tools/lineup.mjs --town <id> <kind>`.
//
// All three use the mini-dungeon/character-orc rig: legs from y 0.176 at x ±0.084, shoulders
// y 0.288 at x ±0.10, hands near ±0.35, neck y 0.343.

import { PALETTE, type BodyPiece, type BodySpec, type PieceColor } from './kit';

/** Pale ward blue, matching the shieldbearer's ward ring. */
const WARD = 0x9fd8ff;

/** Shieldbearer: a chunky horned iron guard behind a big blue tower shield with a glowing ward rune. */
export const SHIELDBEARER: BodySpec = {
  note: 'Shieldbearer: a chunky toy guard in a big horned iron helm with a T-visor and glowing eyes, a steel breastplate under a brown fur mantle, a big blue tower shield with a glowing pale ward rune and a steel cleaver.',
  pieces: [
    // Short sturdy legs in dark trousers, slate boots.
    { bone: 'leg-left', shape: 'rbox', size: [0.13, 0.12, 0.14], at: [0.086, 0.115, -0.01], color: PALETTE.ink, mirror: true },
    { bone: 'leg-left', shape: 'rbox', size: [0.14, 0.065, 0.18], at: [0.086, 0.033, 0.015], color: PALETTE.slate, mirror: true },
    // Barrel body: a steel breastplate, a dark belt, a brown fur mantle over the shoulders.
    { bone: 'torso', shape: 'rbox', size: [0.32, 0.2, 0.24], at: [0, 0.27, 0], color: PALETTE.steel },
    { bone: 'torso', shape: 'rbox', size: [0.33, 0.05, 0.25], at: [0, 0.19, 0], color: PALETTE.ink },
    { bone: 'torso', shape: 'rbox', size: [0.46, 0.11, 0.32], at: [0, 0.36, -0.01], color: PALETTE.brown },
    // Arms: a steel pauldron, a dark sleeve, a slate gauntlet.
    { bone: 'arm-left', shape: 'rbox', size: [0.14, 0.12, 0.16], at: [0.18, 0.31, 0], color: PALETTE.steel, mirror: true },
    { bone: 'arm-left', shape: 'rbox', size: [0.12, 0.09, 0.1], at: [0.28, 0.288, 0], color: PALETTE.ink, mirror: true },
    { bone: 'arm-left', shape: 'rbox', size: [0.09, 0.11, 0.12], at: [0.36, 0.288, 0], color: PALETTE.slate, mirror: true },
    // Big iron helm: a steel band, a dark T-visor with glowing eyes, big cream horns.
    { bone: 'head', shape: 'rbox', size: [0.42, 0.36, 0.36], at: [0, 0.52, 0.01], color: PALETTE.slate },
    { bone: 'head', shape: 'rbox', size: [0.44, 0.06, 0.38], at: [0, 0.6, 0.01], color: PALETTE.steel },
    { bone: 'head', shape: 'box', size: [0.3, 0.075, 0.01], at: [0, 0.52, 0.194], color: PALETTE.charcoal },
    { bone: 'head', shape: 'box', size: [0.06, 0.18, 0.01], at: [0, 0.46, 0.194], color: PALETTE.charcoal },
    { bone: 'head', shape: 'box', size: [0.07, 0.045, 0.01], at: [0.075, 0.52, 0.2], color: 0xff7a3a, glow: true, mirror: true },
    { bone: 'head', shape: 'rbox', size: [0.08, 0.07, 0.4], at: [0, 0.71, 0.01], color: PALETTE.steel },
    { bone: 'head', shape: 'cylinder', size: [0.1, 0.14, 0.1], at: [0.25, 0.62, 0], rot: [0, 0, -1.2], color: PALETTE.cream, sides: 6, mirror: true },
    { bone: 'head', shape: 'cone', size: [0.1, 0.2, 0.1], at: [0.32, 0.72, 0], rot: [0, 0, -0.25], color: PALETTE.cream, sides: 6, mirror: true },
    // Big tower shield on the left arm: a steel rim, a blue face, a glowing ward rune.
    { bone: 'arm-left', shape: 'rbox', size: [0.5, 0.38, 0.03], at: [0.3, 0.288, 0.105], color: PALETTE.steel },
    { bone: 'arm-left', shape: 'rbox', size: [0.44, 0.32, 0.05], at: [0.3, 0.288, 0.125], color: PALETTE.blue },
    { bone: 'arm-left', shape: 'box', size: [0.32, 0.04, 0.01], at: [0.3, 0.288, 0.152], color: WARD, glow: true },
    { bone: 'arm-left', shape: 'cylinder', size: [0.13, 0.01, 0.13], at: [0.3, 0.288, 0.153], rot: [Math.PI / 2, 0, 0], color: WARD, sides: 4, glow: true },
    // Cleaver in the right hand, blade pointing forward.
    { bone: 'arm-right', shape: 'cylinder', size: [0.04, 0.14, 0.04], at: [-0.36, 0.288, 0.08], rot: [Math.PI / 2, 0, 0], color: PALETTE.brown, sides: 6 },
    { bone: 'arm-right', shape: 'rbox', size: [0.035, 0.16, 0.26], at: [-0.36, 0.33, 0.26], color: PALETTE.steel },
  ],
};

/** Colours of a goblin blaster (see goblinBody). */
interface GoblinPalette {
  skin: PieceColor;
  /** Hands and feet. */
  skinDark: PieceColor;
  vest: PieceColor;
  shorts: PieceColor;
  eye: number;
}

const OLIVE = [0xa8c456, 0x6a8a32] as const;
const OLIVE_DARK = [0x86a440, 0x50702a] as const;
const SLATE_BLUE = [0x95a3e0, 0x5d68aa] as const;
const SLATE_BLUE_DARK = [0x7682c4, 0x4a5290] as const;

export const POWDER_GOBLIN: GoblinPalette = {
  skin: OLIVE, skinDark: OLIVE_DARK, vest: PALETTE.brown, shorts: PALETTE.ink, eye: 0xffe14a,
};
export const FROST_KOBOLD: GoblinPalette = {
  skin: SLATE_BLUE, skinDark: SLATE_BLUE_DARK, vest: PALETTE.brown, shorts: PALETTE.ink, eye: 0xffe070,
};

/**
 * Small, hunched toy goblin: a big round head with huge pointy ears and a long nose, a stubby
 * hunched body, thin arms with big hands, and a little tail.
 * `keg`: a red bandana and a powder keg on the back with a glowing fuse spark (the sapper).
 * `miner`: an iron helmet with a lit candle, two small kegs on the back and a pickaxe (the kobold).
 */
export function goblinBody(c: GoblinPalette, prop: 'keg' | 'miner', note: string): BodySpec {
  const pieces: BodyPiece[] = [
    // Stubby legs: shorts and long feet.
    { bone: 'leg-left', shape: 'rbox', size: [0.1, 0.1, 0.11], at: [0.084, 0.12, -0.01], color: c.shorts, mirror: true },
    { bone: 'leg-left', shape: 'rbox', size: [0.1, 0.055, 0.17], at: [0.088, 0.03, 0.03], color: c.skinDark, mirror: true },
    // Small hunched body in a vest, a little tail.
    { bone: 'torso', shape: 'rbox', size: [0.22, 0.17, 0.18], at: [0, 0.26, 0.01], rot: [0.3, 0, 0], color: c.vest },
    { bone: 'torso', shape: 'rbox', size: [0.12, 0.11, 0.03], at: [0, 0.255, 0.1], rot: [0.3, 0, 0], color: c.skin },
    { bone: 'root', shape: 'cone', size: [0.07, 0.22, 0.07], at: [0, 0.12, -0.16], rot: [-2.0, 0, 0], color: c.skin, sides: 4 },
    // Thin arms, big hands.
    { bone: 'arm-left', shape: 'rbox', size: [0.2, 0.07, 0.07], at: [0.2, 0.288, 0], color: c.skin, mirror: true },
    { bone: 'arm-left', shape: 'rbox', size: [0.09, 0.09, 0.1], at: [0.33, 0.288, 0], color: c.skinDark, mirror: true },
    // Big round head, huge ears sticking out sideways, a long nose.
    { bone: 'head', shape: 'rbox', size: [0.36, 0.3, 0.3], at: [0, 0.49, 0.03], color: c.skin },
    { bone: 'head', shape: 'cone', size: [0.13, 0.32, 0.05], at: [0.3, 0.53, 0], rot: [0, 0, -1.2], color: c.skin, sides: 4, mirror: true },
    { bone: 'head', shape: 'cone', size: [0.11, 0.27, 0.1], at: [0, 0.45, 0.27], rot: [Math.PI / 2 + 0.35, 0, 0], color: c.skin, sides: 4 },
    // Painted face: big glowing eyes and a wide grin.
    { bone: 'head', shape: 'box', size: [0.085, 0.075, 0.01], at: [0.085, 0.52, 0.182], color: c.eye, glow: true, mirror: true },
    { bone: 'head', shape: 'box', size: [0.03, 0.045, 0.01], at: [0.075, 0.515, 0.188], color: PALETTE.ink, mirror: true },
    { bone: 'head', shape: 'box', size: [0.17, 0.025, 0.01], at: [0, 0.39, 0.182], color: PALETTE.ink },
  ];
  if (prop === 'keg') {
    pieces.push(
      // Red bandana with a knot tail.
      { bone: 'head', shape: 'rbox', size: [0.38, 0.085, 0.32], at: [0, 0.625, 0.03], color: PALETTE.red },
      { bone: 'head', shape: 'rbox', size: [0.08, 0.15, 0.04], at: [0.07, 0.56, -0.14], rot: [0.3, 0, 0.4], color: PALETTE.red },
      // A powder keg on the back with a glowing fuse spark.
      { bone: 'torso', shape: 'cylinder', size: [0.26, 0.3, 0.26], at: [0, 0.36, -0.18], rot: [-0.2, 0, 0], color: PALETTE.clay, sides: 8 },
      { bone: 'torso', shape: 'cylinder', size: [0.27, 0.035, 0.27], at: [0, 0.46, -0.2], rot: [-0.2, 0, 0], color: PALETTE.ink, sides: 8 },
      { bone: 'torso', shape: 'cylinder', size: [0.27, 0.035, 0.27], at: [0, 0.26, -0.16], rot: [-0.2, 0, 0], color: PALETTE.ink, sides: 8 },
      { bone: 'torso', shape: 'cylinder', size: [0.025, 0.1, 0.025], at: [0, 0.55, -0.22], rot: [-0.4, 0, 0], color: PALETTE.ink, sides: 4 },
      { bone: 'torso', shape: 'sphere', size: [0.09, 0.09, 0.09], at: [0, 0.61, -0.25], color: PALETTE.yellow, sides: 5, glow: true },
    );
  } else {
    pieces.push(
      // Iron helmet with a brim and a lit candle on top.
      { bone: 'head', shape: 'rbox', size: [0.37, 0.09, 0.32], at: [0, 0.645, 0.03], color: PALETTE.slate },
      { bone: 'head', shape: 'rbox', size: [0.43, 0.03, 0.38], at: [0, 0.6, 0.03], color: PALETTE.steel },
      { bone: 'head', shape: 'cylinder', size: [0.06, 0.09, 0.06], at: [0, 0.73, 0.05], color: PALETTE.cream, sides: 6 },
      { bone: 'head', shape: 'cone', size: [0.08, 0.12, 0.08], at: [0, 0.83, 0.05], color: PALETTE.yellow, sides: 5, glow: true },
      // Two small kegs on the back.
      { bone: 'torso', shape: 'cylinder', size: [0.11, 0.15, 0.11], at: [0.065, 0.31, -0.14], color: PALETTE.clay, sides: 7, mirror: true },
      // Pickaxe in the right hand: haft forward, the pick across its end.
      { bone: 'arm-right', shape: 'cylinder', size: [0.045, 0.46, 0.045], at: [-0.35, 0.288, 0.17], rot: [Math.PI / 2, 0, 0], color: PALETTE.tan, sides: 5 },
      { bone: 'arm-right', shape: 'rbox', size: [0.07, 0.08, 0.08], at: [-0.35, 0.288, 0.38], color: PALETTE.slate },
      { bone: 'arm-right', shape: 'cone', size: [0.08, 0.26, 0.07], at: [-0.35, 0.42, 0.37], rot: [-0.25, 0, 0], color: PALETTE.steel, sides: 4 },
      { bone: 'arm-right', shape: 'cone', size: [0.08, 0.26, 0.07], at: [-0.35, 0.156, 0.37], rot: [Math.PI + 0.25, 0, 0], color: PALETTE.steel, sides: 4 },
    );
  }
  return { note, pieces };
}
