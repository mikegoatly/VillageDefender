// Bodies for Lanternwick (Town 5, the night town): the town looks (scarecrow, werewolf) and the night
// monsters (shade, gloom moth, will-o'-wisp). Designed with `node tools/lineup.mjs --town lanternwick
// <kind>`, and in the dark with `--query "dark=1"`: out of the light only the glowing pieces read, so
// each one has bright glowing eyes (or wing spots, or is a light itself) and one silhouette to know it by.
//
// Rigs: the scarecrow keeps the zombie's (its stiff-armed shamble suits a man of straw): legs from
// y 0.223 at x ±0.074, shoulders y 0.373 at x ±0.125 (hands near ±0.39), neck y 0.447. The werewolf
// takes the orc's (hunched, a big swipe): legs from y 0.176 at x ±0.084, shoulders y 0.29 at x ±0.10,
// neck y 0.35. The three night monsters float on the ghost's rig, which has no legs or head: a torso
// pivoting at y 0.223 and arms at y 0.373, x ±0.125 (the moth's wings ride the arms, so walking and
// attacking flap them).

import { PALETTE, type BodySpec } from './kit';

// ------------------------------------------------------------------ scarecrow (zombie rig)

const SACK = [0xf4dca8, 0xd0a868] as const;
const STRAW = [0xffe27a, 0xe0a83a] as const;
const COAT = [0x8aa060, 0x5c7448] as const;
const PATCH = PALETTE.red;
const HAT = [0x8a6a58, 0x5a4440] as const;
const PUMPKIN_EYE = 0xffb020;

/** Scarecrow: a stuffed sack head with a stitched grin and glowing orange eyes, a patched coat, straw everywhere, a crooked hat. */
export const SCARECROW: BodySpec = {
  note: 'Scarecrow: a big stuffed burlap sack head with a stitched grin and glowing orange-yellow eyes, a floppy crooked brown hat, a patched green coat, straw tufts bursting from the neck, cuffs and trouser legs.',
  pieces: [
    // Thin trouser legs on a post, straw sticking out of the hems.
    { bone: 'leg-left', shape: 'rbox', size: [0.11, 0.18, 0.12], at: [0.074, 0.14, 0], color: PALETTE.blue, mirror: true },
    { bone: 'leg-left', shape: 'cone', size: [0.13, 0.08, 0.13], at: [0.074, 0.03, 0.01], rot: [Math.PI, 0, 0], color: STRAW, sides: 5, mirror: true },
    // Patched coat, a rope belt, a red patch.
    { bone: 'torso', shape: 'rbox', size: [0.3, 0.24, 0.21], at: [0, 0.335, 0], color: COAT },
    { bone: 'torso', shape: 'rbox', size: [0.31, 0.035, 0.22], at: [0, 0.27, 0], color: PALETTE.tan },
    { bone: 'torso', shape: 'box', size: [0.08, 0.07, 0.01], at: [0.07, 0.37, 0.108], rot: [0, 0, 0.2], color: PATCH },
    // Straw bursting out of the collar.
    { bone: 'torso', shape: 'cone', size: [0.1, 0.12, 0.08], at: [0.09, 0.46, 0.05], rot: [0.3, 0, -0.5], color: STRAW, sides: 4, mirror: true },
    { bone: 'torso', shape: 'cone', size: [0.1, 0.12, 0.08], at: [0, 0.465, 0.08], rot: [0.5, 0, 0], color: STRAW, sides: 4 },
    // Coat sleeves, straw hands bursting from the cuffs.
    { bone: 'arm-left', shape: 'rbox', size: [0.22, 0.13, 0.13], at: [0.23, 0.373, 0], color: COAT, mirror: true },
    { bone: 'arm-left', shape: 'cone', size: [0.12, 0.15, 0.12], at: [0.4, 0.373, 0], rot: [0, 0, -Math.PI / 2], color: STRAW, sides: 5, mirror: true },
    // Big sack head, a little lopsided, tied off at the neck.
    { bone: 'head', shape: 'rbox', size: [0.42, 0.38, 0.34], at: [0, 0.64, 0.01], rot: [0, 0, 0.06], color: SACK },
    { bone: 'head', shape: 'rbox', size: [0.24, 0.05, 0.22], at: [0, 0.465, 0.0], color: PALETTE.tan },
    // Painted face: glowing triangle-ish eyes and a stitched grin (a dark line with stitches across it).
    { bone: 'head', shape: 'box', size: [0.085, 0.07, 0.01], at: [0.085, 0.68, 0.181], rot: [0, 0, 0.25], color: PUMPKIN_EYE, glow: true, mirror: true },
    { bone: 'head', shape: 'box', size: [0.2, 0.022, 0.01], at: [0, 0.56, 0.181], color: PALETTE.ink },
    { bone: 'head', shape: 'box', size: [0.016, 0.06, 0.01], at: [0.05, 0.56, 0.183], color: PALETTE.ink, mirror: true },
    { bone: 'head', shape: 'box', size: [0.016, 0.06, 0.01], at: [0, 0.56, 0.183], color: PALETTE.ink },
    // Crooked floppy hat: a wide brim and a bent crown, straw poking out underneath.
    { bone: 'head', shape: 'rbox', size: [0.56, 0.04, 0.5], at: [0, 0.83, 0], rot: [0.05, 0, -0.12], color: HAT },
    { bone: 'head', shape: 'cone', size: [0.32, 0.26, 0.3], at: [-0.03, 0.96, -0.01], rot: [0, 0, -0.35], color: HAT, sides: 6 },
    { bone: 'head', shape: 'cone', size: [0.1, 0.12, 0.08], at: [0.2, 0.78, 0.02], rot: [0, 0, -1.6], color: STRAW, sides: 4, mirror: true },
  ],
};

// ------------------------------------------------------------------ werewolf (orc rig)

const WOLF = [0x9a8ab0, 0x5e5478] as const;
const WOLF_DARK = [0x6e6088, 0x463e5c] as const;
const WOLF_BELLY = [0xc8bcd8, 0x9a8eb0] as const;
const WOLF_EYE = 0xfff04a;

/** Werewolf: a hunched grey-violet wolf-man with a long snout, tall ears, glowing yellow eyes and chunky clawed hands. */
export const WEREWOLF: BodySpec = {
  note: 'Werewolf: hunched shaggy grey-violet wolf-man, a big wolf head with a long snout and black nose, tall pointed ears, glowing yellow eyes, a pale chest, ragged trousers and big clawed hands.',
  pieces: [
    // Short bent legs in torn brown trousers, big furry feet.
    { bone: 'leg-left', shape: 'rbox', size: [0.12, 0.12, 0.13], at: [0.086, 0.11, 0], color: PALETTE.brown, mirror: true },
    { bone: 'leg-left', shape: 'rbox', size: [0.12, 0.06, 0.19], at: [0.086, 0.03, 0.04], color: WOLF_DARK, mirror: true },
    // Barrel chest leaning forward, a pale belly, a shaggy ruff over the shoulders.
    { bone: 'torso', shape: 'rbox', size: [0.3, 0.22, 0.22], at: [0, 0.27, 0.02], rot: [0.3, 0, 0], color: WOLF },
    { bone: 'torso', shape: 'rbox', size: [0.2, 0.15, 0.06], at: [0, 0.255, 0.12], rot: [0.3, 0, 0], color: WOLF_BELLY },
    { bone: 'torso', shape: 'rbox', size: [0.36, 0.11, 0.26], at: [0, 0.35, -0.02], color: WOLF_DARK },
    { bone: 'torso', shape: 'cone', size: [0.1, 0.14, 0.07], at: [0.07, 0.36, -0.14], rot: [-0.6, 0, 0], color: WOLF_DARK, sides: 4, mirror: true },
    // Long furry arms with big dark clawed hands (pale claw slab).
    { bone: 'arm-left', shape: 'rbox', size: [0.2, 0.11, 0.11], at: [0.19, 0.29, 0], color: WOLF, mirror: true },
    { bone: 'arm-left', shape: 'rbox', size: [0.13, 0.14, 0.15], at: [0.35, 0.288, 0.01], color: WOLF_DARK, mirror: true },
    { bone: 'arm-left', shape: 'rbox', size: [0.08, 0.04, 0.13], at: [0.44, 0.288, 0.01], color: PALETTE.cream, mirror: true },
    // Big wolf head: the skull, a long snout with a black nose and a dark mouth line, tall ears, a tuft on top.
    { bone: 'head', shape: 'rbox', size: [0.38, 0.32, 0.32], at: [0, 0.5, 0.0], color: WOLF },
    { bone: 'head', shape: 'rbox', size: [0.2, 0.15, 0.22], at: [0, 0.44, 0.24], color: WOLF },
    { bone: 'head', shape: 'rbox', size: [0.17, 0.08, 0.2], at: [0, 0.385, 0.22], color: WOLF_BELLY },
    { bone: 'head', shape: 'rbox', size: [0.09, 0.06, 0.05], at: [0, 0.5, 0.35], color: PALETTE.charcoal },
    { bone: 'head', shape: 'cone', size: [0.13, 0.26, 0.07], at: [0.12, 0.74, -0.03], rot: [-0.15, 0, -0.25], color: WOLF_DARK, sides: 4, mirror: true },
    { bone: 'head', shape: 'cone', size: [0.07, 0.14, 0.03], at: [0.12, 0.72, 0.0], rot: [-0.15, 0, -0.25], color: PALETTE.pink, sides: 4, mirror: true },
    { bone: 'head', shape: 'cone', size: [0.12, 0.14, 0.1], at: [0, 0.68, -0.08], rot: [-0.6, 0, 0], color: WOLF_DARK, sides: 4 },
    // Painted face: glowing slanted yellow eyes above the snout, two little fangs.
    { bone: 'head', shape: 'box', size: [0.08, 0.045, 0.01], at: [0.085, 0.555, 0.162], rot: [0, 0, -0.3], color: WOLF_EYE, glow: true, mirror: true },
    { bone: 'head', shape: 'cone', size: [0.035, 0.06, 0.035], at: [0.05, 0.35, 0.3], rot: [Math.PI, 0, 0], color: PALETTE.white, sides: 4, mirror: true },
  ],
};

// ------------------------------------------------------------------ shade (ghost rig)

const SMOKE = [0x5c5478, 0x2a2638] as const;
const SMOKE_LIGHT = [0x766c98, 0x403a56] as const;
const SHADE_EYE = 0xdff4ff;

/** Shade: a hooded wisp of dark smoke trailing to nothing, a black hood opening with two pale glowing eyes. */
export const SHADE: BodySpec = {
  note: 'Shade: a drifting hooded figure of dark violet smoke, the robe tapering to a ragged trailing wisp, long trailing sleeves with grasping dark hands, a deep black hood opening with two pale glowing eyes.',
  pieces: [
    // Robe: a body tapering down into a ragged wisp of smoke, hem tatters.
    { bone: 'torso', shape: 'rbox', size: [0.32, 0.24, 0.26], at: [0, 0.42, 0], color: SMOKE },
    { bone: 'torso', shape: 'cone', size: [0.3, 0.3, 0.24], at: [0, 0.18, -0.02], rot: [Math.PI + 0.25, 0, 0], color: SMOKE, sides: 6 },
    { bone: 'torso', shape: 'cone', size: [0.1, 0.14, 0.06], at: [0.1, 0.27, 0.08], rot: [Math.PI, 0, 0.3], color: SMOKE_LIGHT, sides: 3, mirror: true },
    { bone: 'torso', shape: 'cone', size: [0.1, 0.12, 0.06], at: [0, 0.26, 0.11], rot: [Math.PI, 0, 0], color: SMOKE_LIGHT, sides: 3 },
    // Big hood with a deep black opening and two pale glowing eyes, a peak flopping back.
    { bone: 'torso', shape: 'rbox', size: [0.4, 0.36, 0.36], at: [0, 0.69, 0.0], color: SMOKE_LIGHT },
    { bone: 'torso', shape: 'cone', size: [0.3, 0.28, 0.28], at: [0, 0.92, -0.08], rot: [-0.6, 0, 0], color: SMOKE_LIGHT, sides: 6 },
    { bone: 'torso', shape: 'rbox', size: [0.28, 0.24, 0.02], at: [0, 0.67, 0.18], color: PALETTE.charcoal },
    { bone: 'torso', shape: 'box', size: [0.07, 0.05, 0.01], at: [0.06, 0.69, 0.193], color: SHADE_EYE, glow: true, mirror: true },
    // Trailing sleeves and dark grasping hands.
    { bone: 'arm-left', shape: 'rbox', size: [0.2, 0.12, 0.12], at: [0.22, 0.373, 0], color: SMOKE, mirror: true },
    { bone: 'arm-left', shape: 'cone', size: [0.14, 0.16, 0.14], at: [0.33, 0.33, 0], rot: [Math.PI, 0, 0.4], color: SMOKE_LIGHT, sides: 4, mirror: true },
    { bone: 'arm-left', shape: 'rbox', size: [0.09, 0.08, 0.09], at: [0.38, 0.373, 0.01], color: PALETTE.ink, mirror: true },
  ],
};

// ------------------------------------------------------------------ gloom moth (ghost rig)

const MOTH_FUZZ = [0xe4d8c8, 0xa89a8c] as const;
const MOTH_BODY = [0xb8a898, 0x7c6c64] as const;
const WING = [0xd8d4ea, 0x9c96bc] as const;
const WING_EDGE = [0x8c84b0, 0x5e5884] as const;
const MOTH_GLOW = 0xc6f2ff;
const MOTH_EYE = 0xffe8a0;

/** Wings lean back a little so the high camera sees their faces. */
const WING_TILT = -0.35;
/**
 * The ghost rig's arms hang about 45° down at idle, so the wings are set at the rest pose (arm out
 * along +X) already raised: the upper pair at 70° rises to a moth's V when the arm hangs, the lower
 * pair at 15° spreads out and down. Walking and attacking swing the arms, so the wings flap.
 */
const UPPER = 1.22;
const LOWER = 0.26;
/** Where a wing piece sits `t` along its pair's direction from the shoulder, and its rotation. */
const wingAt = (angle: number, t: number, z: number): [number, number, number] => [0.125 + Math.cos(angle) * t, 0.373 + Math.sin(angle) * t, z];
/** A glowing eye-spot just proud of a wing's face (`side` 1) or its back (−1): a disc along the wing's normal. */
const spotAt = (angle: number, t: number, z: number, side = 1): [number, number, number] => {
  const [x, y] = wingAt(angle, t, z);
  return [x, y + side * Math.sin(-WING_TILT) * 0.016, z + side * Math.cos(WING_TILT) * 0.016];
};

/** Gloom moth: a fat fuzzy toy moth with two pairs of wide pale wings marked with glowing eye-spots. */
export const GLOOM_MOTH: BodySpec = {
  note: 'Gloom moth: a fat fuzzy cream-grey moth body with a furry white collar, big glowing amber eyes and two feathery antennae, two pairs of wide pale lilac wings with darker tips, each with a big glowing eye-spot, flapping with the arms.',
  pieces: [
    // Fat striped abdomen hanging below and behind, a furry thorax and collar.
    { bone: 'torso', shape: 'sphere', size: [0.22, 0.3, 0.24], at: [0, 0.27, -0.06], rot: [0.5, 0, 0], color: MOTH_BODY, sides: 8 },
    { bone: 'torso', shape: 'rbox', size: [0.2, 0.04, 0.2], at: [0, 0.26, -0.07], rot: [0.5, 0, 0], color: MOTH_FUZZ },
    { bone: 'torso', shape: 'rbox', size: [0.28, 0.24, 0.24], at: [0, 0.45, 0], color: MOTH_FUZZ },
    { bone: 'torso', shape: 'rbox', size: [0.32, 0.08, 0.27], at: [0, 0.55, 0], color: PALETTE.white },
    // Head: round, big glowing eyes, feathery antennae swept back.
    { bone: 'torso', shape: 'rbox', size: [0.26, 0.2, 0.2], at: [0, 0.64, 0.06], color: MOTH_FUZZ },
    { bone: 'torso', shape: 'sphere', size: [0.1, 0.1, 0.06], at: [0.085, 0.65, 0.155], color: MOTH_EYE, glow: true, sides: 8, mirror: true },
    { bone: 'torso', shape: 'cylinder', size: [0.02, 0.22, 0.02], at: [0.06, 0.82, 0.06], rot: [-0.5, 0, -0.35], color: PALETTE.brown, sides: 4, mirror: true },
    { bone: 'torso', shape: 'cone', size: [0.08, 0.14, 0.03], at: [0.1, 0.9, 0.0], rot: [-0.5, 0, -0.35], color: MOTH_FUZZ, sides: 4, mirror: true },
    // Upper wings: wide, darker tips, a big glowing eye-spot with a dark pupil.
    { bone: 'arm-left', shape: 'rbox', size: [0.44, 0.32, 0.025], at: wingAt(UPPER, 0.24, -0.06), rot: [WING_TILT, 0, UPPER], color: WING, mirror: true },
    { bone: 'arm-left', shape: 'rbox', size: [0.09, 0.33, 0.03], at: wingAt(UPPER, 0.44, -0.06), rot: [WING_TILT, 0, UPPER], color: WING_EDGE, mirror: true },
    { bone: 'arm-left', shape: 'cylinder', size: [0.15, 0.012, 0.15], at: spotAt(UPPER, 0.27, -0.06), rot: [WING_TILT + Math.PI / 2, 0, 0], color: MOTH_GLOW, glow: true, sides: 10, mirror: true },
    { bone: 'arm-left', shape: 'cylinder', size: [0.065, 0.016, 0.065], at: spotAt(UPPER, 0.27, -0.057), rot: [WING_TILT + Math.PI / 2, 0, 0], color: PALETTE.ink, sides: 8, mirror: true },
    // The same spots show through on the backs of the wings, so a moth flying away still reads.
    { bone: 'arm-left', shape: 'cylinder', size: [0.13, 0.012, 0.13], at: spotAt(UPPER, 0.27, -0.06, -1), rot: [WING_TILT + Math.PI / 2, 0, 0], color: MOTH_GLOW, glow: true, sides: 10, mirror: true },
    // Lower wings: smaller, spreading out and down, a smaller glowing spot.
    { bone: 'arm-left', shape: 'rbox', size: [0.3, 0.22, 0.022], at: wingAt(LOWER, 0.18, -0.1), rot: [WING_TILT, 0, LOWER], color: WING, mirror: true },
    { bone: 'arm-left', shape: 'cylinder', size: [0.09, 0.012, 0.09], at: spotAt(LOWER, 0.2, -0.1), rot: [WING_TILT + Math.PI / 2, 0, 0], color: MOTH_GLOW, glow: true, sides: 8, mirror: true },
    { bone: 'arm-left', shape: 'cylinder', size: [0.08, 0.012, 0.08], at: spotAt(LOWER, 0.2, -0.1, -1), rot: [WING_TILT + Math.PI / 2, 0, 0], color: MOTH_GLOW, glow: true, sides: 8, mirror: true },
  ],
};

// ------------------------------------------------------------------ will-o'-wisp (ghost rig)

const WISP_CORE = 0xe8fff4;
const WISP_FLAME = 0x8affd0;
const WISP_OUTER = 0x5ad8c8;

/** Will-o'-wisp: a small floating ball of cold green light with a flickering flame tip and a faint sleepy face. */
export const WISP: BodySpec = {
  note: "Will-o'-wisp: a small floating orb of cold mint light, a paler core, a flame licking up off the top and a wispy tail below, a faint little face (two dark dot eyes and an O mouth), two tiny sparks orbiting on the arms.",
  pieces: [
    // The orb: a glowing shell with a brighter core peeking through at the front.
    { bone: 'torso', shape: 'sphere', size: [0.32, 0.3, 0.3], at: [0, 0.5, 0], color: WISP_OUTER, glow: true, sides: 10 },
    { bone: 'torso', shape: 'sphere', size: [0.24, 0.22, 0.1], at: [0, 0.51, 0.11], color: WISP_CORE, glow: true, sides: 10 },
    // Flame tip licking up, and a wispy tail trailing below.
    { bone: 'torso', shape: 'cone', size: [0.2, 0.24, 0.2], at: [0, 0.73, -0.02], rot: [-0.2, 0, 0], color: WISP_FLAME, glow: true, sides: 6 },
    { bone: 'torso', shape: 'cone', size: [0.12, 0.2, 0.12], at: [0, 0.28, -0.04], rot: [Math.PI + 0.3, 0, 0], color: WISP_OUTER, glow: true, sides: 6 },
    // A faint face: dark dot eyes and a little O mouth.
    { bone: 'torso', shape: 'box', size: [0.035, 0.05, 0.01], at: [0.05, 0.53, 0.162], color: 0x2f6a64, mirror: true },
    { bone: 'torso', shape: 'box', size: [0.04, 0.03, 0.01], at: [0, 0.46, 0.158], color: 0x2f6a64 },
    // Two tiny sparks orbiting on the arms.
    { bone: 'arm-left', shape: 'sphere', size: [0.06, 0.06, 0.06], at: [0.3, 0.42, 0.05], color: WISP_FLAME, glow: true, sides: 6, mirror: true },
  ],
};
