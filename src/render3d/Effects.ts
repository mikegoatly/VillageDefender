// World-space effects: projectiles, boss telegraphs, shockwaves, the charge line, the flail ring
// and the rally pulse. Transient effects own their meshes and remove themselves when done.

import * as THREE from 'three';
import type { Projectile } from '../sim/world';
import type { InstancedModel, ModelLibrary } from './assets';

const RED = 0xb8322c;
const MODELS = { arrow: 'mini-forest/weapon-arrow', axe: 'medieval-weapons/axe-single' };
/** Models the effects need preloaded. */
export const EFFECT_MODELS = Object.values(MODELS);
const MAX_PROJECTILES = 256;
/** Arrows and axes fly at about chest height. */
const FLIGHT_Y = 0.55;
const ARROW_SCALE = 1.6;
const AXE = { scale: 0.18, centre: 1.5, spin: 18 };
/** Effects lie just above the ground and roads. */
const GROUND_Y = 0.06;
/** Gem Magnet ring colour (the gems' blue). */
const MAGNET_COLOR = 0x6fb8ff;
/** Warhammer ground cracks. */
const CRACK = { color: 0x3b2f24, opacity: 0.55, width: 0.07, life: 1.2 };
/** Slash crescent: waist height, colour, fill and edge opacity, and sweep and fade times (s). */
export const SLASH = { y: 0.4, color: 0xf6f2e6, fill: 0.22, edge: 0.85, sweep: 0.08, fade: 0.2 };

interface Transient {
  /** Advances by dt; returns false when finished. */
  update(dt: number): boolean;
  dispose(): void;
}

export class Effects {
  readonly root = new THREE.Group();
  private readonly items: Transient[] = [];
  private readonly timers: { left: number; fn: () => void }[] = [];
  private readonly arrows: InstancedModel;
  private readonly axes: InstancedModel;
  private readonly spin: THREE.Group;
  private readonly magnet: THREE.Mesh;
  /** A unit square lying flat, scaled into each crack stroke. */
  private readonly crackStroke = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private spinRadius = 0;
  private clock = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly axeLocal = new THREE.Matrix4()
    .makeRotationX(Math.PI / 2)
    .multiply(new THREE.Matrix4().makeScale(AXE.scale, AXE.scale, AXE.scale))
    .multiply(new THREE.Matrix4().makeTranslation(0, -AXE.centre, 0));

  constructor(library: ModelLibrary) {
    this.arrows = library.instancedModel(MODELS.arrow, MAX_PROJECTILES, true);
    this.axes = library.instancedModel(MODELS.axe, MAX_PROJECTILES, true);
    this.spin = new THREE.Group();
    this.spin.visible = false;
    this.magnet = this.flat(new THREE.RingGeometry(0.96, 1, 64), MAGNET_COLOR, 0, 0, 0);
    this.magnet.visible = false;
    this.root.add(this.arrows.group, this.axes.group, this.spin);
  }

  update(dt: number, projectiles: Projectile[]) {
    this.clock += dt;
    for (let k = this.timers.length - 1; k >= 0; k--) {
      const t = this.timers[k];
      t.left -= dt;
      if (t.left <= 0) {
        this.timers.splice(k, 1);
        t.fn();
      }
    }
    for (let k = this.items.length - 1; k >= 0; k--) {
      if (this.items[k].update(dt)) continue;
      this.items[k].dispose();
      this.items.splice(k, 1);
    }
    this.syncProjectiles(projectiles);
  }

  /** Runs `fn` after `seconds` (effects timed with a swing). */
  later(seconds: number, fn: () => void) {
    this.timers.push({ left: seconds, fn });
  }

  /** Ground circle that fills over `time` seconds: a boss slam or boulder warning. */
  telegraph(x: number, z: number, radius: number, time: number) {
    const outline = this.flat(new THREE.RingGeometry(radius * 0.94, radius, 48), RED, 0.9, x, z);
    const area = this.flat(new THREE.CircleGeometry(radius, 48), RED, 0.18, x, z);
    const fill = this.flat(new THREE.CircleGeometry(radius, 48), RED, 0.35, x, z, 0.003);
    let t = 0;
    this.items.push({
      update: (dt) => {
        t += dt;
        fill.scale.setScalar(Math.max(0.001, Math.min(1, t / time)));
        return t < time;
      },
      dispose: () => [outline, area, fill].forEach(disposeMesh),
    });
  }

  /** Expanding ring that fades (boss slam, boulder impact, hammer slam). */
  shockwave(x: number, z: number, radius: number, color = 0xc9b29b) {
    const ring = this.flat(new THREE.RingGeometry(0.85, 1, 48), color, 0.9, x, z, 0.004);
    let t = 0;
    const life = 0.42;
    this.items.push({
      update: (dt) => {
        t += dt;
        const k = 1 - Math.pow(1 - Math.min(1, t / life), 3);
        ring.scale.setScalar(Math.max(0.001, radius * (0.2 + 0.8 * k) * 1.1));
        (ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - k);
        return t < life;
      },
      dispose: () => disposeMesh(ring),
    });
  }

  /** Blinking red dashes from the boss to the building it is about to charge. */
  chargeLine(fx: number, fz: number, tx: number, tz: number, time: number) {
    const len = Math.hypot(tx - fx, tz - fz);
    const n = 7;
    const dash = len / (n * 2);
    const group = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: RED, transparent: true, opacity: 0.75, depthWrite: false });
    const geo = new THREE.PlaneGeometry(dash, 0.14).rotateX(-Math.PI / 2);
    const angle = Math.atan2(-(tz - fz), tx - fx);
    for (let k = 0; k < n; k++) {
      const f = (k * 2 + 0.5) / (n * 2);
      const d = new THREE.Mesh(geo, mat);
      d.position.set(fx + (tx - fx) * f, GROUND_Y, fz + (tz - fz) * f);
      d.rotation.y = angle;
      d.renderOrder = 1;
      group.add(d);
    }
    this.root.add(group);
    let t = 0;
    this.items.push({
      update: (dt) => {
        t += dt;
        mat.opacity = Math.floor(t / 0.125) % 2 ? 0.2 : 0.75;
        return t < time;
      },
      dispose: () => {
        group.removeFromParent();
        geo.dispose();
        mat.dispose();
      },
    });
  }

  /** Expanding ring at a point, out to about `size` (rally call; dodge ready). */
  pulse(x: number, z: number, color: number, size = 3.8) {
    const ring = this.flat(new THREE.RingGeometry(0.85, 1, 48), color, 1, x, z, 0.005);
    let t = 0;
    const life = 0.7;
    this.items.push({
      update: (dt) => {
        t += dt;
        const k = 1 - Math.pow(1 - Math.min(1, t / life), 3);
        ring.scale.setScalar(0.3 + k * (size - 0.3));
        (ring.material as THREE.MeshBasicMaterial).opacity = 1 - k;
        return t < life;
      },
      dispose: () => disposeMesh(ring),
    });
  }

  /**
   * Sword/spear slash: a pale crescent at waist height that sweeps across the swing's arc in
   * SLASH.sweep seconds, then fades. Its size is the swing's real reach and arc, so upgrades show.
   */
  slash(x: number, z: number, facingX: number, facingZ: number, reach: number, halfArc: number, color = SLASH.color) {
    const segments = Math.max(4, Math.ceil(halfArc * 16));
    const angle = -Math.atan2(facingZ, facingX);
    // A faint fan over the whole arc and a bright band along its edge, centred on the facing.
    const layers = [
      { inner: Math.min(0.3, reach * 0.4), opacity: SLASH.fill },
      { inner: reach * 0.82, opacity: SLASH.edge },
    ].map(({ inner, opacity }) => {
      const mesh = this.flat(new THREE.RingGeometry(inner, reach, segments, 1, -halfArc, halfArc * 2), color, opacity, x, z, SLASH.y - GROUND_Y);
      mesh.rotation.y = angle;
      return { mesh, material: mesh.material as THREE.MeshBasicMaterial, opacity, perSegment: mesh.geometry.index!.count / segments };
    });
    let t = 0;
    this.items.push({
      update: (dt) => {
        t += dt;
        // RingGeometry indexes segment by segment from thetaStart, so a partial draw range sweeps it.
        const shown = Math.ceil(segments * Math.min(1, t / SLASH.sweep));
        const fade = 1 - Math.max(0, (t - SLASH.sweep) / SLASH.fade);
        for (const l of layers) {
          l.mesh.geometry.setDrawRange(0, shown * l.perSegment);
          l.material.opacity = l.opacity * fade;
        }
        return t < SLASH.sweep + SLASH.fade;
      },
      dispose: () => layers.forEach((l) => disposeMesh(l.mesh)),
    });
  }

  /**
   * Cracks in the ground: `lines` dark jagged strokes radiating up to `radius` from a point,
   * fading out over a second (warhammer slams; more lines at higher ranks).
   */
  crack(x: number, z: number, radius: number, lines: number, seed: number) {
    const mat = new THREE.MeshBasicMaterial({ color: CRACK.color, transparent: true, opacity: CRACK.opacity, depthWrite: false });
    const group = new THREE.Group();
    group.position.set(x, GROUND_Y + 0.002, z);
    let r = seed * 9301 + 49297;
    const rand = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
    for (let k = 0; k < lines; k++) {
      // Each crack is two or three short strokes that wander off the radial line.
      let a = ((k + rand() * 0.6) / lines) * Math.PI * 2;
      let px = 0;
      let pz = 0;
      const len = radius * (0.55 + rand() * 0.45);
      const strokes = 2 + Math.floor(rand() * 2);
      for (let s = 0; s < strokes; s++) {
        const l = len / strokes;
        const m = new THREE.Mesh(this.crackStroke, mat);
        m.scale.set(l, 1, CRACK.width * (1 - s / (strokes + 1)));
        m.position.set(px + (Math.cos(a) * l) / 2, 0, pz + (Math.sin(a) * l) / 2);
        m.rotation.y = -a;
        m.renderOrder = 1;
        group.add(m);
        px += Math.cos(a) * l;
        pz += Math.sin(a) * l;
        a += (rand() - 0.5) * 0.9;
      }
    }
    this.root.add(group);
    let t = 0;
    this.items.push({
      update: (dt) => {
        t += dt;
        mat.opacity = CRACK.opacity * Math.min(1, Math.max(0, (CRACK.life - t) / 0.4));
        return t < CRACK.life;
      },
      dispose: () => {
        group.removeFromParent();
        mat.dispose();
      },
    });
  }

  /** Gem Magnet: a faint ring on the ground at the pickup radius (x = null hides it). */
  magnetRing(x: number | null, z: number, radius: number, opacity: number) {
    this.magnet.visible = x !== null;
    if (x === null) return;
    this.magnet.position.set(x, GROUND_Y + 0.001, z);
    this.magnet.scale.setScalar(radius);
    (this.magnet.material as THREE.MeshBasicMaterial).opacity = opacity;
  }

  /** Flail: three arcs spinning around the knight while attacking (x = null hides them). */
  spinRing(x: number | null, z: number, radius: number) {
    this.spin.visible = x !== null;
    if (x === null) return;
    if (Math.abs(radius - this.spinRadius) > 1e-3) {
      this.spinRadius = radius;
      for (const c of [...this.spin.children]) disposeMesh(c as THREE.Mesh);
      const mat = new THREE.MeshBasicMaterial({ color: 0xcfd6dd, transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false });
      for (let k = 0; k < 3; k++) {
        const arc = new THREE.Mesh(new THREE.RingGeometry(radius * 0.92, radius, 16, 1, (k * Math.PI * 2) / 3, 0.96).rotateX(-Math.PI / 2), k === 0 ? mat : mat.clone());
        this.spin.add(arc);
      }
    }
    this.spin.position.set(x, 0.35, z);
    this.spin.rotation.y = -this.clock * 12;
  }

  dispose() {
    for (const i of this.items) i.dispose();
    this.items.length = 0;
    for (const c of [...this.spin.children]) disposeMesh(c as THREE.Mesh);
    this.crackStroke.dispose();
    disposeMesh(this.magnet);
    this.arrows.dispose();
    this.axes.dispose();
    this.root.removeFromParent();
  }

  private syncProjectiles(projectiles: Projectile[]) {
    let arrows = 0;
    let axes = 0;
    for (const p of projectiles) {
      this.v.set(p.x, FLIGHT_Y, p.y);
      if (p.kind === 'axe') {
        if (axes >= MAX_PROJECTILES) continue;
        this.q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, this.clock * AXE.spin + p.id);
        this.m.compose(this.v, this.q, this.s.setScalar(1)).multiply(this.axeLocal);
        this.axes.setMatrixAt(axes++, this.m);
      } else {
        if (arrows >= MAX_PROJECTILES) continue;
        // The arrow model points along +Z.
        this.q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.atan2(p.vx, p.vy));
        this.arrows.setMatrixAt(arrows++, this.m.compose(this.v, this.q, this.s.setScalar(ARROW_SCALE)));
      }
    }
    this.arrows.setCount(arrows);
    this.axes.setCount(axes);
  }

  /** A flat, unlit, see-through shape on the ground. */
  private flat(geo: THREE.BufferGeometry, color: number, opacity: number, x: number, z: number, lift = 0): THREE.Mesh {
    const mesh = new THREE.Mesh(
      geo.rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide }),
    );
    mesh.position.set(x, GROUND_Y + lift, z);
    mesh.renderOrder = 1;
    this.root.add(mesh);
    return mesh;
  }
}

function disposeMesh(m: THREE.Mesh) {
  m.removeFromParent();
  m.geometry.dispose();
  (m.material as THREE.Material).dispose();
}
