// Small helpers shared by every system: unit state changes, timers and vector maths.

import { DT } from '../data/balance';
import type { Unit, UnitState } from './model';
import type { Vec2 } from './types';

/** Advances per-unit timers by one tick. */
export function tickTimers(u: Unit) {
  u.stateTime += DT;
  u.attackCooldown = Math.max(0, u.attackCooldown - DT);
  u.dodgeCooldown = Math.max(0, u.dodgeCooldown - DT);
  u.invuln = Math.max(0, u.invuln - DT);
  u.stun = Math.max(0, u.stun - DT);
  u.slowIn = Math.max(0, u.slowIn - DT);
}

/** Changes state and resets stateTime; `keepTime` leaves the timer if the state is unchanged. Dead is final. */
export function setState(u: Unit, s: UnitState, keepTime = false) {
  if (u.state === s && keepTime) return;
  if (u.state === 'dead') return;
  u.state = s;
  u.stateTime = 0;
}

/** Fields every new unit starts with; callers add kind, team, radius, hp and speed. */
export function unitBase(id: number, x: number, y: number) {
  return {
    id, x, y, vx: 0, vy: 0,
    facing: { x: 0.7071, y: 0.7071 }, state: 'idle' as UnitState, stateTime: 0,
    attackCooldown: 0, hitPending: false, attackBuilding: -1,
    invuln: 0, dodgeCooldown: 0, dodgeHeld: false, moving: false,
    rank: 0, unitKills: 0, targetId: -1, retargetIn: 0, postX: x, postY: y, burstTime: 0, burstCooldown: 0,
    abilityIn: 0, stun: 0, windup: 0, burrowed: false, slowIn: 0, slowBy: 0,
  };
}

/** Unit vector, or the default south-east facing for a zero vector. */
export function norm(v: Vec2): Vec2 {
  const l = Math.hypot(v.x, v.y);
  return l > 1e-6 ? { x: v.x / l, y: v.y / l } : { x: 0.7071, y: 0.7071 };
}

export function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}

/** Mean cell position of a building footprint. */
export function centreOf(cells: [number, number][]): [number, number] {
  let x = 0;
  let y = 0;
  for (const [i, j] of cells) {
    x += i;
    y += j;
  }
  return [x / cells.length, y / cells.length];
}
