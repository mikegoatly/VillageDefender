// Debug tools used by the in-game debug panel (src/ui/DebugPanel.ts). Not used by normal play.

import { WAVES } from '../data/balance';
import type { MonsterKind } from '../data/monsters';
import type { RookieKind } from '../data/rookies';
import { MAX_WEAPON_RANK, type WeaponKind } from '../data/weapons';
import { damageBuilding, damageUnit } from './combat';
import { grantXp } from './gems';
import type { Side } from './map';
import { litCoverage, setLampLit } from './light';
import { collideCells } from './physics';
import { applyMods } from './town';
import { addMonster, pickSides, spawnMonster } from './waves';
import type { World } from './world';

/** Spawns monsters at a ground point (spread slightly) or along a map edge. */
export function debugSpawn(w: World, kind: MonsterKind, count: number, at: Side | { x: number; y: number }) {
  for (let k = 0; k < count; k++) {
    if (typeof at === 'string') spawnMonster(w, at, kind);
    else addMonster(w, at.x + w.rng.range(-0.4, 0.4), at.y + w.rng.range(-0.4, 0.4), kind);
  }
}

export function debugGiveXp(w: World, amount: number) {
  grantXp(w, amount);
}

/** Takes one stack of an upgrade without a level-up. Returns false when maxed/unknown. */
export function debugGiveUpgrade(w: World, id: string): boolean {
  const ok = w.progression.grant(id, w);
  if (ok) applyMods(w);
  return ok;
}

export function debugAddRookie(w: World, kind: RookieKind) {
  const k = w.players[0];
  const r = w.addRookie(k.x + 0.6, k.y + 0.6, kind);
  collideCells(w, r);
  w.events.push({ type: 'rookieJoined', unit: r.id, kind, building: -1 });
}

/** Equips a weapon at a shop rank immediately, even mid-run. */
export function debugSetWeapon(w: World, kind: WeaponKind, rank: number) {
  w.weapon = kind;
  w.weaponRanks[kind] = Math.max(0, Math.min(MAX_WEAPON_RANK, Math.round(rank)));
}

export function debugHealKnight(w: World) {
  for (const p of w.players) if (p.state !== 'dead') p.hp = p.maxHp;
}

/** Next wave becomes `wave`, arriving after its normal warning. */
export function debugJumpToWave(w: World, wave: number) {
  const wd = Math.min(Math.max(1, Math.round(wave)), w.totalWaves);
  w.wave = wd - 1;
  w.pending = { wave: wd, at: w.time + WAVES.warning + 0.1, sides: pickSides(w, wd), warned: false };
}

/** Kills every living monster (they drop gems as usual). */
export function debugKillAll(w: World) {
  for (const m of w.monsters) if (m.state !== 'dead') damageUnit(w, m, m.hp + 1, -1);
}

/** Sets a building's HP fraction (0 destroys it, 1 repairs it). */
export function debugSetBuildingHp(w: World, id: number, fraction: number) {
  const b = w.buildings[id];
  if (!b || b.ruined) return;
  if (fraction <= 0) {
    damageBuilding(w, b, b.hp, w.players[0]);
    return;
  }
  b.hp = b.maxHp * Math.min(1, fraction);
}

/** Lights or puts out a lamp post at any time; a knocked-over post is stood back up first. */
export function debugSetLamp(w: World, id: number, lit: boolean) {
  const l = w.lamps[id];
  if (!l) return;
  if (l.hp <= 0) l.hp = l.maxHp;
  setLampLit(w, l, lit);
  w.light.markDirty();
}

export function debugEnd(w: World, won: boolean) {
  if (w.status !== 'playing') return;
  if (won) {
    w.pending = null;
    w.spawnQueue = [];
    debugKillAll(w);
    w.end(true, null);
  } else w.end(false, 'knight');
}

/** Read-only views of internal state for debug overlays. */
export function debugInfo(w: World) {
  return {
    knightFlow: w.knightFlow.dist,
    buildingFlow: w.buildingFlow.dist,
    nextWaveAt: w.pending?.at ?? null,
    nextWave: w.pending?.wave ?? null,
    queued: w.spawnQueue.length,
    nextRookieAt: w.nextRookieAt(),
    recruitIn: w.recruitIn,
    /** Night towns: lit cells (any source, ignoring dusk grace) out of walkable ones, and lamp posts. */
    light: w.lamps.length || w.map.theme === 'night' ? {
      ...litCoverage(w),
      lamps: { lit: w.lamps.filter((l) => l.lit && l.hp > 0).length, broken: w.lamps.filter((l) => l.hp <= 0).length, total: w.lamps.length },
      oilLeft: w.lampOilLeft,
      /** Pumpkin King: seconds of blackout (or its warning) left, and fires burning. */
      blackout: w.blackout || w.blackoutWarn ? { warn: w.blackoutWarn, dark: w.blackout } : null,
      fires: w.fires.length,
    } : null,
  };
}
