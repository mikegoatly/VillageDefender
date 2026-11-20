// Bodies for the caster monsters that hang back and must be chased down: the necromancer and the
// frost shaman. Designed with `node tools/lineup.mjs [--town <id>] <kind> vampire`.
//
// Both keep the graveyard/character-vampire rig (its clips): legs from y 0.223 at x ±0.074,
// shoulders y 0.373 at x ±0.125 (hands near ±0.39), neck y 0.447.
//
// The staff runs from the right hand up the arm's +X (towards the shoulder: up while the arm
// hangs) leaning forward along +Z, so it stands in front of the body at rest and is raised in the swing.

import { heldPole, PALETTE, type BodySpec, type PieceColor } from './kit';

const SHOULDER = 0.373;

/** A staff in the right hand (see heldPole). */
function staff(length: number, below: number, lean: number, splay: number, wood: PieceColor) {
  return heldPole([-0.38, SHOULDER, 0.02], length, below, lean, splay, wood);
}

const ROBE_DARK = [0x8a5cd0, 0x4a2c94] as const;
const BONE = PALETTE.cream;
const NECRO_GLOW = 0x8dff6a;

const NS = staff(0.8, 0.14, 0.4, 0.8, PALETTE.brown);

/** Necromancer: a hunched purple-robed caster under a tall pointed hood, a skull-lantern staff. */
export const NECROMANCER: BodySpec = {
  note: 'Necromancer: a hunched toy caster in a purple robe flaring to the hem, a tall pointed hood over a dark face with glowing green eyes, bony cream hands and a long staff topped with a cream skull lantern glowing green.',
  pieces: [
    // Short legs under the robe: dark trousers, charcoal shoes.
    { bone: 'leg-left', shape: 'rbox', size: [0.12, 0.1, 0.13], at: [0.074, 0.11, 0], color: PALETTE.ink, mirror: true },
    { bone: 'leg-left', shape: 'rbox', size: [0.13, 0.06, 0.17], at: [0.074, 0.035, 0.02], color: PALETTE.charcoal, mirror: true },
    // Robe: a hunched upper body, a skirt flaring wide to the hem, a dark rope belt with a bone clasp.
    { bone: 'torso', shape: 'rbox', size: [0.3, 0.2, 0.24], at: [0, 0.37, -0.01], rot: [0.2, 0, 0], color: PALETTE.purple },
    { bone: 'torso', shape: 'rbox', size: [0.4, 0.17, 0.32], at: [0, 0.205, 0], color: ROBE_DARK },
    { bone: 'torso', shape: 'rbox', size: [0.33, 0.045, 0.27], at: [0, 0.29, 0.005], color: PALETTE.ink },
    { bone: 'torso', shape: 'rbox', size: [0.07, 0.06, 0.03], at: [0, 0.29, 0.145], color: BONE },
    // Stubby flared sleeves, bony hands.
    { bone: 'arm-left', shape: 'rbox', size: [0.14, 0.13, 0.13], at: [0.19, SHOULDER, 0], color: PALETTE.purple, mirror: true },
    { bone: 'arm-left', shape: 'rbox', size: [0.09, 0.17, 0.17], at: [0.29, SHOULDER, 0], color: ROBE_DARK, mirror: true },
    { bone: 'arm-left', shape: 'rbox', size: [0.08, 0.09, 0.09], at: [0.37, SHOULDER, 0], color: BONE, mirror: true },
    // Big hood rising to a tall point that flops back, a dark face opening with glowing eyes.
    { bone: 'head', shape: 'rbox', size: [0.46, 0.4, 0.38], at: [0, 0.645, 0.02], color: PALETTE.purple },
    { bone: 'head', shape: 'cone', size: [0.4, 0.44, 0.36], at: [0, 1.0, -0.07], rot: [-0.4, 0, 0], color: PALETTE.purple, sides: 6 },
    { bone: 'head', shape: 'rbox', size: [0.32, 0.25, 0.02], at: [0, 0.62, 0.205], color: PALETTE.charcoal },
    { bone: 'head', shape: 'rbox', size: [0.48, 0.07, 0.07], at: [0, 0.775, 0.19], color: ROBE_DARK },
    { bone: 'head', shape: 'box', size: [0.075, 0.04, 0.01], at: [0.075, 0.645, 0.218], color: NECRO_GLOW, glow: true, mirror: true },
    // Staff with a skull lantern: a bone skull with glowing sockets and a green flame on top.
    NS.piece,
    { bone: 'arm-right', shape: 'rbox', size: [0.15, 0.15, 0.14], at: NS.place(NS.top + 0.05), rot: NS.rot, color: BONE },
    { bone: 'arm-right', shape: 'box', size: [0.04, 0.035, 0.01], at: NS.place(NS.top + 0.06, 0.072, 0.035), rot: NS.rot, color: NECRO_GLOW, glow: true },
    { bone: 'arm-right', shape: 'box', size: [0.04, 0.035, 0.01], at: NS.place(NS.top + 0.06, 0.072, -0.035), rot: NS.rot, color: NECRO_GLOW, glow: true },
    { bone: 'arm-right', shape: 'cone', size: [0.11, 0.17, 0.11], at: NS.place(NS.top + 0.2), rot: NS.rot, color: NECRO_GLOW, sides: 5, glow: true },
  ],
};

/** Frost shaman colours: a mid-tone hide so it reads against snow, a bright ice crown and crystal. */
const HIDE = [0x7d98d6, 0x4f5fa8] as const;
const HIDE_DARK = [0x6478b8, 0x3e4a8a] as const;
const SHAMAN_SKIN = [0xa6b8dc, 0x7086b8] as const;
const FUR = [0xe4ebf8, 0xa2adc8] as const;
const ICE = [0xd8f6ff, 0x5fa8ee] as const;
const SHAMAN_GLOW = 0xbff6ff;
/** The staff's crystal: a deeper cyan than the snow, so it pops. */
const CRYSTAL = 0x7fe4ff;

const SS = staff(0.76, 0.14, 0.4, 0.8, PALETTE.tan);

/** Frost shaman: a hide-robed shaman under a crown of icicles, with an ice-crystal staff. */
export const FROST_SHAMAN: BodySpec = {
  note: 'Frost shaman: a toy shaman in a slate-blue hide robe with a fringed hem under a pale fur mantle, a big crown of icicles, a tall fur hat, dark painted sockets with glowing pale-blue eyes and a staff topped with a glowing ice crystal.',
  pieces: [
    // Short legs: hide trousers, fur boots.
    { bone: 'leg-left', shape: 'rbox', size: [0.12, 0.11, 0.13], at: [0.074, 0.11, 0], color: HIDE_DARK, mirror: true },
    { bone: 'leg-left', shape: 'rbox', size: [0.14, 0.07, 0.18], at: [0.074, 0.04, 0.02], color: FUR, mirror: true },
    // Hide robe with a fringed hem, a fur mantle over the shoulders.
    { bone: 'torso', shape: 'rbox', size: [0.32, 0.26, 0.25], at: [0, 0.31, 0], color: HIDE },
    { bone: 'torso', shape: 'cone', size: [0.08, 0.08, 0.05], at: [0.1, 0.16, 0.1], rot: [Math.PI, 0, 0], color: HIDE_DARK, sides: 3, mirror: true },
    { bone: 'torso', shape: 'cone', size: [0.08, 0.08, 0.05], at: [0, 0.16, 0.11], rot: [Math.PI, 0, 0], color: HIDE_DARK, sides: 3 },
    { bone: 'torso', shape: 'rbox', size: [0.46, 0.12, 0.33], at: [0, 0.43, -0.005], color: FUR },
    // Arms: a hide sleeve, a fur cuff, a hand.
    { bone: 'arm-left', shape: 'rbox', size: [0.15, 0.13, 0.13], at: [0.2, SHOULDER, 0], color: HIDE, mirror: true },
    { bone: 'arm-left', shape: 'rbox', size: [0.06, 0.15, 0.15], at: [0.29, SHOULDER, 0], color: FUR, mirror: true },
    { bone: 'arm-left', shape: 'rbox', size: [0.08, 0.09, 0.1], at: [0.36, SHOULDER, 0], color: SHAMAN_SKIN, mirror: true },
    // Big head with dark painted sockets with glowing eyes, a dark mouth.
    { bone: 'head', shape: 'rbox', size: [0.42, 0.37, 0.35], at: [0, 0.635, 0.01], color: SHAMAN_SKIN },
    { bone: 'head', shape: 'box', size: [0.12, 0.085, 0.01], at: [0.085, 0.655, 0.188], color: PALETTE.ink, mirror: true },
    { bone: 'head', shape: 'box', size: [0.07, 0.045, 0.01], at: [0.085, 0.655, 0.194], color: SHAMAN_GLOW, glow: true, mirror: true },
    { bone: 'head', shape: 'box', size: [0.1, 0.03, 0.01], at: [0, 0.53, 0.188], color: PALETTE.ink },
    // Crown of icicles on a tall fur hat: a tall one in the middle, fanning out to the sides.
    { bone: 'head', shape: 'rbox', size: [0.46, 0.15, 0.39], at: [0, 0.82, 0.0], color: FUR },
    { bone: 'head', shape: 'cone', size: [0.13, 0.42, 0.13], at: [0, 1.07, 0.02], color: ICE, sides: 4 },
    { bone: 'head', shape: 'cone', size: [0.12, 0.33, 0.12], at: [0.12, 1.02, 0.02], rot: [0, 0, -0.3], color: ICE, sides: 4, mirror: true },
    { bone: 'head', shape: 'cone', size: [0.11, 0.25, 0.11], at: [0.22, 0.95, 0.0], rot: [0, 0, -0.75], color: ICE, sides: 4, mirror: true },
    // Staff with a glowing ice crystal on top (a double cone, point up and point down).
    SS.piece,
    { bone: 'arm-right', shape: 'cone', size: [0.17, 0.1, 0.17], at: SS.place(SS.top + 0.05), rot: SS.rotDown, color: CRYSTAL, sides: 4, glow: true },
    { bone: 'arm-right', shape: 'cone', size: [0.17, 0.2, 0.17], at: SS.place(SS.top + 0.2), rot: SS.rot, color: CRYSTAL, sides: 4, glow: true },
  ],
};
