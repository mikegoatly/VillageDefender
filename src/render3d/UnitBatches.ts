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
import type { Unit, World } from '../sim/world';
import type { ModelLibrary } from './assets';
import { CHARACTER_MODELS, animFor, animLoops, clipNames, lookFor, type AnimName, type Attachment, type UnitLook } from './characters';
import { bakeClip, collectParts, frameIndex, type PoseClip } from './poses';

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
  ghosts: THREE.InstancedMesh[];
  clips: Map<AnimName, PoseClip>;
  count: number;
}

interface UnitAnim {
  anim: AnimName | null;
  /** Seconds into the current animation. */
  t: number;
  lastStateTime: number;
  /** Displayed heading (radians about +Y); turns smoothly towards the sim's facing. */
  rot: number;
}

export interface UnitBatchOptions {
  silhouettes: boolean;
}

export class UnitBatches {
  readonly root = new THREE.Group();
  private readonly batches = new Map<string, Batch>();
  private readonly anims = new Map<number, UnitAnim>();
  private readonly materials = new Map<string, THREE.Material>();
  private readonly owned: { dispose(): void }[] = [];
  private readonly silhouettes: Record<Unit['team'], THREE.MeshBasicMaterial>;
  private readonly halos: THREE.InstancedMesh;

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
    this.silhouettes = { player: silhouette(SILHOUETTE_COLOR.player), enemy: silhouette(SILHOUETTE_COLOR.enemy) };

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

  sync(world: World, dt: number) {
    for (const b of this.batches.values()) b.count = 0;
    let halos = 0;
    const live = new Set<number>();
    for (const list of [world.players, world.rookies, world.monsters]) {
      for (const u of list) {
        live.add(u.id);
        const look = lookFor(u, world.weapon);
        const rot = this.animate(u, dt);
        this.place(u, look, rot);
        if (u.team === 'player' && u.state !== 'dead' && halos < HALO_CAPACITY) {
          const knight = u.kind === 'knight';
          this.outM.compose(this.pos.set(u.x, 0.03, u.y), this.quat.identity(), this.scl.setScalar(knight ? 1.3 : 1));
          this.halos.setMatrixAt(halos, this.outM);
          this.halos.setColorAt(halos, this.col.setHex(knight ? HALO_KNIGHT : HALO_ROOKIE[u.rank]));
          halos++;
        }
      }
    }
    for (const id of this.anims.keys()) if (!live.has(id)) this.anims.delete(id);

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
    }
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
    if (!a) this.anims.set(u.id, (a = { anim: null, t: 0, lastStateTime: 0, rot: want }));
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

  private place(u: Unit, look: UnitLook, rot: number) {
    const batch = this.batchFor(look, u.team);
    const n = batch.count;
    if (n >= BATCH_CAPACITY) return;
    batch.count++;
    const a = this.anims.get(u.id)!;
    const clip = batch.clips.get(a.anim!) ?? batch.clips.get('idle')!;
    const frame = frameIndex(clip, a.t);
    const np = batch.parts.length;
    this.unitM.compose(
      this.pos.set(u.x, 0, u.y),
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
    this.attach(model, look.attachments);
    const parts = collectParts(model, (m) => this.unitMaterial(m, look.alpha));
    for (const p of parts) if (p.owned) this.owned.push(p.geometry);

    const mixer = new THREE.AnimationMixer(model);
    const clips = new Map<AnimName, PoseClip>();
    for (const [anim, clipName] of Object.entries(clipNames(look.sheet)) as [AnimName, string][]) {
      const clip = gltf.animations.find((c) => c.name === clipName);
      if (clip) clips.set(anim, bakeClip(model, mixer, clip, parts, animLoops(anim)));
    }
    mixer.stopAllAction();

    const meshes = parts.map((p) => {
      const im = new THREE.InstancedMesh(p.geometry, p.material, BATCH_CAPACITY);
      im.castShadow = true;
      im.frustumCulled = false;
      im.count = 0;
      im.setColorAt(0, this.col.setHex(0xffffff));
      this.root.add(im);
      return im;
    });
    const ghosts = !this.opts.silhouettes ? [] : meshes.map((im) => {
      const g = new THREE.InstancedMesh(im.geometry, this.silhouettes[team], BATCH_CAPACITY);
      g.instanceMatrix = im.instanceMatrix;
      g.frustumCulled = false;
      g.renderOrder = SILHOUETTE_ORDER[team];
      g.count = 0;
      this.root.add(g);
      return g;
    });
    this.batches.set(look.key, (batch = { parts: meshes, ghosts, clips, count: 0 }));
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
      bone.add(part);
    }
  }

  /** Shared per (source material, alpha); tint comes from the per-instance colour. */
  private unitMaterial(src: THREE.Material, alpha: number): THREE.Material {
    const key = `${src.uuid}:${alpha}`;
    let m = this.materials.get(key);
    if (!m) {
      const c = this.own((src as THREE.MeshStandardMaterial).clone());
      if (alpha < 1) {
        c.transparent = true;
        c.opacity = alpha;
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
