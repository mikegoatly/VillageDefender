// Shared simulation types. The sim is pure TypeScript: no Phaser, no DOM.
//
// Coordinates: the sim runs on the ground plane in **cell units** (one Sketch tile = 1).
// x grows along grid axis i, y along grid axis j. Rendering projects to isometric screen space.

export interface Vec2 {
  x: number;
  y: number;
}

/**
 * One player's controls for one tick. Produced by src/input, consumed by the sim.
 * `move` is in **screen space** (x right, y down), length 0..1 (analogue sticks may be < 1).
 * The sim converts it to a ground direction (movement is screen-relative, decision 4).
 */
export interface InputState {
  move: Vec2;
  /** Basic attack held (auto-aims at the nearest enemy while held). */
  attack: boolean;
  /** Dodge pressed this tick or held; the sim only triggers on the rising edge. */
  dodge: boolean;
  ability1: boolean;
  ability2: boolean;
  rally: boolean;
  pause: boolean;
}

export function emptyInput(): InputState {
  return { move: { x: 0, y: 0 }, attack: false, dodge: false, ability1: false, ability2: false, rally: false, pause: false };
}

export type InputDevice = 'keyboard' | 'gamepad' | 'touch';
