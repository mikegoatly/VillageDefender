// The knight: input handling, weapons, dodge and the rally call.

import { DT, KNIGHT } from '../data/balance';
import { RALLY } from '../data/rookies';
import type { WeaponDef } from '../data/weapons';
import { areaHits, swingHits } from './combat';
import { screenDirToGround } from './iso';
import type { Unit } from './model';
import { throwAxe } from './projectiles';
import { nearestMonster } from './queries';
import type { InputState } from './types';
import { norm, setState, tickTimers, unitBase } from './units';
import type { World } from './world';

export function updateKnight(w: World, u: Unit, input: InputState | undefined) {
  tickTimers(u);
  if (u.state === 'dead') return;
  const km = w.progression.mods.knight;
  if (km.regen > 0) u.hp = Math.min(u.maxHp, u.hp + km.regen * DT);
  const inp = input ?? { move: { x: 0, y: 0 }, attack: false, dodge: false } as InputState;
  const move = screenDirToGround(inp.move.x, inp.move.y);
  const moveLen = Math.hypot(move.x, move.y);

  // Dodge on the rising edge of the button.
  if (inp.dodge && !u.dodgeHeld && u.dodgeCooldown <= 0 && u.state !== 'dodge') {
    const dir = moveLen > 0.1 ? norm(move) : u.facing;
    u.facing = dir;
    setState(u, 'dodge');
    u.dodgeCooldown = KNIGHT.dodgeCooldown * km.dodgeCooldownMul;
    u.invuln = Math.max(u.invuln, KNIGHT.dodgeDuration);
  }
  u.dodgeHeld = inp.dodge;

  if (u.state === 'dodge') {
    u.x += u.facing.x * KNIGHT.dodgeSpeed * DT;
    u.y += u.facing.y * KNIGHT.dodgeSpeed * DT;
    u.moving = true;
    if (u.stateTime >= KNIGHT.dodgeDuration) setState(u, 'idle');
    return;
  }

  // Attack: hold to auto-aim at the nearest enemy (decision 2); how it hits depends on the weapon (decision 39).
  const wd = w.weaponDef;
  if (wd.style === 'spin') {
    updateSpin(w, u, inp.attack, wd);
  } else {
    if (inp.attack && u.attackCooldown <= 0 && u.state !== 'attack') {
      const target = nearestMonster(w, u.x, u.y, wd.acquireRange * km.rangeMul);
      if (target) u.facing = norm({ x: target.x - u.x, y: target.y - u.y });
      else if (moveLen > 0.1) u.facing = norm(move);
      setState(u, 'attack');
      u.hitPending = true;
      u.attackCooldown = wd.cooldown * km.cooldownMul;
      w.events.push({ type: 'swing', unit: u.id, weapon: w.weapon });
    }
    if (u.state === 'attack') {
      if (u.hitPending && u.stateTime >= wd.hitTime) {
        u.hitPending = false;
        weaponHit(w, u, wd);
      }
      if (u.stateTime >= wd.duration) setState(u, 'idle');
    }
  }

  const speed = u.speed * (u.state === 'attack' ? wd.moveFactor : 1);
  u.moving = moveLen > 0.05;
  if (u.moving) {
    u.x += move.x * speed * DT;
    u.y += move.y * speed * DT;
    if (u.state !== 'attack') u.facing = norm(move);
  }
  if (u.state !== 'attack') setState(u, u.moving ? 'walk' : 'idle', true);
}

/** Weapon damage after upgrades and any smithy bonus at the knight's position. */
function knightDamage(w: World, u: Unit, wd: WeaponDef): number {
  return wd.damage * w.progression.mods.knight.damageMul * w.smithyMulAt(u.x, u.y);
}

/** Applies the knight's weapon at the moment the attack lands. */
function weaponHit(w: World, u: Unit, wd: WeaponDef) {
  const km = w.progression.mods.knight;
  const damage = knightDamage(w, u, wd);
  const knockback = wd.knockback * km.knockbackMul;
  if (wd.style === 'arc') {
    swingHits(w, u, wd.range * km.rangeMul, Math.min(Math.PI, wd.arc * km.arcMul), damage, knockback);
  } else if (wd.style === 'area') {
    // Warhammer: slam centred ahead of the knight.
    const reach = wd.range * km.rangeMul;
    areaHits(w, u.id, u.x + u.facing.x * reach, u.y + u.facing.y * reach, wd.arc * km.arcMul, damage, knockback);
  } else if (wd.style === 'boomerang') {
    throwAxe(w, u, wd, damage);
  }
}

/** Flail: while attack is held, damage pulses hit everything around the knight. */
function updateSpin(w: World, u: Unit, held: boolean, wd: WeaponDef) {
  const km = w.progression.mods.knight;
  if (!held) {
    if (u.state === 'attack') setState(u, 'idle');
    return;
  }
  setState(u, 'attack', true);
  if (u.attackCooldown > 0) return;
  u.attackCooldown = wd.cooldown * km.cooldownMul;
  const damage = knightDamage(w, u, wd);
  areaHits(w, u.id, u.x, u.y, wd.range * km.rangeMul * Math.sqrt(km.arcMul), damage, wd.knockback * km.knockbackMul);
  w.events.push({ type: 'swing', unit: u.id, weapon: w.weapon });
}

export function updateRally(w: World, input: InputState | undefined) {
  w.rallyTime = Math.max(0, w.rallyTime - DT);
  w.rallyCooldown = Math.max(0, w.rallyCooldown - DT);
  const held = !!input?.rally;
  if (held && !w.rallyHeld && w.rallyCooldown <= 0) {
    w.rallyTime = RALLY.duration;
    w.rallyCooldown = RALLY.cooldown;
    w.events.push({ type: 'rally' });
  }
  w.rallyHeld = held;
}

export function makeKnight(w: World, x: number, y: number): Unit {
  return {
    ...unitBase(w.nextId++, x, y),
    kind: 'knight', team: 'player', radius: KNIGHT.radius, hp: KNIGHT.hp * w.boosts.knightHpMul, maxHp: KNIGHT.hp * w.boosts.knightHpMul, speed: KNIGHT.speed,
  };
}
