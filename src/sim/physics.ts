// Physics: soft separation between units, knockback integration and collision with blocked cells.

import { DT, KNOCKBACK_DAMPING, SEPARATION } from '../data/balance';
import { MONSTERS, type MonsterKind } from '../data/monsters';
import { inBounds, isWalkable } from './map';
import type { Unit } from './model';
import { clamp } from './units';
import type { World } from './world';

/** Separation mass: bigger bodies push smaller ones aside. */
function mass(u: Unit): number {
  return u.radius * u.radius * 20;
}

/** Soft push-apart between overlapping units. */
export function separate(w: World) {
  const all = w.bodyHash;
  all.clear();
  for (const u of w.monsters) if (u.state !== 'dead') all.insert(u);
  for (const u of w.rookies) if (u.state !== 'dead') all.insert(u);
  for (const u of w.players) if (u.state !== 'dead') all.insert(u);
  const visit = (u: Unit) => {
    if (u.state === 'dead') return;
    all.query(u.x, u.y, u.radius + 0.5, (o) => {
      if (o === u || o.state === 'dead' || o.id < u.id) return;
      const dx = o.x - u.x;
      const dy = o.y - u.y;
      const d = Math.hypot(dx, dy);
      const min = u.radius + o.radius;
      if (d >= min || d < 1e-6) return;
      const push = ((min - d) / d) * SEPARATION;
      // Heavier units give way less; a dodging knight shoves through.
      const wu = u.state === 'dodge' ? 0 : 1 / mass(u);
      const wo = o.state === 'dodge' ? 0 : 1 / mass(o);
      const total = wu + wo || 1;
      u.x -= dx * push * (wu / total);
      u.y -= dy * push * (wu / total);
      o.x += dx * push * (wo / total);
      o.y += dy * push * (wo / total);
    });
  };
  for (const u of w.monsters) visit(u);
  for (const u of w.rookies) visit(u);
  for (const u of w.players) visit(u);
}

/** Applies knockback velocity, then resolves collisions with blocked cells and the map edge. */
export function integrate(w: World, u: Unit) {
  if (u.vx !== 0 || u.vy !== 0) {
    u.x += u.vx * DT;
    u.y += u.vy * DT;
    const damp = Math.exp(-KNOCKBACK_DAMPING * DT);
    u.vx *= damp;
    u.vy *= damp;
    if (Math.abs(u.vx) < 0.01 && Math.abs(u.vy) < 0.01) u.vx = u.vy = 0;
  }
  // Phasing monsters (ghosts) ignore buildings and trees; only the map edge contains them.
  if (u.team === 'enemy' && MONSTERS[u.kind as MonsterKind].phasing) keepOnMap(w, u);
  else collideCells(w, u);
}

/** Off the map entirely: walk back toward the centre rather than being shoved further out. */
function keepOnMap(w: World, u: Unit) {
  if (inBounds(w.map, Math.round(u.x), Math.round(u.y))) return;
  const c = w.map.centre;
  const d = Math.hypot(c - u.x, c - u.y) || 1;
  u.x += ((c - u.x) / d) * 0.08;
  u.y += ((c - u.y) / d) * 0.08;
}

/** Pushes a circle out of every non-walkable cell it overlaps. Cell (i, j) spans i±0.5, j±0.5. */
export function collideCells(w: World, u: Unit) {
  for (let pass = 0; pass < 2; pass++) {
    const ci = Math.round(u.x);
    const cj = Math.round(u.y);
    for (let j = cj - 1; j <= cj + 1; j++) {
      for (let i = ci - 1; i <= ci + 1; i++) {
        if (isWalkable(w.map, i, j)) continue;
        const nx = clamp(u.x, i - 0.5, i + 0.5);
        const ny = clamp(u.y, j - 0.5, j + 0.5);
        const dx = u.x - nx;
        const dy = u.y - ny;
        const d2 = dx * dx + dy * dy;
        if (d2 >= u.radius * u.radius) continue;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2);
          u.x = nx + (dx / d) * u.radius;
          u.y = ny + (dy / d) * u.radius;
        } else if (inBounds(w.map, i, j)) {
          // Centre inside a blocked cell: push out along the shallowest axis.
          const ox = u.x - i;
          const oy = u.y - j;
          if (Math.abs(ox) > Math.abs(oy)) u.x = i + Math.sign(ox || 1) * (0.5 + u.radius);
          else u.y = j + Math.sign(oy || 1) * (0.5 + u.radius);
        }
      }
    }
  }
  keepOnMap(w, u);
}
