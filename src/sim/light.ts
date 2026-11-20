// Night towns: light as a gameplay rule. Ranged attacks only pick targets standing in light, lamp
// posts can be lit with oil while planning and get knocked over by big monsters. Everywhere else
// (and at dusk, before NIGHT.darkFrom) everything counts as lit, so other towns are untouched.
//
// Sources: the knight's lantern (checked exactly, every call), each standing building's window
// light and each lit lamp post (stamped into a per-cell grid, rebuilt only when one changes).
// render3d/nightLights.ts draws the same list, so what looks lit is what is lit.

import { MONSTERS, type MonsterKind } from '../data/monsters';
import { NIGHT, nightLevel } from '../data/night';
import type { Lamp, Unit } from './model';
import type { World } from './world';

export type LightKind = 'lantern' | 'window' | 'lamp';

export interface LightSpot {
  /** Stable id while the source exists. */
  key: string;
  kind: LightKind;
  /** Ground position. */
  x: number;
  y: number;
  /** Reach (cells). */
  radius: number;
}

/** The world state that light depends on. */
export type Lightable = Pick<World, 'players' | 'buildings' | 'lamps' | 'map'>;

/** True in night towns. */
export function isNight(w: Pick<World, 'map'>): boolean {
  return w.map.theme === 'night';
}

/** True while darkness counts (night towns, from wave 3). */
export function isDark(w: Pick<World, 'map' | 'wave'>): boolean {
  return isNight(w) && nightLevel(w.wave) >= NIGHT.darkFrom;
}

/** A lamp post that is lit and standing gives light. */
export function lampShines(l: Lamp): boolean {
  return l.lit && l.hp > 0;
}

/** Where a building's window light falls: just outside its camera-facing corner. */
export function windowSpot(cells: readonly (readonly [number, number])[]): { x: number; y: number } {
  let maxI = -Infinity;
  let maxJ = -Infinity;
  for (const [i, j] of cells) {
    if (i > maxI) maxI = i;
    if (j > maxJ) maxJ = j;
  }
  return { x: maxI + NIGHT.windowOut, y: maxJ + NIGHT.windowOut };
}

/** Every light source right now: the knight's lantern first (while he lives), windows, lit lamps. */
export function lightSpots(w: Lightable): LightSpot[] {
  const out: LightSpot[] = [];
  const k = w.players[0];
  if (k && k.state !== 'dead') out.push({ key: 'lantern', kind: 'lantern', x: k.x, y: k.y, radius: NIGHT.radius.lantern });
  staticSpots(w, out);
  return out;
}

/** Windows of standing buildings and lit, standing lamp posts. */
function staticSpots(w: Lightable, out: LightSpot[]) {
  for (const b of w.buildings) {
    if (b.ruined) continue;
    const { x, y } = windowSpot(b.cells);
    out.push({ key: `b${b.id}`, kind: 'window', x, y, radius: NIGHT.radius.window });
  }
  for (const l of w.lamps) {
    if (lampShines(l)) out.push({ key: `l${l.id}`, kind: 'lamp', x: l.x, y: l.y, radius: NIGHT.radius.lamp });
  }
}

/**
 * Cells lit by the static sources (windows and lamps), 1 = lit. Rebuilt lazily after `markDirty`
 * (a building falls, a lamp is lit, unlit or knocked over), never per tick.
 */
export class LightGrid {
  readonly cells: Uint8Array;
  private dirty = true;

  constructor(private readonly size: number) {
    this.cells = new Uint8Array(size * size);
  }

  markDirty() {
    this.dirty = true;
  }

  /** The grid, rebuilt first if a source changed. */
  get(w: Lightable): Uint8Array {
    if (this.dirty) this.rebuild(w);
    return this.cells;
  }

  private rebuild(w: Lightable) {
    this.dirty = false;
    const n = this.size;
    this.cells.fill(0);
    const spots: LightSpot[] = [];
    staticSpots(w, spots);
    for (const s of spots) {
      const r = s.radius;
      const i0 = Math.max(0, Math.ceil(s.x - r));
      const i1 = Math.min(n - 1, Math.floor(s.x + r));
      const j0 = Math.max(0, Math.ceil(s.y - r));
      const j1 = Math.min(n - 1, Math.floor(s.y + r));
      for (let j = j0; j <= j1; j++) {
        for (let i = i0; i <= i1; i++) {
          if ((i - s.x) ** 2 + (j - s.y) ** 2 <= r * r) this.cells[j * n + i] = 1;
        }
      }
    }
  }
}

/**
 * True when a ground point stands in light. Always true outside night towns and at dusk (waves 1–2),
 * so only Lanternwick's later waves are affected. Static sources by cell, the lantern exactly.
 */
export function isLit(w: World, x: number, y: number): boolean {
  if (!isDark(w)) return true;
  return litBySources(w, x, y);
}

/** Lit by any source, ignoring dusk grace (the debug overlay and the planning preview use it). */
export function litBySources(w: World, x: number, y: number): boolean {
  const k = w.players[0];
  if (k && k.state !== 'dead' && Math.hypot(k.x - x, k.y - y) <= NIGHT.radius.lantern) return true;
  const i = Math.round(x);
  const j = Math.round(y);
  const n = w.map.size;
  if (i < 0 || j < 0 || i >= n || j >= n) return false;
  return w.light.get(w)[j * n + i] === 1;
}

/** A unit a friendly ranged attack may pick (standing in light). */
export function canShootAt(w: World, m: Pick<Unit, 'x' | 'y'>): boolean {
  return isLit(w, m.x, m.y);
}

// ------------------------------------------------------------------ lamp posts

/** Lamp posts from the map's lamp decor, in map order (ids are indices). */
export function makeLamps(w: Pick<World, 'map'>): Lamp[] {
  const out: Lamp[] = [];
  for (const d of w.map.decor) {
    if (d.kind !== 'lamp') continue;
    const startsLit = !!d.lit;
    out.push({ id: out.length, x: d.i, y: d.j, hp: NIGHT.lampHp, maxHp: NIGHT.lampHp, lit: startsLit, startsLit });
  }
  return out;
}

/** Oil spent on lamps that started dark. */
export function oilUsed(w: Pick<World, 'lamps'>): number {
  let n = 0;
  for (const l of w.lamps) if (l.lit && !l.startsLit) n++;
  return n;
}

/** Lights or unlights a lamp (no rules: planning and debug check their own). */
export function setLampLit(w: World, l: Lamp, lit: boolean) {
  if (l.lit === lit) return;
  l.lit = lit;
  w.light.markDirty();
}

/** Knocks a lamp post over: broken and dark for the rest of the run. */
export function breakLamp(w: World, l: Lamp) {
  if (l.hp <= 0) return;
  l.hp = 0;
  l.lit = false;
  w.light.markDirty();
  w.events.push({ type: 'lampBroken', lamp: l.id, x: l.x, y: l.y });
}

/** True for monsters that knock lamp posts over by walking through them. */
export function breaksLamps(m: Unit): boolean {
  return !!MONSTERS[m.kind as MonsterKind]?.boss || NIGHT.breakers.includes(m.kind as MonsterKind);
}

/** Bosses and brutes knock over any standing lamp post they walk through. */
export function updateLamps(w: World) {
  if (w.lamps.length === 0) return;
  for (const m of w.monsters) {
    if (m.state === 'dead' || !breaksLamps(m)) continue;
    const reach = m.radius + NIGHT.lampReach;
    for (const l of w.lamps) {
      if (l.hp > 0 && Math.abs(l.x - m.x) <= reach && Math.abs(l.y - m.y) <= reach && Math.hypot(l.x - m.x, l.y - m.y) <= reach) breakLamp(w, l);
    }
  }
}

/** Share of walkable cells lit by any source right now (debug). */
export function litCoverage(w: World): { lit: number; walkable: number } {
  const n = w.map.size;
  let lit = 0;
  let walkable = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      if (w.map.ground[k] === 0 || w.map.blocked[k]) continue;
      walkable++;
      if (litBySources(w, i, j)) lit++;
    }
  }
  return { lit, walkable };
}
