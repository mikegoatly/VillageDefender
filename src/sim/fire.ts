// The Pumpkin King's night hazards (Town 5): fires where his pumpkins land, and blackouts. Both are
// world state, ticked every tick by the world (not the boss), so a fire burns out and the lights
// come back even after he falls. Light itself is decided in sim/light.ts, which reads both.

import { DT } from '../data/balance';
import { PUMPKIN_KING } from '../data/monsters';
import { hurtFriendliesInRadius } from './combat';
import { SIDES } from './map';
import type { Unit } from './model';
import { spawnMonster } from './waves';
import type { World } from './world';

/** Starts a fire at a ground point (a pumpkin landed there). */
export function igniteFire(w: World, x: number, y: number) {
  const f = PUMPKIN_KING.fire;
  const id = w.nextId++;
  w.fires.push({ id, x, y, radius: f.radius, until: w.time + f.time, pulseIn: f.pulse });
  w.events.push({ type: 'fireStart', fire: id, x, y, radius: f.radius, time: f.time });
}

/** Burns friendlies standing in a fire every pulse, and puts fires out when their time is up. */
export function updateFires(w: World) {
  if (w.fires.length === 0) return;
  const f = PUMPKIN_KING.fire;
  for (let k = w.fires.length - 1; k >= 0; k--) {
    const fire = w.fires[k];
    if (w.time >= fire.until) {
      w.fires.splice(k, 1);
      continue;
    }
    fire.pulseIn -= DT;
    if (fire.pulseIn > 0) continue;
    fire.pulseIn += f.pulse;
    hurtFriendliesInRadius(w, fire.x, fire.y, fire.radius, f.dps * f.pulse);
  }
}

/** The boss calls a blackout: the warning (lights flicker) starts now. */
export function warnBlackout(w: World, boss: Unit) {
  w.blackoutWarn = PUMPKIN_KING.blackout.telegraph;
  w.events.push({ type: 'blackoutWarn', unit: boss.id, time: PUMPKIN_KING.blackout.telegraph });
}

/**
 * Runs a blackout called by warnBlackout: after the warning every light but the lantern and the fires
 * goes out (sim/light.ts reads `blackout`) and shades come in from random edges; then the lights return.
 */
export function updateBlackout(w: World) {
  const b = PUMPKIN_KING.blackout;
  if (w.blackoutWarn > 0) {
    w.blackoutWarn = Math.max(0, w.blackoutWarn - DT);
    if (w.blackoutWarn > 0) return;
    w.blackout = b.time;
    w.events.push({ type: 'blackout', time: b.time });
    for (let k = 0; k < b.shades; k++) spawnMonster(w, w.rng.pick(SIDES), 'shade');
    return;
  }
  if (w.blackout <= 0) return;
  w.blackout = Math.max(0, w.blackout - DT);
  if (w.blackout === 0) w.events.push({ type: 'lightsBack' });
}
