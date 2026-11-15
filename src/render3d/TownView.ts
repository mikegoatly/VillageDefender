// Ground, buildings and decor built from Kenney Fantasy Town Kit pieces.
// Phase 2 (docs/PORT_3D_PLAN.md) reads the Sketch block data the sim still emits; phase 3 replaces
// it with semantic pieces, role buildings and real damage states.

import * as THREE from 'three';
import { Ground, type Building, type Decor, type TownMap } from '../sim/map';
import type { BuildingState } from '../sim/world';
import { markOccluder, type ModelLibrary } from './assets';

/** A model placed in the town (world units; rotY about +Y). */
export interface Piece {
  model: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
  scale?: number;
}

/** Not a GLB: decor rocks are a generated mesh. */
export const ROCK = 'rock';

export const TOWN_MODELS = [
  'wall', 'wall-door', 'wall-window-shutters', 'wall-wood', 'wall-wood-door', 'wall-wood-window-shutters',
  'roof-gable', 'roof-point', 'roof-high-point', 'tree', 'stall-red',
].map((m) => `fantasy-town/${m}`);

// Fantasy Town wall pieces sit on the +X edge of their cell; rotations turn them to the other edges.
const EDGE = { px: 0, pz: -Math.PI / 2, nx: Math.PI, nz: Math.PI / 2 };

/** Wall levels: houses have their walls below a roof block; towers are two blocks of wall. */
export function wallLevels(b: Building): number {
  const top = Math.max(...b.blocks.map((bl) => bl.level));
  return b.kind === 'tower' ? top : Math.max(1, top - 1);
}

/**
 * The pieces of one building: a wall on every outside edge of every cell at every level (none
 * between the building's own cells), one door on the camera-facing (+X) side of the front cell,
 * windows on the camera-facing sides, and a roof on every cell.
 */
export function buildingPieces(b: Building): Piece[] {
  const has = (i: number, j: number) => b.cells.some(([ci, cj]) => ci === i && cj === j);
  const tower = b.kind === 'tower';
  const wall = !tower && b.id % 2 === 1 ? 'fantasy-town/wall-wood' : 'fantasy-town/wall';
  const facing = tower ? wall : `${wall}-window-shutters`;
  const levels = wallLevels(b);
  const frontI = Math.max(...b.cells.map(([i]) => i));
  const roof = tower ? 'fantasy-town/roof-high-point' : b.cells.length === 1 ? 'fantasy-town/roof-point' : 'fantasy-town/roof-gable';
  const out: Piece[] = [];
  let door = false;
  for (const [i, j] of b.cells) {
    for (let y = 0; y < levels; y++) {
      if (!has(i + 1, j)) {
        const isDoor: boolean = !door && y === 0 && i === frontI;
        door ||= isDoor;
        out.push({ model: isDoor ? `${wall}-door` : facing, x: i, y, z: j, rotY: EDGE.px });
      }
      if (!has(i, j + 1)) out.push({ model: facing, x: i, y, z: j, rotY: EDGE.pz });
      if (!has(i - 1, j)) out.push({ model: wall, x: i, y, z: j, rotY: EDGE.nx });
      if (!has(i, j - 1)) out.push({ model: wall, x: i, y, z: j, rotY: EDGE.nz });
    }
    out.push({ model: roof, x: i, y: levels, z: j, rotY: 0 });
  }
  return out;
}

/** Trees, the well (a market stall for now) and rocks, with a stable pseudo-random turn and size. */
export function decorPiece(d: Decor): Piece {
  const turn = ((d.i * 7 + d.j * 13) % 8) * (Math.PI / 4);
  if (d.tile.includes('tree')) return { model: 'fantasy-town/tree', x: d.i, y: 0, z: d.j, rotY: turn, scale: 0.9 + ((d.i * 3 + d.j) % 4) * 0.1 };
  if (d.tile.includes('well')) return { model: 'fantasy-town/stall-red', x: d.i, y: 0, z: d.j, rotY: 0 };
  return { model: ROCK, x: d.i, y: 0.15, z: d.j, rotY: turn };
}

const GROUND_COLORS = { grass: 0x8fc66a, path: 0xd8b98a, water: 0x5fa8d8, bridge: 0x9a6b44 };
const DAMAGED = new THREE.Color(0x8f6f60);
const RUINED = 0x6f5a50;
const HIGHLIGHT = 0x5a4818;

interface BuildingView {
  group: THREE.Group;
  materials: THREE.MeshStandardMaterial[];
  ruined: boolean;
  lastFrac: number;
}

export class TownView {
  readonly root = new THREE.Group();
  private readonly buildings: BuildingView[];
  private readonly owned: { dispose(): void }[] = [];
  private highlighted = -1;

  constructor(private readonly library: ModelLibrary, map: TownMap) {
    this.root.add(this.makeGround(map));
    this.buildings = map.buildings.map((b) => this.makeBuilding(b));
    const rockGeo = this.own(new THREE.DodecahedronGeometry(0.35));
    const rockMat = this.own(new THREE.MeshStandardMaterial({ color: 0x9a948c, flatShading: true }));
    markOccluder(rockMat);
    for (const d of map.decor) {
      const p = decorPiece(d);
      const o = p.model === ROCK ? new THREE.Mesh(rockGeo, rockMat) : this.library.clone(p.model);
      if (p.model === ROCK) o.castShadow = true;
      this.placePiece(o, p);
      this.root.add(o);
    }
  }

  /** Darkens buildings with damage; flattens ruins (placeholder until phase 3's ruin pieces). */
  sync(states: BuildingState[]) {
    for (const b of states) {
      const v = this.buildings[b.id];
      if (!v || v.ruined) continue;
      if (b.ruined) {
        v.ruined = true;
        v.group.scale.y = 0.22;
        for (const m of v.materials) {
          m.color.setHex(RUINED);
          m.emissive.setHex(0);
        }
        continue;
      }
      const frac = Math.max(0, b.hp / b.maxHp);
      if (frac === v.lastFrac) continue;
      v.lastFrac = frac;
      for (const m of v.materials) m.color.setHex(0xffffff).lerp(DAMAGED, 1 - frac);
    }
  }

  /** Planning selection glow (-1 clears). */
  highlight(id: number) {
    if (id === this.highlighted) return;
    const set = (i: number, hex: number) => {
      const v = this.buildings[i];
      if (v && !v.ruined) for (const m of v.materials) m.emissive.setHex(hex);
    };
    set(this.highlighted, 0);
    set(id, HIGHLIGHT);
    this.highlighted = id;
  }

  dispose() {
    this.root.removeFromParent();
    for (const o of this.owned) o.dispose();
  }

  private makeGround(map: TownMap): THREE.InstancedMesh {
    const cells: [number, number, Ground][] = [];
    for (let j = 0; j < map.size; j++) {
      for (let i = 0; i < map.size; i++) {
        const g = map.ground[j * map.size + i] as Ground;
        if (g !== Ground.None) cells.push([i, j, g]);
      }
    }
    const mesh = new THREE.InstancedMesh(
      this.own(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)), this.own(new THREE.MeshLambertMaterial()), cells.length,
    );
    mesh.receiveShadow = true;
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    cells.forEach(([i, j, g], n) => {
      m.makeTranslation(i, g === Ground.Water ? -0.08 : 0, j);
      mesh.setMatrixAt(n, m);
      const path = i === map.centre || j === map.centre;
      const base = g === Ground.Water ? GROUND_COLORS.water : g === Ground.Bridge ? GROUND_COLORS.bridge : path ? GROUND_COLORS.path : GROUND_COLORS.grass;
      // Checker shading so the grid still reads.
      mesh.setColorAt(n, c.setHex(base).multiplyScalar((i + j) % 2 ? 1 : 0.94));
    });
    return mesh;
  }

  private makeBuilding(b: Building): BuildingView {
    const group = new THREE.Group();
    for (const p of buildingPieces(b)) {
      const o = this.library.clone(p.model);
      this.placePiece(o, p);
      group.add(o);
    }
    // Own materials so this building can darken and glow on its own.
    const cloned = new Map<THREE.Material, THREE.MeshStandardMaterial>();
    group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const src = mesh.material as THREE.MeshStandardMaterial;
      if (!cloned.has(src)) cloned.set(src, this.own(src.clone()));
      mesh.material = cloned.get(src)!;
    });
    this.root.add(group);
    return { group, materials: [...cloned.values()], ruined: false, lastFrac: 1 };
  }

  private placePiece(o: THREE.Object3D, p: Piece) {
    o.position.set(p.x, p.y, p.z);
    o.rotation.y = p.rotY;
    if (p.scale) o.scale.setScalar(p.scale);
  }

  private own<T extends { dispose(): void }>(o: T): T {
    this.owned.push(o);
    return o;
  }
}
