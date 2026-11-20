// Town look bodies for riverside (TownDef.looks). Designed with `node tools/lineup.mjs --town <id> <kind>`.

import { PALETTE, type BodySpec } from './kit';

// Drowned (graveyard/character-zombie rig): legs from y 0.223 at x ±0.074, shoulders y 0.373 at
// x ±0.125 (hands near ±0.39), neck y 0.447. Big head, a bloated belly and a drooping weed hood.
const DROWNED_SKIN = [0x9fd4c4, 0x6fa8a0] as const;
const DROWNED_BELLY = [0xd4f0e4, 0xa4d2c4] as const;
/** Pondweed: a deeper sea green than the meadow and the pines. */
const WEED = [0x4fae7a, 0x1e6a58] as const;

export const DROWNED: BodySpec = {
  note: 'Drowned: a big-headed, pale sea-green corpse with a bloated belly bursting from a blue shirt, a drooping hood of pondweed with a starfish on top, glowing eyes and a gaping mouth.',
  pieces: [
    // Stubby legs: soggy trousers, bare feet.
    { bone: 'leg-left', shape: 'rbox', size: [0.14, 0.17, 0.16], at: [0.074, 0.15, 0], color: PALETTE.slate, mirror: true },
    { bone: 'leg-left', shape: 'rbox', size: [0.15, 0.08, 0.19], at: [0.076, 0.04, 0.02], color: DROWNED_SKIN, mirror: true },
    // Short body: a blue shirt with the bloated belly bulging out of it.
    { bone: 'torso', shape: 'rbox', size: [0.3, 0.23, 0.23], at: [0, 0.335, 0], color: PALETTE.blue },
    { bone: 'torso', shape: 'rbox', size: [0.27, 0.2, 0.2], at: [0, 0.29, 0.08], color: DROWNED_BELLY },
    // Arms: a shirt sleeve, then a swollen bare forearm.
    { bone: 'arm-left', shape: 'rbox', size: [0.12, 0.15, 0.15], at: [0.185, 0.373, 0.0025], color: PALETTE.blue, mirror: true },
    { bone: 'arm-left', shape: 'rbox', size: [0.21, 0.14, 0.14], at: [0.33, 0.373, 0.0025], color: DROWNED_SKIN, mirror: true },
    // Big head with a painted face: glowing eyes and a gaping, sagging mouth.
    { bone: 'head', shape: 'rbox', size: [0.44, 0.4, 0.35], at: [0, 0.647, 0], color: DROWNED_SKIN },
    { bone: 'head', shape: 'box', size: [0.09, 0.07, 0.01], at: [0.09, 0.665, 0.177], color: 0xeafff6, glow: true, mirror: true },
    { bone: 'head', shape: 'box', size: [0.14, 0.11, 0.01], at: [0, 0.53, 0.177], color: PALETTE.ink },
    // Hood of pondweed drooping over the top and sides, hanging down the back in ragged strands,
    // with a long clump over one eye.
    { bone: 'head', shape: 'rbox', size: [0.48, 0.1, 0.39], at: [0, 0.855, -0.01], color: WEED },
    { bone: 'head', shape: 'rbox', size: [0.06, 0.32, 0.3], at: [0.235, 0.72, -0.04], color: WEED, mirror: true },
    { bone: 'head', shape: 'rbox', size: [0.06, 0.46, 0.1], at: [0.24, 0.62, 0.11], color: WEED },
    { bone: 'head', shape: 'rbox', size: [0.16, 0.44, 0.06], at: [0.14, 0.65, -0.19], color: WEED },
    { bone: 'head', shape: 'rbox', size: [0.16, 0.34, 0.06], at: [0, 0.7, -0.195], color: WEED },
    { bone: 'head', shape: 'rbox', size: [0.16, 0.5, 0.06], at: [-0.14, 0.62, -0.19], color: WEED },
    { bone: 'head', shape: 'rbox', size: [0.1, 0.17, 0.05], at: [0.03, 0.77, 0.18], rot: [0, 0, 0.15], color: WEED },
    { bone: 'head', shape: 'rbox', size: [0.08, 0.1, 0.04], at: [-0.15, 0.8, 0.18], color: WEED },
    // A starfish stuck on top.
    { bone: 'head', shape: 'cylinder', size: [0.17, 0.04, 0.17], at: [0.09, 0.915, 0.04], rot: [0, 0.3, 0], color: PALETTE.orange, sides: 5 },
  ],
};

// Frogfolk (mini-dungeon/character-orc rig): legs from y 0.176 at x ±0.084 (z −0.024), shoulders
// y 0.288 at x ±0.10, hands near ±0.35, neck y 0.343. A huge flat head with giant eyes on top.

export const FROGFOLK: BodySpec = {
  note: 'Frogfolk raider: a red poison-dart toy frog with dark spots with a huge flat head, giant yellow eyes on top, a wide painted grin, a cream belly and a steel trident.',
  pieces: [
    // Crouched legs: fat thighs, big flat feet.
    { bone: 'leg-left', shape: 'rbox', size: [0.14, 0.12, 0.16], at: [0.1, 0.12, -0.03], color: PALETTE.red, mirror: true },
    { bone: 'leg-left', shape: 'rbox', size: [0.16, 0.05, 0.2], at: [0.1, 0.025, 0.02], color: PALETTE.red, mirror: true },
    // Short body with a cream belly and a reed belt.
    { bone: 'torso', shape: 'rbox', size: [0.26, 0.18, 0.22], at: [0, 0.265, -0.02], color: PALETTE.red },
    { bone: 'torso', shape: 'rbox', size: [0.2, 0.14, 0.04], at: [0, 0.255, 0.09], color: PALETTE.cream },
    { bone: 'torso', shape: 'rbox', size: [0.28, 0.045, 0.24], at: [0, 0.19, -0.02], color: PALETTE.brown },
    // Stubby arms with flat webbed hands.
    { bone: 'arm-left', shape: 'rbox', size: [0.19, 0.08, 0.08], at: [0.2, 0.288, -0.012], color: PALETTE.red, mirror: true },
    { bone: 'arm-left', shape: 'rbox', size: [0.09, 0.045, 0.13], at: [0.33, 0.288, -0.012], color: PALETTE.red, mirror: true },
    // Huge flat head: a cream jaw and a wide painted grin.
    { bone: 'head', shape: 'rbox', size: [0.46, 0.2, 0.36], at: [0, 0.445, 0.02], color: PALETTE.red },
    { bone: 'head', shape: 'rbox', size: [0.42, 0.07, 0.32], at: [0, 0.36, 0.03], color: PALETTE.cream },
    { bone: 'head', shape: 'box', size: [0.36, 0.018, 0.01], at: [0, 0.39, 0.2], color: PALETTE.ink },
    // Giant eyes sitting on top: green bumps with painted yellow eyes and a slit pupil.
    { bone: 'head', shape: 'rbox', size: [0.16, 0.15, 0.15], at: [0.13, 0.57, 0.07], color: PALETTE.red, mirror: true },
    { bone: 'head', shape: 'box', size: [0.135, 0.12, 0.01], at: [0.13, 0.575, 0.147], color: PALETTE.yellow, mirror: true },
    { bone: 'head', shape: 'box', size: [0.09, 0.035, 0.01], at: [0.13, 0.57, 0.153], color: PALETTE.ink, mirror: true },
    // A few darker spots on the back of the head.
    { bone: 'head', shape: 'box', size: [0.09, 0.02, 0.08], at: [-0.07, 0.545, -0.06], color: 0x3b3e4a },
    { bone: 'head', shape: 'box', size: [0.07, 0.02, 0.06], at: [0.1, 0.545, -0.1], color: 0x3b3e4a },
    // Trident in the right hand, prongs forward.
    { bone: 'arm-right', shape: 'cylinder', size: [0.04, 0.56, 0.04], at: [-0.34, 0.288, 0.13], rot: [Math.PI / 2, 0, 0], color: PALETTE.tan, sides: 6 },
    { bone: 'arm-right', shape: 'box', size: [0.05, 0.21, 0.05], at: [-0.34, 0.288, 0.42], color: PALETTE.steel },
    { bone: 'arm-right', shape: 'box', size: [0.045, 0.045, 0.15], at: [-0.34, 0.37, 0.5], color: PALETTE.steel },
    { bone: 'arm-right', shape: 'box', size: [0.05, 0.05, 0.2], at: [-0.34, 0.288, 0.52], color: PALETTE.steel },
    { bone: 'arm-right', shape: 'box', size: [0.045, 0.045, 0.15], at: [-0.34, 0.206, 0.5], color: PALETTE.steel },
  ],
};
