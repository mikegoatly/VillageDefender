import { describe, expect, it } from 'vitest';
import { DT, WAVES } from '../../src/data/balance';
import { World, type SimEvent } from '../../src/sim/world';
import { emptyInput } from '../../src/sim/types';

type Ev<T extends SimEvent['type']> = Extract<SimEvent, { type: T }>;

/** Ticks a world and records [time, event] pairs. */
function record(world: World, seconds: number) {
  const log: { t: number; e: SimEvent }[] = [];
  const n = Math.round(seconds / DT);
  for (let k = 0; k < n; k++) {
    world.tick([emptyInput()]);
    for (const e of world.events) log.push({ t: world.time, e });
  }
  return log;
}
const first = <T extends SimEvent['type']>(log: { t: number; e: SimEvent }[], type: T) => {
  const f = log.find((x) => x.e.type === type);
  return f && { t: f.t, e: f.e as Ev<T> };
};

describe('waves', () => {
  it('warns, starts and spawns the first wave on schedule', () => {
    const world = new World({ seed: 1, god: true });
    const log = record(world, WAVES.firstAt + 0.5);
    const warn = first(log, 'waveWarning')!;
    const start = first(log, 'waveStart')!;
    expect(Math.abs(warn.t - (WAVES.firstAt - WAVES.warning))).toBeLessThanOrEqual(1.5 * DT);
    expect(warn.e.wave).toBe(1);
    expect(warn.e.sides).toHaveLength(1);
    expect(Math.abs(start.t - WAVES.firstAt)).toBeLessThanOrEqual(1.5 * DT);
    expect(start.e.count).toBe(WAVES.baseCount);
    expect(world.wave).toBe(1);
    // Everything spawned within count * spacing (+1 tick) of the start.
    expect(world.monsters.length).toBe(WAVES.baseCount);
  });

  it('spawns monsters spread over count * spawnSpacing', () => {
    const world = new World({ seed: 1, god: true });
    record(world, WAVES.firstAt + 0.05);
    expect(world.monsters.length).toBeLessThan(WAVES.baseCount);
    record(world, WAVES.baseCount * WAVES.spawnSpacing + DT);
    expect(world.monsters.length).toBe(WAVES.baseCount);
  });

  it('spawns monsters on walkable edge cells of the warned side', () => {
    const world = new World({ seed: 3, god: true });
    const log = record(world, WAVES.firstAt + 1.2);
    const side = first(log, 'waveWarning')!.e.sides[0];
    const cells = world.map.edges[side];
    for (const m of world.monsters) {
      expect(cells.some(([i, j]) => Math.abs(i - m.x) < 1.5 && Math.abs(j - m.y) < 1.5)).toBe(true);
    }
  });

  it('honours the startWave option', () => {
    const world = new World({ seed: 1, god: true, startWave: 3 });
    const log = record(world, WAVES.firstAt + 0.2);
    const start = first(log, 'waveStart')!;
    expect(start.e.wave).toBe(3);
    expect(start.e.count).toBe(WAVES.baseCount + WAVES.perWave * 2);
  });

  it('uses two sides from WAVES.twoSidesFrom onwards', () => {
    const before = new World({ seed: 1, god: true, startWave: WAVES.twoSidesFrom - 1 });
    const at = new World({ seed: 1, god: true, startWave: WAVES.twoSidesFrom });
    const w1 = first(record(before, WAVES.firstAt - WAVES.warning + 0.1), 'waveWarning')!.e;
    const w2 = first(record(at, WAVES.firstAt - WAVES.warning + 0.1), 'waveWarning')!.e;
    expect(w1.sides).toHaveLength(1);
    expect(w2.sides).toHaveLength(2);
    expect(new Set(w2.sides).size).toBe(2);
  });

  it('progresses wave by wave on the interval', () => {
    const world = new World({ seed: 2, god: true });
    const log = record(world, WAVES.firstAt + WAVES.interval * 3 + 0.5);
    const starts = log.filter((x) => x.e.type === 'waveStart');
    expect(starts.map((s) => (s.e as Ev<'waveStart'>).wave)).toEqual([1, 2, 3, 4]);
    starts.forEach((s, k) => expect(Math.abs(s.t - (WAVES.firstAt + k * WAVES.interval))).toBeLessThanOrEqual(1.5 * DT));
    const sides = log.filter((x) => x.e.type === 'waveWarning').map((x) => (x.e as Ev<'waveWarning'>).sides.length);
    expect(sides).toEqual([1, 1, 1, 2]);
  });
});
