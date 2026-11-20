/// <reference types="node" />
// Poses a Kenney Mini rig straight from its GLB (no loader, no meshes) so tests can follow designed
// body pieces (render3d/bodies.ts) through the clips: pieces are given in model space at the rest
// pose, and ride their bone as dressBody hangs them.

import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import type { BodyPiece, BoneName } from '../../src/render3d/bodies';

interface GlbJson {
  nodes: { name?: string; children?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }[];
  scenes: { nodes: number[] }[];
  animations: { name: string; channels: { sampler: number; target: { node: number; path: string } }[]; samplers: { input: number; output: number }[] }[];
  accessors: { bufferView: number; byteOffset?: number; count: number; type: string }[];
  bufferViews: { byteOffset?: number }[];
}

const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC3: 3, VEC4: 4 };
const PATHS: Record<string, string> = { translation: 'position', rotation: 'quaternion', scale: 'scale' };

/** A rig (public/assets/models/<model>.glb) that can be put in any frame of its clips. */
export function aPosedRig(model: string) {
  const buf = readFileSync(`public/assets/models/${model}.glb`);
  const jsonLength = buf.readUInt32LE(12);
  const json: GlbJson = JSON.parse(buf.subarray(20, 20 + jsonLength).toString());
  const binStart = 20 + jsonLength + 8;
  const floats = (index: number) => {
    const a = json.accessors[index];
    const start = binStart + (json.bufferViews[a.bufferView].byteOffset ?? 0) + (a.byteOffset ?? 0);
    return Array.from(new Float32Array(buf.buffer.slice(buf.byteOffset + start, buf.byteOffset + start + a.count * COMPONENTS[a.type] * 4)));
  };
  const nodes = json.nodes.map((n) => {
    const o = new THREE.Object3D();
    o.name = n.name ?? '';
    if (n.translation) o.position.fromArray(n.translation);
    if (n.rotation) o.quaternion.fromArray(n.rotation);
    if (n.scale) o.scale.fromArray(n.scale);
    return o;
  });
  json.nodes.forEach((n, i) => n.children?.forEach((c) => nodes[i].add(nodes[c])));
  const root = new THREE.Group();
  for (const i of json.scenes[0].nodes) root.add(nodes[i]);
  root.updateMatrixWorld(true);
  const restInv = new Map<string, THREE.Matrix4>();
  const bone = (name: BoneName) => root.getObjectByName(name)!;

  return {
    /** The clip's length in seconds. */
    duration(clipName: string): number {
      return this.clip(clipName).duration;
    },
    clip(clipName: string): THREE.AnimationClip {
      const a = json.animations.find((x) => x.name === clipName);
      if (!a) throw new Error(`no clip "${clipName}" in ${model}`);
      const tracks = a.channels.map((ch) => {
        const s = a.samplers[ch.sampler];
        const Track = ch.target.path === 'rotation' ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack;
        return new Track(`${nodes[ch.target.node].name}.${PATHS[ch.target.path]}`, floats(s.input), floats(s.output));
      });
      return new THREE.AnimationClip(clipName, -1, tracks);
    },
    /**
     * Calls `visit` at every `step` seconds of the clip with a function that maps a piece (model
     * space, rest pose) to its matrix in that frame (model space).
     */
    play(clipName: string, step: number, visit: (t: number, place: (p: BodyPiece, size?: THREE.Vector3) => THREE.Matrix4) => void) {
      for (const b of ['root', 'torso', 'head', 'arm-left', 'arm-right', 'leg-left', 'leg-right'] as BoneName[]) {
        // Not every rig has every bone (the ghost has no head or legs).
        if (!restInv.has(b) && root.getObjectByName(b)) restInv.set(b, bone(b).matrixWorld.clone().invert());
      }
      const clip = this.clip(clipName);
      const mixer = new THREE.AnimationMixer(root);
      mixer.clipAction(clip).play();
      for (let t = 0; t <= clip.duration + 1e-6; t += step) {
        mixer.setTime(t);
        root.updateMatrixWorld(true);
        const now = new Map<string, THREE.Matrix4>();
        visit(t, (p, size) => {
          let m = now.get(p.bone);
          if (!m) now.set(p.bone, (m = bone(p.bone).matrixWorld.clone().multiply(restInv.get(p.bone)!)));
          return m.clone().multiply(pieceMatrix(p, size));
        });
      }
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
    },
  };
}

/** A piece's rest matrix: the unit cube centred on 0 maps onto its box. */
export function pieceMatrix(p: BodyPiece, size = new THREE.Vector3(...p.size)): THREE.Matrix4 {
  return new THREE.Matrix4().compose(new THREE.Vector3(...p.at), new THREE.Quaternion().setFromEuler(new THREE.Euler(...(p.rot ?? [0, 0, 0]))), size);
}

/** Points through a piece's volume, in its unit cube. */
const GRID = [-0.5, -0.25, 0, 0.25, 0.5];
const SAMPLES = GRID.flatMap((x) => GRID.flatMap((y) => GRID.map((z) => new THREE.Vector3(x, y, z))));

/**
 * Every `clip@time` (60 fps) at which a point of a `held` piece lies inside one of the body's head
 * pieces (head, hat, helm, horns, crown). Cones, spheres and cylinders are tested as a box 70% as
 * wide, closer to their body than their bounding box. Points within `grip.radius` of `grip.at` (rest
 * pose) are skipped: that is the hand, which the rig itself brings close to the head.
 */
export function headHits(model: string, body: readonly BodyPiece[], held: readonly BodyPiece[], clips: readonly string[], grip?: { at: readonly [number, number, number]; radius: number }): string[] {
  const rig = aPosedRig(model);
  const head = body.filter((p) => p.bone === 'head').map((p) => {
    const s = new THREE.Vector3(...p.size);
    if (p.shape !== 'box' && p.shape !== 'rbox') s.set(s.x * 0.7, s.y, s.z * 0.7);
    return { p, s };
  });
  const gripAt = grip && new THREE.Vector3(...grip.at);
  const samples = held.map((p) => {
    const rest = pieceMatrix(p);
    return SAMPLES.filter((s) => !gripAt || s.clone().applyMatrix4(rest).distanceTo(gripAt) > grip!.radius);
  });
  const hits: string[] = [];
  const v = new THREE.Vector3();
  for (const clip of clips) {
    rig.play(clip, 1 / 60, (t, place) => {
      const into = head.map(({ p, s }) => place(p, s).invert());
      const hit = held.some((p, k) => {
        const m = place(p);
        return samples[k].some((s) => into.some((inv) => {
          v.copy(s).applyMatrix4(m).applyMatrix4(inv);
          return Math.abs(v.x) < 0.5 && Math.abs(v.y) < 0.5 && Math.abs(v.z) < 0.5;
        }));
      });
      if (hit) hits.push(`${clip}@${t.toFixed(2)}`);
    });
  }
  return hits;
}

/** The lowest point any `held` piece reaches over the clips (model space y; the ground is 0). */
export function lowestPoint(model: string, held: readonly BodyPiece[], clips: readonly string[]): number {
  const rig = aPosedRig(model);
  let low = Infinity;
  const v = new THREE.Vector3();
  for (const clip of clips) {
    rig.play(clip, 1 / 60, (_, place) => {
      for (const p of held) {
        const m = place(p);
        for (const s of SAMPLES) low = Math.min(low, v.copy(s).applyMatrix4(m).y);
      }
    });
  }
  return low;
}
