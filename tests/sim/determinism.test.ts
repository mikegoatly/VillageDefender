import { describe, expect, it } from 'vitest';
import { DT } from '../../src/data/balance';
import { World } from '../../src/sim/world';
import { emptyInput, type InputState } from '../../src/sim/types';

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
