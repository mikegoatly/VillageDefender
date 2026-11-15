// Monsters: choosing a target by archetype, attacking, and steering along flow fields.

import { DT } from '../data/balance';
import { MONSTERS, type MonsterDef, type MonsterKind } from '../data/monsters';
import { updateBoss } from './boss';
import { damageBuilding, damageUnit, hurtFriendly } from './combat';
import type { FlowField } from './flowField';
import { isWalkable } from './map';
import type { Unit } from './model';
import { adjacentBuilding, friendlyById, nearestBuildingCell, nearestFriendly, nearestOf, nearestStandingCell } from './queries';
import type { Vec2 } from './types';
import { norm, setState, tickTimers } from './units';
import type { World } from './world';

export function updateMonster(w: World, m: Unit) {
  tickTimers(m);
  if (m.state === 'dead') return;
  const def = MONSTERS[m.kind as MonsterKind];
  m.moving = false;

  if (m.state === 'attack') {
    continueAttack(w, m, def);
    return;
  }
  // Boss abilities take over the unit while they run.
  if (m.boss && updateBoss(w, m, m.boss)) {
    setState(m, m.moving ? 'walk' : 'idle', true);
    return;
  }

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
      m.lungeCooldown = Math.max(0, m.lungeCooldown - DT);
      m.lungeTime = Math.max(0, m.lungeTime - DT);
      if (m.lungeCooldown <= 0 && d <= def.lunge.range) {
        m.lungeTime = def.lunge.duration;
        m.lungeCooldown = def.lunge.cooldown;
      }
    }
    // The knight field only leads to the knight; rookies are always close, so go straight.
    const useField = !def.phasing && friend.kind === 'knight' && d > 1.5;
    steer(w, m, useField ? w.knightFlow : null, dx, dy, m.lungeTime > 0 && def.lunge ? def.lunge.speedMul : 1);
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

  // Building attack: any standing building cell within reach?
  const b = adjacentBuilding(w, m, def.attackReach);
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
  if (m.attackBuilding >= 0) {
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
  const speed = m.speed * (slow > 0 && adjacentBuilding(w, m, 0.6) ? 1 - slow : 1) * speedMul;
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
