// Town map generation. Deterministic from a seed.
//
// The map is cut to a screen-aligned rectangle (decision 11) out of an iso grid. Cells are
// integer (i, j); a unit at ground position (x, y) stands in cell (round(x), round(y)).
// Buildings sit on a 4-cell lattice (2×2 slot + 2-cell lanes) around central crossroads.

import { ICE, MAP } from '../data/balance';
import { ISO_HX, ISO_HY } from './iso';
import { Rng } from './rng';

export const enum Ground {
  None = 0,
  Grass = 1,
  Road = 2,
  /** River: blocked for everyone except waders (decision 45). */
  Water = 3,
  /** Walkable crossing over the river. */
  Bridge = 4,
  /** Frozen pond (Town 4): walkable, but slippery (data/balance ICE). */
  Ice = 5,
}

/** What a block of a building is; the renderer picks the pieces. */
export type BlockPart = 'wall' | 'door' | 'roof';

/** One storey of one footprint cell (towers: two wall blocks, no roof block). */
export interface Block {
  i: number;
  j: number;
  level: number;
  part: BlockPart;
}

export type BuildingKind = 'cottage' | 'long' | 'hall' | 'tower';

export interface Building {
  id: number;
  kind: BuildingKind;
  cells: [number, number][];
  blocks: Block[];
}

export type DecorKind = 'tree' | 'well' | 'rock';

export interface Decor {
  i: number;
  j: number;
  kind: DecorKind;
  blocks: boolean;
}

export type Side = 'top' | 'right' | 'bottom' | 'left';
/** Every side, in the canonical order. */
export const SIDES: readonly Side[] = ['top', 'right', 'bottom', 'left'];

/** Look of a town: picks ground colour, props and lighting in the renderer. */
export type Theme = 'meadow' | 'graveyard' | 'frost';

export interface TownMap {
  /** Visual theme; missing means 'meadow'. */
  theme?: Theme;
  seed: number;
  /** Grid is size × size; cells outside the rectangle have Ground.None. */
  size: number;
  centre: number;
  ground: Uint8Array;
  blocked: Uint8Array;
  buildings: Building[];
  decor: Decor[];
  /** Walkable border cells, grouped by the screen edge they sit on (spawn points). */
  edges: Record<Side, [number, number][]>;
}

export interface MapOptions {
  across?: number;
  aspect?: number;
  /** A river through the town with bridges (Town 2). */
  river?: boolean;
  /**
   * Visual theme. Town 3 is a graveyard (many more gravestones, which are the rock decor);
   * Town 4 is frost (more boulders, and frozen ponds of slippery ice).
   */
  theme?: Theme;
}

export function cellIndex(map: TownMap, i: number, j: number): number {
  return j * map.size + i;
}

export function inBounds(map: TownMap, i: number, j: number): boolean {
  return i >= 0 && j >= 0 && i < map.size && j < map.size && map.ground[j * map.size + i] !== Ground.None;
}

export function isWalkable(map: TownMap, i: number, j: number): boolean {
  return inBounds(map, i, j) && map.blocked[j * map.size + i] === 0;
}

/** Walkable for river-wading monsters: like isWalkable, but water is passable. */
export function isWadeable(map: TownMap, i: number, j: number): boolean {
  if (!inBounds(map, i, j)) return false;
  const k = j * map.size + i;
  return map.blocked[k] === 0 || map.ground[k] === Ground.Water;
}

/** Grid column of the river (Town 2): the lane between the first and second building columns east of the road. */
export function riverColumn(centre: number): number {
  return centre + 3;
}

/** Rows where bridges cross the river: the main road plus one bridge either side. */
export function bridgeRows(centre: number): number[] {
  return [centre - 8, centre, centre + 8];
}

export function generateTown(seed: number, opts: MapOptions = {}): TownMap {
  const across = opts.across ?? MAP.across;
  const aspect = opts.aspect ?? MAP.aspect;
  const rng = new Rng(seed);

  // Screen-space half extents in native pixels, then the grid size needed to cover them.
  const halfW = across * ISO_HX;
  const halfH = halfW / aspect;
  const m = Math.ceil(halfW / ISO_HX + halfH / ISO_HY) + 2;
  const size = 2 * m + 1;
  const c = m;
  const ground = new Uint8Array(size * size);
  const blocked = new Uint8Array(size * size);
  const sx = (i: number, j: number) => (i - j) * ISO_HX;
  const sy = (i: number, j: number) => (i + j - 2 * c) * ISO_HY;

  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      if (Math.abs(sx(i, j)) <= halfW - ISO_HX * 0.5 && Math.abs(sy(i, j)) <= halfH - ISO_HY * 0.5) {
        ground[j * size + i] = i === c || j === c ? Ground.Road : Ground.Grass;
      }
    }
  }

  if (opts.river) {
    // A one-cell river along a grid column, crossed by bridges (decision 45).
    const ri = riverColumn(c);
    const bridges = bridgeRows(c);
    for (let j = 0; j < size; j++) {
      const k = j * size + ri;
      if (ground[k] === Ground.None) continue;
      if (bridges.includes(j)) ground[k] = Ground.Bridge;
      else {
        ground[k] = Ground.Water;
        blocked[k] = 1;
      }
    }
  }

  const map: TownMap = {
    theme: opts.theme ?? 'meadow', seed, size, centre: c, ground, blocked, buildings: [], decor: [],
    edges: { top: [], right: [], bottom: [], left: [] },
  };

  // Edge cells: walkable cells with a missing 4-neighbour. Classify by screen position.
  const isEdge = (i: number, j: number) =>
    !inBounds(map, i + 1, j) || !inBounds(map, i - 1, j) || !inBounds(map, i, j + 1) || !inBounds(map, i, j - 1);
  const edgeSet = new Set<number>();
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      if (!inBounds(map, i, j) || !isEdge(i, j)) continue;
      // Never spawn in the river.
      if (blocked[j * size + i]) continue;
      edgeSet.add(j * size + i);
      const x = sx(i, j) / halfW;
      const y = sy(i, j) / halfH;
      const side: Side = Math.abs(x) > Math.abs(y) ? (x > 0 ? 'right' : 'left') : y > 0 ? 'bottom' : 'top';
      map.edges[side].push([i, j]);
    }
  }

  // Town region: the inner part of the rectangle.
  const inTown = (i: number, j: number) =>
    Math.abs(sx(i, j)) < halfW * MAP.townExtent && Math.abs(sy(i, j)) < halfH * MAP.townExtent;

  const block = (i: number, j: number) => {
    blocked[j * size + i] = 1;
  };

  // Graveyards have far more gravestones (rocks); the RNG draws are unchanged, only the threshold moves.
  const rockChance = MAP.rockChance * (opts.theme === 'graveyard' ? 3 : opts.theme === 'frost' ? 2 : 1);
  const reach = Math.ceil(m / 4) + 1;
  let plazaPlaced = false;
  let id = 0;
  for (let a = -reach; a < reach; a++) {
    for (let b = -reach; b < reach; b++) {
      const i0 = c + a * 4 + 1;
      const j0 = c + b * 4 + 1;
      const fp: [number, number][] = [[i0, j0], [i0 + 1, j0], [i0, j0 + 1], [i0 + 1, j0 + 1]];
      if (!fp.every(([i, j]) => inBounds(map, i, j) && inTown(i, j) && !blocked[j * size + i])) continue;
      if (!plazaPlaced && a === -1 && b === -1) {
        // Well on the plaza by the crossroads.
        map.decor.push({ i: i0 + 1, j: j0 + 1, kind: 'well', blocks: true });
        block(i0 + 1, j0 + 1);
        plazaPlaced = true;
        continue;
      }
      if (rng.frac() < MAP.emptySlotChance) continue;
      const b2 = makeBuilding(id++, i0, j0, rng);
      for (const [i, j] of b2.cells) block(i, j);
      map.buildings.push(b2);
    }
  }

  // Trees and rocks outside town, never on roads or spawn edges.
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      if (!inBounds(map, i, j) || inTown(i, j) || i === c || j === c) continue;
      if (edgeSet.has(j * size + i) || blocked[j * size + i]) continue;
      const r = rng.frac();
      if (r < MAP.treeChance) {
        // The pick chose a tree tile for the old sprite renderer; it stays so seeds keep making the same towns.
        rng.pick(LEGACY_TREE_VARIANTS);
        map.decor.push({ i, j, kind: 'tree', blocks: true });
        block(i, j);
      } else if (r < MAP.treeChance + rockChance) {
        map.decor.push({ i, j, kind: 'rock', blocks: true });
        block(i, j);
      }
    }
  }

  removeUnreachable(map);
  if (opts.theme === 'frost') freezePonds(map, seed);
  return map;
}

/** True where the ground is slippery ice. */
export function isIce(map: TownMap, i: number, j: number): boolean {
  return inBounds(map, i, j) && map.ground[j * map.size + i] === Ground.Ice;
}

/**
 * Frost theme: turns round blobs of open ground (grass and road, never blocked cells) into ice.
 * Uses its own RNG after everything else, so buildings and decor match the same seed's meadow.
 * Keeps clear of the crossroads, where the knight starts.
 */
function freezePonds(map: TownMap, seed: number) {
  const rng = new Rng(seed * 31 + 7);
  const n = map.size;
  const c = map.centre;
  const open: [number, number][] = [];
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      if (isWalkable(map, i, j) && Math.hypot(i - c, j - c) > 5) open.push([i, j]);
    }
  }
  for (let p = 0; p < ICE.ponds && open.length; p++) {
    const [pi, pj] = rng.pick(open);
    const r = rng.range(ICE.pondRadius[0], ICE.pondRadius[1]);
    const reach = Math.ceil(r + 1);
    for (let j = pj - reach; j <= pj + reach; j++) {
      for (let i = pi - reach; i <= pi + reach; i++) {
        if (!isWalkable(map, i, j) || Math.hypot(i - c, j - c) <= 3) continue;
        // A ragged edge: each cell's own threshold wobbles a little.
        if (Math.hypot(i - pi, j - pj) <= r + rng.range(-0.4, 0.4)) map.ground[j * n + i] = Ground.Ice;
      }
    }
  }
}

/**
 * Flood-fills from the crossroads with the same movement rules as the flow field (8-way, no
 * corner cutting) and removes every walkable cell it can't reach: staircase corners on the
 * map rim that only touch the map diagonally, and pockets sealed by buildings and trees.
 * Unreachable rim cells are dropped from the map; enclosed pockets become blocked.
 */
function removeUnreachable(map: TownMap) {
  const n = map.size;
  const seen = new Uint8Array(n * n);
  const start = map.centre * n + map.centre;
  const stack = [start];
  seen[start] = 1;
  while (stack.length) {
    const idx = stack.pop()!;
    const i = idx % n;
    const j = (idx - i) / n;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di;
        const nj = j + dj;
        if (!isWalkable(map, ni, nj)) continue;
        if (di && dj && (!isWalkable(map, i + di, j) || !isWalkable(map, i, j + dj))) continue;
        const k = nj * n + ni;
        if (!seen[k]) {
          seen[k] = 1;
          stack.push(k);
        }
      }
    }
  }
  const dropped = new Set<number>();
  for (let k = 0; k < n * n; k++) {
    if (seen[k] || map.ground[k] === Ground.None || map.blocked[k]) continue;
    const i = k % n;
    const j = (k - i) / n;
    const onRim = !inBounds(map, i + 1, j) || !inBounds(map, i - 1, j) || !inBounds(map, i, j + 1) || !inBounds(map, i, j - 1);
    if (onRim) {
      map.ground[k] = Ground.None;
      dropped.add(k);
    } else {
      map.blocked[k] = 1;
    }
  }
  if (dropped.size) {
    for (const side of Object.keys(map.edges) as Side[]) {
      map.edges[side] = map.edges[side].filter(([i, j]) => !dropped.has(j * n + i));
    }
  }
}

/**
 * The old sprite renderer chose tile variants with these RNG calls. The calls stay (results
 * unused) so every seed still generates the same town and the golden fingerprints hold.
 */
const LEGACY_ROOF_VARIANTS = 7;
const LEGACY_TREE_VARIANTS = [0, 1, 2, 3];
const LEGACY_WALL_VARIANTS = [0, 1];

function makeBuilding(id: number, i0: number, j0: number, rng: Rng): Building {
  rng.frac(); // wall colour
  rng.pick(Array.from({ length: LEGACY_ROOF_VARIANTS }, (_, k) => k)); // roof tile
  // Weighted: towers are rare landmarks.
  const kind = rng.pick<BuildingKind>(['cottage', 'cottage', 'long', 'long', 'long', 'hall', 'hall', 'hall', 'tower']);
  let cells: [number, number][];
  let levels = 1;
  if (kind === 'cottage') {
    cells = [[i0 + rng.between(0, 1), j0 + rng.between(0, 1)]];
  } else if (kind === 'long') {
    cells = rng.frac() < 0.5 ? [[i0, j0], [i0 + 1, j0]] : [[i0, j0], [i0, j0 + 1]];
    levels = rng.between(1, 2);
  } else if (kind === 'hall') {
    cells = [[i0, j0], [i0 + 1, j0], [i0, j0 + 1], [i0 + 1, j0 + 1]];
    levels = rng.between(1, 2);
  } else {
    cells = [[i0 + 1, j0 + 1]];
  }

  const blocks: Block[] = [];
  const frontI = Math.max(...cells.map((f) => f[0]));
  for (const [i, j] of cells) {
    if (kind === 'tower') {
      blocks.push({ i, j, level: 1, part: 'wall' }, { i, j, level: 2, part: 'wall' });
      continue;
    }
    for (let l = 1; l <= levels; l++) {
      const front = i === frontI && l === 1;
      rng.pick(LEGACY_WALL_VARIANTS); // wall tile
      blocks.push({ i, j, level: l, part: front ? 'door' : 'wall' });
    }
    blocks.push({ i, j, level: levels + 1, part: 'roof' });
  }
  return { id, kind, cells, blocks };
}
