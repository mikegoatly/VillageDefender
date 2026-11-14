import { describe, expect, it } from 'vitest';
import { DT } from '../../src/data/balance';
import { World } from '../../src/sim/world';
import { fighterBot, idleBot, type Bot } from '../helpers/bots';

const MAX_SECONDS = 240;
const SEEDS = [1, 2, 3, 4, 5];

interface Result { seed: number; bot: string; survived: number; wave: number; kills: number; lost: boolean }

function play(seed: number, name: string, bot: Bot): Result {
  const world = new World({ seed });
  const maxTicks = Math.round(MAX_SECONDS / DT);
  while (world.status === 'playing' && world.tickCount < maxTicks) world.tick([bot(world)]);
  return { seed, bot: name, survived: world.time, wave: world.wave, kills: world.kills, lost: world.status === 'lost' };
}

describe('bot play-tests', () => {
  const idle = SEEDS.map((s) => play(s, 'idle', idleBot()));
  const fighter = SEEDS.map((s) => play(s, 'fighter', fighterBot()));

  it('prints the results table', () => {
    const rows = [...idle, ...fighter].map((r) =>
      `seed ${r.seed}  ${r.bot.padEnd(8)} survived ${r.survived.toFixed(1).padStart(6)}s  wave ${String(r.wave).padStart(2)}  kills ${String(r.kills).padStart(4)}  ${r.lost ? 'lost' : 'alive'}`);
    console.log('\n' + rows.join('\n'));
  });

  it('idle loses on every seed before 120 s', () => {
    for (const r of idle) {
      expect(r.lost, `seed ${r.seed}`).toBe(true);
      expect(r.survived, `seed ${r.seed}`).toBeLessThan(120);
    }
  });

  it('fighter outlives idle and scores at least 3x the kills', () => {
    SEEDS.forEach((seed, k) => {
      expect(fighter[k].survived, `seed ${seed} survival`).toBeGreaterThan(idle[k].survived);
      expect(fighter[k].kills, `seed ${seed} kills`).toBeGreaterThanOrEqual(3 * idle[k].kills);
    });
  });
});
