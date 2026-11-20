// Shared vocabulary for monster bodies (see render3d/bodies.ts for the format and the style guide).
// Kept apart from bodies.ts so the per-town body files can import it without an import cycle.

export type BoneName = 'root' | 'torso' | 'head' | 'arm-left' | 'arm-right' | 'leg-left' | 'leg-right';
export const BONES: readonly BoneName[] = ['root', 'torso', 'head', 'arm-left', 'arm-right', 'leg-left', 'leg-right'];

/**
 * - box: size = width, height, depth (rbox: the same with soft rounded edges, smooth shaded)
 * - cylinder / cone: size = x diameter, height (along Y before rotation), z diameter; `sides` 3–16 (3 = prism/wedge, 4 = diamond)
 * - sphere: size = diameters (low poly)
 */
export type Shape = 'box' | 'rbox' | 'cylinder' | 'cone' | 'sphere';

/**
 * Kenney colormap swatches as [top, bottom] gradients (mini-dungeon/Textures/colormap.png). A piece
 * coloured with one runs from `top` at its highest point to `bottom` at its lowest.
 */
export const PALETTE = {
  blue: [0x6691d7, 0x5857bd], ice: [0xcae3fd, 0x6c98db], purple: [0xa475e5, 0x5e3bb9], pink: [0xef78f0, 0xaa77e7],
  peach: [0xed946a, 0xb36343], brown: [0xad5f41, 0x845442], tan: [0xf0bc96, 0xca845c], cream: [0xfce2c4, 0xf3ca98],
  green: [0x5dc789, 0x1c856a], yellow: [0xffd263, 0xff952f], orange: [0xff9b44, 0xff7344], red: [0xfc6c41, 0xd1544e],
  steel: [0xc1caf2, 0x797e97], clay: [0xd5845a, 0xbf5c43], rust: [0xba5a42, 0x7c4d48], charcoal: [0x464650, 0x353539],
  slate: [0x84899f, 0x636378], ink: [0x535666, 0x3b3e4a], white: [0xfbfbfd, 0xbebed6],
} as const satisfies Record<string, readonly [number, number]>;

/** A flat colour (shaded a little darker towards the bottom) or a [top, bottom] gradient. */
export type PieceColor = number | readonly [number, number];
/** How much darker a flat colour gets at the bottom of its piece. */
export const FLAT_SHADE = 0.82;

export interface BodyPiece {
  bone: BoneName;
  shape: Shape;
  size: [number, number, number];
  /** Centre, model space at the rest pose. */
  at: [number, number, number];
  /** Euler rotation in radians (XYZ), applied about the centre. */
  rot?: [number, number, number];
  color: PieceColor;
  /** Radial segments for cylinder/cone/sphere (default 8). */
  sides?: number;
  /** Also add the mirror-image twin across x = 0 (left and right bones swapped). */
  mirror?: boolean;
  /** Unlit, full brightness: eyes, lanterns, crystals, runes. */
  glow?: boolean;
}

const MIRROR_BONE: Record<BoneName, BoneName> = {
  root: 'root', torso: 'torso', head: 'head',
  'arm-left': 'arm-right', 'arm-right': 'arm-left', 'leg-left': 'leg-right', 'leg-right': 'leg-left',
};

/** The mirror image of a piece across x = 0: a reflection keeps X rotations and negates Y and Z ones. */
export function mirrorPiece(p: BodyPiece): BodyPiece {
  const [rx, ry, rz] = p.rot ?? [0, 0, 0];
  return { ...p, mirror: false, bone: MIRROR_BONE[p.bone], at: [-p.at[0], p.at[1], p.at[2]], rot: [rx, -ry, -rz] };
}

/** Every piece of a body, with mirrored twins added. */
export function expandPieces(pieces: readonly BodyPiece[]): BodyPiece[] {
  return pieces.flatMap((p) => (p.mirror ? [{ ...p, mirror: false }, mirrorPiece(p)] : [p]));
}

export interface BodySpec {
  /** One line on the look, for reviewers. */
  note: string;
  pieces: BodyPiece[];
}
