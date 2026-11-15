// The town: building regen, arrow slits, role effects and derived max-HP stats.

import { DT, KNIGHT } from '../data/balance';
import { ROLES, ROLE_EFFECTS } from '../data/roles';
import { TOWN_ARROWS } from '../data/rookies';
import type { BuildingState, Unit } from './model';
import { shoot } from './projectiles';
import { nearestMonster } from './queries';
import { applyRookieStats } from './rookieStats';
import { centreOf } from './units';
import type { World } from './world';

/** Building regen, arrow slits and role effects. */
export function updateTown(w: World) {
  const t = w.progression.mods.town;
  for (const b of w.buildings) {
    if (b.ruined) continue;
    if (b.role) updateRole(w, b);
    if (t.regenFrac > 0) b.hp = Math.min(b.maxHp, b.hp + b.maxHp * t.regenFrac * DT);
    if (t.arrowSlits <= 0) continue;
    b.shotIn -= DT;
    if (b.shotIn > 0) continue;
    const [ci, cj] = centreOf(b.cells);
    const target = nearestMonster(w, ci, cj, TOWN_ARROWS.range);
    if (!target) continue;
    shoot(w, ci, cj, target, TOWN_ARROWS.damage, TOWN_ARROWS.speed, -1);
    b.shotIn = Math.max(1.2, TOWN_ARROWS.interval - 0.8 * (t.arrowSlits - 1));
  }
}

function updateRole(w: World, b: BuildingState) {
  const def = ROLES[b.role!];
  const [cx, cy] = centreOf(b.cells);
  if (b.role === 'chapel') {
    const heal = ROLE_EFFECTS.chapelHealPerSecond * DT;
    healWithin(w.players, cx, cy, def.radius, heal);
    healWithin(w.rookies, cx, cy, def.radius, heal);

  } else if (b.role === 'watchtower') {
    b.towerShotIn -= DT;
    if (b.towerShotIn > 0) return;
    const target = nearestMonster(w, cx, cy, def.radius);
    if (!target) return;
    const wd = ROLE_EFFECTS.watchtower;
    shoot(w, cx, cy, target, wd.damage, wd.speed, -1);
    b.towerShotIn = wd.interval;
  }
}

/** Heals living units of a list that stand within adius of a point. */
function healWithin(list: Unit[], cx: number, cy: number, radius: number, heal: number) {
  for (const u of list) {
    if (u.state === 'dead' || Math.hypot(u.x - cx, u.y - cy) > radius) continue;
    u.hp = Math.min(u.maxHp, u.hp + heal);
  }
}

/** Applies derived stats (max HP of knights, rookies and buildings) after mods change. */
export function applyMods(w: World) {
  const m = w.progression.mods;
  for (const p of w.players) {
    const max = (KNIGHT.hp + m.knight.maxHpAdd) * w.boosts.knightHpMul;
    if (p.state !== 'dead') p.hp += max - p.maxHp;
    p.maxHp = max;
    p.speed = KNIGHT.speed * m.knight.speedMul;
  }
  for (const r of w.rookies) applyRookieStats(w, r);
  for (const b of w.buildings) {
    const max = b.baseMaxHp * m.town.maxHpMul;
    if (!b.ruined) b.hp = (b.hp / b.maxHp) * max;
    b.maxHp = max;
  }
}
