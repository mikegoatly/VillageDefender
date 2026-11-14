import { describe, expect, it } from 'vitest';
import { defenderBot, defenderChooser, defenderPlan, fighterBot, fighterChooser, idleBot, idleChooser, playLevel, type Bot, type PlanPolicy, type PlayResult } from '../helpers/bots';
import type { Chooser } from '../helpers/worldBuilder';

const SEEDS = [1, 2, 3, 4, 5];
const MAX_SECONDS = 300;

const BOTS: Record<string, { bot: () => Bot; choose: Chooser; plan?: PlanPolicy }> = {
  idle: { bot: idleBot, choose: idleChooser },
  fighter: { bot: fighterBot, choose: fighterChooser },
  'defender-unplanned': { bot: defenderBot, choose: defenderChooser },
  // Planned defender: barracks + chapel on the two buildings nearest the centre.
  defender: { bot: defenderBot, choose: defenderChooser, plan: defenderPlan },
};

const results: Record<string, PlayResult[]> = {};
for (const [name, { bot, choose, plan }] of Object.entries(BOTS)) {
  results[name] = SEEDS.map((s) => playLevel(s, name, bot(), MAX_SECONDS, choose, plan));
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const outcome = (r: PlayResult) =>
  r.status === 'playing' ? 'timeout' : r.status === 'won' ? 'won' : `lost (${r.lossReason})`;
const upgradesText = (r: PlayResult) =>
  Object.entries(r.upgrades).map(([id, n]) => `${id}${n}`).join(' ') || '-';

describe('bot play-tests (default level, 8 waves)', () => {
  it('prints the results table', () => {
    const header = 'seed  bot                 result        time    wave  kills  buildings  stars  lvl  rookies  coins  upgrades';
    const rows = Object.values(results).flat().map((r) =>
      `${String(r.seed).padStart(4)}  ${r.bot.padEnd(18)}  ${outcome(r).padEnd(12)}  ${r.time.toFixed(1).padStart(6)}s  ${String(r.wave).padStart(4)}  ${String(r.kills).padStart(5)}  ${`${r.standing}/${r.total}`.padStart(9)}  ${String(r.stars).padStart(5)}  ${String(r.level).padStart(3)}  ${String(r.rookiesAlive).padStart(7)}  ${String(r.coins).padStart(5)}  ${upgradesText(r)}`);
    const avgs = Object.entries(results).map(([name, rs]) =>
      `${name.padEnd(18)} avg stars ${avg(rs.map((r) => r.stars)).toFixed(2)}  avg kills ${avg(rs.map((r) => r.kills)).toFixed(1)}  avg standing ${avg(rs.map((r) => r.standing)).toFixed(1)}  avg level ${avg(rs.map((r) => r.level)).toFixed(1)}  avg rookies ${avg(rs.map((r) => r.rookiesAlive)).toFixed(1)}  avg coins ${avg(rs.map((r) => r.coins)).toFixed(1)}  wins ${rs.filter((r) => r.status === 'won').length}/${rs.length}`);
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
