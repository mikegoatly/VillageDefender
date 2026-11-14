import { describe, expect, it } from 'vitest';
import { defenderBot, fighterBot, idleBot, playLevel, type Bot, type PlayResult } from '../helpers/bots';

const SEEDS = [1, 2, 3, 4, 5];
const MAX_SECONDS = 300;

const BOTS: Record<string, () => Bot> = { idle: idleBot, fighter: fighterBot, defender: defenderBot };

const results: Record<string, PlayResult[]> = {};
for (const [name, make] of Object.entries(BOTS)) results[name] = SEEDS.map((s) => playLevel(s, name, make(), MAX_SECONDS));

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const outcome = (r: PlayResult) =>
  r.status === 'playing' ? 'timeout' : r.status === 'won' ? 'won' : `lost (${r.lossReason})`;

describe('bot play-tests (default level, 8 waves)', () => {
  it('prints the results table', () => {
    const header = 'seed  bot       result        time    wave  kills  buildings  stars';
    const rows = Object.values(results).flat().map((r) =>
      `${String(r.seed).padStart(4)}  ${r.bot.padEnd(8)}  ${outcome(r).padEnd(12)}  ${r.time.toFixed(1).padStart(6)}s  ${String(r.wave).padStart(4)}  ${String(r.kills).padStart(5)}  ${`${r.standing}/${r.total}`.padStart(9)}  ${String(r.stars).padStart(5)}`);
    const avgs = Object.entries(results).map(([name, rs]) =>
      `${name.padEnd(8)} avg stars ${avg(rs.map((r) => r.stars)).toFixed(2)}  avg kills ${avg(rs.map((r) => r.kills)).toFixed(1)}  avg standing ${avg(rs.map((r) => r.standing)).toFixed(1)}  wins ${rs.filter((r) => r.status === 'won').length}/${rs.length}`);
    console.log(`\n${header}\n${rows.join('\n')}\n\n${avgs.join('\n')}`);
  });

  it('idle never wins', () => {
    for (const r of results.idle) expect(r.status, `seed ${r.seed}`).not.toBe('won');
  });

  it('every game ends or reaches the time cap with a consistent result', () => {
    for (const r of Object.values(results).flat()) {
      expect(r.standing).toBeLessThanOrEqual(r.total);
      if (r.status === 'lost') expect(r.stars).toBe(0);
      if (r.status === 'won') expect(r.stars).toBeGreaterThanOrEqual(1);
    }
  });

  it('defender averages at least as many stars as fighter', () => {
    expect(avg(results.defender.map((r) => r.stars))).toBeGreaterThanOrEqual(avg(results.fighter.map((r) => r.stars)));
  });
});
