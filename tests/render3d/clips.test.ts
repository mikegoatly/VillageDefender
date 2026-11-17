import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WEAPONS } from '../../src/data/weapons';
import { findClip, THRUST_HIT } from '../../src/render3d/clips';

/** The Mini rig's bones (root > legs, torso > arms, head), at their bind offsets, plus a hand marker. */
function miniRig() {
  const model = new THREE.Group();
  const bone = (name: string, parent: THREE.Object3D, x = 0, y = 0, z = 0) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(x, y, z);
    parent.add(b);
    return b;
  };
  const root = bone('root', model);
  bone('leg-left', root, 0.084, 0.176, -0.024);
  bone('leg-right', root, -0.084, 0.176, -0.024);
  const torso = bone('torso', root, 0, 0.176, -0.024);
  bone('arm-left', torso, 0.1, 0.112, 0.012);
  const arm = bone('arm-right', torso, -0.1, 0.112, 0.012);
  bone('head', torso, 0, 0.167, 0.026);
  // Where the knight's held weapon is attached (characters.ts RIGHT).
  const hand = new THREE.Object3D();
  hand.position.set(-0.27, 0, 0.02);
  hand.rotation.set(Math.PI / 2, 0, 0);
  arm.add(hand);
  return { model, hand };
}

/** The held weapon's tip direction and grip position `t` seconds into the clip. */
function weaponAt(clip: THREE.AnimationClip, t: number) {
  const { model, hand } = miniRig();
  const mixer = new THREE.AnimationMixer(model);
  mixer.clipAction(clip).play();
  mixer.setTime(t);
  model.updateMatrixWorld(true);
  const q = hand.getWorldQuaternion(new THREE.Quaternion());
  // Weapon models point along +Y.
  return { dir: new THREE.Vector3(0, 1, 0).applyQuaternion(q), grip: hand.getWorldPosition(new THREE.Vector3()) };
}

describe('findClip', () => {
  const own = [new THREE.AnimationClip('holding-right-shoot', 1, []), new THREE.AnimationClip('idle', 1, [])];

  it('finds the model’s own clips by name', () => {
    expect(findClip(own, 'idle')).toBe(own[1]);
    expect(findClip(own, 'holding-right-shoot')).toBe(own[0]);
    expect(findClip(own, 'no-such-clip')).toBeUndefined();
  });

  it('adds code-built clips without the model having them, built once', () => {
    const thrust = findClip(own, 'thrust');
    expect(thrust?.name).toBe('thrust');
    expect(findClip([], 'thrust')).toBe(thrust);
  });
});

describe('thrust clip', () => {
  const clip = findClip([], 'thrust')!;
  const spear = WEAPONS.spear;

  it('is timed to the spear', () => {
    expect(clip.duration).toBeCloseTo(spear.duration);
    expect(THRUST_HIT).toBeCloseTo(spear.hitTime);
  });

  it('keeps the spear pointing ahead throughout', () => {
    for (let t = 0; t <= clip.duration; t += 0.02) {
      const { dir } = weaponAt(clip, t);
      expect(dir.z, `t=${t.toFixed(2)}`).toBeGreaterThan(0.97);
    }
  });

  it('draws the spear back, drives it out to the hit and returns to rest', () => {
    const rest = weaponAt(clip, 0).grip;
    const drawn = weaponAt(clip, 0.08).grip;
    const hit = weaponAt(clip, THRUST_HIT).grip;
    expect(drawn.z).toBeLessThan(rest.z);
    expect(hit.z - drawn.z).toBeGreaterThan(0.2);
    // Raised from the hip towards chest height at full stretch.
    expect(hit.y).toBeGreaterThan(rest.y);
    expect(weaponAt(clip, clip.duration).grip.distanceTo(rest)).toBeLessThan(1e-3);
  });
});
