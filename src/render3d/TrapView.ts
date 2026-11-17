// Set traps (decision 52): a spiked patch on the ground that shortens as its damage budget runs out.
// Reads World.traps every frame; meshes are created when an id first appears and disposed when gone.
// The villager who sets a trap is drawn by UnitBatches.

import * as THREE from 'three';
import type { Trap } from '../sim/world';

const GROUND_Y = 0.05;
const COLORS = { patch: 0x4a3322, rim: 0xe8a45a, spike: 0xc8ccd2 };
/** Spikes in the outer ring and in the inner cluster. */
const OUTER = 7;
const INNER = 4;
/** Spikes never shrink below this fraction of their height while the trap lasts. */
const MIN_SPIKE = 0.35;

interface TrapMesh {
  group: THREE.Group;
  /** All spikes, so their height can follow the budget with one write. */
  spikes: THREE.Group;
  /** Budget fraction the spikes were last sized for. */
  left: number;
}

export class TrapView {
  readonly root = new THREE.Group();
  private readonly traps = new Map<number, TrapMesh>();
  private readonly live = new Set<number>();

  private readonly patchGeo = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
  private readonly rimGeo = new THREE.RingGeometry(0.93, 1, 40).rotateX(-Math.PI / 2);
  private readonly spikeGeo = new THREE.ConeGeometry(0.06, 0.3, 6).translate(0, 0.15, 0);
  private readonly patchMat = new THREE.MeshBasicMaterial({ color: COLORS.patch, transparent: true, opacity: 0.55, depthWrite: false });
  private readonly rimMat = new THREE.MeshBasicMaterial({ color: COLORS.rim, transparent: true, opacity: 0.9, depthWrite: false });
  private readonly spikeMat = new THREE.MeshLambertMaterial({ color: COLORS.spike, flatShading: true });

  sync(traps: readonly Trap[]) {
    const live = this.live;
    live.clear();
    for (const t of traps) {
      live.add(t.id);
      let m = this.traps.get(t.id);
      if (!m) this.traps.set(t.id, (m = this.makeTrap(t)));
      const left = Math.max(0, t.budget / t.maxBudget);
      if (left !== m.left) {
        m.left = left;
        m.spikes.scale.y = MIN_SPIKE + (1 - MIN_SPIKE) * left;
      }
    }
    for (const [id, m] of this.traps) {
      if (live.has(id)) continue;
      m.group.removeFromParent();
      this.traps.delete(id);
    }
  }

  private makeTrap(t: Trap): TrapMesh {
    const group = new THREE.Group();
    group.position.set(t.x, GROUND_Y, t.y);
    const patch = new THREE.Mesh(this.patchGeo, this.patchMat);
    const rim = new THREE.Mesh(this.rimGeo, this.rimMat);
    patch.scale.setScalar(t.radius);
    rim.scale.setScalar(t.radius);
    rim.position.y = 0.002;
    const spikes = new THREE.Group();
    // An outer ring of spikes plus a few inside, jittered by id so traps do not look stamped.
    for (const [count, radius] of [[OUTER, 0.68], [INNER, 0.28]] as const) {
      for (let k = 0; k < count; k++) {
        const a = (k / count) * Math.PI * 2 + t.id * 0.7;
        const s = new THREE.Mesh(this.spikeGeo, this.spikeMat);
        s.position.set(Math.cos(a) * radius * t.radius, 0, Math.sin(a) * radius * t.radius);
        s.rotation.set(Math.sin(a * 3) * 0.15, 0, Math.cos(a * 2) * 0.15);
        spikes.add(s);
      }
    }
    group.add(patch, rim, spikes);
    this.root.add(group);
    return { group, spikes, left: 1 };
  }

  dispose() {
    this.root.removeFromParent();
    for (const o of [this.patchGeo, this.rimGeo, this.spikeGeo,
      this.patchMat, this.rimMat, this.spikeMat]) o.dispose();
  }
}
