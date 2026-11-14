// Simple scripted players for play-test style tests. A bot is (world) => InputState, called once per tick.

import { DT } from '../../src/data/balance';
import { FlowField } from '../../src/sim/flowField';
import { groundDirToScreen } from '../../src/sim/iso';
import { isWalkable } from '../../src/sim/map';
import { emptyInput, type InputState } from '../../src/sim/types';
import { World, type Unit } from '../../src/sim/world';

export type Bot = (world: World) => InputState;

/** Converts a desired ground direction to a unit-length screen-space move. */
export function groundToScreenMove(gx: number, gy: number): { x: number; y: number } {
  const s = groundDirToScreen(gx, gy);
  const l = Math.hypot(s.x, s.y);
  return l < 1e-9 ? { x: 0, y: 0 } : { x: s.x / l, y: s.y / l };
}

/** True when the straight segment (plus +-0.25 perpendicular offsets) only crosses walkable cells. */
function clearLine(world: World, x0: number, y0: number, x1: number, y1: number): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return true;
  const px = -dy / len;
  const py = dx / len;
  const steps = Math.max(1, Math.ceil(len / 0.2));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = x0 + dx * t;
    const y = y0 + dy * t;
    for (const o of [0, 0.25, -0.25]) {
      if (!isWalkable(world.map, Math.round(x + px * o), Math.round(y + py * o))) return false;
    }
  }
  return true;
}

/** Per-bot pathing: straight when the line is clear, otherwise follow a lazily built flow field. */
function makePather() {
  let field: FlowField | null = null;
  let fieldMap: unknown = null;
  let ti = -1;
  let tj = -1;
  return (world: World, me: Unit, tx: number, ty: number): { gx: number; gy: number } => {
    const straight = { gx: tx - me.x, gy: ty - me.y };
    if (clearLine(world, me.x, me.y, tx, ty)) return straight;
    if (!field || fieldMap !== world.map) {
      field = new FlowField(world.map);
      fieldMap = world.map;
      ti = -1;
      tj = -1;
    }
    let ci = Math.round(tx);
    let cj = Math.round(ty);
    if (!isWalkable(world.map, ci, cj)) {
      let best = Infinity;
      let bi = ci;
      let bj = cj;
      for (let di = -1; di <= 1; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          if (!isWalkable(world.map, ci + di, cj + dj)) continue;
          const d = Math.hypot(ci + di - tx, cj + dj - ty);
          if (d < best) { best = d; bi = ci + di; bj = cj + dj; }
        }
      }
      ci = bi;
      cj = bj;
    }
    if (ci !== ti || cj !== tj) {
      field.compute(ci, cj);
      ti = ci;
      tj = cj;
    }
    const next = field.next(Math.round(me.x), Math.round(me.y));
    if (!next) return straight;
    return { gx: next[0] - me.x, gy: next[1] - me.y };
  };
}

export const idleBot = (): Bot => () => emptyInput();

function nearestLiving(world: World, from: Unit): { m: Unit; d: number } | null {
  let best: Unit | null = null;
  let bestD = Infinity;
  for (const m of world.monsters) {
    if (m.state === 'dead') continue;
    const d = Math.hypot(m.x - from.x, m.y - from.y);
    if (d < bestD) { bestD = d; best = m; }
  }
  return best ? { m: best, d: bestD } : null;
}

/** Always attacks; kites away from very close zombies, closes on near ones, dodges when surrounded. */
export const fighterBot = (): Bot => {
  let dodgedLastTick = false;
  const path = makePather();
  return (world) => {
    const me = world.players[0];
    const input = emptyInput();
    input.attack = true;
    const near = nearestLiving(world, me);
    let gx = world.map.centre - me.x;
    let gy = world.map.centre - me.y;
    if (near && near.d < 0.9) { gx = me.x - near.m.x; gy = me.y - near.m.y; }
    else if (near && near.d < 4) ({ gx, gy } = path(world, me, near.m.x, near.m.y));
    else ({ gx, gy } = path(world, me, world.map.centre, world.map.centre));
    input.move = groundToScreenMove(gx, gy);
    const close = world.monsters.filter((m) => m.state !== 'dead' && Math.hypot(m.x - me.x, m.y - me.y) < 1.2).length;
    input.dodge = !dodgedLastTick && close >= 3;
    dodgedLastTick = input.dodge;
    return input;
  };
};

/** Dodges on the rising edge when 3+ monsters are within 1.2 cells. Shared by the active bots. */
function surroundedDodger() {
  let dodgedLastTick = false;
  return (world: World, me: Unit): boolean => {
    const close = world.monsters.filter((m) => m.state !== 'dead' && Math.hypot(m.x - me.x, m.y - me.y) < 1.2).length;
    const dodge = !dodgedLastTick && close >= 3;
    dodgedLastTick = dodge;
    return dodge;
  };
}

/** Distance from a point to the nearest cell of any standing building. */
function distToStandingBuilding(world: World, x: number, y: number): number {
  let best = Infinity;
  for (const b of world.buildings) {
    if (b.ruined) continue;
    for (const [i, j] of b.cells) best = Math.min(best, Math.hypot(i - x, j - y));
  }
  return best;
}

/**
 * Holds attack and hunts whatever threatens the town: monsters currently hitting a building first,
 * otherwise the living monster nearest to any standing building. Dodges when surrounded.
 */
export const defenderBot = (): Bot => {
  const dodger = surroundedDodger();
  const path = makePather();
  return (world) => {
    const me = world.players[0];
    const input = emptyInput();
    input.attack = true;
    let target: Unit | null = null;
    let bestD = Infinity;
    let bestAttacking = false;
    for (const m of world.monsters) {
      if (m.state === 'dead') continue;
      const attacking = m.state === 'attack' && m.attackBuilding >= 0;
      const d = distToStandingBuilding(world, m.x, m.y);
      if ((attacking && !bestAttacking) || (attacking === bestAttacking && d < bestD)) {
        target = m;
        bestD = d;
        bestAttacking = attacking;
      }
    }
    let gx = world.map.centre - me.x;
    let gy = world.map.centre - me.y;
    if (target) ({ gx, gy } = path(world, me, target.x, target.y));
    else ({ gx, gy } = path(world, me, world.map.centre, world.map.centre));
    input.move = groundToScreenMove(gx, gy);
    input.dodge = dodger(world, me);
    return input;
  };
};

export interface PlayResult {
  seed: number;
  bot: string;
  status: World['status'];
  lossReason: World['lossReason'];
  time: number;
  wave: number;
  kills: number;
  standing: number;
  total: number;
  stars: number;
}

/** Plays a full default level with a bot until it ends or maxSeconds elapses. */
export function playLevel(seed: number, name: string, bot: Bot, maxSeconds = 300): PlayResult {
  const world = new World({ seed });
  const maxTicks = Math.round(maxSeconds / DT);
  while (world.status === 'playing' && world.tickCount < maxTicks) world.tick([bot(world)]);
  return {
    seed, bot: name, status: world.status, lossReason: world.lossReason, time: world.time, wave: world.wave,
    kills: world.kills, standing: world.standingBuildings(), total: world.buildings.length, stars: world.stars,
  };
}
