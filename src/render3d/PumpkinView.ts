// Town 5 (Lanternwick): the Pumpkin King's flaming pumpkins and the fires they leave. A pumpkin flies
// from his hand to the telegraphed building over the sim's wind-up, burning and trailing embers;
// where it lands, the fire (sim/fire.ts: world.fires) is drawn as burst pumpkin shell and flickering
// flames throwing up sparks, flaring up as it starts and dying down at its end. The fire's light
// itself is NightView's (a real light, a ground glow and the light map), like every other light.
// Render-only randomness (Math.random): never the sim's RNG.

import * as THREE from 'three';
import { PUMPKIN_KING } from '../data/monsters';
import type { SimEvent, World } from '../sim/world';
import type { Particles } from './Particles';
import { fireLight } from './nightLights';

const PUMPKIN = {
  /** Height above the ground he throws from (his raised hand) and the top of the arc above that. */
  from: 1.7, arc: 2.6, size: 0.45,
  skin: 0xff8a1e, glow: 0xff7a10, stalk: 0x4f7a32, ember: 0xffb040, spin: 5,
};
const FLAME = { inner: 0xffd040, outer: 0xff5a10, height: 2.0, width: 0.72 };
const SHELL = { color: 0xe8741e, glow: 0x7a2a04, count: 6 };
/** Share of the wind-up the pumpkin is held up before it flies. */
const FLIGHT_HOLD = 0.25;
const SPARK = { every: 0.05, color: 0xffb040, hot: 0xfff0a0 };

interface Flight { group: THREE.Group; fx: number; fz: number; tx: number; tz: number; spinAxis: THREE.Vector3 }
interface Blaze { group: THREE.Group; flames: THREE.Mesh[]; seed: number; sparkIn: number; x: number; z: number; radius: number }

export class PumpkinView {
  readonly root = new THREE.Group();
  /** Pumpkins in the air, by the boss throwing them. */
  private readonly flights = new Map<number, Flight>();
  private readonly blazes = new Map<number, Blaze>();
  private clock = 0;

  private readonly pumpkinGeo = new THREE.SphereGeometry(1, 10, 8);
  private readonly stalkGeo = new THREE.CylinderGeometry(0.12, 0.16, 0.5, 5);
  private readonly shellGeo = new THREE.SphereGeometry(1, 6, 4, 0, Math.PI * 0.7, 0, Math.PI * 0.6);
  private readonly flameGeo = new THREE.ConeGeometry(0.5, 1, 7, 1, true).translate(0, 0.5, 0);
  private readonly skinMat = new THREE.MeshStandardMaterial({ color: PUMPKIN.skin, emissive: PUMPKIN.glow, emissiveIntensity: 0.9, roughness: 0.7 });
  private readonly stalkMat = new THREE.MeshStandardMaterial({ color: PUMPKIN.stalk, roughness: 0.8 });
  private readonly shellMat = new THREE.MeshStandardMaterial({ color: SHELL.color, emissive: SHELL.glow, emissiveIntensity: 1, roughness: 0.8, side: THREE.DoubleSide });
  // Outer flames solid enough to read against lit ground; inner tongues bright and additive.
  private readonly flameMats = [
    new THREE.MeshBasicMaterial({ color: FLAME.outer, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, fog: false }),
    new THREE.MeshBasicMaterial({ color: FLAME.inner, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }),
  ];

  constructor(private readonly particles: Particles) {}

  onEvent(world: World, e: SimEvent) {
    if (e.type === 'bossBoulderWarn' && e.pumpkin) {
      const boss = world.monsters.find((m) => m.id === e.unit);
      if (boss) this.throwPumpkin(boss.id, boss.x + boss.facing.x * 0.4, boss.y + boss.facing.y * 0.4, e.x, e.y);
    } else if (e.type === 'bossBoulder' && e.pumpkin) {
      // Smash: shell chips, a burst of embers and a puff of smoke.
      this.particles.spark(e.x, 0.4, e.y, 18, SPARK.color, 3.2);
      this.particles.spark(e.x, 0.4, e.y, 8, SHELL.color, 2.4);
      this.particles.burst(e.x, 0.4, e.y, 8, 0x3a3030, 0.35, 1.4, 1.2);
    }
  }

  sync(world: World, dt: number) {
    this.clock += dt;
    this.syncFlights(world, dt);
    this.syncBlazes(world, dt);
  }

  private throwPumpkin(boss: number, fx: number, fz: number, tx: number, tz: number) {
    this.flights.get(boss)?.group.removeFromParent();
    const group = new THREE.Group();
    const body = new THREE.Mesh(this.pumpkinGeo, this.skinMat);
    body.scale.set(1, 0.82, 1);
    const stalk = new THREE.Mesh(this.stalkGeo, this.stalkMat);
    stalk.position.y = 0.9;
    group.add(body, stalk);
    group.scale.setScalar(PUMPKIN.size);
    group.position.set(fx, PUMPKIN.from, fz);
    this.root.add(group);
    const spinAxis = new THREE.Vector3(Math.random() - 0.5, 0.3, Math.random() - 0.5).normalize();
    this.flights.set(boss, { group, fx, fz, tx, tz, spinAxis });
  }

  /**
   * The pumpkin follows the sim's wind-up (so hit-stop and game speed keep it in step with the
   * telegraph): held up for the first part, then lobbed onto the target, landing as the throw lands.
   */
  private syncFlights(world: World, dt: number) {
    for (const [id, f] of this.flights) {
      const boss = world.monsters.find((m) => m.id === id);
      const s = boss?.state !== 'dead' ? boss?.boss : undefined;
      if (!s || s.ability !== 'boulderWindup') {
        f.group.removeFromParent();
        this.flights.delete(id);
        continue;
      }
      const u = Math.min(1, Math.max(0, (s.abilityTime / PUMPKIN_KING.pumpkin.telegraph - FLIGHT_HOLD) / (1 - FLIGHT_HOLD)));
      // A lob: up from his hand, over, and down onto the target.
      const y = PUMPKIN.from * (1 - u) + 4 * PUMPKIN.arc * u * (1 - u) + 0.2 * u;
      const x = f.fx + (f.tx - f.fx) * u;
      const z = f.fz + (f.tz - f.fz) * u;
      f.group.position.set(x, y, z);
      f.group.rotateOnAxis(f.spinAxis, PUMPKIN.spin * dt * (u > 0 ? 1 : 0.2));
      // Burning: embers left hanging behind it.
      if (Math.random() < 0.8) this.particles.mote(x, y + 0.1, z, Math.random() < 0.5 ? PUMPKIN.ember : FLAME.outer, 0.07, 0.5, 0, 0.4, 0);
    }
  }

  private syncBlazes(world: World, dt: number) {
    const live = new Set<number>();
    for (const fire of world.fires) {
      live.add(fire.id);
      let b = this.blazes.get(fire.id);
      if (!b) this.blazes.set(fire.id, (b = this.makeBlaze(fire.id, fire.x, fire.y, fire.radius)));
      const left = fire.until - world.time;
      const k = fireLight(PUMPKIN_KING.fire.time - left, left, this.clock, fire.id);
      b.flames.forEach((m, i) => {
        const wob = 1 + 0.18 * Math.sin(this.clock * (11 + i * 3.1) + b.seed + i);
        const base = m.userData.base as number;
        m.scale.set(base * FLAME.width * (0.9 + 0.1 * wob), base * FLAME.height * k * wob, base * FLAME.width * (0.9 + 0.1 * wob));
        m.rotation.y += dt * (i % 2 ? 1.5 : -1.2);
      });
      // Sparks and embers rising off it while it burns well.
      b.sparkIn -= dt;
      while (b.sparkIn <= 0 && k > 0.2) {
        b.sparkIn += SPARK.every;
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * b.radius * 0.6;
        this.particles.mote(b.x + Math.cos(a) * r, 0.3, b.z + Math.sin(a) * r, Math.random() < 0.3 ? SPARK.hot : SPARK.color, 0.06, 0.9, (Math.random() - 0.5) * 0.3, 1.4 + Math.random(), (Math.random() - 0.5) * 0.3);
      }
      if (b.sparkIn <= 0) b.sparkIn = SPARK.every;
    }
    for (const [id, b] of this.blazes) {
      if (live.has(id)) continue;
      // Out: a last curl of smoke.
      this.particles.burst(b.x, 0.3, b.z, 5, 0x3a3434, 0.3, 0.6, 1.2);
      b.group.removeFromParent();
      this.blazes.delete(id);
    }
  }

  /** Burst pumpkin shell round the landing point and a few flames among it. */
  private makeBlaze(id: number, x: number, z: number, radius: number): Blaze {
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    const seed = id * 1.7;
    for (let k = 0; k < SHELL.count; k++) {
      const a = seed + (k / SHELL.count) * Math.PI * 2;
      const r = radius * (0.25 + 0.3 * ((k * 7) % 5) / 5);
      const shell = new THREE.Mesh(this.shellGeo, this.shellMat);
      shell.scale.setScalar(0.3 + 0.08 * (k % 3));
      shell.position.set(Math.cos(a) * r, 0.05, Math.sin(a) * r);
      shell.rotation.set(-Math.PI / 2 + 0.4, a, 0);
      group.add(shell);
    }
    const flames: THREE.Mesh[] = [];
    const spots: [number, number, number, number][] = [
      [0, 0, 1.1, 0], [0, 0, 0.7, 1], [0.5, 0.25, 0.75, 0], [0.5, 0.25, 0.45, 1], [-0.4, 0.4, 0.65, 0], [0.15, -0.5, 0.7, 0], [0.15, -0.5, 0.4, 1], [-0.45, -0.3, 0.55, 0],
    ];
    for (const [dx, dz, base, inner] of spots) {
      const m = new THREE.Mesh(this.flameGeo, this.flameMats[inner]);
      m.position.set(dx * radius * 0.6, 0.02, dz * radius * 0.6);
      m.userData.base = base;
      m.renderOrder = 3;
      flames.push(m);
      group.add(m);
    }
    this.root.add(group);
    return { group, flames, seed, sparkIn: 0, x, z, radius };
  }

  dispose() {
    this.root.removeFromParent();
    for (const o of [this.pumpkinGeo, this.stalkGeo, this.shellGeo, this.flameGeo, this.skinMat, this.stalkMat, this.shellMat, ...this.flameMats]) o.dispose();
  }
}
