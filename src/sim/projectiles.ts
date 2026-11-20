// Arrows and thrown axes: firing them and moving them each tick.

import { DT } from '../data/balance';
import type { WeaponDef } from '../data/weapons';
import { damageBuilding, damageUnit, hurtFriendly } from './combat';
import { isWalkable } from './map';
import type { Projectile, Unit } from './model';
import { isProp } from './queries';
import { norm } from './units';
import type { World } from './world';

/** Where a moving target will be when a shot of `speed` fired from (x, y) arrives. */
export function leadPoint(x: number, y: number, target: Unit, speed: number): [number, number] {
  if (!target.moving) return [target.x, target.y];
  const lead = Math.hypot(target.x - x, target.y - y) / speed;
  return [target.x + target.facing.x * target.speed * lead, target.y + target.facing.y * target.speed * lead];
}

/** Fires an arrow at a monster, leading it slightly. */
export function shoot(w: World, x: number, y: number, target: Unit, damage: number, speed: number, owner: number) {
  const d = Math.hypot(target.x - x, target.y - y);
  const [tx, ty] = leadPoint(x, y, target, speed);
  const dir = norm({ x: tx - x, y: ty - y });
  const p: Projectile = { id: w.nextId++, x, y, vx: dir.x * speed, vy: dir.y * speed, damage, ttl: 1.2 * (d / speed) + 0.3, owner,
    kind: 'arrow', returning: false, travelled: 0, maxDist: 0, hitIds: [] };
  w.projectiles.push(p);
  w.events.push({ type: 'shot', projectile: p.id, from: owner });
}

export function throwAxe(w: World, u: Unit, wd: WeaponDef, damage: number) {
  const km = w.progression.mods.knight;
  const p: Projectile = {
    id: w.nextId++, x: u.x, y: u.y, vx: u.facing.x * wd.projectileSpeed, vy: u.facing.y * wd.projectileSpeed,
    damage, ttl: 6, owner: u.id, kind: 'axe', returning: false, travelled: 0, maxDist: wd.range * km.rangeMul, hitIds: [],
  };
  w.projectiles.push(p);
  w.events.push({ type: 'axeThrow', projectile: p.id });
}

export function updateProjectiles(w: World) {
  for (let k = w.projectiles.length - 1; k >= 0; k--) {
    const p = w.projectiles[k];
    if (p.kind === 'axe') {
      if (updateAxe(w, p)) w.projectiles.splice(k, 1);
      continue;
    }
    if (p.kind === 'bolt') {
      if (updateBolt(w, p)) w.projectiles.splice(k, 1);
      continue;
    }
    p.x += p.vx * DT;
    p.y += p.vy * DT;
    p.ttl -= DT;
    if (p.owner >= 0 && !isWalkable(w.map, Math.round(p.x), Math.round(p.y))) {
      w.projectiles.splice(k, 1);
      continue;
    }
    let hit: Unit | null = null;
    w.enemyHash.query(p.x, p.y, 0.6, (m) => {
      if (hit || m.state === 'dead' || isProp(m)) return;
      if (Math.hypot(m.x - p.x, m.y - p.y) <= m.radius + 0.12) hit = m;
    });
    if (hit) damageUnit(w, hit, p.damage, p.owner);
    if (hit || p.ttl <= 0) w.projectiles.splice(k, 1);
  }
}

/**
 * A monster's lobbed arrow: flies over anything to its landing point, then hits the building it
 * was aimed at, or the first friendly standing there. Returns true when it has landed.
 */
function updateBolt(w: World, p: Projectile): boolean {
  // The last step is shortened so the bolt lands exactly on its target point.
  const dt = Math.min(DT, p.ttl);
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.ttl -= dt;
  if (p.ttl > 1e-9) return false;
  const b = w.buildings[p.building ?? -1];
  if (b) {
    if (!b.ruined) damageBuilding(w, b, p.damage, { id: p.owner });
    return true;
  }
  const f = [...w.players, ...w.rookies].find((u) => u.state !== 'dead' && Math.hypot(u.x - p.x, u.y - p.y) <= u.radius + 0.3);
  if (f) hurtFriendly(w, f, p.damage);
  return true;
}

/** Moves a thrown axe out and back; returns true when it should be removed. */
function updateAxe(w: World, p: Projectile): boolean {
  const speed = Math.hypot(p.vx, p.vy);
  const owner = w.players.find((pl) => pl.id === p.owner && pl.state !== 'dead');
  p.ttl -= DT;
  if (p.ttl <= 0 || !owner) return true;
  if (!p.returning) {
    p.travelled += speed * DT;
    if (p.travelled >= p.maxDist) {
      p.returning = true;
      p.hitIds = [];
    }
  } else {
    const dx = owner.x - p.x;
    const dy = owner.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.45) return true;
    p.vx = (dx / d) * speed;
    p.vy = (dy / d) * speed;
  }
  p.x += p.vx * DT;
  p.y += p.vy * DT;
  w.enemyHash.query(p.x, p.y, 0.8, (m) => {
    if (m.state === 'dead' || isProp(m) || p.hitIds.includes(m.id)) return;
    if (Math.hypot(m.x - p.x, m.y - p.y) > m.radius + 0.3) return;
    p.hitIds.push(m.id);
    damageUnit(w, m, p.damage, p.owner);
  });
  return false;
}
