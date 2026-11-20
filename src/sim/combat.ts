// Damage and death: hits on monsters, buildings, the knight and rookies, plus the area and arc swings that deliver them.

import { KNIGHT } from '../data/balance';
import { MONSTERS, type MonsterKind } from '../data/monsters';
import { ARMY } from '../data/rookies';
import type { BuildingState, Unit } from './model';
import { friendlyById } from './queries';
import { addMonster } from './waves';
import { applyRookieStats } from './rookieStats';
import { setState } from './units';
import type { World } from './world';

/** Armour covers everything within about 80° of the way a plated monster faces. */
const ARMOR_FRONT_COS = 0.17;

/**
 * Damages a monster; `by` is the attacking unit id (-1 for buildings/thorns). Plated monsters
 * (bone knights) take reduced damage from a friendly standing in front of them, unless `ignoreArmor`.
 */
export function damageUnit(w: World, u: Unit, amount: number, by: number, ignoreArmor = false) {
  const own = u.team === 'enemy' ? MONSTERS[u.kind as MonsterKind] : undefined;
  if (own?.inert) {
    // A planted keg remembers who kicked it last, so its blast is credited to them.
    if (by >= 0) u.targetId = by;
    return;
  }
  if (own && wardedBy(w, u)) amount *= 1 - MONSTERS[wardedBy(w, u)!.kind as MonsterKind].ward!.reduction;
  const armor = own && !ignoreArmor ? own.armor : undefined;
  if (armor) {
    const attacker = friendlyById(w, by);
    if (attacker) {
      const dx = attacker.x - u.x;
      const dy = attacker.y - u.y;
      const d = Math.hypot(dx, dy) || 1;
      if ((dx * u.facing.x + dy * u.facing.y) / d > ARMOR_FRONT_COS) amount *= 1 - armor.front;
    }
  }
  u.hp -= amount;
  w.events.push({ type: 'hit', unit: u.id, by, damage: amount, x: u.x, y: u.y });
  if (u.hp <= 0) {
    u.hp = 0;
    setState(u, 'dead');
    w.events.push({ type: 'death', unit: u.id });
    if (u.team === 'enemy') {
      const def = MONSTERS[u.kind as MonsterKind];
      w.kills++;
      w.killsByKind[u.kind] = (w.killsByKind[u.kind] ?? 0) + 1;
      // Raised monsters are free for the necromancer, so they pay nothing (no farming).
      if (u.raisedBy === undefined) {
        w.coins += def.coins;
        w.gems.push({ id: w.nextId++, x: u.x, y: u.y, value: def.xp, magnet: false, speed: 0 });
      }
      const killer = w.rookies.find((r) => r.id === by);
      if (killer) creditRookieKill(w, killer);
      if (def.splits) shatter(w, u, def.splits.kind, def.splits.count);
      // A sapper's keg goes off among the monsters when it is killed.
      if (def.explodes) {
        w.events.push({ type: 'explosion', unit: u.id, x: u.x, y: u.y, radius: def.explodes.radius });
        areaHits(w, by, u.x, u.y, def.explodes.radius, def.explodes.deathDamage, def.explodes.deathKnockback);
      }
    }
  }
}

/** The shieldbearer (other than `u` itself) whose ward covers `u`, if any. Wards don't stack. */
export function wardedBy(w: World, u: Unit): Unit | null {
  for (const s of w.wards) {
    if (s === u || s.state === 'dead') continue;
    if (Math.hypot(s.x - u.x, s.y - u.y) <= MONSTERS[s.kind as MonsterKind].ward!.radius) return s;
  }
  return null;
}

/** Ice golem (and shard) death: breaks into smaller pieces that burst outward. */
function shatter(w: World, u: Unit, kind: MonsterKind, count: number) {
  for (let k = 0; k < count; k++) {
    const a = w.rng.range(0, Math.PI * 2);
    const piece = addMonster(w, u.x + Math.cos(a) * 0.2, u.y + Math.sin(a) * 0.2, kind);
    piece.vx = Math.cos(a) * 3;
    piece.vy = Math.sin(a) * 3;
    if (u.raisedBy !== undefined) piece.raisedBy = u.raisedBy;
    w.events.push({ type: 'monsterSplit', unit: piece.id, from: u.id, x: piece.x, y: piece.y });
  }
}

function creditRookieKill(w: World, r: Unit) {
  r.unitKills++;
  const next = r.rank + 1;
  if (next < ARMY.rankKills.length && r.unitKills >= ARMY.rankKills[next]) {
    r.rank = next;
    applyRookieStats(w, r);
    r.hp = r.maxHp;
    w.events.push({ type: 'rookiePromoted', unit: r.id, rank: next });
  }
}

export function damageBuilding(w: World, b: BuildingState, amount: number, by: Pick<Unit, 'id'>) {
  b.hp = Math.max(0, b.hp - amount);
  b.lastHit = w.time;
  w.events.push({ type: 'buildingHit', building: b.id, by: by.id, damage: amount });
  if (b.hp <= 0 && !b.ruined) {
    b.ruined = true;
    w.buildingFlowDirty = true;
    w.wadeFlowDirty = true;
    w.light.markDirty();
    w.events.push({ type: 'buildingDestroyed', building: b.id });
  }
}

/** Damages the knight or a rookie. Returns the damage actually dealt. */
export function hurtFriendly(w: World, p: Unit, amount: number): number {
  if (p.invuln > 0 || p.state === 'dead') return 0;
  const isKnight = p.kind === 'knight';
  if (isKnight && w.god) return 0;
  p.hp -= amount;
  p.invuln = isKnight ? KNIGHT.hurtInvuln : 0.15;
  if (isKnight) w.events.push({ type: 'playerHurt', unit: p.id, damage: amount });
  else w.events.push({ type: 'hit', unit: p.id, by: -1, damage: amount, x: p.x, y: p.y });
  if (p.hp <= 0) {
    p.hp = 0;
    setState(p, 'dead');
    if (isKnight) w.events.push({ type: 'playerDied', unit: p.id });
    else {
      w.events.push({ type: 'death', unit: p.id });
      w.recruitIn = Math.max(w.recruitIn, ARMY.respawnDelay);
    }
  }
  return amount;
}

/** Hurts every living knight and rookie whose body overlaps a circle (blasts, boulders). */
export function hurtFriendliesInRadius(w: World, cx: number, cy: number, radius: number, damage: number) {
  for (const list of [w.players, w.rookies]) {
    for (const f of list) {
      if (f.state === 'dead' || Math.hypot(f.x - cx, f.y - cy) > radius + f.radius) continue;
      hurtFriendly(w, f, damage);
    }
  }
}

/** Hurts and stuns every living knight and rookie whose body overlaps a circle; only those actually hurt (not dodging) are stunned. */
export function stunFriendliesInRadius(w: World, cx: number, cy: number, radius: number, damage: number, stun: number) {
  for (const list of [w.players, w.rookies]) {
    for (const f of list) {
      if (f.state === 'dead' || Math.hypot(f.x - cx, f.y - cy) > radius + f.radius) continue;
      if (hurtFriendly(w, f, damage) > 0) f.stun = Math.max(f.stun, stun);
    }
  }
}

/** Melee swing: hits every enemy within reach inside the facing arc. */
export function swingHits(w: World, u: Unit, reach: number, arc: number, damage: number, knockback: number) {
  const cosArc = Math.cos(arc);
  w.enemyHash.query(u.x, u.y, reach + 0.5, (m) => {
    if (m.state === 'dead' || m.team === u.team) return;
    const dx = m.x - u.x;
    const dy = m.y - u.y;
    const d = Math.hypot(dx, dy);
    if (d - m.radius > reach) return;
    // Inside the arc (or overlapping the attacker, which always counts).
    if (d > u.radius + m.radius && (dx * u.facing.x + dy * u.facing.y) / d < cosArc) return;
    damageUnit(w, m, damage, u.id);
    knock(m, dx, dy, d, knockback);
  });
}

/** Hits every enemy whose body overlaps a circle; knocks them away from its centre. */
export function areaHits(w: World, owner: number, cx: number, cy: number, radius: number, damage: number, knockback: number) {
  w.enemyHash.query(cx, cy, radius + 0.6, (m) => {
    if (m.state === 'dead') return;
    const dx = m.x - cx;
    const dy = m.y - cy;
    const d = Math.hypot(dx, dy);
    if (d - m.radius > radius) return;
    damageUnit(w, m, damage, owner, true); // slams and spins go over the plate
    knock(m, dx, dy, d, knockback);
  });
}

/** Knocks a monster back by its own resistance (and kick multiplier: kegs fly). */
function knock(m: Unit, dx: number, dy: number, d: number, knockback: number) {
  const def = MONSTERS[m.kind as MonsterKind];
  applyKnockback(m, dx, dy, d, knockback * (def.kick ?? 1), def.knockbackResist);
}

/** Pushes a unit away along (dx, dy), scaled by its knockback resistance. */
export function applyKnockback(m: Unit, dx: number, dy: number, d: number, knockback: number, resist: number) {
  const k = d > 1e-4 ? (knockback * (1 - resist)) / d : 0;
  m.vx += dx * k;
  m.vy += dy * k;
}
