// Draws every unit as instanced rigid parts: one InstancedMesh per body part per model, so draw
// calls stay flat however many units there are. Poses come from tables baked once per model.
//
// Occlusion silhouettes (decision 9), pixel-exact via depth-fail + stencil: scenery writes
// stencil 1 where visible, units write 0 where visible, so stencil 1 means "scenery is the
// nearest thing here". A silhouette twin of each part draws only where the unit is behind such a
// pixel, then bumps the stencil so each pixel is painted once. Twins share geometry and the
// instance matrix buffer, so they cost no CPU per unit.

import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { MONSTERS, type MonsterKind } from '../data/monsters';
import { TOWN_BY_ID } from '../data/towns';
import { isDark, isLit } from '../sim/light';
import { unitBase } from '../sim/units';
import type { TrapRunner, Unit, World } from '../sim/world';
import type { ModelLibrary } from './assets';
import { CHARACTER_MODELS, WADE, animFor, animLoops, clipNames, echoLook, lookFor, unitFx, VILLAGER_LOOK, wadeDepth, type AnimName, type Attachment, type UnitLook } from './characters';
import { BODIES, dressBody, hangPieces } from './bodies';
import { findClip } from './clips';
import { ECHO_ALPHA } from './motionFx';
import { bakeClip, collectParts, frameIndex, type PoseClip } from './poses';
import { eyePieces } from './nightEyes';
import { approach } from './nightLights';
import { FX_FRIENDLY, withDarkSilhouette, withFxAttribute, withUnitFx } from './unitFx';
import type { ArmyGear, KnightGear } from './upgradeFx';

/** Character size relative to one ground cell (milestone 0 look test: ~1.5x reads well). */
export const CHAR_SCALE = 1.5;
/** Mini characters are about this tall at scale 1. */
export const CHAR_HEIGHT = 0.76;
const BATCH_CAPACITY = 512;
const HALO_CAPACITY = 64;

export const HALO_KNIGHT = 0xffd75e;
export const HALO_ROOKIE = [0x7fb3e6, 0xb9d6f2, 0xffffff];
const SILHOUETTE_COLOR: Record<Unit['team'], number> = { player: HALO_KNIGHT, enemy: 0xe23b2e };
/** Allies win a pixel where an ally and a monster are both hidden. */
const SILHOUETTE_ORDER: Record<Unit['team'], number> = { player: 2, enemy: 3 };

interface Batch {
  parts: THREE.InstancedMesh[];
  /** Per unit: flash towards white, opacity, darkness (shared by all of the batch's part geometries). */
  fx: THREE.InstancedBufferAttribute;
  ghosts: THREE.InstancedMesh[];
  clips: Map<AnimName, PoseClip>;
  count: number;
}

/** A see-through copy of a unit drawn somewhere else (dash afterimage). */
export interface Echo {
  x: number;
  y: number;
  alpha: number;
}

interface UnitAnim {
  anim: AnimName | null;
  /** Seconds into the current animation. */
  t: number;
  lastStateTime: number;
  /** Displayed heading (radians about +Y); turns smoothly towards the sim's facing. */
  rot: number;
  /** Displayed river-wading depth; eases towards wadeDepth(). */
  wade: number;
  /** Displayed darkness (night towns: a monster out of the light), 0..1; eases towards the sim's light. */
  dark: number;
}

/** Seconds a monster takes to darken or come back to full colour at the edge of the light. */
const DARK_FADE = 0.15;

export interface UnitBatchOptions {
  silhouettes: boolean;
  /** Night towns: plain monster models get glowing eyes on the head bone, shown while they are dark. */
  nightEyes?: boolean;
  /** Debug (`&dark=1`): every monster drawn as if out of the light (eye close-ups). */
  forceDark?: boolean;
  /** Debug (`&eyes=1`): night eyes shown even in the light (lining them up with the painted eyes). */
  eyesAlways?: boolean;
}

export class UnitBatches {
  readonly root = new THREE.Group();
  private readonly batches = new Map<string, Batch>();
  private readonly anims = new Map<number, UnitAnim>();
  private readonly villagers = new Map<number, Unit & { working?: boolean }>();
  private readonly materials = new Map<string, THREE.Material>();
  private readonly owned: { dispose(): void }[] = [];
  private readonly silhouettes: Record<Unit['team'], THREE.MeshBasicMaterial>;
  private readonly halos: THREE.InstancedMesh;
  /** Night eyes' material (glow pieces whose alpha follows the unit's darkness). */
  private readonly eyeMaterial: THREE.MeshBasicMaterial;
  /** Seconds of hit flash left, by unit id. */
  private readonly flashes = new Map<number, number>();
  private clock = 0;

  // Scratch objects (no per-frame allocation).
  private readonly unitM = new THREE.Matrix4();
  private readonly partM = new THREE.Matrix4();
  private readonly outM = new THREE.Matrix4();
  private readonly pos = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();
  private readonly scl = new THREE.Vector3();
  private readonly col = new THREE.Color();

  constructor(private readonly library: ModelLibrary, private readonly opts: UnitBatchOptions) {
    const silhouette = (color: number) => this.own(new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.55, depthFunc: THREE.GreaterDepth, depthWrite: false,
      stencilWrite: true, stencilRef: 1, stencilFunc: THREE.EqualStencilFunc, stencilZPass: THREE.IncrementStencilOp,
    }));
    // Monsters out of the light (night) lose their silhouette: only their eyes give them away.
    this.silhouettes = { player: silhouette(SILHOUETTE_COLOR.player), enemy: withDarkSilhouette(silhouette(SILHOUETTE_COLOR.enemy)) };
    this.eyeMaterial = this.own(new THREE.MeshBasicMaterial({ vertexColors: true }));
    this.eyeMaterial.userData.nightEyes = true;

    // Friendly halos (decision 8): one instanced ring, coloured per unit.
    this.halos = new THREE.InstancedMesh(
      this.own(new THREE.RingGeometry(0.3, 0.42, 28).rotateX(-Math.PI / 2)),
      this.own(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.8, depthWrite: false })),
      HALO_CAPACITY,
    );
    this.halos.frustumCulled = false;
    this.halos.count = 0;
    this.root.add(this.halos);
  }

  /** Units currently tracked. */
  get size(): number {
    return this.anims.size;
  }

  /** Restarts a unit's current animation from its first frame (flail pulses). */
  restartAnim(unitId: number) {
    const a = this.anims.get(unitId);
    if (a) a.anim = null;
  }

  /** White hit flash on a unit for `seconds`. */
  flash(unitId: number, seconds: number) {
    this.flashes.set(unitId, Math.max(seconds, this.flashes.get(unitId) ?? 0));
  }

  /** `gear`/`army`: how the knight and rookies are drawn this frame; `echoes`: dash afterimages behind the knight. */
  sync(world: World, dt: number, gear: KnightGear, army: ArmyGear, echoes: readonly Echo[]) {
    this.clock += dt;
    for (const [id, t] of this.flashes) {
      if (t - dt <= 0) this.flashes.delete(id);
      else this.flashes.set(id, t - dt);
    }
    for (const b of this.batches.values()) b.count = 0;
    let halos = 0;
    const live = new Set<number>();
    const townLooks = TOWN_BY_ID[world.townId]?.looks;
    const lantern = world.map.theme === 'night';
    const dark0 = isDark(world);
    for (const list of [world.players, world.rookies, world.monsters]) {
      for (const u of list) {
        // Props (planted kegs) are drawn by FrostView.
        if (u.team === 'enemy' && MONSTERS[u.kind as MonsterKind].inert) continue;
        live.add(u.id);
        const look = lookFor(u, world.weapon, gear, army, townLooks, lantern);
        const fresh = !this.anims.has(u.id);
        const rot = this.animate(u, dt);
        const a = this.anims.get(u.id)!;
        a.wade += (wadeDepth(world.map, u, look.scale) - a.wade) * Math.min(1, dt * WADE.rate);
        // Night: monsters out of the light go dark (friendlies never do); eased, never popped.
        const dark = u.team === 'enemy' && (this.opts.forceDark || (dark0 && !isLit(world, u.x, u.y))) ? 1 : 0;
        a.dark = fresh ? dark : approach(a.dark, dark, 1 / DARK_FADE, dt);
        this.place(u, look, rot);
        if (u.kind === 'knight') for (const e of echoes) this.place(u, echoLook(look, ECHO_ALPHA), rot, e);
        if (u.team === 'player' && u.state !== 'dead') halos = this.halo(u, halos);
      }
    }
    // Villagers on their way to set a trap, or busy setting it.
    for (const r of world.trapRunners) {
      const u = this.villager(r);
      live.add(u.id);
      this.place(u, VILLAGER_LOOK, this.animate(u, dt));
      halos = this.halo(u, halos);
    }
    for (const id of this.villagers.keys()) if (!live.has(id)) this.villagers.delete(id);
    for (const id of this.anims.keys()) if (!live.has(id)) this.anims.delete(id);
    for (const id of this.flashes.keys()) if (!live.has(id)) this.flashes.delete(id);

    this.halos.count = halos;
    this.halos.instanceMatrix.needsUpdate = true;
    if (this.halos.instanceColor) this.halos.instanceColor.needsUpdate = true;
    for (const b of this.batches.values()) {
      for (const im of b.parts) {
        im.count = b.count;
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
      }
      for (const g of b.ghosts) g.count = b.count;
      b.fx.needsUpdate = true;
    }
  }

  /** Friendly halo under a unit (decision 8); returns the next free halo slot. */
  private halo(u: Unit, n: number): number {
    if (n >= HALO_CAPACITY) return n;
    const knight = u.kind === 'knight';
    this.outM.compose(this.pos.set(u.x, 0.03, u.y), this.quat.identity(), this.scl.setScalar(knight ? 1.3 : 1));
    this.halos.setMatrixAt(n, this.outM);
    this.halos.setColorAt(n, this.col.setHex(knight ? HALO_KNIGHT : HALO_ROOKIE[u.rank]));
    return n + 1;
  }

  /** The drawable stand-in for a trap runner (the sim has no unit for it), kept per runner id. */
  private villager(r: TrapRunner): Unit & { working?: boolean } {
    let u = this.villagers.get(r.id);
    if (!u) this.villagers.set(r.id, (u = { ...unitBase(r.id, r.x, r.y), kind: 'swordsman', team: 'player', radius: 0.2, hp: 1, maxHp: 1, speed: 0 }));
    u.x = r.x;
    u.y = r.y;
    u.facing = r.facing;
    u.working = r.setLeft !== null;
    u.moving = !u.working;
    return u;
  }

  dispose() {
    this.root.removeFromParent();
    for (const o of this.owned) o.dispose();
    for (const b of this.batches.values()) for (const im of [...b.parts, ...b.ghosts]) im.dispose();
    this.halos.dispose();
  }

  // ------------------------------------------------------------------ per unit

  /** Advances the unit's animation clock; returns its displayed heading. */
  private animate(u: Unit, dt: number): number {
    let a = this.anims.get(u.id);
    const want = Math.atan2(u.facing.x, u.facing.y);
    if (!a) this.anims.set(u.id, (a = { anim: null, t: 0, lastStateTime: 0, rot: want, wade: 0, dark: 0 }));
    const anim = animFor(u);
    // A new swing restarts the attack even when the previous one has not been left.
    const restart = anim === 'attack' && u.stateTime < a.lastStateTime;
    a.lastStateTime = u.stateTime;
    if (anim !== a.anim || restart) {
      a.anim = anim;
      // Spread loop phases so a crowd doesn't march in step.
      a.t = animLoops(anim) ? (u.id * 0.37) % 1 : 0;
    } else a.t += dt;
    // Models face +Z; ground (x, y) is world (x, z). Turn smoothly, no 8-direction snapping.
    a.rot += Math.atan2(Math.sin(want - a.rot), Math.cos(want - a.rot)) * Math.min(1, dt * 16);
    return a.rot;
  }

  /** `at`: draw a copy here with this opacity instead (dash afterimages). */
  private place(u: Unit, look: UnitLook, rot: number, at?: Echo) {
    const batch = this.batchFor(look, u.team);
    const n = batch.count;
    if (n >= BATCH_CAPACITY) return;
    batch.count++;
    const a = this.anims.get(u.id)!;
    const clip = batch.clips.get(a.anim!) ?? batch.clips.get('idle')!;
    const frame = frameIndex(clip, a.t);
    const np = batch.parts.length;
    const { flash, alpha, sink } = unitFx(u, !at && this.flashes.has(u.id), this.clock);
    // z: the monster's darkness; friendlies (and the knight's dash echoes) are exempt from the night.
    batch.fx.setXYZ(n, at ? 0 : flash, at ? at.alpha : alpha, u.team === 'player' ? FX_FRIENDLY : a.dark);
    this.unitM.compose(
      this.pos.set(at?.x ?? u.x, -sink - a.wade, at?.y ?? u.y),
      this.quat.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rot),
      this.scl.setScalar(CHAR_SCALE * look.scale),
    );
    this.col.setHex(look.tint);
    for (let p = 0; p < np; p++) {
      this.partM.fromArray(clip.data, (frame * np + p) * 16);
      this.outM.multiplyMatrices(this.unitM, this.partM);
      batch.parts[p].setMatrixAt(n, this.outM);
      batch.parts[p].setColorAt(n, this.col);
    }
  }

  // ------------------------------------------------------------------ batches

  private batchFor(look: UnitLook, team: Unit['team']): Batch {
    let batch = this.batches.get(look.key);
    if (batch) return batch;
    const gltf = this.library.gltf(CHARACTER_MODELS[look.sheet]);
    const model = cloneSkinned(gltf.scene);
    // A designed body replaces the rig's own meshes (render3d/bodies.ts); attachments go on after.
    const body = BODIES[look.sheet];
    if (body) this.owned.push(...dressBody(model, body));
    if (look.pieces) this.owned.push(...hangPieces(model, look.pieces));
    // Night: plain models get glowing eyes on the head bone (designed bodies bring their own glow).
    if (this.opts.nightEyes && team === 'enemy' && !body) {
      const eyes = eyePieces(CHARACTER_MODELS[look.sheet]);
      if (eyes.length) this.owned.push(...hangPieces(model, eyes, this.eyeMaterial));
    }
    this.attach(model, look.attachments);
    const parts = collectParts(model, (m) => this.unitMaterial(m, look.alpha, look.pallor, look.gild ?? 0));
    const isEyes = (im: THREE.InstancedMesh) => !!(im.material as THREE.Material).userData.nightEyes;
    for (const p of parts) if (p.owned) this.owned.push(p.geometry);

    const mixer = new THREE.AnimationMixer(model);
    const clips = new Map<AnimName, PoseClip>();
    for (const [anim, clipName] of Object.entries(clipNames(look.sheet, look.attackClip)) as [AnimName, string][]) {
      const clip = findClip(gltf.animations, clipName);
      if (clip) clips.set(anim, bakeClip(model, mixer, clip, parts, animLoops(anim)));
    }
    mixer.stopAllAction();

    const fx = new THREE.InstancedBufferAttribute(new Float32Array(BATCH_CAPACITY * 3).fill(0), 3);
    fx.setUsage(THREE.DynamicDrawUsage);
    const meshes = parts.map((p) => {
      const im = new THREE.InstancedMesh(this.own(withFxAttribute(p.geometry, fx)), p.material, BATCH_CAPACITY);
      im.castShadow = !isEyes(im);
      im.frustumCulled = false;
      im.count = 0;
      im.setColorAt(0, this.col.setHex(0xffffff));
      this.root.add(im);
      return im;
    });
    const ghosts = !this.opts.silhouettes ? [] : meshes.filter((im) => !isEyes(im)).map((im) => {
      const g = new THREE.InstancedMesh(im.geometry, this.silhouettes[team], BATCH_CAPACITY);
      g.instanceMatrix = im.instanceMatrix;
      g.frustumCulled = false;
      g.renderOrder = SILHOUETTE_ORDER[team];
      g.count = 0;
      this.root.add(g);
      return g;
    });
    this.batches.set(look.key, (batch = { parts: meshes, fx, ghosts, clips, count: 0 }));
    return batch;
  }

  private attach(model: THREE.Object3D, attachments: Attachment[]) {
    for (const a of attachments) {
      const bone = model.getObjectByName(a.bone);
      if (!bone) continue;
      const part = this.library.clone(a.model);
      part.position.set(...a.position);
      part.rotation.set(...a.rotation);
      if (a.scale) part.scale.setScalar(a.scale);
      if (a.glow) this.light(part, a.glow.color, a.glow.amount);
      bone.add(part);
    }
  }

  /** Gives a model's meshes their own copy of their material, lit from within. */
  private light(part: THREE.Object3D, color: number, amount: number) {
    part.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const m = this.own((mesh.material as THREE.MeshStandardMaterial).clone());
      m.emissive.setHex(color);
      m.emissiveIntensity = amount;
      mesh.material = m;
    });
  }

  /** Shared per (source material, alpha); tint comes from the per-instance colour. */
  private unitMaterial(src: THREE.Material, alpha: number, pallor: number, gild: number): THREE.Material {
    const key = `${src.uuid}:${alpha}:${pallor}:${gild}`;
    let m = this.materials.get(key);
    if (!m) {
      const eyes = !!src.userData.nightEyes;
      const c = this.own(withUnitFx((src as THREE.MeshStandardMaterial).clone(), { pallor, gild, eyes, eyesAlways: this.opts.eyesAlways }));
      if (alpha < 1) {
        c.transparent = true;
        c.opacity = alpha;
      }
      if (eyes) {
        // Fades in with the dark; drawn after the bodies, never hiding what is behind it.
        c.transparent = true;
        c.depthWrite = false;
      }
      c.stencilWrite = true;
      c.stencilRef = 0;
      c.stencilZPass = THREE.ReplaceStencilOp;
      this.materials.set(key, (m = c));
    }
    return m;
  }

  private own<T extends { dispose(): void }>(o: T): T {
    this.owned.push(o);
    return o;
  }
}
