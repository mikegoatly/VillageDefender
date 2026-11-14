// Read-only lookups over the world: nearest units, buildings and cells, and the enemy spatial hash.

import type { Unit } from './model';
import { clamp } from './units';
import type { World } from './world';

export function nearestMonster(w: World, x: number, y: number, range: number): Unit | null {
  let best: Unit | null = null;
  if (w.enemyHash.size === 0) return null;
  let bestD = range;
  w.enemyHash.query(x, y, range, (m) => {
    if (m.state === 'dead' || m.team !== 'enemy') return;
    const d = Math.hypot(m.x - x, m.y - y) - m.radius;
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  });
  return best;
}

/** Nearest living knight or rookie. */
export function nearestFriendly(w: World, x: number, y: number): Unit | null {
  const p = nearestOf(w.players, x, y);
  const r = nearestOf(w.rookies, x, y);
  if (!p) return r;
  if (!r) return p;
  // A rookie only wins when strictly closer, so ties keep the knight.
  return Math.hypot(r.x - x, r.y - y) < Math.hypot(p.x - x, p.y - y) ? r : p;
}

/** Nearest living unit of a list. */
export function nearestOf(list: Unit[], x: number, y: number): Unit | null {
  let best: Unit | null = null;
  let bestD = Infinity;
  for (const u of list) {
    if (u.state === 'dead') continue;
    const d = Math.hypot(u.x - x, u.y - y);
    if (d < bestD) {
      bestD = d;
      best = u;
    }
  }
  return best;
}

export function friendlyById(w: World, id: number): Unit | null {
  if (id < 0) return null;
  for (const p of w.players) if (p.id === id) return p;
  for (const p of w.rookies) if (p.id === id) return p;
  return null;
}

export function monsterById(w: World, id: number): Unit | null {
  if (id < 0) return null;
  for (const m of w.monsters) if (m.id === id) return m;
  return null;
}

/** Nearest cell of any standing building (whole map; used by phasing monsters). */
export function nearestStandingCell(w: World, x: number, y: number): [number, number] | null {
  let best: [number, number] | null = null;
  let bestD = Infinity;
  for (const b of w.buildings) {
    if (b.ruined) continue;
    for (const [i, j] of b.cells) {
      const d = Math.hypot(i - x, j - y);
      if (d < bestD) {
        bestD = d;
        best = [i, j];
      }
    }
  }
  return best;
}

/** Nearest standing building cell within `reach` of the unit's edge, with the direction toward it. */
export function adjacentBuilding(w: World, m: Unit, reach: number): { id: number; dx: number; dy: number } | null {
  const ci = Math.round(m.x);
  const cj = Math.round(m.y);
  let best: { id: number; dx: number; dy: number } | null = null;
  let bestD = m.radius + reach + 0.05;
  for (let j = cj - 1; j <= cj + 1; j++) {
    for (let i = ci - 1; i <= ci + 1; i++) {
      const b = w.buildingAt(i, j);
      if (!b || b.ruined) continue;
      const nx = clamp(m.x, i - 0.5, i + 0.5);
      const ny = clamp(m.y, j - 0.5, j + 0.5);
      const d = Math.hypot(m.x - nx, m.y - ny);
      if (d <= bestD) {
        bestD = d;
        best = { id: b.id, dx: i - m.x, dy: j - m.y };
      }
    }
  }
  return best;
}

/** Closest standing building cell within two cells, or null. */
export function nearestBuildingCell(w: World, m: Unit): [number, number] | null {
  const ci = Math.round(m.x);
  const cj = Math.round(m.y);
  let best: [number, number] | null = null;
  let bestD = Infinity;
  for (let j = cj - 2; j <= cj + 2; j++) {
    for (let i = ci - 2; i <= ci + 2; i++) {
      const b = w.buildingAt(i, j);
      if (!b || b.ruined) continue;
      const d = Math.hypot(i - m.x, j - m.y);
      if (d < bestD) {
        bestD = d;
        best = [i, j];
      }
    }
  }
  return best;
}

export function rebuildEnemyHash(w: World) {
  w.enemyHash.clear();
  for (const m of w.monsters) if (m.state !== 'dead') w.enemyHash.insert(m);
}
