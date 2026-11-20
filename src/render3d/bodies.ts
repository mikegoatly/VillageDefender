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
//
// Hand-held pieces: a piece's +Z keeps facing forward whatever the arm does; when the arm hangs
// down (idle, walk) the arm's outward X axis points at the ground, and the attack clip swings the
// right arm forward and down. So a weapon along −X in the right hand points down at rest and
// forward-down mid-swing. `mirror: true` adds the piece's twin on the other side (x negated,
// left↔right bones swapped), and `glow: true` draws a piece unlit, at full brightness (eyes, lamps, runes).
//
// STYLE (match the Kenney Mini characters; they are toys, not sculptures):
// - Chunky toy proportions: a big head (about 40–50% of the height, wider than the body), a short
//   box body, stubby limbs. Exaggerate one or two signature features (huge frog eyes, long ears)
//   and leave everything else plain.
// - Few, big, soft shapes: build mostly from `rbox` (rounded box). Aim for 12–22 pieces before
//   mirroring. No fiddly bits (separate fangs, claws, brows, buckles, straps) that turn to noise at 60 px.
// - Faces are painted, not sculpted: dot or slab eyes and a simple mouth as thin flat boxes just
//   proud of the head's front face (a glowing pair of eyes is fine for a monster).
// - Colours from PALETTE (sampled from the Kenney colormap): bright, slightly pastel, each with a
//   soft top-to-bottom gradient like the texture's swatches. Avoid near-black and muddy browns
//   except as small accents.
// - Measured Kenney targets (graveyard/character-zombie, model space; total height ~0.85):
//   head 0.44 wide × 0.40 tall × 0.35 deep (y 0.45–0.85, i.e. ~47% of the height and ~1.5× the
//   torso's width), torso 0.30 × 0.22 × 0.23 (y 0.22–0.45), each arm 0.33 long × 0.16 thick,
//   each leg 0.14 × 0.25 × 0.19 (y 0–0.27). The skeleton is leaner (head 0.31 × 0.27), the vampire
//   bulkier (cloak torso 0.51 wide). Whole models are 650–1100 triangles. Compare side by side:
//   `node tools/lineup.mjs <your kind> zombie skeleton` (or the Kenney model your body replaces).

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BONES, expandPieces, FLAT_SHADE, type BodyPiece, type BodySpec, type PieceColor } from './bodies/kit';
import { FROST_GIANT, GRAVEKEEPER, TROLL, WARLORD } from './bodies/bosses';
import { FROST_SHAMAN, NECROMANCER } from './bodies/casters';
import { FROST_THRALL, YETI } from './bodies/frostpeak';
import { GHOUL } from './bodies/graveyard';
import { FROST_KOBOLD, goblinBody, POWDER_GOBLIN, SHIELDBEARER } from './bodies/monsters';
import { DROWNED, FROGFOLK } from './bodies/riverside';

export { BONES, expandPieces, mirrorPiece, PALETTE } from './bodies/kit';
export type { BodyPiece, BodySpec, BoneName, PieceColor, Shape } from './bodies/kit';

/**
 * Bodies by monster sheet. The rig (and its animations) is CHARACTER_MODELS[sheet]; the rig's own
 * meshes are dropped. Designed by eye with `node tools/lineup.mjs <kind>`.
 */
export const BODIES: Record<string, BodySpec> = {
  shieldbearer: SHIELDBEARER,
  sapper: goblinBody(POWDER_GOBLIN, 'keg',
    'Powder goblin: an olive toy goblin, big-eared and long-nosed, a red bandana and a powder keg on its back with a glowing fuse spark.'),
  kobold: goblinBody(FROST_KOBOLD, 'miner',
    'Frost kobold miner: a slate-blue toy goblin in an iron helmet with a lit candle, two small kegs on its back and a pickaxe.'),
  // Casters that hang back (vampire rig): a pointed hood and skull-lantern staff, an icicle crown and ice-crystal staff.
  necromancer: NECROMANCER,
  frostShaman: FROST_SHAMAN,
  // Town looks (TownDef.looks): each town's own everyday horde in place of zombies and orcs.
  drowned: DROWNED,
  frogfolk: FROGFOLK,
  ghoul: GHOUL,
  frostThrall: FROST_THRALL,
  yeti: YETI,
  // Town bosses: more detail than the horde, as only one is on screen.
  warlord: WARLORD,
  troll: TROLL,
  gravekeeper: GRAVEKEEPER,
  frostGiant: FROST_GIANT,
};

function pieceGeometry(p: BodyPiece): THREE.BufferGeometry {
  const sides = Math.max(3, Math.min(16, p.sides ?? 8));
  let g: THREE.BufferGeometry;
  if (p.shape === 'box') g = new THREE.BoxGeometry(1, 1, 1);
  else if (p.shape === 'rbox') g = new RoundedBoxGeometry(1, 1, 1, 1, ROUNDING);
  else if (p.shape === 'cylinder') g = new THREE.CylinderGeometry(0.5, 0.5, 1, sides);
  else if (p.shape === 'cone') g = new THREE.ConeGeometry(0.5, 1, sides);
  else g = new THREE.SphereGeometry(0.5, sides, Math.max(3, Math.round(sides * 0.75)));
  // Everything is non-indexed so the pieces merge; rounded boxes keep their smooth normals, the
  // rest get flat facets (no shared vertices between faces).
  g = g.index ? g.toNonIndexed() : g;
  g.deleteAttribute('uv');
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...p.at),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rot ?? [0, 0, 0]))),
    new THREE.Vector3(...p.size),
  );
  g.applyMatrix4(m);
  if (p.shape !== 'rbox') g.computeVertexNormals();
  g.setAttribute('color', gradientColors(g, p.color));
  return g;
}

/** Edge radius of a rounded box, as a fraction of a unit cube (scaled with the piece). */
const ROUNDING = 0.14;

/** Per-vertex colours running from the colour's top to its bottom over the piece's height. */
function gradientColors(g: THREE.BufferGeometry, color: PieceColor): THREE.BufferAttribute {
  const top = new THREE.Color().setHex(typeof color === 'number' ? color : color[0]);
  const bottom = typeof color === 'number' ? top.clone().multiplyScalar(FLAT_SHADE) : new THREE.Color().setHex(color[1]);
  const pos = g.getAttribute('position');
  let lo = Infinity;
  let hi = -Infinity;
  for (let k = 0; k < pos.count; k++) {
    lo = Math.min(lo, pos.getY(k));
    hi = Math.max(hi, pos.getY(k));
  }
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let k = 0; k < pos.count; k++) {
    const t = hi > lo ? (pos.getY(k) - lo) / (hi - lo) : 1;
    c.copy(bottom).lerp(top, t).toArray(colors, k * 3);
  }
  return new THREE.BufferAttribute(colors, 3);
}

/**
 * Strips `model` (a fresh clone of the rig) of its meshes and hangs the body's pieces on its bones,
 * one merged mesh per bone. Call before any animation is applied. Returns what the caller must dispose.
 */
export function dressBody(model: THREE.Object3D, spec: BodySpec): { dispose(): void }[] {
  const meshes: THREE.Object3D[] = [];
  model.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o); });
  for (const o of meshes) {
    // Skinned rigs (orc) keep their meshes beside the bones; the graveyard rigs' bones *are* their
    // meshes, so a bone mesh is swapped for a bare node that keeps its name, transform and children.
    if ((BONES as readonly string[]).includes(o.name) || o.children.length) {
      const bone = new THREE.Object3D();
      bone.name = o.name;
      bone.position.copy(o.position);
      bone.quaternion.copy(o.quaternion);
      bone.scale.copy(o.scale);
      for (const child of [...o.children]) bone.add(child);
      o.parent?.add(bone);
    }
    o.removeFromParent();
  }
  model.updateMatrixWorld(true);
  const rootInv = model.matrixWorld.clone().invert();

  // Facets come from the geometry (flat pieces have per-face normals), so rounded boxes can stay smooth.
  const lit = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0 });
  const glow = new THREE.MeshBasicMaterial({ vertexColors: true });
  const owned: { dispose(): void }[] = [lit, glow];
  const all = expandPieces(spec.pieces);
  for (const bone of BONES) {
    const onBone = all.filter((p) => p.bone === bone);
    if (!onBone.length) continue;
    const node = model.getObjectByName(bone);
    if (!node) throw new Error(`Body piece on missing bone "${bone}"`);
    // Model space → the bone's local space at the rest pose.
    const toBone = new THREE.Matrix4().multiplyMatrices(rootInv, node.matrixWorld).invert();
    // Lit pieces and glowing pieces: one merged mesh each per bone.
    for (const glowing of [false, true]) {
      const pieces = onBone.filter((p) => !!p.glow === glowing);
      if (!pieces.length) continue;
      const parts = pieces.map(pieceGeometry);
      const merged = mergeGeometries(parts)!;
      for (const g of parts) g.dispose();
      merged.applyMatrix4(toBone);
      const mesh = new THREE.Mesh(merged, glowing ? glow : lit);
      mesh.name = glowing ? `body-${bone}-glow` : `body-${bone}`;
      node.add(mesh);
      owned.push(merged);
    }
  }
  return owned;
}
