// Town 4 (Frostpeak) extras the unit batches don't draw: planted powder kegs (props, not characters),
// the shieldbearers' ward rings, ground the Frost Giant has iced over, and rookies frozen in ice.
// Reads the world every frame; meshes are made when an id first appears and dropped when it goes.

import * as THREE from 'three';
import { MONSTERS, type MonsterKind } from '../data/monsters';
import type { SimEvent, Unit, World } from '../sim/world';
import type { ModelLibrary } from './assets';

const GROUND_Y = 0.03;
const KEG = { model: 'mini-dungeon/barrel', scale: 0.9, spark: 0xffb040, blink: 6 };
/** Models the Frostpeak extras need preloaded. */
export const FROST_MODELS = [KEG.model];
const WARD = { color: 0x9fd8ff, opacity: 0.5, width: 0.06 };
const ICE = { color: 0xcdeeff, opacity: 0.75, fadeIn: 0.25, fadeOut: 1.5 };
/** Ice block around a frozen unit: size relative to its body, and colour. */
const FROZEN = { color: 0xbfe8ff, opacity: 0.55, height: 0.85, width: 0.62 };

interface Patch { mesh: THREE.Mesh; age: number; life: number }

export class FrostView {
  readonly root = new THREE.Group();
  private readonly kegs = new Map<number, { group: THREE.Group; spark: THREE.Mesh }>();
  private readonly wards = new Map<number, THREE.Mesh>();
  private readonly frozen = new Map<number, THREE.Mesh>();
  /** Units frozen by a shaman (not every stun: a banshee's wail doesn't make ice). */
  private readonly frozenIds = new Set<number>();
  private readonly patches: Patch[] = [];
  private readonly live = new Set<number>();
  private clock = 0;

  private readonly sparkGeo = new THREE.SphereGeometry(0.07, 8, 6);
  private readonly sparkMat = new THREE.MeshBasicMaterial({ color: KEG.spark });
  private readonly wardGeo = new THREE.RingGeometry(1 - WARD.width, 1, 48).rotateX(-Math.PI / 2);
  private readonly wardMat = new THREE.MeshBasicMaterial({ color: WARD.color, transparent: true, opacity: WARD.opacity, depthWrite: false });
  private readonly patchGeo = new THREE.CircleGeometry(1, 40).rotateX(-Math.PI / 2);
  private readonly blockGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  private readonly blockMat = new THREE.MeshStandardMaterial({
    color: FROZEN.color, transparent: true, opacity: FROZEN.opacity, roughness: 0.1, metalness: 0.1, depthWrite: false,
  });

  constructor(private readonly library: ModelLibrary) {}

  onEvent(world: World, e: SimEvent) {
    if (e.type === 'iceStomp') this.addPatch(e.x, e.y, e.radius, e.time);
    else if (e.type === 'freeze') {
      for (const u of [...world.players, ...world.rookies]) {
        if (u.stun > 0 && Math.hypot(u.x - e.x, u.y - e.y) <= e.radius + u.radius) this.frozenIds.add(u.id);
      }
    }
  }

  sync(world: World, dt: number) {
    this.clock += dt;
    const live = this.live;
    live.clear();
    for (const m of world.monsters) {
      if (m.state === 'dead') continue;
      const def = MONSTERS[m.kind as MonsterKind];
      if (def.inert) this.syncKeg(m, live);
      if (def.ward) this.syncWard(m, def.ward.radius, live);
    }
    for (const u of [...world.players, ...world.rookies]) {
      if (!this.frozenIds.has(u.id)) continue;
      if (u.stun <= 0 || u.state === 'dead') this.frozenIds.delete(u.id);
      else this.syncFrozen(u, live);
    }
    const prune = <T,>(map: Map<number, T>, obj: (t: T) => THREE.Object3D) => {
      for (const [id, o] of map) {
        if (live.has(id)) continue;
        obj(o).removeFromParent();
        map.delete(id);
      }
    };
    prune(this.kegs, (k) => k.group);
    prune(this.wards, (r) => r);
    prune(this.frozen, (b) => b);
    this.syncPatches(dt);
  }

  private syncKeg(m: Unit, live: Set<number>) {
    live.add(m.id);
    let k = this.kegs.get(m.id);
    if (!k) {
      const group = new THREE.Group();
      const barrel = this.library.clone(KEG.model);
      barrel.scale.setScalar(KEG.scale);
      barrel.traverse((o) => { o.castShadow = true; });
      const spark = new THREE.Mesh(this.sparkGeo, this.sparkMat);
      spark.position.y = 0.62;
      group.add(barrel, spark);
      this.root.add(group);
      this.kegs.set(m.id, (k = { group, spark }));
    }
    k.group.position.set(m.x, 0, m.y);
    // The fuse spark flickers faster as it burns down.
    const fuse = MONSTERS[m.kind as MonsterKind].explodes?.fuse ?? 1;
    const left = Math.max(0, m.abilityIn / fuse);
    k.spark.visible = Math.sin(this.clock * KEG.blink * (1 + 3 * (1 - left)) * Math.PI) > -0.3;
  }

  private syncWard(m: Unit, radius: number, live: Set<number>) {
    live.add(m.id);
    let ring = this.wards.get(m.id);
    if (!ring) {
      ring = new THREE.Mesh(this.wardGeo, this.wardMat);
      ring.scale.setScalar(radius);
      ring.renderOrder = 1;
      this.root.add(ring);
      this.wards.set(m.id, ring);
    }
    ring.position.set(m.x, GROUND_Y + 0.004, m.y);
  }

  private syncFrozen(u: Unit, live: Set<number>) {
    live.add(u.id);
    let block = this.frozen.get(u.id);
    if (!block) {
      block = new THREE.Mesh(this.blockGeo, this.blockMat);
      block.scale.set(FROZEN.width, FROZEN.height, FROZEN.width);
      block.rotation.y = u.id * 0.7;
      this.root.add(block);
      this.frozen.set(u.id, block);
    }
    block.position.set(u.x, 0, u.y);
  }

  private addPatch(x: number, z: number, radius: number, life: number) {
    const mat = new THREE.MeshStandardMaterial({ color: ICE.color, transparent: true, opacity: 0, roughness: 0.15, metalness: 0.1, depthWrite: false });
    const mesh = new THREE.Mesh(this.patchGeo, mat);
    mesh.scale.setScalar(radius);
    mesh.position.set(x, GROUND_Y, z);
    mesh.receiveShadow = true;
    this.root.add(mesh);
    this.patches.push({ mesh, age: 0, life });
  }

  private syncPatches(dt: number) {
    for (let k = this.patches.length - 1; k >= 0; k--) {
      const p = this.patches[k];
      p.age += dt;
      const mat = p.mesh.material as THREE.MeshStandardMaterial;
      const fadeIn = Math.min(1, p.age / ICE.fadeIn);
      const fadeOut = Math.min(1, Math.max(0, (p.life - p.age) / ICE.fadeOut));
      mat.opacity = ICE.opacity * fadeIn * fadeOut;
      if (p.age < p.life) continue;
      p.mesh.removeFromParent();
      mat.dispose();
      this.patches.splice(k, 1);
    }
  }

  dispose() {
    this.root.removeFromParent();
    for (const p of this.patches) (p.mesh.material as THREE.Material).dispose();
    for (const o of [this.sparkGeo, this.sparkMat, this.wardGeo, this.wardMat, this.patchGeo, this.blockGeo, this.blockMat]) o.dispose();
  }
}
