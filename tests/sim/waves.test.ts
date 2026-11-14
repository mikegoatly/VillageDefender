import { describe, expect, it } from 'vitest';
import { DT, WAVES } from '../../src/data/balance';
import type { MonsterKind } from '../../src/data/monsters';
import { LEVEL1_WAVES, spawnOrder, type WaveDef } from '../../src/data/waves';
import { World, type SimEvent } from '../../src/sim/world';
import { fieldRows, mapFromAscii } from '../helpers/mapBuilder';
import { emptyInput } from '../../src/sim/types';

type Ev<T extends SimEvent['type']> = Extract<SimEvent, { type: T }>;
type Log = { t: number; e: SimEvent }[];

/** Ticks a world and records [time, event] pairs. */
function record(world: World, seconds: number): Log {
  const log: Log = [];
  const n = Math.round(seconds / DT);
  for (let k = 0; k < n; k++) {
    world.tick([emptyInput()]);
    for (const e of world.events) log.push({ t: world.time, e });
  }
  return log;
}
const first = <T extends SimEvent['type']>(log: Log, type: T) => {
  const f = log.find((x) => x.e.type === type);
  return f && { t: f.t, e: f.e as Ev<T> };
};
const all = <T extends SimEvent['type']>(log: Log, type: T) =>
  log.filter((x) => x.e.type === type).map((x) => ({ t: x.t, e: x.e as Ev<T> }));

const total = (w: WaveDef) => Object.values(w.monsters).reduce((a, b) => a + (b ?? 0), 0);
const kindCounts = (world: World) => {
  const out: Partial<Record<MonsterKind, number>> = {};
  for (const m of world.monsters) out[m.kind as MonsterKind] = (out[m.kind as MonsterKind] ?? 0) + 1;
  return out;
};
/** Table definition without zero entries, for comparing with kindCounts. */
const nonZero = (w: WaveDef) => Object.fromEntries(Object.entries(w.monsters).filter(([, n]) => (n ?? 0) > 0));

describe('wave table', () => {
  it('has 8 waves whose totals match their spawn order', () => {
    expect(LEVEL1_WAVES).toHaveLength(8);
    for (const w of LEVEL1_WAVES) expect(spawnOrder(w)).toHaveLength(total(w));
  });

  it('interleaves kinds rather than sending them in blocks', () => {
    const order = spawnOrder({ monsters: { zombie: 3, orc: 3 }, sides: 1 });
    expect(order).toEqual(['zombie', 'orc', 'zombie', 'orc', 'zombie', 'orc']);
  });
});

describe('waves', () => {
  it('warns, starts and spawns the first wave on schedule', () => {
    const world = new World({ seed: 1, god: true });
    const w1 = LEVEL1_WAVES[0];
    const log = record(world, WAVES.firstAt + 0.5);
    const warn = first(log, 'waveWarning')!;
    const start = first(log, 'waveStart')!;
    expect(Math.abs(warn.t - (WAVES.firstAt - WAVES.warning))).toBeLessThanOrEqual(1.5 * DT);
    expect(warn.e.wave).toBe(1);
    expect(warn.e.sides).toHaveLength(w1.sides);
    expect(Math.abs(start.t - WAVES.firstAt)).toBeLessThanOrEqual(1.5 * DT);
    expect(start.e.count).toBe(total(w1));
    expect(world.wave).toBe(1);
    // 5 zombies at 0.12 s spacing are all out within 0.5 s.
    expect(world.monsters.length).toBe(total(w1));
  });

  it('spawns monsters spread over count * spawnSpacing', () => {
    const world = new World({ seed: 1, god: true });
    const count = total(LEVEL1_WAVES[0]);
    record(world, WAVES.firstAt + 0.05);
    expect(world.monsters.length).toBeGreaterThan(0);
    expect(world.monsters.length).toBeLessThan(count);
    record(world, count * WAVES.spawnSpacing + DT);
    expect(world.monsters.length).toBe(count);
  });

  it('spawns one monster per spawnSpacing, in order', () => {
    const world = new World({ seed: 1, god: true });
    record(world, WAVES.firstAt + 0.06);
    const counts: number[] = [world.monsters.length];
    for (let k = 1; k <= 3; k++) {
      record(world, WAVES.spawnSpacing);
      counts.push(world.monsters.length);
    }
    expect(counts[0]).toBeGreaterThanOrEqual(1);
    expect(counts.slice(1).map((c, k) => c - counts[k])).toEqual([1, 1, 1]);
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

  it('honours the startWave option: count, sides and kinds come from that wave', () => {
    const world = new World({ seed: 1, god: true, startWave: 4 });
    const w4 = LEVEL1_WAVES[3];
    const log = record(world, WAVES.firstAt + total(w4) * WAVES.spawnSpacing + 0.2);
    const start = first(log, 'waveStart')!;
    expect(start.e.wave).toBe(4);
    expect(start.e.count).toBe(total(w4));
    expect(first(log, 'waveWarning')!.e.sides).toHaveLength(w4.sides);
    expect(new Set(first(log, 'waveWarning')!.e.sides).size).toBe(w4.sides);
    expect(kindCounts(world)).toEqual(nonZero(w4));
  });

  it.each([2, 3, 8])('spawns exactly the kinds listed for wave %i', (n) => {
    const world = new World({ seed: 2, god: true, startWave: n });
    const w = LEVEL1_WAVES[n - 1];
    record(world, WAVES.firstAt + total(w) * WAVES.spawnSpacing + 0.2);
    expect(kindCounts(world)).toEqual(nonZero(w));
  });

  it('clamps startWave into the table', () => {
    const world = new World({ seed: 1, god: true, startWave: 99 });
    const log = record(world, WAVES.firstAt + 0.2);
    expect(first(log, 'waveStart')!.e.wave).toBe(LEVEL1_WAVES.length);
  });

  it('progresses through every wave on the interval with the table sides and counts', () => {
    // A building-free map so idle waves cannot end the level (lost by town) before the last one.
    const world = new World({ seed: 2, god: true, map: mapFromAscii(fieldRows(40)) });
    const log = record(world, WAVES.firstAt + WAVES.interval * (LEVEL1_WAVES.length - 1) + 0.5);
    const starts = all(log, 'waveStart');
    expect(starts.map((s) => s.e.wave)).toEqual(LEVEL1_WAVES.map((_, k) => k + 1));
    starts.forEach((s, k) => {
      expect(Math.abs(s.t - (WAVES.firstAt + k * WAVES.interval))).toBeLessThanOrEqual(1.5 * DT);
      expect(s.e.count).toBe(total(LEVEL1_WAVES[k]));
    });
    expect(all(log, 'waveWarning').map((x) => x.e.sides.length)).toEqual(LEVEL1_WAVES.map((w) => w.sides));
    expect(world.wave).toBe(LEVEL1_WAVES.length);
    expect(world.totalWaves).toBe(LEVEL1_WAVES.length);
  });

  it('starts no wave after the last one', () => {
    const world = new World({ seed: 2, god: true, startWave: LEVEL1_WAVES.length });
    const log = record(world, WAVES.firstAt + WAVES.interval * 2);
    expect(all(log, 'waveStart')).toHaveLength(1);
    expect(all(log, 'waveWarning')).toHaveLength(1);
  });
});

describe('custom wave tables (WorldOptions.waves)', () => {
  it('uses the supplied table for counts, kinds, sides and total', () => {
    const waves: WaveDef[] = [
      { monsters: { orc: 2 }, sides: 2 },
      { monsters: { brute: 1, zombie: 1 }, sides: 1 },
    ];
    const world = new World({ seed: 1, god: true, waves });
    expect(world.totalWaves).toBe(2);
    const log = record(world, WAVES.firstAt + 0.5);
    expect(first(log, 'waveWarning')!.e.sides).toHaveLength(2);
    expect(first(log, 'waveStart')!.e.count).toBe(2);
    expect(kindCounts(world)).toEqual({ orc: 2 });
    const log2 = record(world, WAVES.interval);
    expect(first(log2, 'waveStart')!.e).toMatchObject({ wave: 2, count: 2 });
    expect(first(log2, 'waveWarning')!.e.sides).toHaveLength(1);
    expect(kindCounts(world)).toEqual({ orc: 2, brute: 1, zombie: 1 });
  });
});
