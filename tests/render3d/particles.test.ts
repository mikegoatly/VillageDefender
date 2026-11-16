import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Particles } from '../../src/render3d/Particles';

/** World positions and scales of the live instances of every particle mesh. */
function instances(p: Particles) {
  const out: { pos: THREE.Vector3; scale: number }[] = [];
  const m = new THREE.Matrix4();
  for (const mesh of p.root.children as THREE.InstancedMesh[]) {
    for (let k = 0; k < mesh.count; k++) {
      mesh.getMatrixAt(k, m);
      const pos = new THREE.Vector3();
      const scale = new THREE.Vector3();
      m.decompose(pos, new THREE.Quaternion(), scale);
      out.push({ pos, scale: scale.x });
    }
  }
  return out;
}

describe('Particles', () => {
  it('throws sparks up and out from the hit point, then lets them fall and vanish', () => {
    const p = new Particles();
    p.spark(5, 0.5, 5, 6, 0xffffff, 2.4, 1, 0);
    expect(p.live).toBe(6);
    p.update(0.05);
    const early = instances(p);
    expect(early).toHaveLength(6);
    for (const s of early) {
      expect(s.scale).toBeGreaterThan(0.03);
      expect(s.pos.y).toBeGreaterThan(0.5);
      expect(s.pos.distanceTo(new THREE.Vector3(5, 0.5, 5))).toBeLessThan(0.5);
    }
    // Thrown mostly along +x.
    expect(early.reduce((a, s) => a + s.pos.x - 5, 0)).toBeGreaterThan(0);
    p.update(1);
    expect(p.live).toBe(0);
    p.dispose();
  });

  it('drifts dash dust along the given direction at ground level', () => {
    const p = new Particles();
    for (let k = 0; k < 10; k++) p.dust(0, 0, -1, 0, 0xc9b29b, 1);
    p.update(0.2);
    const puffs = instances(p);
    expect(puffs).toHaveLength(10);
    expect(puffs.reduce((a, s) => a + s.pos.x, 0) / puffs.length).toBeLessThan(-0.05);
    for (const s of puffs) expect(s.pos.y).toBeLessThan(0.5);
    p.dispose();
  });
});
