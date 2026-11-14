import { describe, expect, it } from 'vitest';
import { clearLine, Pather } from '../../src/sim/pather';
import { isWalkable } from '../../src/sim/map';
import { fieldRows, mapFromAscii } from '../helpers/mapBuilder';

// A 2x2 building at (10..11, 10..11) in a 30x30 field.
const map = () => mapFromAscii(fieldRows(30, [{ id: 0, i: 10, j: 10, w: 2, h: 2 }]));

describe('clearLine', () => {
  it('is true across open ground and false through a building', () => {
    const m = map();
    expect(clearLine(m, 2, 2, 20, 2, 0.2)).toBe(true);
    expect(clearLine(m, 7, 10.5, 14, 10.5, 0.2)).toBe(false);
  });

  it('accounts for the radius: a line grazing a wall is blocked for a fat unit only', () => {
    const m = map();
    // Passes 0.3 above the building edge (y = 9.5): fine for a thin unit, blocked for radius 0.45.
    expect(clearLine(m, 7, 9.2, 14, 9.2, 0.05)).toBe(true);
    expect(clearLine(m, 7, 9.2, 14, 9.2, 0.45)).toBe(false);
  });

  it('is true for a zero-length line', () => {
    expect(clearLine(map(), 3, 3, 3, 3, 0.2)).toBe(true);
  });
});

describe('Pather', () => {
  it('heads straight at the target when the line is clear', () => {
    const d = new Pather(map()).dirTo(2, 2, 12, 2, 0.2, 0);
    expect(d.x).toBeCloseTo(1);
    expect(d.y).toBeCloseTo(0);
  });

  it('returns a zero vector when already on the target', () => {
    expect(new Pather(map()).dirTo(5, 5, 5, 5, 0.2, 0)).toEqual({ x: 0, y: 0 });
  });

  it('routes around an obstacle and eventually arrives', () => {
    const m = map();
    const p = new Pather(m);
    let [x, y] = [7.5, 10.5];
    const [tx, ty] = [14, 10.5];
    let t = 0;
    let steered = false;
    for (let k = 0; k < 600 && Math.hypot(tx - x, ty - y) > 0.3; k++) {
      t += 1 / 60;
      const d = p.dirTo(x, y, tx, ty, 0.23, t);
      if (Math.abs(d.y) > 0.3) steered = true;
      x += d.x * 2.7 / 60;
      y += d.y * 2.7 / 60;
      expect(isWalkable(m, Math.round(x), Math.round(y))).toBe(true);
    }
    expect(steered).toBe(true);
    expect(Math.hypot(tx - x, ty - y)).toBeLessThanOrEqual(0.3);
  });

  it('retargets a goal inside a blocked cell to the nearest walkable neighbour', () => {
    const m = map();
    const p = new Pather(m);
    const d = p.dirTo(7.5, 10.5, 10.5, 10.5, 0.2, 0); // target is inside the building
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1);
  });
});
