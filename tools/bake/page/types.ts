// Shared between the bake page (browser) and run.mjs (node, via JSDoc only).

export interface Attachment {
  model: string;          // path under /assets-src/models, without .glb
  bone: string;           // node name in the character, e.g. 'arm-right'
  position?: [number, number, number];
  rotation?: [number, number, number]; // radians, XYZ euler
  scale?: number;
}

export interface AnimSpec {
  name: string;           // name used in game, e.g. 'walk'
  clip: string;           // glTF clip name, e.g. 'walk'
  frames: number;
  fps: number;
  loop: boolean;
}

export interface CharacterSpec {
  kind: 'character';
  name: string;
  model: string;
  attachments?: Attachment[];
  anims: AnimSpec[];
  /** Model scale multiplier (world units). */
  scale?: number;
}

export interface Part {
  model: string;
  position?: [number, number, number];
  rotationY?: number;     // radians
  scale?: number;
}

export interface StaticSpec {
  kind: 'static';
  name: string;
  parts: Part[];
  /** Number of view rotations to bake (1 or 4). */
  views: 1 | 4;
  cellWidth: number;
  cellHeight: number;
  /** Ground origin position inside the cell, in pixels. */
  pivotX: number;
  pivotY: number;
}

export type BakeSpec = CharacterSpec | StaticSpec;

export interface BakeGlobals {
  /** Camera elevation above the ground plane, radians. */
  elevation: number;
  /** Screen pixels per world unit (before any in-game display scaling). */
  pixelsPerUnit: number;
  outline: { radius: number; color: [number, number, number] };
  character: { cellWidth: number; cellHeight: number; pivotX: number; pivotY: number };
}

/** Screen-space facing directions, y down. Index * 45° = screen angle. */
export const DIRECTIONS = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'] as const;
export type Direction = (typeof DIRECTIONS)[number];

export interface SheetMeta {
  name: string;
  image: string;
  frameWidth: number;
  frameHeight: number;
  pivotX: number;
  pivotY: number;
  columns: number;
  frameCount: number;
  /** character sheets */
  directions?: readonly Direction[];
  anims?: Record<string, { frames: number; fps: number; loop: boolean; start: Record<Direction, number> }>;
  /** static sheets: frame index per view rotation */
  views?: number;
}

export interface BakeResult {
  png: string; // data URL
  meta: SheetMeta;
}
