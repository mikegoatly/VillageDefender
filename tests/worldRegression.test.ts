import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { emptyInput } from '../src/sim/types';
import { Ground, inBounds, type TownMap } from '../src/sim/map';

/** Square all-grass map with no obstacles. */
function openMap(size: number): TownMap {
  const ground = new Uint8Array(size * size).fill(Ground.Grass);
  const edges: TownMap['edges'] = { top: [], right: [], bottom: [], left: [] };
  for (let k = 0; k < size; k++) edges.top.push([k, 0]);
  return { seed: 0, size, centre: Math.floor(size / 2), ground, blocked: new Uint8Array(size * size), buildings: [], decor: [], edges };
}

describe('World regressions', () => {
  it('knight swinging with no enemies around never damages itself', () => {
    const w = new World({ seed: 1, noWaves: true });
    const input = { ...emptyInput(), attack: true };
    for (let t = 0; t < 600; t++) w.tick([input]);
    expect(w.players[0].hp).toBe(w.players[0].maxHp);
    expect(w.events.some((e) => e.type === 'hit' && e.unit === w.players[0].id)).toBe(false);
  });

  it('monsters never stand on cells outside the map', () => {
    const w = new World({ seed: 2, god: true, startWave: 6 });
    for (let t = 0; t < 60 * 30; t++) {
      // Hold attack so knockback is exercised near the edges too.
      w.tick([{ ...emptyInput(), attack: true }]);
      for (const m of w.monsters) {
        expect(inBounds(w.map, Math.round(m.x), Math.round(m.y)), `monster ${m.id} at ${m.x.toFixed(2)},${m.y.toFixed(2)} t=${w.time.toFixed(2)}`).toBe(true);
      }
    }
  });

  it('a crowd chasing a knight in the open does not queue in single file', () => {
    // 3x5 block of zombies 7 cells from the knight, open ground, no buildings in the way.
    const w = new World({ seed: 1, noWaves: true, god: true, map: openMap(30) });
    const k = w.players[0];
    k.x = 15;
    k.y = 22;
    for (let a = 0; a < 3; a++) for (let b = 0; b < 5; b++) w.addMonster(13 + b, 13 + a);
    for (let t = 0; t < 60 * 6; t++) w.tick([emptyInput()]);
    const close = w.monsters.filter((m) => Math.hypot(m.x - k.x, m.y - k.y) < 2.2).length;
    expect(close).toBeGreaterThanOrEqual(10);
  });

  it('auto-aim never targets a player', () => {
    const w = new World({ seed: 1, noWaves: true });
    const k = w.players[0];
    for (let t = 0; t < 5; t++) w.tick([emptyInput()]);
    expect(w.nearestMonster(k.x, k.y, 5)).toBeNull();
  });
});
