// Rookies: recruitment, stats, pathing and their fight-or-follow AI.

import { DT, KNIGHT } from '../data/balance';
import { ARMY, RALLY, ROOKIES, type RookieKind } from '../data/rookies';
import { swingHits } from './combat';
import { isWalkable } from './map';
import type { BuildingState, Unit } from './model';
import { clearLine, Pather } from './pather';
import { shoot } from './projectiles';
import { monsterById, nearestMonster } from './queries';
import { makeRookie, rookieDamage } from './rookieStats';
import { norm, setState, tickTimers } from './units';
import type { World } from './world';

/** Seconds a fallen rookie's corpse stays before it is removed. */
const ROOKIE_CORPSE_TIME = 1.4;

/** Removes rookie corpses once their death animation has played. */
export function reapRookies(w: World) {
  for (let k = w.rookies.length - 1; k >= 0; k--) {
    const r = w.rookies[k];
    if (r.state === 'dead' && r.stateTime > ROOKIE_CORPSE_TIME) {
      w.rookies.splice(k, 1);
      w.pathers.delete(r.id);
    }
  }
}

export function updateRecruitment(w: World) {
  if (w.noRookies) return;
  w.recruitIn = Math.max(0, w.recruitIn - DT);
  let alive = 0;
  for (const r of w.rookies) if (r.state !== 'dead') alive++;
  if (alive >= w.rookieCap || w.recruitIn > 0) return;
  // A new recruit when the next kill threshold is reached; replacements for fallen rookies
  // (recruited but no longer alive) once the respawn delay has passed.
  const next = w.nextRookieAt();
  const owed = w.recruited - alive;
  if (owed <= 0 && (next === null || w.kills < next)) return;
  // Rookies step out of a barracks when there is one (decision 29), else any standing building.
  const barracks = w.standingRoles('barracks');
  const standing = barracks.length ? barracks : w.buildings.filter((b) => !b.ruined);
  if (!standing.length) return;
  const home = standing[Math.floor(w.rng.frac() * standing.length)];
  const door = doorOf(w, home);
  if (!door) return;
  if (owed <= 0) w.recruited++;
  const order = ARMY.order;
  const kind = order[(w.recruited - 1 + Math.max(0, owed - 1)) % order.length];
  const r = makeRookie(w, kind, door[0], door[1]);
  w.rookies.push(r);
  w.recruitIn = owed > 0 ? ARMY.respawnDelay : 0;
  w.events.push({ type: 'rookieJoined', unit: r.id, kind, building: home.id });
}

/** 4-neighbour offsets for finding a door cell. */
const NEIGHBOURS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

/** A walkable cell next to the building (where a rookie steps out). */
function doorOf(w: World, b: BuildingState): [number, number] | null {
  for (const [i, j] of b.cells) {
    for (const [di, dj] of NEIGHBOURS) {
      if (isWalkable(w.map, i + di, j + dj)) return [i + di, j + dj];
    }
  }
  return null;
}

function pather(w: World, u: Unit): Pather {
  let p = w.pathers.get(u.id);
  if (!p) {
    p = new Pather(w.map);
    w.pathers.set(u.id, p);
  }
  return p;
}

/** Rookies defend buildings first, then hunt nearby monsters, then return to their post. */
export function updateRookie(w: World, r: Unit) {
  tickTimers(r);
  if (r.state === 'dead') return;
  const def = ROOKIES[r.kind as RookieKind];
  r.moving = false;
  if (r.stun > 0) {
    if (r.state !== 'idle') setState(r, 'idle');
    return;
  }

  if (r.state === 'attack') {
    const target = monsterById(w, r.targetId);
    if (target && target.state !== 'dead') r.facing = norm({ x: target.x - r.x, y: target.y - r.y });
    if (r.hitPending && r.stateTime >= def.attackHitTime) {
      r.hitPending = false;
      if (def.keepAway > 0) {
        if (target && target.state !== 'dead') shoot(w, r.x, r.y, target, rookieDamage(w, r), def.projectileSpeed, r.id);
      } else {
        swingHits(w, r, def.range, KNIGHT.attackArc, rookieDamage(w, r), KNIGHT.knockback * 0.6);
      }
    }
    if (r.stateTime >= def.attackDuration) setState(r, 'idle');
    return;
  }

  const knight = w.players.find((p) => p.state !== 'dead');
  // Rally: regroup on the knight, only fighting once there.
  if (w.rallyTime > 0 && knight) {
    const d = Math.hypot(knight.x - r.x, knight.y - r.y);
    if (d > RALLY.closeEnough) {
      r.targetId = -1;
      moveRookie(w, r, knight.x, knight.y, def.speed * 1.25);
      return;
    }
    r.postX = knight.x;
    r.postY = knight.y;
  }

  r.retargetIn -= DT;
  let target = monsterById(w, r.targetId);
  if (!target || target.state === 'dead' || r.retargetIn <= 0) {
    target = pickRookieTarget(w, r);
    r.targetId = target ? target.id : -1;
    r.retargetIn = ARMY.retargetEvery;
  }

  if (!target) {
    // Home building gone? Follow the knight instead.
    if (knight && !w.hasStandingBuilding()) {
      r.postX = knight.x;
      r.postY = knight.y;
    }
    if (Math.hypot(r.postX - r.x, r.postY - r.y) > 0.6) moveRookie(w, r, r.postX, r.postY, def.speed);
    else setState(r, 'idle', true);
    return;
  }

  const dx = target.x - r.x;
  const dy = target.y - r.y;
  const d = Math.hypot(dx, dy);
  if (def.keepAway > 0) {
    // Archer: back off when crowded, otherwise shoot from range.
    if (d < def.keepAway) {
      const away = norm({ x: -dx, y: -dy });
      moveRookie(w, r, r.x + away.x, r.y + away.y, def.speed);
      return;
    }
    if (d <= def.range && clearLine(w.map, r.x, r.y, target.x, target.y, 0.05)) {
      r.facing = norm({ x: dx, y: dy });
      if (r.attackCooldown <= 0) startRookieAttack(r, def.attackCooldown);
      else setState(r, 'idle', true);
      return;
    }
    moveRookie(w, r, target.x, target.y, def.speed);
    return;
  }
  // Swordsman.
  if (d - target.radius - r.radius <= def.range * 0.8) {
    r.facing = norm({ x: dx, y: dy });
    if (r.attackCooldown <= 0) startRookieAttack(r, def.attackCooldown);
    else setState(r, 'idle', true);
    return;
  }
  moveRookie(w, r, target.x, target.y, def.speed);
}

function startRookieAttack(r: Unit, cooldown: number) {
  setState(r, 'attack');
  r.hitPending = true;
  r.attackCooldown = cooldown;
}

function moveRookie(w: World, r: Unit, tx: number, ty: number, speed: number) {
  const dir = pather(w, r).dirTo(r.x, r.y, tx, ty, r.radius, w.time);
  if (dir.x === 0 && dir.y === 0) {
    setState(r, 'idle', true);
    return;
  }
  r.x += dir.x * speed * DT;
  r.y += dir.y * speed * DT;
  r.facing = dir;
  r.moving = true;
  setState(r, 'walk', true);
}

/** Building attackers within defendRange first (nearest to the rookie), else nearest monster in huntRange. */
function pickRookieTarget(w: World, r: Unit): Unit | null {
  let best: Unit | null = null;
  let bestD = ARMY.defendRange;
  for (const m of w.monsters) {
    // Building attackers idle between swings; they stay targets until they walk off or the building falls.
    const wrecking = m.attackBuilding >= 0 && m.state !== 'walk' && !w.buildings[m.attackBuilding].ruined;
    if (m.state === 'dead' || !wrecking) continue;
    const d = Math.hypot(m.x - r.x, m.y - r.y);
    if (d < bestD) {
      bestD = d;
      best = m;
    }
  }
  if (best) return best;
  // A boss on the field is worth walking further for (play-test note: rookies ignored a distant boss).
  const boss = w.boss;
  if (boss && Math.hypot(boss.x - r.x, boss.y - r.y) <= ARMY.bossRange) return boss;
  return nearestMonster(w, r.x, r.y, ARMY.huntRange);
}
