// Simple scripted players for play-test style tests. A bot is (world) => InputState, called once per tick.

import { groundDirToScreen } from '../../src/sim/iso';
import { emptyInput, type InputState } from '../../src/sim/types';
import type { Unit, World } from '../../src/sim/world';

export type Bot = (world: World) => InputState;

/** Converts a desired ground direction to a unit-length screen-space move. */
export function groundToScreenMove(gx: number, gy: number): { x: number; y: number } {
  const s = groundDirToScreen(gx, gy);
  const l = Math.hypot(s.x, s.y);
  return l < 1e-9 ? { x: 0, y: 0 } : { x: s.x / l, y: s.y / l };
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
  return (world) => {
    const me = world.players[0];
    const input = emptyInput();
    input.attack = true;
    const near = nearestLiving(world, me);
    let gx = world.map.centre - me.x;
    let gy = world.map.centre - me.y;
    if (near && near.d < 0.9) { gx = me.x - near.m.x; gy = me.y - near.m.y; }
    else if (near && near.d < 4) { gx = near.m.x - me.x; gy = near.m.y - me.y; }
    input.move = groundToScreenMove(gx, gy);
    const close = world.monsters.filter((m) => m.state !== 'dead' && Math.hypot(m.x - me.x, m.y - me.y) < 1.2).length;
    input.dodge = !dodgedLastTick && close >= 3;
    dodgedLastTick = input.dodge;
    return input;
  };
};
