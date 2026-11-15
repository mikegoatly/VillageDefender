// Low-poly puffs for smoke and dust: one instanced mesh, no per-frame allocation. Puffs grow and
// then shrink away (instances cannot fade individually without a custom shader).

import * as THREE from 'three';

const CAPACITY = 700;

export interface EmitterSpec {
  x: number;
  y: number;
  z: number;
  /** Seconds between puffs. */
  every: number;
  color: number;
  /** Puff radius at its biggest. */
  size: number;
  /** Upward speed (units/s). */
  rise: number;
  life: number;
}

interface Emitter extends EmitterSpec {
  timer: number;
}

export class Particles {
  readonly mesh: THREE.InstancedMesh;
  private readonly pos = new Float32Array(CAPACITY * 3);
  private readonly vel = new Float32Array(CAPACITY * 3);
  private readonly age = new Float32Array(CAPACITY);
  private readonly life = new Float32Array(CAPACITY);
  private readonly size = new Float32Array(CAPACITY);
  private readonly spin = new Float32Array(CAPACITY);
  private readonly colors = new Float32Array(CAPACITY * 3);
  private count = 0;
  private readonly emitters = new Set<Emitter>();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly c = new THREE.Color();
  /** Deterministic jitter (looks only; never touches the sim's RNG). */
  private seed = 1;

  constructor() {
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ flatShading: true }), CAPACITY);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, this.c.setHex(0xffffff));
  }

  get live(): number {
    return this.count;
  }

  addEmitter(spec: EmitterSpec): EmitterSpec {
    const e: Emitter = { ...spec, timer: this.rand() * spec.every };
    this.emitters.add(e);
    return e;
  }

  removeEmitter(e: EmitterSpec) {
    this.emitters.delete(e as Emitter);
  }

  /** A one-off cloud: puffs thrown outwards and up from a point. */
  burst(x: number, y: number, z: number, n: number, color: number, size: number, speed: number, life: number) {
    for (let k = 0; k < n; k++) {
      const a = this.rand() * Math.PI * 2;
      const sp = speed * (0.4 + this.rand() * 0.6);
      this.spawn(x, y, z, Math.cos(a) * sp, speed * 0.3 * this.rand(), Math.sin(a) * sp, color, size * (0.6 + this.rand() * 0.6), life * (0.7 + this.rand() * 0.6));
    }
  }

  update(dt: number) {
    for (const e of this.emitters) {
      e.timer -= dt;
      while (e.timer <= 0) {
        e.timer += e.every;
        const j = () => (this.rand() - 0.5) * 0.15;
        this.spawn(e.x + j(), e.y, e.z + j(), j(), e.rise, j(), e.color, e.size * (0.7 + this.rand() * 0.5), e.life * (0.8 + this.rand() * 0.4));
      }
    }
    let k = 0;
    while (k < this.count) {
      this.age[k] += dt;
      if (this.age[k] >= this.life[k]) {
        this.moveLast(k);
        continue;
      }
      for (let a = 0; a < 3; a++) this.pos[k * 3 + a] += this.vel[k * 3 + a] * dt;
      // Drag on the sideways throw so bursts settle into a drifting cloud.
      this.vel[k * 3] *= 1 - Math.min(1, dt * 2);
      this.vel[k * 3 + 2] *= 1 - Math.min(1, dt * 2);
      k++;
    }
    for (let p = 0; p < this.count; p++) {
      const t = this.age[p] / this.life[p];
      // Swell quickly, then shrink to nothing.
      const r = this.size[p] * Math.min(1, 0.35 + t * 3) * (1 - t * t);
      this.m.compose(
        this.v.fromArray(this.pos, p * 3),
        this.q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, this.spin[p] + t),
        this.s.setScalar(Math.max(0.001, r)),
      );
      this.mesh.setMatrixAt(p, this.m);
      this.mesh.setColorAt(p, this.c.fromArray(this.colors, p * 3));
    }
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }

  private spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: number, size: number, life: number) {
    if (this.count >= CAPACITY) return;
    const k = this.count++;
    this.pos.set([x, y, z], k * 3);
    this.vel.set([vx, vy, vz], k * 3);
    this.age[k] = 0;
    this.life[k] = life;
    this.size[k] = size;
    this.spin[k] = this.rand() * Math.PI * 2;
    this.c.setHex(color).toArray(this.colors, k * 3);
  }

  /** Removes puff k by moving the last puff into its slot. */
  private moveLast(k: number) {
    const last = --this.count;
    if (k === last) return;
    this.pos.copyWithin(k * 3, last * 3, last * 3 + 3);
    this.vel.copyWithin(k * 3, last * 3, last * 3 + 3);
    this.colors.copyWithin(k * 3, last * 3, last * 3 + 3);
    this.age[k] = this.age[last];
    this.life[k] = this.life[last];
    this.size[k] = this.size[last];
    this.spin[k] = this.spin[last];
  }

  private rand(): number {
    // xorshift32
    let x = this.seed;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.seed = x >>> 0;
    return this.seed / 4294967296;
  }
}
