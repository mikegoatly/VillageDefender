// Helpers for profile / run-result tests.

import type { RunResult } from '../../src/data/achievements';
import type { KeyValueStore } from '../../src/meta/profile';

/** In-memory KeyValueStore; `data` is exposed so tests can inspect or corrupt what was saved. */
export function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, get: (k) => data.get(k) ?? null, set: (k, v) => void data.set(k, v) };
}

/** A losing, zero-everything run; override what the test cares about. */
export function aRun(over: Partial<RunResult> = {}): RunResult {
  return { townId: 'village', won: false, stars: 0, standing: 0, totalBuildings: 6, knightLevel: 1, kills: {}, coins: 0, ...over };
}
