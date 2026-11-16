// Low-poly particles, one instanced mesh per kind and no per-frame allocation:
// - puffs: smoke and dust that swell and then shrink away (instances cannot fade individually
//   without a custom shader);
// - sparks: small unlit chips thrown out fast that fall under gravity and shrink (hit sparks).

import * as THREE from 'three';

const PUFF_CAPACITY = 700;
const SPARK_CAPACITY = 400;
const GRAVITY = 9;

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

interface PoolStyle {
  capacity: number;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Downward acceleration (units/s²). */
  gravity: number;
  /** Fraction of sideways speed lost per second. */
  drag: number;
  /** Fraction of falling speed kept when bouncing off the ground (0: pass through it). */
  bounce: number;
  /** Size over life, t = 0..1. */
  sizeAt(t: number): number;
  /** Sparks tumble quickly; puffs turn slowly. */
  spinRate: number;
}

/** One instanced mesh of particles of a single kind. */
class Pool {
  readonly mesh: THREE.InstancedMesh;
  private readonly pos: Float32Array;
  private readonly vel: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly size: Float32Array;
  private readonly spin: Float32Array;
  private readonly colors: Float32Array;
  count = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly c = new THREE.Color();

  constructor(private readonly style: PoolStyle) {
    const n = style.capacity;
    this.pos = new Float32Array(n * 3);
    this.vel = new Float32Array(n * 3);
    this.age = new Float32Array(n);
    this.life = new Float32Array(n);
    this.size = new Float32Array(n);
    this.spin = new Float32Array(n);
    this.colors = new Float32Array(n * 3);
    this.mesh = new THREE.InstancedMesh(style.geometry, style.material, n);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.setColorAt(0, this.c.setHex(0xffffff));
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: number, size: number, life: number, spin: number) {
    if (this.count >= this.style.capacity) return;
    const k = this.count++;
    this.pos[k * 3] = x; this.pos[k * 3 + 1] = y; this.pos[k * 3 + 2] = z;
    this.vel[k * 3] = vx; this.vel[k * 3 + 1] = vy; this.vel[k * 3 + 2] = vz;
    this.age[k] = 0;
    this.life[k] = life;
    this.size[k] = size;
    this.spin[k] = spin;
    this.c.setHex(color).toArray(this.colors, k * 3);
  }

  update(dt: number) {
    const { gravity, drag, bounce, spinRate } = this.style;
    const keep = 1 - Math.min(1, dt * drag);
    let k = 0;
    while (k < this.count) {
      this.age[k] += dt;
      if (this.age[k] >= this.life[k]) {
        this.moveLast(k);
        continue;
      }
      const i = k * 3;
      this.vel[i + 1] -= gravity * dt;
      for (let a = 0; a < 3; a++) this.pos[i + a] += this.vel[i + a] * dt;
      if (bounce > 0 && this.pos[i + 1] < 0.02 && this.vel[i + 1] < 0) {
        this.pos[i + 1] = 0.02;
        this.vel[i + 1] *= -bounce;
      }
      // Drag on the sideways throw so bursts settle into a drifting cloud.
      this.vel[i] *= keep;
      this.vel[i + 2] *= keep;
      k++;
    }
    for (let p = 0; p < this.count; p++) {
      const t = this.age[p] / this.life[p];
      const r = this.size[p] * this.style.sizeAt(t);
      const turn = this.spin[p] + t * spinRate;
      this.m.compose(
        this.v.fromArray(this.pos, p * 3),
        this.q.setFromEuler(this.e.set(turn * 0.7, turn, 0)),
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

  /** Removes particle k by moving the last one into its slot. */
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
}

export class Particles {
  readonly root = new THREE.Group();
  private readonly puffs = new Pool({
    capacity: PUFF_CAPACITY,
    geometry: new THREE.IcosahedronGeometry(1, 0),
    material: new THREE.MeshLambertMaterial({ flatShading: true }),
    gravity: 0,
    drag: 2,
    bounce: 0,
    // Swell quickly, then shrink to nothing.
    sizeAt: (t) => Math.min(1, 0.35 + t * 3) * (1 - t * t),
    spinRate: 1,
  });
  private readonly sparks = new Pool({
    capacity: SPARK_CAPACITY,
    geometry: new THREE.OctahedronGeometry(1, 0),
    // Unlit so they read as bright chips of light whatever the scene lighting.
    material: new THREE.MeshBasicMaterial(),
    gravity: GRAVITY,
    drag: 1.5,
    // Bounce off the ground instead of sinking through it.
    bounce: 0.3,
    sizeAt: (t) => 1 - t,
    spinRate: 12,
  });
  private readonly emitters = new Set<Emitter>();
  /** Deterministic jitter (looks only; never touches the sim's RNG). */
  private seed = 1;

  constructor() {
    this.root.add(this.puffs.mesh, this.sparks.mesh);
  }

  get live(): number {
    return this.puffs.count + this.sparks.count;
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
      this.puff(x, y, z, Math.cos(a) * sp, speed * 0.3 * this.rand(), Math.sin(a) * sp, color, size * (0.6 + this.rand() * 0.6), life * (0.7 + this.rand() * 0.6));
    }
  }

  /**
   * A puff of kicked-up dust at ground level drifting along (dirX, dirZ) and spreading sideways.
   * `size` scales the puff (a charging boss throws up more than the knight).
   */
  dust(x: number, z: number, dirX: number, dirZ: number, color: number, size: number) {
    const side = (this.rand() - 0.5) * 1.2;
    const sp = 0.5 + this.rand() * 0.6;
    const j = () => (this.rand() - 0.5) * 0.12 * size;
    this.puff(
      x + j(), 0.08 * size, z + j(),
      (dirX * sp - dirZ * side) * size, 0.35 + this.rand() * 0.3, (dirZ * sp + dirX * side) * size,
      color, 0.21 * size * (0.75 + this.rand() * 0.5), 0.55 + this.rand() * 0.3,
    );
  }

  /** Bright chips thrown out from a point, mostly up and away along (dirX, dirZ) if given. */
  spark(x: number, y: number, z: number, n: number, color: number, speed: number, dirX = 0, dirZ = 0) {
    for (let k = 0; k < n; k++) {
      const a = this.rand() * Math.PI * 2;
      const sp = speed * (0.5 + this.rand() * 0.6);
      this.sparks.spawn(
        x, y, z,
        Math.cos(a) * sp * 0.6 + dirX * sp, speed * (0.4 + this.rand() * 0.6), Math.sin(a) * sp * 0.6 + dirZ * sp,
        color, 0.06 + this.rand() * 0.04, 0.28 + this.rand() * 0.2, this.rand() * Math.PI * 2,
      );
    }
  }

  update(dt: number) {
    for (const e of this.emitters) {
      e.timer -= dt;
      while (e.timer <= 0) {
        e.timer += e.every;
        const j = () => (this.rand() - 0.5) * 0.15;
        this.puff(e.x + j(), e.y, e.z + j(), j(), e.rise, j(), e.color, e.size * (0.7 + this.rand() * 0.5), e.life * (0.8 + this.rand() * 0.4));
      }
    }
    this.puffs.update(dt);
    this.sparks.update(dt);
  }

  dispose() {
    this.puffs.dispose();
    this.sparks.dispose();
    this.root.removeFromParent();
  }

  private puff(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: number, size: number, life: number) {
    this.puffs.spawn(x, y, z, vx, vy, vz, color, size, life, this.rand() * Math.PI * 2);
  }

  private rand(): number {
    // xorshift32
    let x = this.seed;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    this.seed = x >>> 0;
    return this.seed / 4294967296;
  }
}
