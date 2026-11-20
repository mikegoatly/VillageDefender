// Monster bodies built from simple low-poly pieces on the shared Kenney Mini rig, so a monster can
// look like nothing else in the game while reusing every baked animation (idle, walk, attack, die).
//
// A body replaces all of the base model's meshes. Each piece hangs off one bone and moves with it;
// pieces are given in *model space at the rest pose* (a T-pose: feet on y = 0, facing +Z, the left
// arm stretched along +X), so a designer never deals with bone-local axes. Pieces on the same bone
// are merged into one vertex-coloured mesh, so a body costs one draw call per bone, like a Kenney model.
//
// Rest pose of the rig (mini-dungeon/character-orc, model space, cells): legs hang from y 0.18
// (hips at x ±0.084), the torso pivots at y 0.18, the arms at shoulder height y 0.29 (x ±0.10, the
// arm reaching out along ±X to about ±0.32), the neck at y 0.35. A normal character is ~0.6 tall.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type BoneName = 'root' | 'torso' | 'head' | 'arm-left' | 'arm-right' | 'leg-left' | 'leg-right';
export const BONES: readonly BoneName[] = ['root', 'torso', 'head', 'arm-left', 'arm-right', 'leg-left', 'leg-right'];

/**
 * - box: size = width, height, depth
 * - cylinder / cone: size = x diameter, height (along Y before rotation), z diameter; `sides` 3–16 (3 = prism/wedge, 4 = diamond)
 * - sphere: size = diameters (low poly)
 */
export type Shape = 'box' | 'cylinder' | 'cone' | 'sphere';

export interface BodyPiece {
  bone: BoneName;
  shape: Shape;
  size: [number, number, number];
  /** Centre, model space at the rest pose. */
  at: [number, number, number];
  /** Euler rotation in radians (XYZ), applied about the centre. */
  rot?: [number, number, number];
  color: number;
  /** Radial segments for cylinder/cone/sphere (default 8). */
  sides?: number;
}

export interface BodySpec {
  /** One line on the look, for reviewers. */
  note: string;
  pieces: BodyPiece[];
}

/** Colours of a kobold blaster (see koboldBody). */
interface KoboldPalette {
  skin: number;
  /** Darker skin: hands, feet, ear insides. */
  skinDark: number;
  leather: number;
  leatherDark: number;
  /** One warm accent (bandana, lamp). */
  accent: number;
  eye: number;
  /** Bare feet, or wraps against the cold. */
  feet: number;
}

const POWDER_GOBLIN: KoboldPalette = {
  skin: 0x9aae3e, skinDark: 0x667a26, leather: 0x4e3a30, leatherDark: 0x2a1e18, accent: 0xd0402a, eye: 0xffd23a, feet: 0x667a26,
};
const FROST_KOBOLD: KoboldPalette = {
  skin: 0x6a76a8, skinDark: 0x464f7c, leather: 0x4a3428, leatherDark: 0x2a1e18, accent: 0xffc845, eye: 0xffe070, feet: 0x6e5240,
};

/**
 * Small, hunched kobold/goblin blaster: a big head with long pointy ears and a long nose, a stubby
 * hunched body with a hump, thin arms with big clawed hands, bandy legs on long feet and a little tail.
 * `keg`: a powder keg strapped upright on the back and a lit match in the right hand (the sapper).
 * `miner`: a candle helmet, a satchel with two small kegs on the back and a pickaxe (the kobold).
 */
function koboldBody(c: KoboldPalette, prop: 'keg' | 'miner', note: string): BodySpec {
  const wood = 0x9a6a3a;
  const hoop = 0x3a3a40;
  const metal = 0xa8b0bc;
  const pieces: BodyPiece[] = [
    ...([1, -1] as const).flatMap((s): BodyPiece[] => {
      const leg = s > 0 ? 'leg-left' : 'leg-right';
      const arm = s > 0 ? 'arm-left' : 'arm-right';
      return [
        // Bandy legs: shorts, a thin shin splayed outwards, a long foot with a claw.
        { bone: leg, shape: 'box', size: [0.09, 0.07, 0.1], at: [s * 0.09, 0.145, 0], color: c.leather },
        { bone: leg, shape: 'box', size: [0.05, 0.11, 0.05], at: [s * 0.1, 0.075, 0], rot: [0, 0, s * 0.18], color: c.skin },
        { bone: leg, shape: 'box', size: [0.08, 0.04, 0.16], at: [s * 0.105, 0.02, 0.03], color: c.feet },
        { bone: leg, shape: 'cone', size: [0.04, 0.05, 0.03], at: [s * 0.105, 0.02, 0.13], rot: [Math.PI / 2, 0, 0], color: 0xe8dcc0, sides: 4 },
        // Thin arms, a leather bracer, a big clawed hand.
        { bone: arm, shape: 'sphere', size: [0.08, 0.08, 0.08], at: [s * 0.12, 0.29, 0], color: c.skin, sides: 6 },
        { bone: arm, shape: 'box', size: [0.12, 0.045, 0.045], at: [s * 0.18, 0.288, 0], color: c.skin },
        { bone: arm, shape: 'box', size: [0.08, 0.06, 0.06], at: [s * 0.27, 0.288, 0], color: c.leatherDark },
        { bone: arm, shape: 'box', size: [0.07, 0.075, 0.08], at: [s * 0.34, 0.288, 0], color: c.skinDark },
        { bone: arm, shape: 'cone', size: [0.025, 0.05, 0.025], at: [s * 0.38, 0.27, 0.03], rot: [0, 0, s * -Math.PI / 2], color: 0xe8dcc0, sides: 4 },
        // Huge pointy ears sticking out sideways and a little up, with a dark inside.
        { bone: 'head', shape: 'cone', size: [0.1, 0.28, 0.04], at: [s * 0.25, 0.53, -0.01], rot: [0, 0, -s * 1.2], color: c.skin, sides: 4 },
        { bone: 'head', shape: 'cone', size: [0.05, 0.18, 0.02], at: [s * 0.23, 0.525, 0.008], rot: [0, 0, -s * 1.2], color: c.skinDark, sides: 4 },
        // Big glowing eyes under an angry brow.
        { bone: 'head', shape: 'box', size: [0.065, 0.055, 0.02], at: [s * 0.065, 0.49, 0.135], color: c.eye },
        { bone: 'head', shape: 'box', size: [0.022, 0.035, 0.02], at: [s * 0.06, 0.49, 0.145], color: 0x161208 },
        { bone: 'head', shape: 'box', size: [0.1, 0.03, 0.04], at: [s * 0.065, 0.535, 0.13], rot: [0, 0, s * 0.35], color: c.skinDark },
        // Fangs.
        { bone: 'head', shape: 'cone', size: [0.03, 0.05, 0.03], at: [s * 0.05, 0.385, 0.135], rot: [Math.PI, 0, 0], color: 0xf2ead2, sides: 4 },
      ];
    }),
    // Hunched little body: leather vest, belt, a hump behind the neck, a tail.
    { bone: 'torso', shape: 'box', size: [0.22, 0.15, 0.17], at: [0, 0.255, 0.01], color: c.leather },
    { bone: 'torso', shape: 'box', size: [0.12, 0.12, 0.02], at: [0, 0.26, 0.095], color: c.skin },
    { bone: 'torso', shape: 'box', size: [0.24, 0.04, 0.19], at: [0, 0.19, 0.01], color: c.leatherDark },
    { bone: 'torso', shape: 'sphere', size: [0.22, 0.13, 0.14], at: [0, 0.32, -0.04], color: c.skin, sides: 7 },
    { bone: 'root', shape: 'cone', size: [0.07, 0.24, 0.06], at: [0, 0.11, -0.18], rot: [-2.0, 0, 0], color: c.skin, sides: 5 },
    // Big head, long nose, wide mouth.
    { bone: 'head', shape: 'sphere', size: [0.29, 0.26, 0.26], at: [0, 0.47, 0.02], color: c.skin, sides: 8 },
    { bone: 'head', shape: 'cone', size: [0.08, 0.2, 0.07], at: [0, 0.43, 0.22], rot: [Math.PI / 2 + 0.45, 0, 0], color: c.skin, sides: 5 },
    { bone: 'head', shape: 'box', size: [0.14, 0.025, 0.02], at: [0, 0.405, 0.13], color: 0x241410 },
  ];
  if (prop === 'keg') {
    pieces.push(
      // Red bandana with a knot tail.
      { bone: 'head', shape: 'sphere', size: [0.28, 0.13, 0.25], at: [0, 0.57, 0.0], color: c.accent, sides: 8 },
      { bone: 'head', shape: 'cone', size: [0.06, 0.12, 0.03], at: [0.04, 0.53, -0.15], rot: [-2.4, 0, 0.3], color: c.accent, sides: 3 },
      // Powder keg strapped upright on the back, fuse sticking up; a strap across the chest.
      { bone: 'torso', shape: 'cylinder', size: [0.26, 0.28, 0.26], at: [0, 0.32, -0.18], rot: [-0.2, 0, 0], color: wood, sides: 8 },
      { bone: 'torso', shape: 'cylinder', size: [0.27, 0.03, 0.27], at: [0, 0.41, -0.2], rot: [-0.2, 0, 0], color: hoop, sides: 8 },
      { bone: 'torso', shape: 'cylinder', size: [0.27, 0.03, 0.27], at: [0, 0.23, -0.16], rot: [-0.2, 0, 0], color: hoop, sides: 8 },
      { bone: 'torso', shape: 'box', size: [0.08, 0.05, 0.02], at: [0, 0.34, -0.06], color: 0x1a1a1a },
      { bone: 'torso', shape: 'cylinder', size: [0.02, 0.1, 0.02], at: [0, 0.5, -0.22], rot: [-0.4, 0, 0], color: 0x2a2a2a, sides: 4 },
      { bone: 'torso', shape: 'sphere', size: [0.08, 0.08, 0.08], at: [0, 0.56, -0.25], color: 0xffe040, sides: 5 },
      { bone: 'torso', shape: 'box', size: [0.035, 0.24, 0.02], at: [0, 0.26, 0.105], rot: [0, 0, 0.6], color: c.leatherDark },
      // A lit match in the right hand.
      { bone: 'arm-right', shape: 'cylinder', size: [0.025, 0.14, 0.025], at: [-0.35, 0.288, 0.08], rot: [Math.PI / 2, 0, 0], color: 0x6b4a2a, sides: 4 },
      { bone: 'arm-right', shape: 'cone', size: [0.05, 0.08, 0.05], at: [-0.35, 0.288, 0.18], rot: [Math.PI / 2, 0, 0], color: 0xffa020, sides: 5 },
    );
  } else {
    pieces.push(
      // Dented iron helmet with a stub candle on top.
      { bone: 'head', shape: 'sphere', size: [0.31, 0.17, 0.29], at: [0, 0.575, 0.01], color: 0x5a5e6a, sides: 8 },
      { bone: 'head', shape: 'cylinder', size: [0.34, 0.02, 0.32], at: [0, 0.555, 0.01], color: 0x3c3f48, sides: 8 },
      { bone: 'head', shape: 'cylinder', size: [0.05, 0.09, 0.05], at: [0, 0.68, 0.03], color: 0xf2e8c8, sides: 6 },
      { bone: 'head', shape: 'cone', size: [0.05, 0.08, 0.05], at: [0, 0.76, 0.03], color: c.accent, sides: 5 },
      // Brass headlamp on the brow.
      { bone: 'head', shape: 'box', size: [0.09, 0.07, 0.04], at: [0, 0.585, 0.155], color: 0x8a6a2a },
      { bone: 'head', shape: 'box', size: [0.065, 0.05, 0.02], at: [0, 0.585, 0.178], color: c.accent },
      // Satchel with two small kegs on the back.
      { bone: 'torso', shape: 'box', size: [0.2, 0.15, 0.09], at: [0, 0.26, -0.13], color: c.leather },
      { bone: 'torso', shape: 'cylinder', size: [0.1, 0.14, 0.1], at: [0.06, 0.38, -0.15], color: wood, sides: 7 },
      { bone: 'torso', shape: 'cylinder', size: [0.1, 0.14, 0.1], at: [-0.06, 0.38, -0.15], color: wood, sides: 7 },
      { bone: 'torso', shape: 'box', size: [0.035, 0.24, 0.02], at: [0, 0.26, 0.105], rot: [0, 0, -0.6], color: c.leatherDark },
      // Pickaxe in the right hand: haft forward, the double pick across its end.
      { bone: 'arm-right', shape: 'cylinder', size: [0.035, 0.44, 0.035], at: [-0.35, 0.288, 0.15], rot: [Math.PI / 2, 0, 0], color: 0x8a5e34, sides: 5 },
      { bone: 'arm-right', shape: 'box', size: [0.06, 0.07, 0.07], at: [-0.35, 0.288, 0.35], color: metal },
      { bone: 'arm-right', shape: 'cone', size: [0.06, 0.2, 0.05], at: [-0.35, 0.4, 0.33], rot: [-0.3, 0, 0], color: metal, sides: 4 },
      { bone: 'arm-right', shape: 'cone', size: [0.06, 0.2, 0.05], at: [-0.35, 0.176, 0.33], rot: [Math.PI + 0.3, 0, 0], color: metal, sides: 4 },
    );
  }
  return { note, pieces };
}

/**
 * Bodies by monster sheet. The rig (and its animations) is CHARACTER_MODELS[sheet]; the rig's own
 * meshes are dropped. Designed by eye with `node tools/lineup.mjs <kind>`.
 */
export const BODIES: Record<string, BodySpec> = {
  shieldbearer: {
    note: 'Horned, visored iron guard of the mountain horde: blue-black plate, fur mantle, red eye slits, a tower shield with a pale ward rune and a jagged cleaver.',
    pieces: [
      ...([1, -1] as const).flatMap((s): BodyPiece[] => {
        const leg = s > 0 ? 'leg-left' : 'leg-right';
        const arm = s > 0 ? 'arm-left' : 'arm-right';
        return [
          { bone: leg, shape: 'box', size: [0.12, 0.12, 0.13], at: [s * 0.084, 0.12, -0.02], color: 0x46536a },
          { bone: leg, shape: 'box', size: [0.14, 0.07, 0.17], at: [s * 0.084, 0.035, 0], color: 0x232a36 },
          { bone: arm, shape: 'box', size: [0.13, 0.08, 0.15], at: [s * 0.15, 0.315, -0.012], color: 0x5a6a80 },
          { bone: arm, shape: 'cone', size: [0.05, 0.09, 0.05], at: [s * 0.17, 0.38, -0.012], color: 0xe6dcc4, sides: 5 },
          { bone: arm, shape: 'box', size: [0.2, 0.075, 0.08], at: [s * 0.24, 0.288, -0.012], color: 0x3b4658 },
          { bone: arm, shape: 'box', size: [0.08, 0.09, 0.09], at: [s * 0.35, 0.288, -0.012], color: 0x232a36 },
          { bone: 'torso', shape: 'sphere', size: [0.17, 0.13, 0.2], at: [s * 0.17, 0.34, -0.02], color: 0x9c8a74, sides: 6 },
          { bone: 'head', shape: 'box', size: [0.04, 0.035, 0.02], at: [s * 0.06, 0.49, 0.152], color: 0xff5a2a },
          // Horn: a thick root jutting out sideways, then a tip curling up.
          { bone: 'head', shape: 'cylinder', size: [0.075, 0.13, 0.075], at: [s * 0.215, 0.6, 0], rot: [0, 0, -s * 1.1], color: 0xe6dcc4, sides: 5 },
          { bone: 'head', shape: 'cone', size: [0.07, 0.16, 0.07], at: [s * 0.29, 0.71, 0], rot: [0, 0, -s * 0.25], color: 0xe6dcc4, sides: 5 },
          // Angry brow over the eye slit, and fangs under the jaw guard.
          { bone: 'head', shape: 'box', size: [0.13, 0.035, 0.03], at: [s * 0.065, 0.535, 0.15], rot: [0, 0, s * 0.35], color: 0x6b7d96 },
          { bone: 'head', shape: 'cone', size: [0.035, 0.06, 0.035], at: [s * 0.07, 0.33, 0.15], rot: [Math.PI, 0, 0], color: 0xe6dcc4, sides: 4 },
        ];
      }),
      // Torso: plate over a fur mantle and a short hanging cape.
      { bone: 'torso', shape: 'box', size: [0.34, 0.17, 0.22], at: [0, 0.265, -0.02], color: 0x46536a },
      { bone: 'torso', shape: 'box', size: [0.22, 0.11, 0.03], at: [0, 0.27, 0.09], color: 0x6b7d96 },
      { bone: 'torso', shape: 'box', size: [0.31, 0.04, 0.22], at: [0, 0.195, -0.02], color: 0x3a2a1e },
      { bone: 'torso', shape: 'box', size: [0.3, 0.06, 0.22], at: [0, 0.165, -0.02], color: 0x2a3240 },
      { bone: 'torso', shape: 'box', size: [0.44, 0.09, 0.3], at: [0, 0.335, -0.03], color: 0x7d6b58 },
      { bone: 'torso', shape: 'box', size: [0.3, 0.12, 0.04], at: [0, 0.27, -0.14], color: 0x7d6b58 },
      // Helm: visor slit, jaw guard, crest spike.
      { bone: 'head', shape: 'box', size: [0.32, 0.27, 0.29], at: [0, 0.49, 0], color: 0x4a5568 },
      { bone: 'head', shape: 'box', size: [0.26, 0.05, 0.25], at: [0, 0.64, 0], color: 0x3b4658 },
      { bone: 'head', shape: 'box', size: [0.24, 0.05, 0.02], at: [0, 0.49, 0.146], color: 0x0e1116 },
      { bone: 'head', shape: 'box', size: [0.26, 0.09, 0.04], at: [0, 0.39, 0.14], color: 0x2e3644 },
      { bone: 'head', shape: 'cone', size: [0.06, 0.12, 0.06], at: [0, 0.7, 0], color: 0xe6dcc4, sides: 5 },
      // Tower shield on the left hand, a ward rune on its face.
      { bone: 'arm-left', shape: 'box', size: [0.05, 0.05, 0.08], at: [0.33, 0.288, 0.07], color: 0x232a36 },
      { bone: 'arm-left', shape: 'box', size: [0.43, 0.3, 0.025], at: [0.31, 0.288, 0.11], color: 0x6b7d96 },
      { bone: 'arm-left', shape: 'box', size: [0.4, 0.27, 0.035], at: [0.31, 0.288, 0.13], color: 0x2e3644 },
      { bone: 'arm-left', shape: 'box', size: [0.33, 0.03, 0.02], at: [0.31, 0.288, 0.152], color: 0x9fd8ff },
      { bone: 'arm-left', shape: 'cylinder', size: [0.15, 0.03, 0.15], at: [0.31, 0.288, 0.158], rot: [Math.PI / 2, 0, 0], color: 0x9fd8ff, sides: 4 },
      { bone: 'arm-left', shape: 'cylinder', size: [0.06, 0.03, 0.06], at: [0.31, 0.288, 0.168], rot: [Math.PI / 2, 0, 0], color: 0x0e1116, sides: 4 },
      // Jagged cleaver in the right hand, blade pointing forward.
      { bone: 'arm-right', shape: 'cylinder', size: [0.035, 0.12, 0.035], at: [-0.36, 0.288, 0.05], rot: [Math.PI / 2, 0, 0], color: 0x4a3626, sides: 6 },
      { bone: 'arm-right', shape: 'box', size: [0.025, 0.15, 0.28], at: [-0.36, 0.33, 0.24], color: 0xb8c4d4 },
      { bone: 'arm-right', shape: 'box', size: [0.035, 0.03, 0.28], at: [-0.36, 0.265, 0.24], color: 0x2e3644 },
      { bone: 'arm-right', shape: 'cone', size: [0.025, 0.06, 0.06], at: [-0.36, 0.43, 0.15], color: 0xb8c4d4, sides: 3 },
      { bone: 'arm-right', shape: 'cone', size: [0.025, 0.06, 0.06], at: [-0.36, 0.43, 0.29], color: 0xb8c4d4, sides: 3 },
    ],
  },
  sapper: koboldBody(POWDER_GOBLIN, 'keg',
    'Powder goblin: olive, big-eared and hook-nosed, a red bandana, a powder keg strapped to its back and a lit match in hand.'),
  kobold: koboldBody(FROST_KOBOLD, 'miner',
    'Frost kobold miner: slate-blue goblin body, an iron helmet with a lit candle, two small kegs on its back and a pickaxe.'),
};

function pieceGeometry(p: BodyPiece): THREE.BufferGeometry {
  const sides = Math.max(3, Math.min(16, p.sides ?? 8));
  let g: THREE.BufferGeometry;
  if (p.shape === 'box') g = new THREE.BoxGeometry(1, 1, 1);
  else if (p.shape === 'cylinder') g = new THREE.CylinderGeometry(0.5, 0.5, 1, sides);
  else if (p.shape === 'cone') g = new THREE.ConeGeometry(0.5, 1, sides);
  else g = new THREE.SphereGeometry(0.5, sides, Math.max(3, Math.round(sides * 0.75)));
  // Flat facets like the Kenney models: no shared vertices between faces.
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv');
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...p.at),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rot ?? [0, 0, 0]))),
    new THREE.Vector3(...p.size),
  );
  g.applyMatrix4(m);
  g.computeVertexNormals();
  const c = new THREE.Color().setHex(p.color);
  const n = g.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) c.toArray(colors, k * 3);
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/**
 * Strips `model` (a fresh clone of the rig) of its meshes and hangs the body's pieces on its bones,
 * one merged mesh per bone. Call before any animation is applied. Returns what the caller must dispose.
 */
export function dressBody(model: THREE.Object3D, spec: BodySpec): { dispose(): void }[] {
  const meshes: THREE.Object3D[] = [];
  model.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o); });
  for (const o of meshes) o.removeFromParent();
  model.updateMatrixWorld(true);
  const rootInv = model.matrixWorld.clone().invert();

  const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0 });
  const owned: { dispose(): void }[] = [material];
  for (const bone of BONES) {
    const pieces = spec.pieces.filter((p) => p.bone === bone);
    if (!pieces.length) continue;
    const node = model.getObjectByName(bone);
    if (!node) throw new Error(`Body piece on missing bone "${bone}"`);
    const parts = pieces.map(pieceGeometry);
    const merged = mergeGeometries(parts)!;
    for (const g of parts) g.dispose();
    // Model space → the bone's local space at the rest pose.
    const boneInModel = new THREE.Matrix4().multiplyMatrices(rootInv, node.matrixWorld);
    merged.applyMatrix4(boneInModel.invert());
    const mesh = new THREE.Mesh(merged, material);
    mesh.name = `body-${bone}`;
    node.add(mesh);
    owned.push(merged);
  }
  return owned;
}
