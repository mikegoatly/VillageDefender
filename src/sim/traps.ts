// Traps (decision 52): the trap button sends a villager from the nearest standing building to where
// the knight was; they set a trap there, and the trap hurts monsters in its radius until its damage
// budget is spent. Flyers and burrowed monsters are out of reach, bosses take half, friendlies are never hurt.

import { DT } from '../data/balance';
import { MONSTERS, type MonsterKind } from '../data/monsters';
import { TRAP } from '../data/traps';
import { damageUnit } from './combat';
import type { Trap, TrapRunner, Unit } from './model';
import { norm, centreOf } from './units';
import type { InputState } from './types';
import type { World } from './world';

/** How many traps (set or being set) may be out at once. */
function trapCap(w: World): number {
  return TRAP.cap + w.progression.mods.trap.capAdd;
}

/** Seconds until the trap power is ready again. */
function trapCooldownTime(w: World): number {
  return TRAP.cooldown * w.progression.mods.trap.cooldownMul;
}

/** A monster that is alive and above ground. */
function exposed(m: Unit): boolean {
  return m.state !== 'dead' && !m.burrowed;
}

export function updateTraps(w: World, input: InputState | undefined) {
  w.trapCooldown = Math.max(0, w.trapCooldown - DT);
  const held = !!input?.ability1;
  if (held && !w.trapHeld) callTrap(w);
  w.trapHeld = held;
  for (let k = w.trapRunners.length - 1; k >= 0; k--) updateRunner(w, w.trapRunners[k], k);
  for (let k = w.traps.length - 1; k >= 0; k--) updateTrap(w, w.traps[k], k);
}

/** Starts a villager running to the first living knight's position. */
function callTrap(w: World) {
  if (!w.hasPower('trap') || w.trapCooldown > 0) return;
  const knight = w.players.find((p) => p.state !== 'dead');
  if (!knight) return;
  if (w.traps.length + w.trapRunners.length >= trapCap(w)) return;
  // The villager comes from the standing building nearest the knight.
  let home: [number, number] | null = null;
  let homeD = Infinity;
  for (const b of w.buildings) {
    if (b.ruined) continue;
    const c = centreOf(b.cells);
    const d = (c[0] - knight.x) ** 2 + (c[1] - knight.y) ** 2;
    if (d < homeD) { homeD = d; home = c; }
  }
  if (!home) return;
  const runner: TrapRunner = {
    id: w.nextId++, x: home[0], y: home[1], tx: knight.x, ty: knight.y, setLeft: null, setTotal: 0,
    facing: norm({ x: knight.x - home[0], y: knight.y - home[1] }),
  };
  w.trapRunners.push(runner);
  w.trapCooldown = trapCooldownTime(w);
  w.events.push({ type: 'trapCalled', runner: runner.id, x: runner.tx, y: runner.ty });
}

function updateRunner(w: World, r: TrapRunner, index: number) {
  if (caught(w, r)) {
    w.trapRunners.splice(index, 1);
    w.trapCooldown = 0; // the trap never got set: no cooldown to wait out
    w.events.push({ type: 'trapRunnerDown', runner: r.id, x: r.x, y: r.y });
    return;
  }
  if (r.setLeft === null) {
    const dx = r.tx - r.x;
    const dy = r.ty - r.y;
    const d = Math.hypot(dx, dy);
    const step = TRAP.runnerSpeed * DT;
    if (d > step) {
      r.facing = { x: dx / d, y: dy / d };
      r.x += r.facing.x * step;
      r.y += r.facing.y * step;
      return;
    }
    r.x = r.tx;
    r.y = r.ty;
    r.setTotal = r.setLeft = TRAP.setTime * w.progression.mods.trap.buildMul;
    return;
  }
  r.setLeft -= DT;
  if (r.setLeft > 0) return;
  w.trapRunners.splice(index, 1);
  const tm = w.progression.mods.trap;
  const budget = TRAP.budget * tm.budgetMul;
  const trap: Trap = {
    id: w.nextId++, x: r.tx, y: r.ty, radius: TRAP.radius * tm.radiusMul,
    budget, maxBudget: budget, pulseIn: TRAP.pulse, slow: tm.slow,
  };
  w.traps.push(trap);
  w.events.push({ type: 'trapSet', trap: trap.id, x: trap.x, y: trap.y, radius: trap.radius });
}

/** True when a monster has reached the villager. */
function caught(w: World, r: TrapRunner): boolean {
  let hit = false;
  w.enemyHash.query(r.x, r.y, 1.5, (m) => {
    if (hit || !exposed(m)) return;
    if (Math.hypot(m.x - r.x, m.y - r.y) <= m.radius + TRAP.catchReach) hit = true;
  });
  return hit;
}

function updateTrap(w: World, t: Trap, index: number) {
  t.pulseIn -= DT;
  if (t.pulseIn > 0) return;
  t.pulseIn += TRAP.pulse;
  let struck = false;
  w.enemyHash.query(t.x, t.y, t.radius + 0.8, (m) => {
    if (t.budget <= 0 || !exposed(m)) return;
    const def = MONSTERS[m.kind as MonsterKind];
    if (def.flying || Math.hypot(m.x - t.x, m.y - t.y) - m.radius > t.radius) return;
    const boss = !!def.boss;
    // The budget is spent on the full damage, so a boss soaks it up twice as fast as it loses health.
    const raw = Math.min(TRAP.dps * TRAP.pulse, t.budget);
    t.budget -= raw;
    if (t.slow > 0 && !boss) {
      m.slowBy = m.slowIn > 0 ? Math.max(m.slowBy, t.slow) : t.slow;
      m.slowIn = TRAP.pulse + TRAP.slowLinger;
    }
    damageUnit(w, m, boss ? raw * TRAP.bossMul : raw, -1, true);
    struck = true;
  });
  if (struck) w.events.push({ type: 'trapPulse', trap: t.id, x: t.x, y: t.y, radius: t.radius });
  if (t.budget <= 0) {
    w.traps.splice(index, 1);
    w.events.push({ type: 'trapSpent', trap: t.id, x: t.x, y: t.y, radius: t.radius });
  }
}
