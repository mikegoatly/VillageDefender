// Waves: the countdown and warning, building the spawn queue, picking sides and spawning monsters.

import { WAVES } from '../data/balance';
import { MONSTERS, type MonsterKind } from '../data/monsters';
import { ROLE_EFFECTS } from '../data/roles';
import { COINS } from '../data/towns';
import { spawnOrder } from '../data/waves';
import { newBossState } from './bossState';
import { SIDES, type Side } from './map';
import type { Unit } from './model';
import { unitBase } from './units';
import type { World } from './world';

export function updateWaves(w: World) {
  if (w.noWaves) return;
  const pw = w.pending;
  if (pw) {
    const warning = WAVES.warning + (w.standingRoles('watchtower').length ? ROLE_EFFECTS.watchtowerExtraWarning : 0);
    if (!pw.warned && w.time >= pw.at - warning) {
      pw.warned = true;
      w.events.push({ type: 'waveWarning', wave: pw.wave, sides: pw.sides });
    }
    if (w.time >= pw.at) {
      // Reaching the next wave pays for surviving the previous one.
      if (pw.wave > 1) w.coins += COINS.perWaveCleared * (pw.wave - 1);
      w.wave = pw.wave;
      const order = spawnOrder(w.waves[pw.wave - 1]);
      order.forEach((kind, k) => {
        w.spawnQueue.push({ at: w.time + k * WAVES.spawnSpacing, side: pw.sides[k % pw.sides.length], kind });
      });
      w.events.push({ type: 'waveStart', wave: pw.wave, count: order.length });
      const next = pw.wave + 1;
      w.pending = next <= w.totalWaves
        ? { wave: next, at: pw.at + WAVES.interval, sides: pickSides(w, next), warned: false }
        : null;
    }
  }
  while (w.spawnQueue.length && w.spawnQueue[0].at <= w.time) {
    const s = w.spawnQueue.shift()!;
    if (w.monsters.length < WAVES.maxAlive) spawnMonster(w, s.side, s.kind);
  }
}

export function pickSides(w: World, wave: number): Side[] {
  const count = w.waves[wave - 1]?.sides ?? 1;
  const pool: Side[] = [...SIDES];
  const out: Side[] = [];
  for (let k = 0; k < count; k++) {
    const s = w.rng.pick(pool);
    out.push(s);
    pool.splice(pool.indexOf(s), 1);
  }
  return out;
}

export function spawnMonster(w: World, side: Side, kind: MonsterKind) {
  const cells = w.map.edges[side];
  if (!cells.length) return;
  const [i, j] = w.rng.pick(cells);
  addMonster(w, i + w.rng.range(-0.15, 0.15), j + w.rng.range(-0.15, 0.15), kind);
}

/** Adds a monster at a ground position. Public for tests and debug tools. */
export function addMonster(w: World, x: number, y: number, kind: MonsterKind = 'zombie'): Unit {
  const def = MONSTERS[kind];
  const m: Unit = {
    ...unitBase(w.nextId++, x, y),
    kind, team: 'enemy', radius: def.radius, hp: def.hp, maxHp: def.hp,
    speed: def.speed + w.rng.range(-def.speedJitter, def.speedJitter),
    abilityIn: def.raise?.first ?? def.wail?.first ?? def.freezes?.first ?? (def.inert ? def.explodes?.fuse : undefined) ?? 0,
    burrowed: !!def.burrows,
  };
  if (def.boss) {
    m.boss = newBossState(def.boss);
    w.events.push({ type: 'bossSpawn', unit: m.id });
  }
  w.monsters.push(m);
  // Light sources count from the moment they appear (the list is otherwise rebuilt each tick).
  if (def.light) w.glows.push(m);
  return m;
}
