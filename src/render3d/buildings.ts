// Which kit pieces make up each building, by role and damage state. Pure functions (no three.js
// objects), so the rules are unit-tested; TownView turns the pieces into meshes.
//
// Fantasy Town wall pieces sit on the +X edge of their 1×1 cell; the camera looks from +X/+Z, so
// the +X and +Z sides of a building face the player.

import type { RoleKind } from '../data/roles';
import type { Building, Decor } from '../sim/map';

/** A model placed in the town (world units; rotY about +Y). */
export interface Piece {
  model: string;
  x: number;
  y: number;
  z: number;
  rotY: number;
  scale?: number;
  /** Extra offset along the piece's own +X after rotating (pushes wall-hung props off the wall). */
  out?: number;
}

export type DamageState = 'intact' | 'damaged' | 'ruined';

export interface BuildingLook {
  role: RoleKind | null;
  damage: DamageState;
}

export const PLAIN: BuildingLook = { role: null, damage: 'intact' };

/** Not a GLB: decor rocks are a generated mesh. */
export const ROCK = 'rock';

const ft = (m: string) => `fantasy-town/${m}`;

/** Every model the town can use, for preloading. */
export const TOWN_MODELS = [
  ...['wall', 'wall-door', 'wall-window-shutters', 'wall-broken', 'wall-half',
    'wall-wood', 'wall-wood-door', 'wall-wood-window-shutters', 'wall-wood-broken', 'wall-wood-half',
    'roof-gable', 'roof-point', 'roof-high-point', 'roof-high-gable', 'chimney', 'banner-red',
    'tree', 'stall-red', 'road'].map(ft),
  'castle/flag', 'castle/flag-pennant', 'castle/tower-square-top', 'castle/tower-square-top-roof',
  'graveyard/cross', 'graveyard/candle-multiple', 'graveyard/debris', 'graveyard/debris-wood',
  'survival/workbench-anvil', 'survival/grass', 'survival/grass-large', 'survival/resource-planks',
  'mini-arena/weapon-rack', 'mini-forest/bridge', 'mini-forest/plant',
];

/** Rotations that turn a +X-edge piece to each edge of its cell. */
export const EDGE = { px: 0, pz: -Math.PI / 2, nx: Math.PI, nz: Math.PI / 2 };

/** Stable 0..1 from integers, so a building looks the same every time it is rebuilt. */
export function hash01(...n: number[]): number {
  let h = 0x811c9dc5;
  for (const v of n) {
    h = Math.imul(h ^ Math.imul(Math.round(v * 16) | 0, 0x27d4eb2d), 0x165667b1);
    h ^= h >>> 15;
  }
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Wall storeys: houses have their walls below a roof block, towers are two blocks of wall; a watchtower adds a storey. */
export function wallLevels(b: Building, role: RoleKind | null = null): number {
  const top = Math.max(...b.blocks.map((bl) => bl.level));
  const base = b.kind === 'tower' ? top : Math.max(1, top - 1);
  return base + (role === 'watchtower' ? 1 : 0);
}

const isWood = (b: Building) => b.kind !== 'tower' && b.id % 2 === 1;
const wallModel = (b: Building) => (isWood(b) ? ft('wall-wood') : ft('wall'));

/** The front door's cell: the first footprint cell on the camera-facing (+X) side. */
export function doorCell(b: Building): [number, number] {
  const frontI = Math.max(...b.cells.map(([i]) => i));
  return b.cells.find(([i]) => i === frontI)!;
}

/** The cell furthest from the camera (chimneys go here). */
function backCell(b: Building): [number, number] {
  return b.cells.reduce((a, c) => (c[0] + c[1] < a[0] + a[1] ? c : a));
}

/**
 * The pieces of a standing building: a wall on every outside edge of every cell at every storey
 * (none between its own cells), one door on the front, windows facing the camera, a roof per
 * cell, and the role's own roof and props. Damaged buildings swap some walls for broken ones.
 */
export function buildingPieces(b: Building, look: BuildingLook = PLAIN): Piece[] {
  if (look.damage === 'ruined') return ruinPieces(b);
  const has = (i: number, j: number) => b.cells.some(([ci, cj]) => ci === i && cj === j);
  const tower = b.kind === 'tower';
  const wall = wallModel(b);
  const facing = tower ? wall : `${wall}-window-shutters`;
  const levels = wallLevels(b, look.role);
  const [di, dj] = doorCell(b);
  const out: Piece[] = [];
  const broken = (i: number, j: number, y: number, edge: number) => look.damage === 'damaged' && hash01(i, j, y, edge, b.id) < 0.45;
  const addWall = (model: string, i: number, j: number, y: number, rotY: number, edge: number) =>
    out.push({ model: broken(i, j, y, edge) ? `${wall}-broken` : model, x: i, y, z: j, rotY });

  for (const [i, j] of b.cells) {
    for (let y = 0; y < levels; y++) {
      if (!has(i + 1, j)) {
        if (i === di && j === dj && y === 0) out.push({ model: `${wall}-door`, x: i, y, z: j, rotY: EDGE.px });
        else addWall(facing, i, j, y, EDGE.px, 0);
      }
      if (!has(i, j + 1)) addWall(facing, i, j, y, EDGE.pz, 1);
      if (!has(i - 1, j)) addWall(wall, i, j, y, EDGE.nx, 2);
      if (!has(i, j - 1)) addWall(wall, i, j, y, EDGE.nz, 3);
    }
    out.push({ model: roofModel(b, look.role), x: i, y: levels, z: j, rotY: 0 });
  }
  out.push(...roleProps(b, look.role, levels));
  return out;
}

function roofModel(b: Building, role: RoleKind | null): string {
  const single = b.cells.length === 1;
  switch (role) {
    case 'barracks': return 'castle/tower-square-top';
    case 'watchtower': return 'castle/tower-square-top-roof';
    case 'chapel': return single ? ft('roof-high-point') : ft('roof-high-gable');
    default:
      if (b.kind === 'tower') return ft('roof-high-point');
      return single ? ft('roof-point') : ft('roof-gable');
  }
}

/** Props that make a role readable at a glance (Notes.txt: special buildings). */
function roleProps(b: Building, role: RoleKind | null, levels: number): Piece[] {
  const [i, j] = doorCell(b);
  const front = i + 0.85;
  switch (role) {
    case 'barracks': {
      // Battlements, red banners on the camera-facing walls, a pennant and a weapon rack.
      const out: Piece[] = [{ model: 'castle/flag-pennant', x: i, y: levels + 0.3, z: j, rotY: 0 }];
      for (const [ci, cj] of b.cells) {
        if (!b.cells.some(([x, z]) => x === ci && z === cj + 1)) out.push({ model: ft('banner-red'), x: ci, y: levels - 1, z: cj, rotY: EDGE.pz, out: 0.13 });
      }
      out.push({ model: 'mini-arena/weapon-rack', x: front, y: 0, z: j - 0.25, rotY: Math.PI / 2 });
      return out;
    }
    case 'chapel':
      // Tall red roof with a cross on the peak; candles by the door.
      return [
        { model: 'graveyard/cross', x: i, y: levels + (b.cells.length === 1 ? 0.95 : 1.05), z: j, rotY: Math.PI / 2, scale: 0.45 },
        { model: 'graveyard/candle-multiple', x: front, y: 0, z: j + 0.3, rotY: 0, scale: 1.4 },
      ];
    case 'smithy': {
      // Chimney (it smokes, see smokeSources) and an anvil out front.
      const [bi, bj] = backCell(b);
      return [
        { model: ft('chimney'), x: bi, y: levels, z: bj, rotY: Math.PI },
        { model: 'survival/workbench-anvil', x: front, y: 0, z: j - 0.25, rotY: Math.PI / 2, scale: 1.6 },
      ];
    }
    case 'watchtower':
      // An extra storey (wallLevels), a blue castle roof and a flag on top.
      return [{ model: 'castle/flag', x: i, y: levels + 1, z: j, rotY: 0 }];
    default:
      return [];
  }
}

/** Low broken walls on the camera-facing edges plus scattered debris on every cell. */
export function ruinPieces(b: Building): Piece[] {
  const half = isWood(b) ? ft('wall-wood-half') : ft('wall-half');
  const out: Piece[] = [];
  for (const [i, j] of b.cells) {
    const h = (k: number) => hash01(i, j, b.id, k);
    if (h(0) < 0.7) out.push({ model: half, x: i, y: 0, z: j, rotY: EDGE.px });
    if (h(1) < 0.7) out.push({ model: half, x: i, y: 0, z: j, rotY: EDGE.pz });
    out.push(
      { model: 'graveyard/debris', x: i + (h(2) - 0.5) * 0.5, y: 0, z: j + (h(3) - 0.5) * 0.5, rotY: h(4) * Math.PI * 2, scale: 1.8 },
      { model: 'graveyard/debris-wood', x: i + (h(5) - 0.5) * 0.6, y: 0, z: j + (h(6) - 0.5) * 0.6, rotY: h(7) * Math.PI * 2, scale: 1.6 },
      { model: 'survival/resource-planks', x: i + (h(8) - 0.5) * 0.6, y: 0, z: j + (h(9) - 0.5) * 0.6, rotY: h(10) * Math.PI * 2, scale: 1.2 },
    );
  }
  return out;
}

export interface SmokeSource {
  x: number;
  y: number;
  z: number;
  kind: 'chimney' | 'fire';
}

/** Where smoke rises: a smithy's chimney, and the roof of a badly damaged building. */
export function smokeSources(b: Building, look: BuildingLook): SmokeSource[] {
  if (look.damage === 'ruined') return [];
  const levels = wallLevels(b, look.role);
  const out: SmokeSource[] = [];
  if (look.role === 'smithy') {
    const [bi, bj] = backCell(b);
    // The chimney sits 0.21–0.43 along its +X; turned by π that is behind the cell centre.
    out.push({ x: bi - 0.32, y: levels + 1, z: bj, kind: 'chimney' });
  }
  if (look.damage === 'damaged') {
    const cx = b.cells.reduce((s, [i]) => s + i, 0) / b.cells.length;
    const cz = b.cells.reduce((s, [, j]) => s + j, 0) / b.cells.length;
    out.push({ x: cx, y: levels + 0.6, z: cz, kind: 'fire' });
  }
  return out;
}

/** Cells a role's aura or range covers: centres within `radius` of the building centre (as the sim checks). */
export function auraCells(b: Building, radius: number): [number, number][] {
  if (radius <= 0) return [];
  const cx = b.cells.reduce((s, [i]) => s + i, 0) / b.cells.length;
  const cy = b.cells.reduce((s, [, j]) => s + j, 0) / b.cells.length;
  const r = Math.ceil(radius);
  const out: [number, number][] = [];
  for (let j = Math.floor(cy) - r; j <= Math.ceil(cy) + r; j++) {
    for (let i = Math.floor(cx) - r; i <= Math.ceil(cx) + r; i++) {
      if (Math.hypot(i - cx, j - cy) <= radius) out.push([i, j]);
    }
  }
  return out;
}

/** Trees, the well (a market stall for now) and rocks, with a stable turn and size. */
export function decorPiece(d: Decor): Piece {
  const turn = Math.floor(hash01(d.i, d.j, 1) * 8) * (Math.PI / 4);
  if (d.tile.includes('tree')) return { model: ft('tree'), x: d.i, y: 0, z: d.j, rotY: turn, scale: 0.9 + hash01(d.i, d.j, 2) * 0.35 };
  if (d.tile.includes('well')) return { model: ft('stall-red'), x: d.i, y: 0, z: d.j, rotY: 0 };
  return { model: ROCK, x: d.i, y: 0.15, z: d.j, rotY: turn };
}
