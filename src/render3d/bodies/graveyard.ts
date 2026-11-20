// Town look bodies for graveyard (TownDef.looks). Designed with `node tools/lineup.mjs --town <id> <kind>`.

import { PALETTE, type BodySpec } from './kit';

const SKIN = [0xb0e09c, 0x6aa684] as const;
const SKIN_DARK = [0x8cc488, 0x4f8a6e] as const;
const EYE = 0xd8ff5a;

/** Ghoul (orc rig, the raider role): a hunched grey-green toy ghoul with a long swept-back skull and long clawed arms. */
export const GHOUL: BodySpec = {
  note: 'Ghoul: hunched sage-green ghoul with a long swept-back bald skull, sunken glowing eyes, a ragged purple loincloth and long arms ending in pale claws.',
  pieces: [
    // Stubby legs and feet.
    { bone: 'leg-left', shape: 'rbox', size: [0.1, 0.13, 0.11], at: [0.086, 0.1, 0], color: SKIN, mirror: true },
    { bone: 'leg-left', shape: 'rbox', size: [0.11, 0.05, 0.15], at: [0.086, 0.028, 0.03], color: SKIN_DARK, mirror: true },
    // Short body hunched forward with a bony hump, a ragged loincloth.
    { bone: 'torso', shape: 'rbox', size: [0.24, 0.17, 0.18], at: [0, 0.265, 0.025], rot: [0.35, 0, 0], color: SKIN },
    { bone: 'torso', shape: 'rbox', size: [0.21, 0.12, 0.13], at: [0, 0.33, -0.05], rot: [0.5, 0, 0], color: SKIN_DARK },
    { bone: 'torso', shape: 'rbox', size: [0.25, 0.08, 0.2], at: [0, 0.185, 0.01], color: PALETTE.purple },
    { bone: 'torso', shape: 'cone', size: [0.13, 0.1, 0.03], at: [0, 0.12, 0.08], rot: [Math.PI, 0, 0], color: PALETTE.purple, sides: 3 },
    // Long arms: a thin arm, a big hand and a pale claw slab.
    { bone: 'arm-left', shape: 'rbox', size: [0.24, 0.075, 0.075], at: [0.21, 0.288, 0.01], color: SKIN, mirror: true },
    { bone: 'arm-left', shape: 'rbox', size: [0.1, 0.09, 0.11], at: [0.37, 0.288, 0.01], color: SKIN_DARK, mirror: true },
    { bone: 'arm-left', shape: 'rbox', size: [0.13, 0.03, 0.09], at: [0.47, 0.288, 0.01], color: PALETTE.white, mirror: true },
    // Big head slung forward, the bald skull sweeping up and back.
    { bone: 'head', shape: 'rbox', size: [0.34, 0.28, 0.28], at: [0, 0.48, 0.08], color: SKIN },
    { bone: 'head', shape: 'sphere', size: [0.3, 0.26, 0.42], at: [0, 0.54, -0.06], rot: [0.4, 0, 0], color: SKIN, sides: 8 },
    { bone: 'head', shape: 'cone', size: [0.06, 0.13, 0.03], at: [0.19, 0.5, 0.06], rot: [0, 0, -1.2], color: SKIN, sides: 4, mirror: true },
    // Painted face: dark sunken sockets with glowing eyes, a thin mouth.
    { bone: 'head', shape: 'box', size: [0.1, 0.07, 0.01], at: [0.075, 0.5, 0.223], color: PALETTE.charcoal, mirror: true },
    { bone: 'head', shape: 'box', size: [0.05, 0.035, 0.01], at: [0.075, 0.5, 0.229], color: EYE, glow: true, mirror: true },
    { bone: 'head', shape: 'box', size: [0.15, 0.025, 0.01], at: [0, 0.4, 0.223], color: PALETTE.charcoal },
  ],
};
