// Ground, buildings, decor and role auras, built from Kenney kit pieces (rules in buildings.ts).
// A building is rebuilt whenever its role or damage state changes.

import * as THREE from 'three';
import { BUILDING } from '../data/balance';
import { ROLES, type RoleKind } from '../data/roles';
import { Ground, type Building, type TownMap } from '../sim/map';
import type { BuildingState } from '../sim/world';
import { markOccluder, type ModelLibrary } from './assets';
import {
  auraCells, buildingPieces, decorPiece, footprintOutline, hash01, ROCK, smokeSources, wallLevels,
  type BuildingLook, type DamageState, type Piece, type SmokeSource,
} from './buildings';
import type { EmitterSpec, Particles } from './Particles';

/** Aura tile colours (same as the sprite renderer): chapel gold, smithy orange, watchtower blue. */
const AURA_COLORS: Record<RoleKind, number> = { barracks: 0xffffff, chapel: 0xfff27a, smithy: 0xff7a2e, watchtower: 0x4f9dff };
const AURA_OPACITY = { planning: 0.38, playing: 0.1 };
const SMOKE: Record<SmokeSource['kind'], Omit<EmitterSpec, 'x' | 'y' | 'z'>> = {
  chimney: { every: 0.4, color: 0xb0aaa4, size: 0.14, rise: 0.5, life: 2.4 },
  fire: { every: 0.14, color: 0x5b4a44, size: 0.2, rise: 0.8, life: 1.8 },
};
const DUST = 0xc9b29b;
const DAMAGED = new THREE.Color(0x8f6f60);
/** Planning selection: roof/wall glow pulses between these, plus a gold outline and a bobbing arrow. */
const HIGHLIGHT_LOW = new THREE.Color(0x4a3a10);
const HIGHLIGHT_HIGH = new THREE.Color(0x8a6a1a);
const SELECT_COLOR = 0xffd75e;
const SELECT = { pulseHz: 1.6, outlineGap: 0.22, bar: 0.12, arrowLift: 1.0, bob: 0.18 };
const HIT_FLASH = 0x9a9a9a;
/** Hit shake length (s) and how long the white flash lasts within it. */
const SHAKE = { time: 0.18, flash: 0.06, amplitude: 0.05 };

const GRASS = 0x8fc66a;
const WATER = 0x4f9fd6;
/** Non-blocking ground clutter: [model, chance weight, scale]. */
const SCATTER: [string, number, number][] = [
  ['survival/grass', 0.5, 1.4], ['survival/grass-large', 0.3, 1.2], ['mini-forest/plant', 0.2, 1.0],
];
const GRAVEYARD_GRASS = 0x9a9466;
const GRAVEYARD_SCATTER: [string, number, number][] = [
  ['graveyard/gravestone-broken', 0.3, 0.8], ['graveyard/grave', 0.25, 0.8], ['graveyard/gravestone-debris', 0.25, 0.9],
  ['graveyard/candle-multiple', 0.1, 1.0], ['graveyard/fire-basket', 0.1, 0.9],
];
const SCATTER_CHANCE = 0.16;

interface BuildingView {
  def: Building;
  group: THREE.Group | null;
  materials: THREE.MeshStandardMaterial[];
  look: BuildingLook | null;
  emitters: EmitterSpec[];
  lastFrac: number;
  /** Seconds of hit shake left. */
  shake: number;
  /** Centre of the footprint. */
  cx: number;
  cz: number;
}

export class TownView {
  readonly root = new THREE.Group();
  private readonly views: BuildingView[];
  private readonly owned: { dispose(): void }[] = [];
  private readonly instanced: THREE.InstancedMesh[] = [];
  private readonly aura: THREE.InstancedMesh;
  private auraKey = '';
  private planning = false;
  private highlighted = -1;
  private readonly marker = new THREE.Group();
  private readonly arrow: THREE.Mesh;
  private readonly markerMat: THREE.MeshBasicMaterial;
  private readonly barGeo: THREE.BoxGeometry;
  private readonly glow = new THREE.Color();
  private time = 0;

  constructor(private readonly library: ModelLibrary, private readonly map: TownMap, private readonly particles: Particles) {
    this.makeGround();
    this.makeDecor();
    this.views = map.buildings.map((def) => ({
      def, group: null, materials: [], look: null, emitters: [], lastFrac: 1, shake: 0,
      cx: def.cells.reduce((a, [i]) => a + i, 0) / def.cells.length,
      cz: def.cells.reduce((a, [, j]) => a + j, 0) / def.cells.length,
    }));

    // Role auras: one flat quad per covered cell, coloured per role.
    const cap = Math.max(1, map.size * map.size);
    this.aura = new THREE.InstancedMesh(
      this.own(new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2)),
      this.own(new THREE.MeshBasicMaterial({ transparent: true, opacity: AURA_OPACITY.playing, depthWrite: false })),
      cap,
    );
    this.aura.count = 0;
    this.aura.frustumCulled = false;
    this.aura.renderOrder = 1;
    this.root.add(this.aura);

    // Selection marker (planning): outline bars rebuilt per selection, an arrow above the roof.
    this.markerMat = this.own(new THREE.MeshBasicMaterial({ color: SELECT_COLOR, transparent: true, depthWrite: false }));
    this.barGeo = this.own(new THREE.BoxGeometry(1, 0.06, 1));
    const arrowGeo = this.own(new THREE.ConeGeometry(0.4, 0.8, 4).rotateX(Math.PI));
    // Drawn over everything, so a taller building in front never hides which one is picked.
    const arrowMat = this.own(new THREE.MeshBasicMaterial({ color: SELECT_COLOR, depthTest: false, depthWrite: false, transparent: true }));
    this.arrow = new THREE.Mesh(arrowGeo, arrowMat);
    this.arrow.renderOrder = 10;
    this.marker.visible = false;
    this.marker.renderOrder = 2;
    this.root.add(this.marker);
  }

  /** Rebuilds buildings whose role or damage state changed; darkens with damage; hit shake. */
  sync(states: BuildingState[], dt: number) {
    for (const s of states) {
      const v = this.views[s.id];
      if (!v) continue;
      if (v.shake > 0) this.updateShake(v, dt);
      const frac = Math.max(0, s.hp / s.maxHp);
      const damage: DamageState = s.ruined ? 'ruined' : frac < BUILDING.damagedAt ? 'damaged' : 'intact';
      if (!v.look || v.look.damage !== damage || v.look.role !== s.role) {
        const wasStanding = v.look && v.look.damage !== 'ruined';
        this.rebuild(v, { role: s.role, damage });
        if (damage === 'ruined' && wasStanding) this.dustBurst(v.def);
        v.lastFrac = -1;
      }
      if (damage !== 'ruined' && frac !== v.lastFrac) {
        v.lastFrac = frac;
        for (const m of v.materials) m.color.setHex(0xffffff).lerp(DAMAGED, 1 - frac);
      }
    }
    this.syncAura(states);
    this.animateSelection(dt);
  }

  /** Shake and flash a building that was hit. */
  hit(id: number) {
    const v = this.views[id];
    if (!v || v.look?.damage === 'ruined') return;
    v.shake = SHAKE.time;
    this.applyHighlight(v);
  }

  /** Point just above a building's roof (for its HP bar and role icon). */
  topOf(id: number): { x: number; y: number; z: number } {
    const v = this.views[id];
    return { x: v.cx, y: wallLevels(v.def, v.look?.role ?? null) + 1.05, z: v.cz };
  }

  /** Planning shows auras strongly; during play they stay faint. */
  setPlanning(on: boolean) {
    this.planning = on;
    (this.aura.material as THREE.MeshBasicMaterial).opacity = on ? AURA_OPACITY.planning : AURA_OPACITY.playing;
  }

  /** Planning selection glow (-1 clears). */
  highlight(id: number) {
    if (id === this.highlighted) return;
    const prev = this.highlighted;
    this.highlighted = id;
    for (const i of [prev, id]) if (this.views[i]) this.applyHighlight(this.views[i]);
    this.buildMarker();
  }

  private buildMarker() {
    this.marker.clear();
    const v = this.views[this.highlighted];
    if (!v) {
      this.marker.visible = false;
      return;
    }
    const gap = SELECT.outlineGap;
    for (const e of footprintOutline(v.def.cells)) {
      const bar = new THREE.Mesh(this.barGeo, this.markerMat);
      // Pushed out past the walls and lengthened by the gap at both ends so corners meet.
      bar.position.set(e.x + e.nx * gap, 0.06, e.z + e.nz * gap);
      bar.scale.set(e.horizontal ? 1 + 2 * gap : SELECT.bar, 1, e.horizontal ? SELECT.bar : 1 + 2 * gap);
      bar.renderOrder = 2;
      this.marker.add(bar);
    }
    this.marker.add(this.arrow);
    this.marker.visible = true;
    this.time = 0;
    this.animateSelection(0);
  }

  /** Pulses the selected building's glow and the marker, and bobs the arrow. */
  private animateSelection(dt: number) {
    const v = this.views[this.highlighted];
    if (!v || !this.marker.visible) return;
    this.time += dt;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * Math.PI * 2 * SELECT.pulseHz);
    this.markerMat.opacity = 0.6 + 0.4 * pulse;
    const top = this.topOf(v.def.id);
    this.arrow.position.set(top.x, top.y + SELECT.arrowLift + SELECT.bob * pulse, top.z);
    this.arrow.rotation.y = this.time * 1.5;
    this.glow.copy(HIGHLIGHT_LOW).lerp(HIGHLIGHT_HIGH, pulse);
    if (v.look?.damage !== 'ruined' && !(v.shake > SHAKE.time - SHAKE.flash)) for (const m of v.materials) m.emissive.copy(this.glow);
  }

  dispose() {
    this.root.removeFromParent();
    for (const v of this.views) {
      for (const e of v.emitters) this.particles.removeEmitter(e);
      for (const m of v.materials) m.dispose();
    }
    for (const im of this.instanced) im.dispose();
    for (const o of this.owned) o.dispose();
  }

  // ------------------------------------------------------------------ buildings

  private rebuild(v: BuildingView, look: BuildingLook) {
    if (v.group) this.root.remove(v.group);
    for (const m of v.materials) m.dispose();
    for (const e of v.emitters) this.particles.removeEmitter(e);

    const group = new THREE.Group();
    for (const p of buildingPieces(v.def, look)) group.add(this.place(this.library.clone(p.model), p));
    // Own materials so this building can darken and glow on its own.
    const cloned = new Map<THREE.Material, THREE.MeshStandardMaterial>();
    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const src = mesh.material as THREE.MeshStandardMaterial;
      if (!cloned.has(src)) cloned.set(src, src.clone());
      mesh.material = cloned.get(src)!;
    });
    this.root.add(group);
    v.group = group;
    v.materials = [...cloned.values()];
    v.look = look;
    v.emitters = smokeSources(v.def, look).map((s) => this.particles.addEmitter({ x: s.x, y: s.y, z: s.z, ...SMOKE[s.kind] }));
    this.applyHighlight(v);
  }

  private applyHighlight(v: BuildingView) {
    const ruined = v.look?.damage === 'ruined';
    const flash = !ruined && v.shake > SHAKE.time - SHAKE.flash;
    const on = !ruined && v.def.id === this.highlighted;
    for (const m of v.materials) {
      if (flash) m.emissive.setHex(HIT_FLASH);
      else if (on) m.emissive.copy(HIGHLIGHT_HIGH);
      else m.emissive.setHex(0);
    }
  }

  private updateShake(v: BuildingView, dt: number) {
    const wasFlashing = v.shake > SHAKE.time - SHAKE.flash;
    v.shake = Math.max(0, v.shake - dt);
    const offset = v.shake > 0 ? Math.sin(v.shake * 90) * SHAKE.amplitude * (v.shake / SHAKE.time) : 0;
    // Shake along the screen's horizontal (+X/-Z).
    v.group?.position.set(offset, 0, -offset);
    if (wasFlashing !== v.shake > SHAKE.time - SHAKE.flash) this.applyHighlight(v);
  }

  private dustBurst(b: Building) {
    for (const [i, j] of b.cells) this.particles.burst(i, 0.4, j, 10, DUST, 0.32, 1.6, 1.3);
  }

  private syncAura(states: BuildingState[]) {
    // Rebuild only when the set of live role buildings changes.
    const live = states.filter((s) => s.role && !s.ruined && ROLES[s.role].radius > 0);
    const key = live.map((s) => `${s.id}:${s.role}`).join(',');
    if (key === this.auraKey) return;
    this.auraKey = key;
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    let n = 0;
    for (const s of live) {
      const role = s.role!;
      for (const [i, j] of auraCells(this.views[s.id].def, ROLES[role].radius)) {
        if (i < 0 || j < 0 || i >= this.map.size || j >= this.map.size || this.map.ground[j * this.map.size + i] === Ground.None) continue;
        if (n >= this.aura.instanceMatrix.count) break;
        this.aura.setMatrixAt(n, m.makeTranslation(i, 0.05, j));
        this.aura.setColorAt(n, c.setHex(AURA_COLORS[role]));
        n++;
      }
    }
    this.aura.count = n;
    this.aura.instanceMatrix.needsUpdate = true;
    if (this.aura.instanceColor) this.aura.instanceColor.needsUpdate = true;
    this.setPlanning(this.planning);
  }

  // ------------------------------------------------------------------ ground and decor

  private makeGround() {
    const map = this.map;
    const at = (i: number, j: number) => map.ground[j * map.size + i] as Ground;
    const grass: [number, number][] = [];
    const water: THREE.Matrix4[] = [];
    const roads: THREE.Matrix4[] = [];
    const bridges: THREE.Matrix4[] = [];
    const scatter = new Map<string, THREE.Matrix4[]>();
    for (let j = 0; j < map.size; j++) {
      for (let i = 0; i < map.size; i++) {
        const g = at(i, j);
        if (g === Ground.None) continue;
        if (g === Ground.Water || g === Ground.Bridge) {
          water.push(new THREE.Matrix4().makeTranslation(i, -0.12, j));
          if (g === Ground.Bridge) bridges.push(new THREE.Matrix4().makeTranslation(i, -0.1, j));
          continue;
        }
        grass.push([i, j]);
        if (g === Ground.Road) roads.push(new THREE.Matrix4().makeTranslation(i, 0, j));
        else if (map.blocked[j * map.size + i] === 0) this.scatterOn(i, j, scatter);
      }
    }

    // Grass: one quad per cell, colour varied with smooth noise so it reads as a meadow, not a grid.
    const ground = new THREE.InstancedMesh(
      this.own(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), this.own(new THREE.MeshLambertMaterial()), Math.max(1, grass.length),
    );
    ground.receiveShadow = true;
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    grass.forEach(([i, j], n) => {
      ground.setMatrixAt(n, m.makeTranslation(i, 0, j));
      const shade = 0.9 + 0.12 * smoothNoise(i / 4, j / 4) + 0.03 * hash01(i, j, 7);
      ground.setColorAt(n, c.setHex(this.map.theme === 'graveyard' ? GRAVEYARD_GRASS : GRASS).multiplyScalar(shade));
    });
    ground.count = grass.length;
    this.instanced.push(ground);
    this.root.add(ground);

    if (water.length) {
      const w = new THREE.InstancedMesh(
        this.own(new THREE.PlaneGeometry(1.02, 1.02).rotateX(-Math.PI / 2)),
        this.own(new THREE.MeshLambertMaterial({ color: WATER })), water.length,
      );
      water.forEach((t, k) => w.setMatrixAt(k, t));
      w.receiveShadow = true;
      this.instanced.push(w);
      this.root.add(w);
    }
    this.addInstanced('fantasy-town/road', roads);
    this.addInstanced('mini-forest/bridge', bridges, true);
    for (const [model, ts] of scatter) this.addInstanced(model, ts);
  }

  /** Maybe one small plant or stone on a free grass cell, placed by hash (same every session). */
  private scatterOn(i: number, j: number, out: Map<string, THREE.Matrix4[]>) {
    if (hash01(i, j, 11) >= SCATTER_CHANCE) return;
    let pick = hash01(i, j, 12);
    const table = this.map.theme === 'graveyard' ? GRAVEYARD_SCATTER : SCATTER;
    const entry = table.find(([, w]) => (pick -= w) < 0) ?? table[0];
    const [model, , scale] = entry;
    const t = new THREE.Matrix4().compose(
      new THREE.Vector3(i + (hash01(i, j, 13) - 0.5) * 0.7, 0, j + (hash01(i, j, 14) - 0.5) * 0.7),
      new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, hash01(i, j, 15) * Math.PI * 2),
      new THREE.Vector3().setScalar(scale * (0.85 + hash01(i, j, 16) * 0.3)),
    );
    if (!out.has(model)) out.set(model, []);
    out.get(model)!.push(t);
  }

  private makeDecor() {
    const rockGeo = this.own(new THREE.DodecahedronGeometry(0.35));
    const rockMat = this.own(new THREE.MeshStandardMaterial({ color: 0x9a948c, flatShading: true }));
    markOccluder(rockMat);
    for (const d of this.map.decor) {
      const p = decorPiece(d, this.map.theme);
      const o = p.model === ROCK ? new THREE.Mesh(rockGeo, rockMat) : this.library.clone(p.model);
      o.castShadow = true;
      this.root.add(this.place(o, p));
    }
  }

  private addInstanced(model: string, transforms: THREE.Matrix4[], castShadow = false) {
    if (!transforms.length) return;
    const g = this.library.instanced(model, transforms, castShadow);
    g.traverse((o) => { if ((o as THREE.InstancedMesh).isInstancedMesh) this.instanced.push(o as THREE.InstancedMesh); });
    this.root.add(g);
  }

  private place(o: THREE.Object3D, p: Piece): THREE.Object3D {
    const out = p.out ?? 0;
    o.position.set(p.x + Math.cos(p.rotY) * out, p.y, p.z - Math.sin(p.rotY) * out);
    o.rotation.y = p.rotY;
    if (p.scale) o.scale.setScalar(p.scale);
    return o;
  }

  private own<T extends { dispose(): void }>(o: T): T {
    this.owned.push(o);
    return o;
  }
}

/** Smooth value noise in about [-0.5, 0.5]. */
function smoothNoise(x: number, y: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const v = (a: number, b: number) => hash01(a, b, 99) - 0.5;
  const top = v(xi, yi) * (1 - sx) + v(xi + 1, yi) * sx;
  const bottom = v(xi, yi + 1) * (1 - sx) + v(xi + 1, yi + 1) * sx;
  return top * (1 - sy) + bottom * sy;
}
