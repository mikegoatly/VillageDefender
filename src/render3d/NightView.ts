// Night towns (Lanternwick): the moonlight grade as night falls wave by wave, a fixed pool of real
// point lights handed to the light sources nearest the knight (nightLights.ts), soft glow pools on
// the ground under every window and lamp so far-off lights still read as lit, glowing lamp heads, and
// lightning. Only built for night towns; the light count never changes, so shaders never recompile.

import * as THREE from 'three';
import type { World } from '../sim/world';
import { NIGHT } from '../data/night';
import { LightMap } from './nightDark';
import { LAMP } from './buildings';
import { CAMERA_DIR } from './camera';
import {
  approach, LIGHT_POOL, LIGHTNING, lightningFlash, lightSources, LightSlots, nightLevel, type LightKind, type LightSource,
} from './nightLights';
import type { Stage } from './Stage';

/** How fast the shown night level follows the wave (level per second): a third of the way takes ~3 s. */
const NIGHT_RATE = 0.12;
/**
 * Real lights by kind: peak intensity and decay (three.js physical units). Lights are dimmer at dusk
 * (`dusk` × at level 0, full at level 1).
 */
const LIGHTS: Record<LightKind, { intensity: number; decay: number }> = {
  lantern: { intensity: 5, decay: 1.4 },
  window: { intensity: 2.6, decay: 1.5 },
  lamp: { intensity: 4, decay: 1.5 },
  wisp: { intensity: 2.2, decay: 1.6 },
};
const DUSK_LIGHT = 0.55;
/** A real light reaches this × the sim's lit radius, so it is still clearly bright at the lit edge. */
const LIGHT_REACH = 1.35;
/**
 * Ground glow under every window and lamp (additive, unlit): `size` × the source's (sim) radius across,
 * so the glow's visible edge sits about where the light stops counting; weaker at dusk, and mostly
 * handed over to the real light where one is lit (`real` of it fades).
 */
const POOL = { size: 2.5, y: 0.025, dusk: 0.22, night: 0.5, real: 0.6 };
/** Planning: a ring on the ground at each dark post's light radius (gold once oil lights it, white when selected). */
const RING = { y: 0.04, width: 0.08, dark: 0x8fa6d8, lit: 0xffc860, selected: 0xffffff, opacity: 0.85 };
/** Lamp heads: a small glowing core and a camera-facing halo. */
const LAMP_GLOW = { color: 0xffe0a0, core: 0.085, halo: 0.75, haloColor: 0xffc070, haloStrength: 0.55 };
const POOL_CAPACITY = 256;

export interface NightViewOptions {
  /** Real point lights in the pool (default LIGHT_POOL; `&lights=<n>`, at least 1 for the lantern). */
  lights?: number;
  /** Random lightning strikes (`&lightning=0` turns them off, for screenshots). */
  lightning: boolean;
  /** Called a moment after each strike (a low thunder rumble). */
  onThunder?: () => void;
}

export class NightView {
  readonly root = new THREE.Group();
  private readonly slots: LightSlots;
  private readonly lights: THREE.PointLight[];
  private readonly pools: THREE.InstancedMesh;
  private readonly heads: THREE.InstancedMesh;
  private readonly halos: THREE.InstancedMesh;
  private readonly owned: { dispose(): void }[] = [];
  private level = -1;
  private clock = 0;
  private struckAt = -Infinity;
  private nextStrike: number;
  private thunderDue = false;
  private held = false;
  private planning = false;
  private selectedLamp = -1;
  private lampKey = '';
  private readonly face: THREE.Quaternion;
  private readonly rings: THREE.InstancedMesh;
  private readonly lightMap: LightMap;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly c = new THREE.Color();

  constructor(private readonly stage: Stage, world: World, private readonly opts: NightViewOptions) {
    this.slots = new LightSlots(Math.max(1, Math.round(opts.lights ?? LIGHT_POOL)));
    this.nextStrike = randomBetween(...LIGHTNING.every);
    this.lights = Array.from({ length: this.slots.size }, () => {
      const l = new THREE.PointLight(0xffffff, 0, 1, 1.5);
      l.castShadow = false;
      this.root.add(l);
      return l;
    });

    const glowTex = this.own(radialTexture());
    const additive = (color = 0xffffff) => this.own(new THREE.MeshBasicMaterial({
      color, map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    }));
    this.pools = new THREE.InstancedMesh(this.own(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), additive(), POOL_CAPACITY);
    this.pools.frustumCulled = false;
    this.pools.renderOrder = 1;
    this.pools.count = 0;

    // Lamp heads: one per post, hidden while the post is dark or knocked over (syncLamps).
    const lamps = world.lamps;
    const n = Math.max(1, lamps.length);
    this.heads = new THREE.InstancedMesh(
      this.own(new THREE.SphereGeometry(LAMP_GLOW.core, 8, 6)), this.own(new THREE.MeshBasicMaterial({ color: LAMP_GLOW.color, fog: false })), n,
    );
    // Halos face the (fixed) camera.
    const face = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), CAMERA_DIR.clone().normalize());
    this.halos = new THREE.InstancedMesh(this.own(new THREE.PlaneGeometry(1, 1)), additive(), n);
    this.face = face;
    const haloColor = new THREE.Color(LAMP_GLOW.haloColor).multiplyScalar(LAMP_GLOW.haloStrength);
    lamps.forEach((_, k) => this.halos.setColorAt(k, haloColor));
    this.heads.count = lamps.length;
    this.halos.count = lamps.length;
    this.halos.renderOrder = 1;
    this.rings = new THREE.InstancedMesh(
      this.own(new THREE.RingGeometry(1 - RING.width, 1, 64).rotateX(-Math.PI / 2)),
      this.own(new THREE.MeshBasicMaterial({ transparent: true, opacity: RING.opacity, depthWrite: false, fog: false })),
      n,
    );
    this.rings.renderOrder = 2;
    this.rings.count = 0;
    for (const im of [this.heads, this.halos, this.rings]) im.frustumCulled = false;
    this.root.add(this.pools, this.heads, this.halos, this.rings);
    this.syncLamps(world);
    this.lightMap = new LightMap(world.map.size);
  }

  /** Planning: show the light radius of each post that starts dark (oil can light it). */
  setPlanning(on: boolean) {
    this.planning = on;
  }

  /** Planning: highlight one lamp post's ring (-1 for none). */
  highlightLamp(id: number) {
    this.selectedLamp = id;
  }

  sync(world: World, dt: number) {
    this.clock += dt;
    const target = nightLevel(Math.max(1, world.wave));
    this.level = this.level < 0 ? target : approach(this.level, target, NIGHT_RATE, dt);
    const flash = this.syncLightning();
    this.stage.setNight(this.level, flash);

    const sources = lightSources(world);
    const k = world.players[0];
    const centre = k && k.state !== 'dead' ? { x: k.x, z: k.y } : { x: world.map.centre, z: world.map.centre };
    this.slots.update(sources, centre, dt);
    const dusk = DUSK_LIGHT + (1 - DUSK_LIGHT) * this.level;
    this.slots.slots.forEach((slot, i) => {
      const light = this.lights[i];
      const s = slot.source;
      if (!s || slot.weight <= 0) {
        light.intensity = 0;
        return;
      }
      const spec = LIGHTS[s.kind];
      light.position.set(s.x, s.y, s.z);
      light.color.setHex(s.color);
      light.distance = s.radius * LIGHT_REACH;
      light.decay = spec.decay;
      light.intensity = spec.intensity * slot.weight * dusk;
    });
    this.syncPools(sources);
    this.syncLamps(world);
    // Real darkness comes in with the sim's darkness rules (wave 3), eased with the shown night level.
    this.lightMap.update(world, this.stage.camera, darknessStrength(this.level));
  }

  /** Debug/screenshots: hold the lightning at full flash (true) or let it go (false). */
  lightning(hold: boolean) {
    this.held = hold;
  }

  dispose() {
    this.root.removeFromParent();
    for (const im of [this.pools, this.heads, this.halos, this.rings]) im.dispose();
    this.lightMap.dispose();
    for (const o of this.owned) o.dispose();
  }

  /** Strikes every 15–35 s (Math.random: render side only, never the sim's RNG); returns the flash 0..1. */
  private syncLightning(): number {
    if (this.held) return 1;
    if (this.opts.lightning && this.clock >= this.nextStrike) {
      this.struckAt = this.clock;
      this.nextStrike = this.clock + randomBetween(...LIGHTNING.every);
      this.thunderDue = true;
    }
    if (this.thunderDue && this.clock - this.struckAt >= LIGHTNING.thunderAfter) {
      this.thunderDue = false;
      this.opts.onThunder?.();
    }
    return lightningFlash(this.clock - this.struckAt);
  }

  /** Lamp heads glow only on lit, standing posts; planning rings on the posts that start dark. */
  private syncLamps(world: World) {
    const lamps = world.lamps;
    const key = `${this.planning}:${this.selectedLamp}:${lamps.map((l) => (l.hp > 0 ? (l.lit ? 1 : 0) : 2)).join('')}`;
    if (key === this.lampKey) return;
    this.lampKey = key;
    let rings = 0;
    lamps.forEach((l, k) => {
      const on = l.lit && l.hp > 0;
      const y = LAMP.head;
      this.heads.setMatrixAt(k, this.m.compose(this.v.set(l.x, y, l.y), this.q.identity(), this.s.setScalar(on ? 1 : 0)));
      this.halos.setMatrixAt(k, this.m.compose(this.v.set(l.x, y, l.y), this.face, this.s.setScalar(on ? LAMP_GLOW.halo : 0)));
      if (!this.planning || l.startsLit) return;
      const r = NIGHT.radius.lamp;
      this.rings.setMatrixAt(rings, this.m.compose(this.v.set(l.x, RING.y, l.y), this.q.identity(), this.s.set(r, 1, r)));
      this.rings.setColorAt(rings, this.c.setHex(l.id === this.selectedLamp ? RING.selected : l.lit ? RING.lit : RING.dark));
      rings++;
    });
    this.rings.count = rings;
    for (const im of [this.heads, this.halos, this.rings]) {
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }

  /** A warm pool on the ground under every window and lamp, weaker where a real light already shines. */
  private syncPools(sources: readonly LightSource[]) {
    const strength = POOL.dusk + (POOL.night - POOL.dusk) * this.level;
    let n = 0;
    for (const s of sources) {
      if (s.kind === 'lantern' || n >= POOL_CAPACITY) continue;
      const w = 1 - POOL.real * this.slots.weightOf(s.key);
      this.pools.setMatrixAt(n, this.m.compose(this.v.set(s.x, POOL.y, s.z), this.q.identity(), this.s.setScalar(s.radius * POOL.size)));
      this.pools.setColorAt(n, this.c.setHex(s.color).multiplyScalar(strength * w));
      n++;
    }
    this.pools.count = n;
    this.pools.instanceMatrix.needsUpdate = true;
    if (this.pools.instanceColor) this.pools.instanceColor.needsUpdate = true;
  }

  private own<T extends { dispose(): void }>(o: T): T {
    this.owned.push(o);
    return o;
  }
}

/**
 * How far real darkness has come in at a shown night level: none at dusk (wave 2: level 1/3), all of
 * it by the level of wave 3, when the sim's darkness rules start (NIGHT.darkFrom).
 */
export function darknessStrength(level: number): number {
  const from = NIGHT.darkFrom - 1 / 6;
  return Math.min(1, Math.max(0, (level - from) / (2 / 3 - from)));
}

function randomBetween(lo: number, hi: number): number {
  return lo + Math.random() * (hi - lo);
}

/** A soft round glow (white, alpha and colour falling off smoothly to the edge), made in code. */
function radialTexture(size = 64): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const r = Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) / (size / 2);
      const a = r >= 1 ? 0 : Math.pow(1 - r, 2) * (3 - 2 * (1 - r)) * (1 - r);
      const k = (y * size + x) * 4;
      const v = Math.round(255 * a);
      data[k] = data[k + 1] = data[k + 2] = v;
      data[k + 3] = v;
    }
  }
  const tex = new THREE.DataTexture(data, size, size);
  tex.needsUpdate = true;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}
