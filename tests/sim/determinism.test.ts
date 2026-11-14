import { describe, expect, it } from 'vitest';
import { DT } from '../../src/data/balance';
import { World } from '../../src/sim/world';
import { emptyInput, type InputState } from '../../src/sim/types';
import { defenderBot, defenderChooser, fighterChooser } from '../helpers/bots';
import { stepWith, type Chooser } from '../helpers/worldBuilder';
import type { Bot } from '../helpers/bots';

/** A fixed, seed-independent input script: wanders, swings, and dodges now and then. */
function script(tick: number): InputState {
  const a = tick * 0.013;
  return {
    ...emptyInput(),
    move: { x: Math.cos(a), y: Math.sin(a * 1.7) },
    attack: tick % 90 < 60,
    dodge: tick % 150 === 0,
  };
}

function snapshot(seed: number, ticks: number) {
  const world = new World({ seed });
  for (let t = 0; t < ticks; t++) world.tick([script(t)]);
  return {
    time: world.time,
    status: world.status,
    kills: world.kills,
    wave: world.wave,
    players: world.players.map((p) => [p.x, p.y, p.hp]),
    monsters: world.monsters.map((m) => [m.x, m.y, m.hp, m.state]),
  };
}

describe('determinism', () => {
  it('same seed + same inputs → identical state after 3000 ticks', () => {
    const a = snapshot(5, 3000);
    const b = snapshot(5, 3000);
    expect(a.monsters.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
    expect(a.time).toBeCloseTo(a.status === 'playing' ? 3000 * DT : a.time, 6);
  });

  it('different seeds diverge', () => {
    expect(snapshot(5, 3000)).not.toEqual(snapshot(6, 3000));
  });
});

/** Plays with a bot and an upgrade policy so rookies, gems and upgrades are all exercised. */
function fullSnapshot(seed: number, ticks: number, bot: Bot, choose: Chooser) {
  const world = new World({ seed });
  for (let t = 0; t < ticks; t++) stepWith(world, bot(world), choose);
  return {
    time: world.time,
    status: world.status,
    kills: world.kills,
    wave: world.wave,
    level: world.progression.level,
    xp: world.progression.xp,
    upgrades: { ...world.progression.levels },
    players: world.players.map((p) => [p.x, p.y, p.hp]),
    rookies: world.rookies.map((r) => [r.kind, r.x, r.y, r.hp, r.rank, r.unitKills, r.state]),
    monsters: world.monsters.map((m) => [m.x, m.y, m.hp, m.state]),
    gems: world.gems.map((g) => [g.x, g.y, g.value, g.magnet]),
    projectiles: world.projectiles.map((p) => [p.x, p.y, p.damage]),
    buildings: world.buildings.map((b) => [b.hp, b.maxHp, b.ruined]),
  };
}

describe('determinism with rookies and upgrades', () => {
  const TICKS = 60 * 100;

  it('same seed + inputs + choice policy → identical state, and the run really used them', () => {
    const a = fullSnapshot(3, TICKS, defenderBot(), defenderChooser);
    const b = fullSnapshot(3, TICKS, defenderBot(), defenderChooser);
    expect(a.level).toBeGreaterThan(1);
    expect(Object.keys(a.upgrades).length).toBeGreaterThan(0);
    expect(a.rookies.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
  });

  it('a different choice policy gives a different game', () => {
    const a = fullSnapshot(3, TICKS, defenderBot(), defenderChooser);
    const b = fullSnapshot(3, TICKS, defenderBot(), fighterChooser);
    expect(a.upgrades).not.toEqual(b.upgrades);
  });
});
