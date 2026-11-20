// Town look bodies for frostpeak (TownDef.looks). Designed with `node tools/lineup.mjs --town <id> <kind>`.

import { PALETTE, type BodySpec } from './kit';

const T_SKIN = [0xbccde2, 0x8098b8] as const;
const ICE = [0xbff0ff, 0x4f9fe8] as const;

/** Frost thrall (zombie rig, the zombie role): a frozen toy zombie in blue rags, icicles on arms and chin, ice shards in the shoulders. */
export const FROST_THRALL: BodySpec = {
  note: 'Frost thrall: a frozen corpse with icy blue-grey skin, a spiky frost-white mop, blue rags with snow on the shoulders, big icicles hanging from its arms and chin, ice shards from its shoulders and glowing pale eyes.',
  pieces: [
    // Grey trousers, bare frozen feet.
    { bone: 'leg-left', shape: 'rbox', size: [0.13, 0.13, 0.14], at: [0.074, 0.16, 0], color: PALETTE.slate, mirror: true },
    { bone: 'leg-left', shape: 'rbox', size: [0.12, 0.07, 0.17], at: [0.074, 0.045, 0.02], color: T_SKIN, mirror: true },
    // Ragged blue tunic, a torn hem, snow crusted on the shoulders.
    { bone: 'torso', shape: 'rbox', size: [0.3, 0.23, 0.21], at: [0, 0.335, 0], color: PALETTE.blue },
    { bone: 'torso', shape: 'cone', size: [0.09, 0.07, 0.05], at: [0.075, 0.21, 0.07], rot: [Math.PI, 0, 0], color: PALETTE.blue, sides: 3, mirror: true },
    { bone: 'torso', shape: 'rbox', size: [0.31, 0.05, 0.22], at: [0, 0.445, 0], color: PALETTE.white },
    // Ice shards growing out of the shoulders.
    { bone: 'torso', shape: 'cone', size: [0.11, 0.3, 0.11], at: [0.19, 0.52, -0.04], rot: [-0.25, 0, -0.8], color: ICE, sides: 4, glow: true, mirror: true },
    // Arms: a blue sleeve, a frozen forearm and hand, a big icicle hanging underneath.
    { bone: 'arm-left', shape: 'rbox', size: [0.14, 0.13, 0.13], at: [0.19, 0.373, 0], color: PALETTE.blue, mirror: true },
    { bone: 'arm-left', shape: 'rbox', size: [0.17, 0.11, 0.11], at: [0.33, 0.373, 0], color: T_SKIN, mirror: true },
    { bone: 'arm-left', shape: 'cone', size: [0.06, 0.17, 0.06], at: [0.3, 0.265, 0], rot: [Math.PI, 0, 0], color: ICE, sides: 4, glow: true, mirror: true },
    // Big head under a spiky frost-white mop.
    { bone: 'head', shape: 'rbox', size: [0.42, 0.37, 0.35], at: [0, 0.64, 0.01], color: T_SKIN },
    { bone: 'head', shape: 'rbox', size: [0.44, 0.08, 0.38], at: [0, 0.82, -0.01], color: PALETTE.white },
    { bone: 'head', shape: 'cone', size: [0.14, 0.22, 0.14], at: [0.17, 0.87, 0.0], rot: [0, 0, -1.0], color: PALETTE.white, sides: 4, mirror: true },
    { bone: 'head', shape: 'cone', size: [0.14, 0.24, 0.14], at: [0.04, 0.92, 0.06], rot: [0.4, 0, -0.2], color: PALETTE.white, sides: 4, mirror: true },
    { bone: 'head', shape: 'cone', size: [0.14, 0.22, 0.14], at: [0.0, 0.88, -0.12], rot: [-0.9, 0, 0], color: PALETTE.white, sides: 4 },
    // Painted face: glowing eyes, a gaping mouth, icicles hanging from the chin.
    { bone: 'head', shape: 'box', size: [0.08, 0.055, 0.01], at: [0.09, 0.66, 0.19], color: 0xb8f8ff, glow: true, mirror: true },
    { bone: 'head', shape: 'box', size: [0.13, 0.05, 0.01], at: [0, 0.55, 0.19], color: PALETTE.ink },
    { bone: 'head', shape: 'cone', size: [0.05, 0.12, 0.05], at: [0.06, 0.42, 0.12], rot: [Math.PI, 0, 0], color: ICE, sides: 4, glow: true, mirror: true },
    { bone: 'head', shape: 'cone', size: [0.06, 0.16, 0.06], at: [0, 0.4, 0.13], rot: [Math.PI, 0, 0], color: ICE, sides: 4, glow: true },
  ],
};

const FUR = [0xd2c2b2, 0x8e7c70] as const;
const FUR_DARK = [0xa89484, 0x6e5e56] as const;

/** Young yeti (orc rig, the raider role): shaggy taupe fur, huge slate hands, a small dark face under a big shaggy brow, tusks. */
export const YETI: BodySpec = {
  note: 'Young yeti: shaggy taupe fur, hunched, huge slate-grey hands on long arms, a small dark face peering out under a big shaggy brow fringe, glowing eyes and two tusks.',
  pieces: [
    // Short thick legs, big dark feet.
    { bone: 'leg-left', shape: 'rbox', size: [0.12, 0.12, 0.13], at: [0.086, 0.1, 0], color: FUR, mirror: true },
    { bone: 'leg-left', shape: 'rbox', size: [0.13, 0.06, 0.17], at: [0.086, 0.03, 0.03], color: PALETTE.slate, mirror: true },
    // Barrel body leaning forward under a shaggy mantle with tufts down the back.
    { bone: 'torso', shape: 'rbox', size: [0.32, 0.22, 0.24], at: [0, 0.27, 0.02], rot: [0.25, 0, 0], color: FUR },
    { bone: 'torso', shape: 'rbox', size: [0.38, 0.12, 0.27], at: [0, 0.35, -0.02], color: FUR_DARK },
    { bone: 'torso', shape: 'cone', size: [0.12, 0.14, 0.08], at: [0.08, 0.27, -0.14], rot: [Math.PI - 0.3, 0, 0], color: FUR_DARK, sides: 4, mirror: true },
    // Long arms with a shaggy cuff and huge hands.
    { bone: 'arm-left', shape: 'rbox', size: [0.2, 0.12, 0.12], at: [0.19, 0.29, 0], color: FUR, mirror: true },
    { bone: 'arm-left', shape: 'rbox', size: [0.06, 0.15, 0.15], at: [0.29, 0.288, 0], color: FUR_DARK, mirror: true },
    { bone: 'arm-left', shape: 'rbox', size: [0.16, 0.16, 0.18], at: [0.39, 0.288, 0.01], color: PALETTE.slate, mirror: true },
    // Big furry head with a tuft on top, a small dark face and a shaggy brow fringe hanging over it.
    { bone: 'head', shape: 'rbox', size: [0.42, 0.36, 0.34], at: [0, 0.5, 0.03], color: FUR },
    { bone: 'head', shape: 'cone', size: [0.13, 0.16, 0.1], at: [0.05, 0.71, -0.03], rot: [-0.4, 0, -0.35], color: FUR_DARK, sides: 4, mirror: true },
    { bone: 'head', shape: 'rbox', size: [0.26, 0.17, 0.04], at: [0, 0.465, 0.19], color: PALETTE.ink },
    { bone: 'head', shape: 'cone', size: [0.12, 0.13, 0.08], at: [0.085, 0.57, 0.2], rot: [Math.PI + 0.3, 0, 0], color: FUR_DARK, sides: 4, mirror: true },
    { bone: 'head', shape: 'cone', size: [0.12, 0.14, 0.08], at: [0, 0.565, 0.21], rot: [Math.PI + 0.3, 0, 0], color: FUR_DARK, sides: 4 },
    { bone: 'head', shape: 'cone', size: [0.12, 0.16, 0.1], at: [0.2, 0.38, 0.08], rot: [Math.PI, 0, -0.5], color: FUR, sides: 4, mirror: true },
    // Painted face: little glowing eyes, a wide mouth, two tusks pointing up.
    { bone: 'head', shape: 'box', size: [0.045, 0.035, 0.01], at: [0.06, 0.5, 0.212], color: 0xbff0ff, glow: true, mirror: true },
    { bone: 'head', shape: 'box', size: [0.14, 0.022, 0.01], at: [0, 0.42, 0.212], color: PALETTE.charcoal },
    { bone: 'head', shape: 'cone', size: [0.05, 0.1, 0.05], at: [0.08, 0.44, 0.215], color: PALETTE.cream, sides: 4, mirror: true },
  ],
};
