// Monsters: choosing a target by archetype, attacking, and steering along flow fields.

import { DT } from '../data/balance';
import { MONSTERS, type MonsterDef, type MonsterKind } from '../data/monsters';
import { tickBossTimers, updateBoss } from './boss';
import { damageBuilding, damageUnit, hurtFriendliesInRadius, hurtFriendly, stunFriendliesInRadius } from './combat';
import type { FlowField } from './flowField';
import { isWalkable } from './map';
import type { Unit } from './model';
import { adjacentBuilding, friendlyById, nearestBuildingCell, nearestFriendly, nearestOf, nearestStandingCell } from './queries';
import type { Vec2 } from './types';
import { centreOf, norm, setState, tickTimers } from './units';
import { leadPoint } from './projectiles';
import { addMonster } from './waves';
import type { World } from './world';

export function updateMonster(w: World, m: Unit) {
  tickTimers(m);
  if (m.state === 'dead') return;
  const def = MONSTERS[m.kind as MonsterKind];
  m.moving = false;

  if (def.raise) raiseDead(w, m, def);
  if (m.boss) tickBossTimers(w, m, m.boss);
  if (def.explodes && m.abilityIn > 0) {
    burnFuse(w, m, def);
    return;
  }
  if (m.state === 'attack') {
    continueAttack(w, m, def);
    return;
  }
  // Boss abilities take over the unit while they run.
  if (m.boss && updateBoss(w, m, m.boss)) {
    setState(m, m.moving ? 'walk' : 'idle', true);
    return;
  }

  if (m.burrowed) {
    tunnel(w, m, def);
    return;
  }
  if (def.wail && wail(w, m, def)) return;
  if (def.flee && fleeKnight(w, m, def)) return;
  if (def.ranged && rangedAttack(w, m, def)) return;

  // Choose a target by archetype (plan section 3.3).
  const hasBuildings = w.hasStandingBuilding();
  let friend: Unit | null;
  let chase: boolean;
  if (def.target === 'knight') {
    friend = nearestOf(w.players, m.x, m.y);
    chase = !!friend;
  } else if (def.target === 'rookies') {
    friend = nearestOf(w.rookies, m.x, m.y) ?? nearestOf(w.players, m.x, m.y);
    chase = !!friend;
  } else {
    friend = nearestFriendly(w, m.x, m.y);
    chase = !!friend && (!hasBuildings || (def.target === 'nearest' && Math.hypot(friend.x - m.x, friend.y - m.y) <= def.aggroRange));
  }

  if (chase && friend) {
    const dx = friend.x - m.x;
    const dy = friend.y - m.y;
    const d = Math.hypot(dx, dy);
    const reach = m.radius + friend.radius + def.attackReach;
    if (d <= reach) {
      if (m.attackCooldown <= 0) startAttack(m, def, { x: dx, y: dy }, -1, friend.id);
      else setState(m, 'idle', true);
      return;
    }
    // Lunge: a short sprint at a close target.
    if (def.lunge) {
      tickBurst(m, def.lunge, d, def.lunge.cooldown);
    }
    // The knight field only leads to the knight; rookies are always close, so go straight.
    const useField = !def.phasing && friend.kind === 'knight' && d > 1.5;
    steer(w, m, useField ? w.knightFlow : null, dx, dy, m.burstTime > 0 && def.lunge ? def.lunge.speedMul : 1);
    return;
  }

  // Big wreckers swat anyone standing in their way before carrying on to the buildings.
  if (def.swatsBlockers && m.attackCooldown <= 0) {
    const blocker = nearestFriendly(w, m.x, m.y);
    if (blocker) {
      const bx = blocker.x - m.x;
      const by = blocker.y - m.y;
      if (Math.hypot(bx, by) <= m.radius + blocker.radius + def.attackReach) {
        startAttack(m, def, { x: bx, y: by }, -1, blocker.id);
        return;
      }
    }
  }

  // Necromancers hold back from the town.
  if (def.standoff !== undefined) {
    const cell = nearestStandingCell(w, m.x, m.y);
    if (cell && Math.hypot(cell[0] - m.x, cell[1] - m.y) <= def.standoff) {
      setState(m, 'idle', true);
      return;
    }
  }

  // Building attack: any standing building cell within reach?
  const b = adjacentBuilding(w, m, def.attackReach);
  if (b && def.explodes) {
    m.abilityIn = def.explodes.fuse;
    m.facing = norm({ x: b.dx, y: b.dy });
    setState(m, 'idle');
    w.events.push({ type: 'fuseLit', unit: m.id, x: m.x, y: m.y, radius: def.explodes.radius, time: def.explodes.fuse });
    return;
  }
  if (b) {
    if (m.attackCooldown <= 0) startAttack(m, def, { x: b.dx, y: b.dy }, b.id, -1);
    else setState(m, 'idle', true);
    return;
  }
  if (!hasBuildings) {
    setState(m, 'idle', true);
    return;
  }
  // The field ends on cells next to buildings; from there close the last gap directly,
  // since a cell centre is 0.5 from the building edge, beyond most monsters' reach.
  m.attackBuilding = -1;
  if (def.phasing) {
    // Ghosts drift straight through anything toward the nearest standing building.
    const cell = nearestStandingCell(w, m.x, m.y);
    steer(w, m, null, cell ? cell[0] - m.x : 0, cell ? cell[1] - m.y : 0);
    return;
  }
  const near = nearestBuildingCell(w, m);
  // Waders path through the river on their own field.
  steer(w, m, def.wades ? w.wadeFlow : w.buildingFlow, near ? near[0] - m.x : 0, near ? near[1] - m.y : 0);
}

function startAttack(m: Unit, def: MonsterDef, dir: Vec2, building: number, target: number) {
  setState(m, 'attack');
  m.hitPending = true;
  m.attackCooldown = def.attackCooldown;
  m.attackBuilding = building;
  m.targetId = target;
  m.facing = norm(dir);
}

function continueAttack(w: World, m: Unit, def: MonsterDef) {
  if (def.ranged) {
    if (m.hitPending && m.stateTime >= def.attackWindup) {
      m.hitPending = false;
      loose(w, m, def);
    }
  } else if (m.attackBuilding >= 0) {
    const b = w.buildings[m.attackBuilding];
    if (m.hitPending && m.stateTime >= def.attackWindup) {
      m.hitPending = false;
      if (!b.ruined) {
        damageBuilding(w, b, def.buildingDamage, m);
        const thorns = w.progression.mods.town.thorns;
        if (thorns > 0) damageUnit(w, m, thorns, -1);
      }
    }
  } else {
    const target = friendlyById(w, m.targetId) ?? nearestFriendly(w, m.x, m.y);
    if (target && target.state !== 'dead') {
      const dx = target.x - m.x;
      const dy = target.y - m.y;
      m.facing = norm({ x: dx, y: dy });
      if (m.hitPending && m.stateTime >= def.attackWindup) {
        m.hitPending = false;
        const reach = m.radius + target.radius + def.attackReach;
        if (Math.hypot(dx, dy) <= reach + 0.1) {
          const dealt = hurtFriendly(w, target, def.damage);
          if (def.lifesteal && dealt > 0) m.hp = Math.min(m.maxHp, m.hp + dealt * def.lifesteal);
        }
      }
    }
  }
  if (m.stateTime >= def.attackWindup + 0.25) setState(m, 'idle');
}

/**
 * Ranged monsters: shoot the nearest friendly in range, else the nearest building in range.
 * Returns true when it took a shot (or is waiting to); false to walk on toward the town.
 */
function rangedAttack(w: World, m: Unit, def: MonsterDef): boolean {
  const range = def.ranged!.range;
  const inRange = (x: number, y: number) => Math.hypot(x - m.x, y - m.y) <= range;
  let aim: { x: number; y: number; building: number; target: number } | null = null;
  const f = nearestFriendly(w, m.x, m.y);
  if (f && inRange(f.x, f.y)) aim = { x: f.x, y: f.y, building: -1, target: f.id };
  else {
    const cell = nearestStandingCell(w, m.x, m.y);
    if (cell && inRange(cell[0], cell[1])) aim = { x: cell[0], y: cell[1], building: w.buildingAt(cell[0], cell[1])!.id, target: -1 };
  }
  if (!aim) return false;
  if (m.attackCooldown <= 0) startAttack(m, def, { x: aim.x - m.x, y: aim.y - m.y }, aim.building, aim.target);
  else setState(m, 'idle', true);
  return true;
}

/** Releases a lobbed arrow at the attack's target: it lands where a unit was heading, or on the building. */
function loose(w: World, m: Unit, def: MonsterDef) {
  const speed = def.ranged!.projectileSpeed;
  let tx: number;
  let ty: number;
  let damage: number;
  if (m.attackBuilding >= 0) {
    const b = w.buildings[m.attackBuilding];
    if (b.ruined) return;
    [tx, ty] = centreOf(b.cells);
    damage = def.buildingDamage;
  } else {
    const t = friendlyById(w, m.targetId);
    if (!t || t.state === 'dead') return;
    [tx, ty] = leadPoint(m.x, m.y, t, speed);
    damage = def.damage;
  }
  const d = Math.hypot(tx - m.x, ty - m.y) || 1e-3;
  m.facing = norm({ x: tx - m.x, y: ty - m.y });
  const id = w.nextId++;
  w.projectiles.push({
    id, x: m.x, y: m.y, vx: ((tx - m.x) / d) * speed, vy: ((ty - m.y) / d) * speed, damage,
    ttl: d / speed, owner: m.id, kind: 'bolt', returning: false, travelled: 0, maxDist: 0, hitIds: [],
    building: m.attackBuilding,
  });
  w.events.push({ type: 'shot', projectile: id, from: m.id });
}

/**
 * Necromancer: when a knight closes in, sprints straight away from him for a while, then has to
 * recover; the knight is faster, so a determined chase still catches him.
 */
function fleeKnight(w: World, m: Unit, def: MonsterDef): boolean {
  const f = def.flee!;
  const k = nearestOf(w.players, m.x, m.y);
  if (!k) return false;
  tickBurst(m, f, Math.hypot(k.x - m.x, k.y - m.y), f.duration + f.cooldown);
  if (m.burstTime <= 0) return false;
  steer(w, m, null, m.x - k.x, m.y - k.y, f.speedMul);
  return true;
}

/** Ticks a sprint (lunge or flee): starts one when ready and `d` is within range, setting `cooldown` from its start. */
function tickBurst(m: Unit, burst: { range: number; duration: number }, d: number, cooldown: number) {
  m.burstCooldown = Math.max(0, m.burstCooldown - DT);
  m.burstTime = Math.max(0, m.burstTime - DT);
  if (m.burstTime <= 0 && m.burstCooldown <= 0 && d <= burst.range) {
    m.burstTime = burst.duration;
    m.burstCooldown = cooldown;
  }
}

/** Necromancer: raises monsters around itself on a timer, up to a cap of living raised. */
function raiseDead(w: World, m: Unit, def: MonsterDef) {
  const r = def.raise!;
  m.abilityIn -= DT;
  if (m.abilityIn > 0) return;
  m.abilityIn = r.every;
  const alive = w.monsters.filter((u) => u.raisedBy === m.id && u.state !== 'dead').length;
  const n = Math.min(r.count, r.maxAlive - alive);
  for (let k = 0; k < n; k++) {
    const a = w.rng.range(0, Math.PI * 2);
    let x = m.x + Math.cos(a) * r.radius;
    let y = m.y + Math.sin(a) * r.radius;
    if (!isWalkable(w.map, Math.round(x), Math.round(y))) {
      x = m.x;
      y = m.y;
    }
    const z = addMonster(w, x, y, r.kind);
    z.raisedBy = m.id;
    w.events.push({ type: 'monsterRaised', unit: z.id, by: m.id, x, y });
  }
}

/**
 * Banshee: when a friendly gets close and the wail is ready, stands still for the telegraph, then
 * hurts and stuns everyone in the circle. True while it is winding up (or just started to).
 */
function wail(w: World, m: Unit, def: MonsterDef): boolean {
  const wl = def.wail!;
  if (m.windup > 0) {
    m.windup -= DT;
    setState(m, 'idle', true);
    if (m.windup <= 0) {
      m.windup = 0;
      w.events.push({ type: 'wail', unit: m.id, x: m.x, y: m.y, radius: wl.radius });
      stunFriendliesInRadius(w, m.x, m.y, wl.radius, wl.damage, wl.stun);
    }
    return true;
  }
  m.abilityIn = Math.max(0, m.abilityIn - DT);
  if (m.abilityIn > 0) return false;
  const f = nearestFriendly(w, m.x, m.y);
  if (!f || Math.hypot(f.x - m.x, f.y - m.y) > wl.range) return false;
  m.windup = wl.telegraph;
  m.abilityIn = wl.every;
  setState(m, 'idle', true);
  w.events.push({ type: 'wailWarn', unit: m.id, x: m.x, y: m.y, radius: wl.radius, time: wl.telegraph });
  return true;
}

/** Gravedigger: tunnels straight to the nearest building, then surfaces for good beside it. */
function tunnel(w: World, m: Unit, def: MonsterDef) {
  const cell = nearestStandingCell(w, m.x, m.y);
  if (!cell) {
    setState(m, 'idle', true);
    return;
  }
  const dx = cell[0] - m.x;
  const dy = cell[1] - m.y;
  if (Math.hypot(dx, dy) <= def.burrows!.surfaceRange) {
    m.burrowed = false;
    setState(m, 'idle');
    w.events.push({ type: 'monsterSurfaced', unit: m.id, x: m.x, y: m.y });
    return;
  }
  steer(w, m, null, dx, dy, def.burrows!.speedMul);
}

/** Sapper: stands still while the fuse burns, then blows up (no reward: it did its job). */
function burnFuse(w: World, m: Unit, def: MonsterDef) {
  const ex = def.explodes!;
  m.abilityIn -= DT;
  setState(m, 'idle', true);
  if (m.abilityIn > 0) return;
  w.events.push({ type: 'explosion', unit: m.id, x: m.x, y: m.y, radius: ex.radius });
  for (const b of w.buildings) {
    if (b.ruined) continue;
    if (b.cells.some(([i, j]) => Math.hypot(i - m.x, j - m.y) <= ex.radius + 0.5)) damageBuilding(w, b, ex.buildingDamage, m);
  }
  hurtFriendliesInRadius(w, m.x, m.y, ex.radius, ex.unitDamage);
  m.hp = 0;
  setState(m, 'dead');
  w.events.push({ type: 'death', unit: m.id });
}

/** Moves along a flow field (or straight along (dx, dy) when field is null or exhausted). */
function steer(w: World, m: Unit, field: FlowField | null, dx: number, dy: number, speedMul = 1) {
  let sx = dx;
  let sy = dy;
  if (field) {
    const next = field.next(Math.round(m.x), Math.round(m.y));
    if (next) {
      sx = next[0] - m.x;
      sy = next[1] - m.y;
    }
  }
  if (Math.abs(sx) < 1e-6 && Math.abs(sy) < 1e-6) {
    setState(m, 'idle', true);
    return;
  }
  // Tar pits: slowed next to buildings.
  const slow = w.progression.mods.town.slow;
  const trapSlow = m.slowIn > 0 ? 1 - m.slowBy : 1;
  const speed = m.speed * (slow > 0 && adjacentBuilding(w, m, 0.6) ? 1 - slow : 1) * trapSlow * speedMul;
  const dir = norm({ x: sx, y: sy });
  m.x += dir.x * speed * DT;
  m.y += dir.y * speed * DT;
  m.facing = dir;
  m.moving = true;
  setState(m, 'walk', true);
}

/** 4-neighbour offsets for flow-field sources. */
const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** Removes monster corpses once their death animation has played. */
export function reapMonsters(w: World) {
  for (let k = w.monsters.length - 1; k >= 0; k--) {
    const m = w.monsters[k];
    if (m.state === 'dead' && m.stateTime > MONSTERS[m.kind as MonsterKind].corpseTime) w.monsters.splice(k, 1);
  }
}

export function updateFlowFields(w: World) {
  const p = w.players.find((u) => u.state !== 'dead');
  if (p) {
    const ti = Math.round(p.x);
    const tj = Math.round(p.y);
    if (ti !== w.knightFlow.targetI || tj !== w.knightFlow.targetJ) w.knightFlow.compute(ti, tj);
  }
  // The wade field is only needed while a wader is alive (no cost in towns without one).
  if (w.wadeFlowDirty && w.monsters.some((m) => m.state !== 'dead' && MONSTERS[m.kind as MonsterKind].wades)) {
    w.wadeFlowDirty = false;
    w.wadeFlow.computeMulti(buildingSources(w));
  }
  if (w.buildingFlowDirty) {
    w.buildingFlowDirty = false;
    w.buildingFlow.computeMulti(buildingSources(w));
  }
}

/** Flow-field sources: walkable cells 4-adjacent to any standing building. */
function buildingSources(w: World): [number, number][] {
  const sources: [number, number][] = [];
  for (const b of w.buildings) {
    if (b.ruined) continue;
    for (const [i, j] of b.cells) {
      for (const [di, dj] of NEIGHBOURS) {
        if (isWalkable(w.map, i + di, j + dj)) sources.push([i + di, j + dj]);
      }
    }
  }
  return sources;
}
