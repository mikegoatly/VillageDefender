import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { bakeClip, collectParts, frameIndex, POSE_FPS, splitByBone, type PoseClip } from '../../src/render3d/poses';

/** Geometry with one vertex per entry of `bones`, each fully weighted to that bone. */
function skinnedGeometry(bones: number[], dominantSlot = 0): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(bones.flatMap((_, k) => [k, 0, 0]), 3));
  const idx: number[] = [];
  const wts: number[] = [];
  for (const b of bones) {
    // The dominant bone sits in `dominantSlot`; a weak distractor fills slot 0 when it is free.
    const i = [9, 9, 9, 9];
    const w = [0, 0, 0, 0];
    i[dominantSlot] = b;
    w[dominantSlot] = 0.9;
    if (dominantSlot !== 0) w[0] = 0.1;
    idx.push(...i);
    wts.push(...w);
  }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(idx, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(wts, 4));
  return g;
}

const aClip = (o: Partial<PoseClip>): PoseClip => ({ frames: 30, duration: 1, loop: true, parts: 1, data: new Float32Array(0), ...o });

describe('splitByBone', () => {
  it('groups each triangle under its bone', () => {
    const split = splitByBone(skinnedGeometry([3, 3, 3, 5, 5, 5]));
    expect([...split.keys()]).toEqual([3, 5]);
    expect(split.get(3)).toEqual([0, 1, 2]);
    expect(split.get(5)).toEqual([3, 4, 5]);
  });

  it('uses the heaviest weight, not the first slot', () => {
    expect([...splitByBone(skinnedGeometry([4, 4, 4], 2)).keys()]).toEqual([4]);
  });

  it('follows the index buffer when there is one', () => {
    const g = skinnedGeometry([1, 2, 2, 2]);
    g.setIndex([1, 2, 3, 3, 2, 1]);
    expect(splitByBone(g)).toEqual(new Map([[2, [1, 2, 3, 3, 2, 1]]]));
  });
});

describe('frameIndex', () => {
  it('wraps a looping clip', () => {
    const c = aClip({ loop: true, duration: 1, frames: 30 });
    expect(frameIndex(c, 0)).toBe(0);
    expect(frameIndex(c, 0.5)).toBe(15);
    expect(frameIndex(c, 1.5)).toBe(15);
  });

  it('holds the last frame of a one-shot clip', () => {
    const c = aClip({ loop: false, duration: 1, frames: 31 });
    expect(frameIndex(c, 0.5)).toBe(15);
    expect(frameIndex(c, 9)).toBe(30);
  });
});

describe('bakeClip', () => {
  /** A rigid mesh on a bone named 'arm' that slides from x=1 to x=3 over one second. */
  function rig() {
    const model = new THREE.Group();
    const arm = new THREE.Bone();
    arm.name = 'arm';
    arm.position.set(1, 0, 0);
    model.add(arm);
    arm.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial()));
    const clip = new THREE.AnimationClip('slide', 1, [new THREE.VectorKeyframeTrack('arm.position', [0, 1], [1, 0, 0, 3, 0, 0])]);
    return { model, clip };
  }
  const xAt = (c: PoseClip, f: number) => c.data[f * c.parts * 16 + 12];

  it('records each part’s transform at every sampled frame', () => {
    const { model, clip } = rig();
    const parts = collectParts(model, (m) => m);
    const baked = bakeClip(model, new THREE.AnimationMixer(model), clip, parts, false);
    expect(baked.frames).toBe(POSE_FPS + 1);
    expect(baked.parts).toBe(1);
    expect(xAt(baked, 0)).toBeCloseTo(1);
    expect(xAt(baked, POSE_FPS / 2)).toBeCloseTo(2);
    expect(xAt(baked, POSE_FPS)).toBeCloseTo(3, 2);
  });

  it('leaves out the repeated end frame of a loop', () => {
    const { model, clip } = rig();
    const baked = bakeClip(model, new THREE.AnimationMixer(model), clip, collectParts(model, (m) => m), true);
    expect(baked.frames).toBe(POSE_FPS);
  });
});
