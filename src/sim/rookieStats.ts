// Rookie stat helpers: creation, derived max HP and damage. A leaf module so combat and town can use it without importing the rookie AI.

import { ARMY, ROOKIES, type RookieKind } from '../data/rookies';
import type { Unit } from './model';
import { unitBase } from './units';
import type { World } from './world';

export function makeRookie(w: World, kind: RookieKind, x: number, y: number): Unit {
  const def = ROOKIES[kind];
  const r: Unit = {
    ...unitBase(w.nextId++, x, y),
    kind, team: 'player', radius: def.radius, hp: def.hp, maxHp: def.hp, speed: def.speed,
    rank: Math.min(2, w.progression.mods.army.startRank), postX: x, postY: y,
  };
  applyRookieStats(w, r);
  r.hp = r.maxHp;
  return r;
}

export function applyRookieStats(w: World, r: Unit) {
  const def = ROOKIES[r.kind as RookieKind];
  const max = def.hp * w.progression.mods.army.hpMul * ARMY.rankMul[r.rank];
  if (r.state !== 'dead') r.hp = Math.min(max, r.hp + Math.max(0, max - r.maxHp));
  r.maxHp = max;
}

export function rookieDamage(w: World, r: Unit): number {
  return ROOKIES[r.kind as RookieKind].damage * w.progression.mods.army.damageMul * ARMY.rankMul[r.rank] * w.smithyMulAt(r.x, r.y);
}
