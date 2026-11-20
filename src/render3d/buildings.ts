// Which kit pieces make up each building, by role and damage state. Pure functions (no three.js
// objects), so the rules are unit-tested; TownView turns the pieces into meshes.
//
// Fantasy Town wall pieces sit on the +X edge of their 1×1 cell; the camera looks from +X/+Z, so
// the +X and +Z sides of a building face the player.

import type { RoleKind } from '../data/roles';
import type { Building, Decor, Theme } from '../sim/map';

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

/** Town and army upgrade stacks that change how buildings look (see fortPieces). */
export interface TownFort {
  walls: number;
  thorns: number;
  slits: number;
  crews: number;
  /** Tar Pits ('braziers'). */
  tar: number;
  recruit: number;
  garrison: number;
  /** Same for equal forts. */
  key: string;
}

export interface BuildingLook {
  role: RoleKind | null;
  damage: DamageState;
  fort?: TownFort;
}

/** Generated (not GLB) pieces: a dark arrow slit and a tar puddle. */
export const SLIT = 'slit';
export const TAR = 'tar';

export const PLAIN: BuildingLook = { role: null, damage: 'intact' };

/** Not a GLB: decor rocks are a generated mesh. */
export const ROCK = 'rock';

const ft = (m: string) => `fantasy-town/${m}`;

const gy = (m: string) => `graveyard/${m}`;
const GRAVEYARD_TREES = ['pine', 'pine-crooked', 'pine-fall', 'pine-fall-crooked'].map(gy);
const GRAVESTONES = [
  'gravestone-bevel', 'gravestone-broken', 'gravestone-cross', 'gravestone-cross-large',
  'gravestone-round', 'gravestone-wide', 'gravestone-decorative',
].map(gy);

const hol = (m: string) => `holiday/${m}`;
const SNOW_TREES = ['tree-snow-a', 'tree-snow-b', 'tree-snow-c'].map(hol);
const SNOW_ROCKS = ['rocks-medium', 'rocks-small'].map(hol);

/** Every model the town can use, for preloading. */
export const TOWN_MODELS = [
  ...['wall', 'wall-door', 'wall-window-shutters', 'wall-broken', 'wall-half',
    'wall-wood', 'wall-wood-door', 'wall-wood-window-shutters', 'wall-wood-broken', 'wall-wood-half',
    'roof-gable', 'roof-point', 'roof-high-point', 'roof-high-gable', 'chimney', 'banner-red',
    'tree', 'stall-red', 'road'].map(ft),
  'castle/flag', 'castle/flag-pennant', 'castle/tower-square-top', 'castle/tower-square-top-roof',
  'graveyard/cross', 'graveyard/candle-multiple', 'graveyard/debris', 'graveyard/debris-wood',
  ...GRAVEYARD_TREES, ...GRAVESTONES,
  ...SNOW_TREES, ...SNOW_ROCKS, 'holiday/snow-pile', 'holiday/snow-flat', 'holiday/lantern', 'holiday/sled',
  'graveyard/gravestone-debris', 'graveyard/grave', 'graveyard/fire-basket',
  'survival/workbench-anvil', 'survival/grass', 'survival/grass-large', 'survival/resource-planks',
  'mini-arena/weapon-rack', 'mini-forest/bridge', 'mini-forest/plant',
  'fantasy-town/fence', 'survival/fence-fortified', 'mini-dungeon/trap', 'mini-forest/ladder',
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
  if (look.fort) out.push(...fortPieces(b, look.role, levels, look.fort));
  return out;
}

interface OutsideEdge {
  i: number;
  j: number;
  /** Outward normal. */
  nx: number;
  nz: number;
  /** Rotation of a +X-edge piece onto this edge. */
  rotY: number;
  /** Faces the camera (+X or +Z). */
  front: boolean;
}

/** Rotation turning a +X-edge piece onto the edge with outward normal (nx, nz). */
const EDGE_ROT = (nx: number, nz: number) => (nx > 0 ? EDGE.px : nx < 0 ? EDGE.nx : nz > 0 ? EDGE.pz : EDGE.nz);

/** Outside edges of a building's cells (footprintOutline, by cell). */
function outsideEdges(b: Building): OutsideEdge[] {
  return footprintOutline(b.cells).map((e) => ({
    i: e.x - e.nx / 2, j: e.z - e.nz / 2, nx: e.nx, nz: e.nz, rotY: EDGE_ROT(e.nx, e.nz), front: e.nx > 0 || e.nz > 0,
  }));
}

/** Placement of the cumulative town-upgrade pieces (offsets are outward from the cell centre). */
const FORT = {
  /** Fences stand just outside the wall line. */
  fenceOut: 0.28,
  /**
   * The palisade model runs along its own X, 0.22 off centre on its -Z side, at half a cell's
   * size: scaled up and turned a quarter so it runs along the wall, standing ~0.78 out.
   */
  palisade: { scale: 1.6, out: 0.43 },
  trap: { scale: 0.42, out: 0.98, spread: 0.42 },
  slit: { y: 0.55, along: 0.3 },
  planks: { scale: 1.5, out: 0.8 },
  ladder: { out: 0.6 },
  /** Tar pools under this share of the front edges. */
  tar: { out: 0.85, share: 0.65 },
  /** Braziers stand out from the front corners, `inset` back along the wall. */
  basket: { scale: 1.6, out: 0.95, inset: 0.35 },
  banner: { out: 0.13 },
  /** Pennants go on the other roof cells, or round the one roof of a single cell. */
  pennant: { y: 0.3, around: 0.35 },
};

/**
 * What the town's upgrades add to a standing building, more with each stack: fences on the front,
 * then all round, then a palisade (Reinforced Walls); spike traps by the door (Spiked Doors);
 * arrow slits (Arrow Slits); planks then a ladder (Repair Crews); tar then burning braziers (Tar
 * Pits); and on the barracks, extra banners (Recruitment Drive) and pennants (Bigger Garrison).
 */
export function fortPieces(b: Building, role: RoleKind | null, levels: number, f: TownFort): Piece[] {
  const out: Piece[] = [];
  const [di, dj] = doorCell(b);
  const edges = outsideEdges(b);
  const isDoor = (e: OutsideEdge) => e.i === di && e.j === dj && e.nx === 1;

  if (f.walls > 0) {
    for (const e of edges) {
      if (isDoor(e) || (f.walls < 2 && !e.front)) continue;
      if (f.walls >= 3) {
        const { scale, out: o } = FORT.palisade;
        out.push({ model: 'survival/fence-fortified', x: e.i + e.nx * o, y: 0, z: e.j + e.nz * o, rotY: e.rotY - Math.PI / 2, scale });
      } else out.push({ model: ft('fence'), x: e.i + e.nx * FORT.fenceOut, y: 0, z: e.j + e.nz * FORT.fenceOut, rotY: e.rotY });
    }
  }

  const { scale: ts, out: to, spread } = FORT.trap;
  for (let n = 0; n < Math.min(3, f.thorns); n++) {
    out.push({ model: 'mini-dungeon/trap', x: di + to, y: 0, z: dj + [0, -spread, spread][n], rotY: 0, scale: ts });
  }

  if (f.slits > 0) {
    for (const e of edges) {
      // One: the +X face of the top storey; two: +Z too; three: every storey.
      if (!e.front || (f.slits === 1 && e.nx !== 1)) continue;
      for (let y = f.slits >= 3 ? 0 : levels - 1; y < levels; y++) {
        // Off-centre, clear of the window shutters, on the wall's outer face.
        const along = FORT.slit.along * (hash01(e.i, e.j, y, b.id) < 0.5 ? -1 : 1);
        out.push({ model: SLIT, x: e.i + e.nx * 0.5 - e.nz * along, y: y + FORT.slit.y, z: e.j + e.nz * 0.5 + e.nx * along, rotY: e.rotY });
      }
    }
  }

  if (f.crews >= 2) {
    const back = edges.find((e) => e.nx === -1) ?? edges[0];
    const o = FORT.planks.out;
    out.push({ model: 'survival/resource-planks', x: back.i + back.nx * o, y: 0, z: back.j + back.nz * o, rotY: back.rotY, scale: FORT.planks.scale });
  }
  if (f.crews >= 3) {
    const side = edges.find((e) => e.nz === 1) ?? edges[0];
    const o = FORT.ladder.out;
    // The ladder model lies along its own X; a quarter turn lays it flat against the wall.
    out.push({ model: 'mini-forest/ladder', x: side.i + side.nx * o, y: 0, z: side.j + side.nz * o, rotY: side.rotY + Math.PI / 2 });
  }

  if (f.tar > 0) {
    for (const e of edges) {
      if (!e.front || isDoor(e) || hash01(e.i, e.j, e.nx, b.id, 9) > FORT.tar.share) continue;
      out.push({ model: TAR, x: e.i + e.nx * FORT.tar.out, y: 0, z: e.j + e.nz * FORT.tar.out, rotY: hash01(e.i, e.j, b.id) * Math.PI * 2 });
    }
  }
  for (const p of brazierSpots(b, f)) out.push({ model: gy('fire-basket'), x: p.x, y: 0, z: p.z, rotY: 0, scale: FORT.basket.scale });

  if (role === 'barracks') {
    // Extra banners on the front walls, then pennants on more of the roof.
    const fronts = edges.filter((e) => e.nx === 1 && !isDoor(e));
    for (let n = 0; n < Math.min(f.recruit, fronts.length); n++) {
      out.push({ model: ft('banner-red'), x: fronts[n].i, y: levels - 1, z: fronts[n].j, rotY: EDGE.px, out: FORT.banner.out });
    }
    const r = FORT.pennant.around;
    const spots = b.cells.length > 1 ? b.cells.slice(1) : [[di, dj - r], [di, dj + r], [di - r, dj]];
    for (let n = 0; n < Math.min(f.garrison, spots.length); n++) {
      out.push({ model: 'castle/flag-pennant', x: spots[n][0], y: levels + FORT.pennant.y, z: spots[n][1], rotY: 0 });
    }
  }
  return out;
}

/** Tar Pits maxed: a burning brazier at each front corner of the building. */
function brazierSpots(b: Building, f: TownFort): { x: number; z: number }[] {
  if (f.tar < 2) return [];
  const maxI = Math.max(...b.cells.map(([i]) => i));
  const maxJ = Math.max(...b.cells.map(([, j]) => j));
  const minJ = Math.min(...b.cells.map(([, j]) => j));
  const { out: o, inset } = FORT.basket;
  return [{ x: maxI + o, z: minJ - inset }, { x: maxI + inset, z: maxJ + o }];
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
  kind: 'chimney' | 'fire' | 'brazier';
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
  if (look.fort) for (const p of brazierSpots(b, look.fort)) out.push({ x: p.x, y: 0.4, z: p.z, kind: 'brazier' });
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

/** One unit-long side of a footprint cell: its midpoint, whether it runs along x, and its outward normal. */
export interface OutlineEdge {
  x: number;
  z: number;
  horizontal: boolean;
  nx: number;
  nz: number;
}

/** The outer boundary of a building's footprint (cell sides with no footprint cell beyond them). */
export function footprintOutline(cells: readonly (readonly [number, number])[]): OutlineEdge[] {
  const has = new Set(cells.map(([i, j]) => `${i},${j}`));
  const out: OutlineEdge[] = [];
  for (const [i, j] of cells) {
    if (!has.has(`${i},${j - 1}`)) out.push({ x: i, z: j - 0.5, horizontal: true, nx: 0, nz: -1 });
    if (!has.has(`${i},${j + 1}`)) out.push({ x: i, z: j + 0.5, horizontal: true, nx: 0, nz: 1 });
    if (!has.has(`${i - 1},${j}`)) out.push({ x: i - 0.5, z: j, horizontal: false, nx: -1, nz: 0 });
    if (!has.has(`${i + 1},${j}`)) out.push({ x: i + 0.5, z: j, horizontal: false, nx: 1, nz: 0 });
  }
  return out;
}

/** Trees, the well (a market stall for now) and rocks, with a stable turn and size. */
export function decorPiece(d: Decor, theme: Theme = 'meadow'): Piece {
  const turn = Math.floor(hash01(d.i, d.j, 1) * 8) * (Math.PI / 4);
  const pick = <T,>(xs: T[], k: number) => xs[Math.min(xs.length - 1, Math.floor(hash01(d.i, d.j, k) * xs.length))];
  if (theme === 'frost') {
    if (d.kind === 'tree') return { model: pick(SNOW_TREES, 3), x: d.i, y: 0, z: d.j, rotY: turn, scale: 1.0 + hash01(d.i, d.j, 2) * 0.35 };
    if (d.kind === 'rock') return { model: pick(SNOW_ROCKS, 4), x: d.i, y: 0, z: d.j, rotY: hash01(d.i, d.j, 5) * Math.PI * 2, scale: 0.8 };
  }
  if (theme === 'graveyard') {
    if (d.kind === 'tree') return { model: pick(GRAVEYARD_TREES, 3), x: d.i, y: 0, z: d.j, rotY: turn, scale: 1.1 + hash01(d.i, d.j, 2) * 0.35 };
    if (d.kind === 'rock') return { model: pick(GRAVESTONES, 4), x: d.i, y: 0, z: d.j, rotY: hash01(d.i, d.j, 5) * Math.PI * 2, scale: 1.2 };
  }
  if (d.kind === 'tree') return { model: ft('tree'), x: d.i, y: 0, z: d.j, rotY: turn, scale: 0.9 + hash01(d.i, d.j, 2) * 0.35 };
  if (d.kind === 'well') return { model: ft('stall-red'), x: d.i, y: 0, z: d.j, rotY: 0 };
  return { model: ROCK, x: d.i, y: 0.15, z: d.j, rotY: turn };
}
