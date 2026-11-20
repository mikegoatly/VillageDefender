// Town bosses: one on screen at a time, drawn 2.4–2.8× the horde, so they carry more detail (up to
// ~30 pieces before mirroring) but stay toys: big readable shapes, one or two signature features,
// glowing eyes and a big weapon or prop that reads in walk and attack.
// Designed with `node tools/lineup.mjs [--town <id>] <boss>`.
//
// Rigs: the warlord and the frost giant keep mini-dungeon/character-orc (legs from y 0.176 at x ±0.084,
// shoulders y 0.288 at x ±0.10, hands near ±0.37, neck y 0.343); the troll is on graveyard/character-zombie
// (its hunched lurch) and the gravekeeper on graveyard/character-keeper (legs from y 0.223 at x ±0.074,
// shoulders y 0.373 at x ±0.125, hands near ±0.39, neck y 0.447). Weapons are poles held in the right
// hand (heldPole): upright beside the body at rest and raised in the swing.

import { heldPole, PALETTE, type BodyPiece, type BodySpec } from './kit';

const ORC_SHOULDER = 0.288;
const GY_SHOULDER = 0.373;

type V3 = [number, number, number];

// ---------------------------------------------------------------------------------------------
// Orc Warlord (Town 1)

const ORC_SKIN = [0x7fcf6a, 0x3f8f4a] as const;
const IRON = [0xb4bcd8, 0x6a6f88] as const;
const WAR_RED = [0xd8503a, 0x8e3434] as const;
const WARLORD_EYES = 0xff4a2a;

const AXE_GRIP: V3 = [-0.37, ORC_SHOULDER, 0.02];
const AXE = heldPole(AXE_GRIP, 0.78, 0.08, 0.3, 1.35, PALETTE.brown, 0.05);
/** Giant cleaver-axe: a long haft, a broad iron blade with a bright edge, a top spike. */
const AXE_PIECES: BodyPiece[] = [
  AXE.piece,
  { bone: 'arm-right', shape: 'box', size: [0.24, 0.26, 0.035], at: AXE.place(AXE.top - 0.15, 0, -0.13), rot: AXE.rot, color: IRON },
  { bone: 'arm-right', shape: 'box', size: [0.04, 0.28, 0.04], at: AXE.place(AXE.top - 0.15, 0, -0.26), rot: AXE.rot, color: PALETTE.white },
  { bone: 'arm-right', shape: 'cone', size: [0.07, 0.14, 0.07], at: AXE.place(AXE.top + 0.06), rot: AXE.rot, color: IRON, sides: 4 },
];

/** Orc Warlord: a hulking green chieftain in a horned iron helm, spiked pauldrons, a war-kilt, a banner on his back and a huge cleaver-axe. */
export const WARLORD: BodySpec = {
  note: 'Orc Warlord: a hulking green orc chieftain in a horned iron helm with glowing red eyes in the visor slit, an under-bite with two tusks, massive spiked iron pauldrons, a red war-kilt, a tall tattered red war banner with a pale skull on his back and a giant cleaver-axe.',
  pieces: [
    // Thick legs in dark trousers, iron boots.
    { bone: 'leg-left', shape: 'rbox', size: [0.14, 0.12, 0.15], at: [0.088, 0.12, -0.02], color: PALETTE.ink, mirror: true },
    { bone: 'leg-left', shape: 'rbox', size: [0.16, 0.08, 0.2], at: [0.088, 0.04, 0.0], color: IRON, mirror: true },
    // Barrel chest, a red war-kilt with a front flap, a dark belt with a bone skull buckle.
    { bone: 'torso', shape: 'rbox', size: [0.38, 0.22, 0.27], at: [0, 0.3, -0.01], color: ORC_SKIN },
    { bone: 'torso', shape: 'rbox', size: [0.42, 0.11, 0.31], at: [0, 0.18, -0.02], color: WAR_RED },
    { bone: 'torso', shape: 'cone', size: [0.16, 0.12, 0.05], at: [0, 0.12, 0.13], rot: [Math.PI, 0, 0], color: WAR_RED, sides: 3 },
    { bone: 'torso', shape: 'rbox', size: [0.4, 0.06, 0.3], at: [0, 0.235, -0.01], color: PALETTE.charcoal },
    { bone: 'torso', shape: 'rbox', size: [0.08, 0.075, 0.03], at: [0, 0.235, 0.15], color: PALETTE.cream },
    // Massive spiked iron pauldrons riding on the arms.
    { bone: 'arm-left', shape: 'rbox', size: [0.22, 0.13, 0.25], at: [0.17, 0.36, -0.01], color: IRON, mirror: true },
    { bone: 'arm-left', shape: 'cone', size: [0.08, 0.17, 0.08], at: [0.21, 0.47, -0.01], rot: [0, 0, -0.45], color: PALETTE.white, sides: 4, mirror: true },
    // Thick green arms, red-leather bracers, big fists.
    { bone: 'arm-left', shape: 'rbox', size: [0.16, 0.14, 0.14], at: [0.21, ORC_SHOULDER, -0.01], color: ORC_SKIN, mirror: true },
    { bone: 'arm-left', shape: 'rbox', size: [0.08, 0.16, 0.16], at: [0.3, ORC_SHOULDER, -0.01], color: PALETTE.rust, mirror: true },
    { bone: 'arm-left', shape: 'rbox', size: [0.11, 0.14, 0.14], at: [0.37, ORC_SHOULDER, 0.0], color: ORC_SKIN, mirror: true },
    // Big green head under a horned iron helm: a dark visor slit with glowing red eyes, a jutting jaw and tusks.
    { bone: 'head', shape: 'rbox', size: [0.42, 0.34, 0.34], at: [0, 0.5, 0.04], color: ORC_SKIN },
    { bone: 'head', shape: 'rbox', size: [0.46, 0.15, 0.39], at: [0, 0.645, 0.03], color: PALETTE.slate },
    { bone: 'head', shape: 'box', size: [0.34, 0.06, 0.02], at: [0, 0.55, 0.215], color: PALETTE.charcoal },
    { bone: 'head', shape: 'box', size: [0.075, 0.035, 0.01], at: [0.09, 0.552, 0.228], color: WARLORD_EYES, glow: true, mirror: true },
    { bone: 'head', shape: 'rbox', size: [0.36, 0.1, 0.08], at: [0, 0.39, 0.2], color: ORC_SKIN },
    { bone: 'head', shape: 'cone', size: [0.055, 0.12, 0.055], at: [0.11, 0.47, 0.235], color: PALETTE.cream, sides: 4, mirror: true },
    // Curving horns: out from the helm, then up.
    { bone: 'head', shape: 'cone', size: [0.14, 0.24, 0.14], at: [0.31, 0.66, 0.02], rot: [0, 0, -1.25], color: PALETTE.cream, sides: 6, mirror: true },
    { bone: 'head', shape: 'cone', size: [0.1, 0.24, 0.1], at: [0.43, 0.79, 0.02], rot: [0, 0, -0.25], color: PALETTE.cream, sides: 6, mirror: true },
    // War banner on his back: a pole and crossbar, a tattered red cloth with a pale skull on both faces.
    { bone: 'torso', shape: 'cylinder', size: [0.035, 0.95, 0.035], at: [0.12, 0.62, -0.18], color: PALETTE.brown, sides: 6 },
    { bone: 'torso', shape: 'cylinder', size: [0.025, 0.34, 0.025], at: [0.0, 1.06, -0.18], rot: [0, 0, Math.PI / 2], color: PALETTE.brown, sides: 6 },
    { bone: 'torso', shape: 'box', size: [0.3, 0.3, 0.02], at: [-0.01, 0.9, -0.19], color: WAR_RED },
    { bone: 'torso', shape: 'cone', size: [0.1, 0.12, 0.02], at: [0.09, 0.69, -0.19], rot: [Math.PI, 0, 0], color: WAR_RED, sides: 3 },
    { bone: 'torso', shape: 'cone', size: [0.1, 0.12, 0.02], at: [-0.11, 0.69, -0.19], rot: [Math.PI, 0, 0], color: WAR_RED, sides: 3 },
    { bone: 'torso', shape: 'rbox', size: [0.12, 0.12, 0.035], at: [-0.01, 0.91, -0.19], color: PALETTE.cream },
    { bone: 'torso', shape: 'box', size: [0.035, 0.03, 0.04], at: [-0.035, 0.92, -0.19], color: PALETTE.charcoal },
    { bone: 'torso', shape: 'box', size: [0.035, 0.03, 0.04], at: [0.015, 0.92, -0.19], color: PALETTE.charcoal },
    // Giant cleaver-axe.
    ...AXE_PIECES,
  ],
};

// ---------------------------------------------------------------------------------------------
// River Troll (Town 2)

const TROLL_SKIN = [0x6fb59a, 0x3d7a6e] as const;
const TROLL_BELLY = [0xa8cf9a, 0x78a87e] as const;
const MOSS = [0x78b852, 0x4a8a3e] as const;
const REED = [0xd8c87a, 0x8a9a4e] as const;
const DRIFTWOOD = [0xd2bfa2, 0x8e7a68] as const;
const TROLL_EYES = 0xffe04a;

const CLUB_GRIP: V3 = [-0.47, GY_SHOULDER, 0.02];
const CLUB = heldPole(CLUB_GRIP, 0.6, 0.08, 0.15, 1.05, DRIFTWOOD, 0.07);
/** Gnarled driftwood club: a thick knotted head, a moss band and a broken branch stub. */
const CLUB_PIECES: BodyPiece[] = [
  CLUB.piece,
  { bone: 'arm-right', shape: 'rbox', size: [0.15, 0.22, 0.15], at: CLUB.place(CLUB.top - 0.04), rot: CLUB.rot, color: DRIFTWOOD },
  { bone: 'arm-right', shape: 'rbox', size: [0.11, 0.1, 0.11], at: CLUB.place(CLUB.top + 0.1, 0.02, 0.02), rot: CLUB.rot, color: DRIFTWOOD },
  { bone: 'arm-right', shape: 'cone', size: [0.05, 0.12, 0.05], at: CLUB.place(CLUB.top - 0.08, 0, -0.1), rot: [CLUB.rot[0], CLUB.rot[1], CLUB.rot[2] + 1.0], color: DRIFTWOOD, sides: 5 },
  { bone: 'arm-right', shape: 'rbox', size: [0.16, 0.05, 0.16], at: CLUB.place(CLUB.top - 0.1), rot: CLUB.rot, color: MOSS },
];

/** River Troll: hunched and mossy, a small low head with a jutting tusked jaw between huge stone-crusted shoulders, a driftwood club. */
export const TROLL: BodySpec = {
  note: 'River Troll: a hulking hunched teal-green troll, a small head set low and forward between huge mossy shoulders crusted with river stones, a big jutting jaw with two tusks, glowing yellow eyes, reeds on its head, long arms with huge hands and a gnarled driftwood club.',
  pieces: [
    // Short thick legs, big flat feet.
    { bone: 'leg-left', shape: 'rbox', size: [0.15, 0.14, 0.16], at: [0.08, 0.15, 0], color: TROLL_SKIN, mirror: true },
    { bone: 'leg-left', shape: 'rbox', size: [0.17, 0.07, 0.22], at: [0.08, 0.04, 0.03], color: TROLL_SKIN, mirror: true },
    // Pot-bellied body leaning forward, a pale belly, a ragged hide loincloth.
    { bone: 'torso', shape: 'rbox', size: [0.42, 0.3, 0.32], at: [0, 0.37, 0.02], rot: [0.3, 0, 0], color: TROLL_SKIN },
    { bone: 'torso', shape: 'rbox', size: [0.28, 0.17, 0.05], at: [0, 0.32, 0.17], rot: [0.2, 0, 0], color: TROLL_BELLY },
    { bone: 'torso', shape: 'rbox', size: [0.38, 0.1, 0.3], at: [0, 0.24, 0], color: PALETTE.brown },
    { bone: 'torso', shape: 'cone', size: [0.14, 0.12, 0.05], at: [0, 0.16, 0.13], rot: [Math.PI, 0, 0], color: PALETTE.brown, sides: 3 },
    // Huge hunched shoulders, moss on top, river stones crusted in.
    { bone: 'torso', shape: 'rbox', size: [0.24, 0.2, 0.28], at: [0.17, 0.5, -0.04], rot: [0, 0, -0.25], color: TROLL_SKIN, mirror: true },
    { bone: 'torso', shape: 'sphere', size: [0.24, 0.11, 0.26], at: [0.18, 0.6, -0.05], rot: [0, 0, -0.25], color: MOSS, sides: 7, mirror: true },
    { bone: 'torso', shape: 'rbox', size: [0.1, 0.08, 0.1], at: [0.27, 0.58, 0.06], rot: [0.3, 0.5, 0.2], color: PALETTE.slate, mirror: true },
    { bone: 'torso', shape: 'rbox', size: [0.08, 0.07, 0.08], at: [0.14, 0.64, -0.12], rot: [0.2, 0.8, 0], color: PALETTE.slate, mirror: true },
    // Long arms with huge hands.
    { bone: 'arm-left', shape: 'rbox', size: [0.2, 0.15, 0.15], at: [0.22, GY_SHOULDER, 0], color: TROLL_SKIN, mirror: true },
    { bone: 'arm-left', shape: 'rbox', size: [0.16, 0.17, 0.17], at: [0.37, GY_SHOULDER, 0], color: TROLL_SKIN, mirror: true },
    { bone: 'arm-left', shape: 'rbox', size: [0.13, 0.19, 0.2], at: [0.48, GY_SHOULDER, 0.01], color: TROLL_BELLY, mirror: true },
    // Small head low and forward: a big jutting jaw with tusks, a heavy brow, glowing eyes, a big nose.
    { bone: 'head', shape: 'rbox', size: [0.27, 0.22, 0.25], at: [0, 0.53, 0.15], color: TROLL_SKIN },
    { bone: 'head', shape: 'rbox', size: [0.33, 0.11, 0.26], at: [0, 0.43, 0.2], color: TROLL_BELLY },
    { bone: 'head', shape: 'cone', size: [0.06, 0.13, 0.06], at: [0.11, 0.51, 0.31], color: PALETTE.cream, sides: 4, mirror: true },
    { bone: 'head', shape: 'rbox', size: [0.29, 0.05, 0.07], at: [0, 0.6, 0.27], color: [0x4f8e78, 0x3d6e60] },
    { bone: 'head', shape: 'box', size: [0.06, 0.04, 0.01], at: [0.07, 0.567, 0.28], color: TROLL_EYES, glow: true, mirror: true },
    { bone: 'head', shape: 'rbox', size: [0.08, 0.08, 0.07], at: [0, 0.52, 0.29], color: TROLL_SKIN },
    { bone: 'head', shape: 'cone', size: [0.07, 0.14, 0.05], at: [0.16, 0.56, 0.12], rot: [0, 0, -1.3], color: TROLL_SKIN, sides: 4, mirror: true },
    // Moss on the head, a few reeds sticking up.
    { bone: 'head', shape: 'sphere', size: [0.3, 0.1, 0.26], at: [0, 0.645, 0.13], color: MOSS, sides: 7 },
    { bone: 'head', shape: 'cylinder', size: [0.025, 0.2, 0.025], at: [0.06, 0.74, 0.1], rot: [-0.2, 0, -0.25], color: REED, sides: 4 },
    { bone: 'head', shape: 'cylinder', size: [0.025, 0.24, 0.025], at: [-0.03, 0.76, 0.12], rot: [0.1, 0, 0.15], color: REED, sides: 4 },
    { bone: 'head', shape: 'cylinder', size: [0.025, 0.16, 0.025], at: [-0.1, 0.72, 0.1], rot: [-0.1, 0, 0.5], color: REED, sides: 4 },
    // Gnarled driftwood club.
    ...CLUB_PIECES,
  ],
};

// ---------------------------------------------------------------------------------------------
// Gravekeeper (Town 3)

const COAT = [0x6a4f8a, 0x3a2c56] as const;
const COAT_DARK = [0x4c3a66, 0x2c2240] as const;
const SKULL = [0xf2eee2, 0xb8b0a4] as const;
const GHOST_GREEN = 0x8dff6a;

const SHOVEL_GRIP: V3 = [-0.38, GY_SHOULDER, 0.02];
const SHOVEL = heldPole(SHOVEL_GRIP, 0.76, 0.08, 0.0, 1.2, PALETTE.brown, 0.04);
/** Huge grave shovel: a long haft with a T-grip below the hand, a broad iron blade on top. */
const SHOVEL_PIECES: BodyPiece[] = [
  SHOVEL.piece,
  { bone: 'arm-right', shape: 'cylinder', size: [0.03, 0.1, 0.03], at: SHOVEL.place(-0.06), rot: [SHOVEL.rot[0], SHOVEL.rot[1], SHOVEL.rot[2] + Math.PI / 2], color: PALETTE.brown, sides: 5 },
  { bone: 'arm-right', shape: 'rbox', size: [0.21, 0.3, 0.03], at: SHOVEL.place(SHOVEL.top + 0.13), rot: SHOVEL.rot, color: PALETTE.steel },
];

/** Gravekeeper: a tall gaunt undertaker with a skull face under a battered top hat, a ragged coat with tails, a green lantern and a huge grave shovel. */
export const GRAVEKEEPER: BodySpec = {
  note: 'Gravekeeper: a tall gaunt undertaker with a pale skull face and glowing green eyes under a battered top hat, a ragged dark-purple coat with long tails, a lantern glowing green in one hand and a huge grave shovel in the other.',
  pieces: [
    // Thin dark legs, pointed charcoal boots.
    { bone: 'leg-left', shape: 'rbox', size: [0.1, 0.16, 0.11], at: [0.07, 0.13, 0], color: PALETTE.charcoal, mirror: true },
    { bone: 'leg-left', shape: 'rbox', size: [0.12, 0.06, 0.18], at: [0.07, 0.035, 0.03], color: PALETTE.ink, mirror: true },
    // Narrow coat: a high collar, a pale shirt front, a flaring ragged skirt and long tails behind.
    { bone: 'torso', shape: 'rbox', size: [0.27, 0.25, 0.21], at: [0, 0.36, 0], color: COAT },
    { bone: 'torso', shape: 'box', size: [0.07, 0.2, 0.01], at: [0, 0.37, 0.106], color: PALETTE.white },
    { bone: 'torso', shape: 'rbox', size: [0.33, 0.08, 0.25], at: [0, 0.47, -0.01], color: COAT_DARK },
    { bone: 'torso', shape: 'rbox', size: [0.32, 0.13, 0.25], at: [0, 0.2, -0.005], color: COAT_DARK },
    { bone: 'torso', shape: 'cone', size: [0.09, 0.1, 0.04], at: [0.1, 0.1, 0.1], rot: [Math.PI, 0, 0], color: COAT_DARK, sides: 3, mirror: true },
    { bone: 'torso', shape: 'rbox', size: [0.1, 0.26, 0.03], at: [0.055, 0.16, -0.13], rot: [0.15, 0, 0.06], color: COAT_DARK, mirror: true },
    { bone: 'torso', shape: 'cone', size: [0.1, 0.1, 0.03], at: [0.06, -0.01, -0.155], rot: [Math.PI + 0.15, 0, 0], color: COAT_DARK, sides: 3, mirror: true },
    // Long thin sleeves, ragged cuffs, bony hands.
    { bone: 'arm-left', shape: 'rbox', size: [0.2, 0.11, 0.11], at: [0.22, GY_SHOULDER, 0], color: COAT, mirror: true },
    { bone: 'arm-left', shape: 'rbox', size: [0.06, 0.15, 0.15], at: [0.32, GY_SHOULDER, 0], color: COAT_DARK, mirror: true },
    { bone: 'arm-left', shape: 'rbox', size: [0.08, 0.08, 0.08], at: [0.38, GY_SHOULDER, 0], color: SKULL, mirror: true },
    // Skull face: dark sockets with glowing green eyes, a nose hole, a grim row of teeth.
    { bone: 'head', shape: 'rbox', size: [0.34, 0.33, 0.3], at: [0, 0.62, 0.02], color: SKULL },
    { bone: 'head', shape: 'rbox', size: [0.1, 0.08, 0.02], at: [0.075, 0.64, 0.17], color: PALETTE.charcoal, mirror: true },
    { bone: 'head', shape: 'box', size: [0.05, 0.04, 0.01], at: [0.075, 0.64, 0.182], color: GHOST_GREEN, glow: true, mirror: true },
    { bone: 'head', shape: 'box', size: [0.04, 0.045, 0.01], at: [0, 0.575, 0.172], color: PALETTE.charcoal },
    { bone: 'head', shape: 'box', size: [0.16, 0.045, 0.01], at: [0, 0.51, 0.172], color: PALETTE.charcoal },
    { bone: 'head', shape: 'box', size: [0.13, 0.022, 0.01], at: [0, 0.51, 0.178], color: PALETTE.cream },
    // Battered top hat: a wide brim, a tall crown leaning to one side, a purple band.
    { bone: 'head', shape: 'rbox', size: [0.5, 0.04, 0.44], at: [0, 0.79, 0.01], rot: [0.05, 0, 0.06], color: PALETTE.charcoal },
    { bone: 'head', shape: 'rbox', size: [0.29, 0.3, 0.27], at: [0.02, 0.95, 0.0], rot: [0, 0, -0.12], color: PALETTE.charcoal },
    { bone: 'head', shape: 'rbox', size: [0.3, 0.05, 0.28], at: [0.01, 0.84, 0.0], rot: [0, 0, -0.12], color: PALETTE.purple },
    // Lantern hanging from the left hand, glowing green.
    { bone: 'arm-left', shape: 'cylinder', size: [0.015, 0.05, 0.015], at: [0.43, GY_SHOULDER, 0], rot: [0, 0, Math.PI / 2], color: PALETTE.charcoal, sides: 4 },
    { bone: 'arm-left', shape: 'rbox', size: [0.035, 0.15, 0.15], at: [0.465, GY_SHOULDER, 0], color: PALETTE.charcoal },
    { bone: 'arm-left', shape: 'rbox', size: [0.13, 0.11, 0.11], at: [0.545, GY_SHOULDER, 0], color: GHOST_GREEN, glow: true },
    { bone: 'arm-left', shape: 'rbox', size: [0.035, 0.15, 0.15], at: [0.625, GY_SHOULDER, 0], color: PALETTE.charcoal },
    // Huge grave shovel.
    ...SHOVEL_PIECES,
  ],
};

// ---------------------------------------------------------------------------------------------
// Frost Giant (Town 4)

const GIANT_SKIN = [0x8fa6d6, 0x5a6fa6] as const;
const GIANT_HIDE = [0x5f7ab8, 0x3e4f8a] as const;
const GIANT_FUR = [0xf2f6ff, 0xb2bcd6] as const;
const MANTLE = [0xc8b4a0, 0x8a7464] as const;
const ICE_GLOW = [0xe0fbff, 0x7fd8ff] as const;
const GIANT_EYES = 0xbff6ff;

const ICE_CLUB_GRIP: V3 = [-0.37, ORC_SHOULDER, 0.02];
const ICE_CLUB = heldPole(ICE_CLUB_GRIP, 0.56, 0.08, 0.75, 1.65, PALETTE.brown, 0.06);
/** Giant club of glowing ice crystal on a wooden haft. */
const ICE_CLUB_PIECES: BodyPiece[] = [
  ICE_CLUB.piece,
  { bone: 'arm-right', shape: 'cone', size: [0.28, 0.14, 0.28], at: ICE_CLUB.place(ICE_CLUB.top + 0.05), rot: ICE_CLUB.rotDown, color: ICE_GLOW, sides: 4, glow: true },
  { bone: 'arm-right', shape: 'cone', size: [0.28, 0.32, 0.28], at: ICE_CLUB.place(ICE_CLUB.top + 0.28), rot: ICE_CLUB.rot, color: ICE_GLOW, sides: 4, glow: true },
  { bone: 'arm-right', shape: 'cone', size: [0.12, 0.22, 0.12], at: ICE_CLUB.place(ICE_CLUB.top + 0.16, 0, -0.14), rot: [ICE_CLUB.rot[0], ICE_CLUB.rot[1], ICE_CLUB.rot[2] - 0.7], color: ICE_GLOW, sides: 4, glow: true },
  { bone: 'arm-right', shape: 'cone', size: [0.11, 0.2, 0.11], at: ICE_CLUB.place(ICE_CLUB.top + 0.14, 0, 0.13), rot: [ICE_CLUB.rot[0], ICE_CLUB.rot[1], ICE_CLUB.rot[2] + 0.7], color: ICE_GLOW, sides: 4, glow: true },
];

/** Frost Giant: a slate-blue giant with a huge white icicle-tipped beard, a horned helm crowned with glowing ice, a fur mantle and an ice-crystal club. */
export const FROST_GIANT: BodySpec = {
  note: 'Frost Giant: a massive slate-blue ice giant with a huge white beard hanging in icicles, a horned iron helm crowned with glowing ice crystals, glowing pale eyes, a white fur mantle and a giant club of glowing ice crystal.',
  pieces: [
    // Hide trousers, big fur boots.
    { bone: 'leg-left', shape: 'rbox', size: [0.14, 0.12, 0.15], at: [0.088, 0.12, -0.02], color: GIANT_HIDE, mirror: true },
    { bone: 'leg-left', shape: 'rbox', size: [0.17, 0.09, 0.2], at: [0.088, 0.045, 0.0], color: GIANT_FUR, mirror: true },
    // Broad bare chest, a hide kilt with a dark belt, a white fur mantle over the shoulders.
    { bone: 'torso', shape: 'rbox', size: [0.38, 0.22, 0.27], at: [0, 0.29, -0.01], color: GIANT_SKIN },
    { bone: 'torso', shape: 'rbox', size: [0.42, 0.11, 0.31], at: [0, 0.18, -0.02], color: GIANT_HIDE },
    { bone: 'torso', shape: 'rbox', size: [0.4, 0.05, 0.3], at: [0, 0.235, -0.01], color: PALETTE.charcoal },
    { bone: 'torso', shape: 'rbox', size: [0.54, 0.13, 0.36], at: [0, 0.38, -0.02], color: MANTLE },
    { bone: 'torso', shape: 'cone', size: [0.14, 0.14, 0.06], at: [0.12, 0.3, -0.17], rot: [Math.PI - 0.2, 0, 0], color: MANTLE, sides: 4, mirror: true },
    // Thick arms, fur cuffs, big fists.
    { bone: 'arm-left', shape: 'rbox', size: [0.17, 0.14, 0.14], at: [0.21, ORC_SHOULDER, -0.01], color: GIANT_SKIN, mirror: true },
    { bone: 'arm-left', shape: 'rbox', size: [0.07, 0.17, 0.17], at: [0.3, ORC_SHOULDER, -0.01], color: GIANT_FUR, mirror: true },
    { bone: 'arm-left', shape: 'rbox', size: [0.11, 0.14, 0.14], at: [0.37, ORC_SHOULDER, 0.0], color: GIANT_SKIN, mirror: true },
    // Big head: glowing eyes under the helm, a white moustache and a huge beard ending in icicles.
    { bone: 'head', shape: 'rbox', size: [0.4, 0.32, 0.32], at: [0, 0.5, 0.04], color: GIANT_SKIN },
    { bone: 'head', shape: 'box', size: [0.07, 0.04, 0.01], at: [0.085, 0.56, 0.205], color: GIANT_EYES, glow: true, mirror: true },
    { bone: 'head', shape: 'rbox', size: [0.42, 0.26, 0.12], at: [0, 0.38, 0.17], color: GIANT_FUR },
    { bone: 'head', shape: 'rbox', size: [0.26, 0.06, 0.05], at: [0, 0.49, 0.235], color: PALETTE.white },
    { bone: 'head', shape: 'cone', size: [0.07, 0.14, 0.07], at: [0.12, 0.2, 0.18], rot: [Math.PI, 0, 0], color: ICE_GLOW, sides: 4, glow: true, mirror: true },
    { bone: 'head', shape: 'cone', size: [0.08, 0.18, 0.08], at: [0, 0.18, 0.19], rot: [Math.PI, 0, 0], color: ICE_GLOW, sides: 4, glow: true },
    // Horned iron helm crowned with glowing ice crystals.
    { bone: 'head', shape: 'rbox', size: [0.44, 0.13, 0.36], at: [0, 0.675, 0.03], color: PALETTE.slate },
    { bone: 'head', shape: 'rbox', size: [0.46, 0.05, 0.38], at: [0, 0.615, 0.03], color: PALETTE.steel },
    { bone: 'head', shape: 'cone', size: [0.13, 0.2, 0.13], at: [0.28, 0.69, 0.02], rot: [0, 0, -1.0], color: PALETTE.cream, sides: 6, mirror: true },
    { bone: 'head', shape: 'cone', size: [0.1, 0.22, 0.1], at: [0.35, 0.82, 0.02], rot: [0, 0, -0.1], color: PALETTE.cream, sides: 6, mirror: true },
    { bone: 'head', shape: 'cone', size: [0.13, 0.34, 0.13], at: [0, 0.89, 0.04], color: ICE_GLOW, sides: 4, glow: true },
    { bone: 'head', shape: 'cone', size: [0.1, 0.24, 0.1], at: [0.11, 0.84, 0.05], rot: [0, 0, -0.35], color: ICE_GLOW, sides: 4, glow: true, mirror: true },
    // Giant club of glowing ice crystal on a wooden haft.
    ...ICE_CLUB_PIECES,
  ],
};

/**
 * The held weapon or tool of each boss, by sheet, and where the hand grips it (model space, rest
 * pose): tests check it never passes through the head in idle, walk or attack.
 */
export const HELD_ITEMS: Record<string, { grip: V3; pieces: readonly BodyPiece[] }> = {
  warlord: { grip: AXE_GRIP, pieces: AXE_PIECES },
  troll: { grip: CLUB_GRIP, pieces: CLUB_PIECES },
  gravekeeper: { grip: SHOVEL_GRIP, pieces: SHOVEL_PIECES },
  frostGiant: { grip: ICE_CLUB_GRIP, pieces: ICE_CLUB_PIECES },
};
