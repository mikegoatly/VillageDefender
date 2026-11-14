import { describe, expect, it } from 'vitest';
import { directionFor } from '../src/render/sheets';

describe('directionFor', () => {
  it.each([
    [1, 0, 'E'],
    [1, 1, 'SE'],
    [0, 1, 'S'],
    [-1, 1, 'SW'],
    [-1, 0, 'W'],
    [-1, -1, 'NW'],
    [0, -1, 'N'],
    [1, -1, 'NE'],
  ])('screen vector (%d, %d) faces %s', (dx, dy, dir) => {
    expect(directionFor(dx, dy)).toBe(dir);
  });

  it('snaps to the nearest 45° sector', () => {
    expect(directionFor(1, 0.3)).toBe('E');
    expect(directionFor(1, 0.6)).toBe('SE');
    expect(directionFor(-1, -0.01)).toBe('W');
  });
});
