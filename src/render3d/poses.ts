// Turns a rigged Kenney character into rigid parts plus pre-baked pose tables, so many units can
// be drawn as instanced meshes with no AnimationMixer at runtime.
//
// Every Mini character is rigid: each vertex follows exactly one bone and no triangle spans two
// bones (checked for all models in use). So a skinned mesh splits losslessly into one part per
// bone, and a pose is one matrix per part.

import * as THREE from 'three';

/** Pose tables are sampled at this rate; units show the nearest earlier frame (no blending). */
export const POSE_FPS = 30;

/** One animation baked to matrices: frames × parts × 16 floats, relative to the model root. */
export interface PoseClip {
  frames: number;
  duration: number;
  loop: boolean;
  parts: number;
  data: Float32Array;
}

export interface Part {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** True when the geometry was created here (and must be disposed by the owner). */
  owned: boolean;
  /** Writes the part's current transform relative to the model root. */
  pose(out: THREE.Matrix4): void;
}

/** Triangle vertex indices grouped by the bone that dominates each triangle's first vertex. */
export function splitByBone(g: THREE.BufferGeometry): Map<number, number[]> {
  const joints = g.getAttribute('skinIndex');
  const weights = g.getAttribute('skinWeight');
  const boneOf = (v: number) => {
    let best = 0;
    for (let c = 1; c < 4; c++) if (weights.getComponent(v, c) > weights.getComponent(v, best)) best = c;
    return joints.getComponent(v, best);
  };
  const byBone = new Map<number, number[]>();
  const count = g.index ? g.index.count : g.getAttribute('position').count;
  for (let k = 0; k < count; k += 3) {
    const tri = [0, 1, 2].map((o) => (g.index ? g.index.getX(k + o) : k + o));
    const bone = boneOf(tri[0]);
    let list = byBone.get(bone);
    if (!list) byBone.set(bone, (list = []));
    list.push(...tri);
  }
  return byBone;
}

/** Every mesh under `model` as rigid parts; skinned meshes are split per bone. */
export function collectParts(model: THREE.Object3D, materialFor: (m: THREE.Material) => THREE.Material): Part[] {
  model.updateMatrixWorld(true);
  const parts: Part[] = [];
  model.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const material = materialFor(mesh.material as THREE.Material);
    const skinned = mesh as THREE.SkinnedMesh;
    if (!skinned.isSkinnedMesh) {
      parts.push({ geometry: mesh.geometry, material, owned: false, pose: (out) => out.copy(mesh.matrixWorld) });
      return;
    }
    const src = skinned.geometry;
    for (const [bone, index] of splitByBone(src)) {
      const geometry = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'uv']) {
        const attr = src.getAttribute(name);
        if (attr) geometry.setAttribute(name, attr);
      }
      geometry.setIndex(index);
      parts.push({
        geometry, material, owned: true,
        pose: (out) => out
          .multiplyMatrices(skinned.skeleton.bones[bone].matrixWorld, skinned.skeleton.boneInverses[bone])
          .multiply(skinned.bindMatrix),
      });
    }
  });
  return parts;
}

/** Samples `clip` on `model` at POSE_FPS and records every part's matrix per frame. */
export function bakeClip(model: THREE.Object3D, mixer: THREE.AnimationMixer, clip: THREE.AnimationClip, parts: Part[], loop: boolean): PoseClip {
  // A loop's last frame is its first again, so it is left out; a one-shot keeps its final pose.
  const frames = Math.max(1, Math.ceil(clip.duration * POSE_FPS) + (loop ? 0 : 1));
  const data = new Float32Array(frames * parts.length * 16);
  const action = mixer.clipAction(clip);
  action.play();
  const m = new THREE.Matrix4();
  for (let f = 0; f < frames; f++) {
    mixer.setTime(Math.min(f / POSE_FPS, clip.duration * 0.999));
    model.updateMatrixWorld(true);
    parts.forEach((p, k) => {
      p.pose(m);
      m.toArray(data, (f * parts.length + k) * 16);
    });
  }
  action.stop();
  return { frames, duration: clip.duration, loop, parts: parts.length, data };
}

/** Frame to show `t` seconds into the clip: loops wrap, one-shots hold their last frame. */
export function frameIndex(clip: PoseClip, t: number): number {
  const time = clip.loop ? ((t % clip.duration) + clip.duration) % clip.duration : Math.max(0, t);
  return Math.min(clip.frames - 1, Math.floor(time * POSE_FPS));
}
