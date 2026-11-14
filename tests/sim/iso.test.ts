import { describe, expect, it } from 'vitest';
import { groundDirToScreen, screenDirToGround } from '../../src/sim/iso';
import { angleDiff, angleOf } from '../helpers/assertions';

const EIGHT = Array.from({ length: 8 }, (_, k) => (k * Math.PI) / 4);
const RANDOM = [0.1, 0.77, 2.3, 4.01, 5.5].map((a) => a);

describe('iso direction conversion', () => {
  it.each([...EIGHT, ...RANDOM])('round-trips screen angle %f', (a) => {
    const s = { x: Math.cos(a), y: Math.sin(a) };
    const g = screenDirToGround(s.x, s.y);
    const back = groundDirToScreen(g.x, g.y);
    expect(angleDiff(angleOf(back), a)).toBeLessThan(1e-6);
  });

  it('preserves length for |v| <= 1', () => {
    for (const len of [0.1, 0.5, 1]) {
      for (const a of [...EIGHT, 0.3, 1.9]) {
        const g = screenDirToGround(Math.cos(a) * len, Math.sin(a) * len);
        expect(Math.hypot(g.x, g.y)).toBeCloseTo(len, 6);
      }
    }
  });

  it('clamps length to 1 above', () => {
    const g = screenDirToGround(3, -4);
    expect(Math.hypot(g.x, g.y)).toBeCloseTo(1, 6);
  });

  it('returns zero for zero input', () => {
    expect(screenDirToGround(0, 0)).toEqual({ x: 0, y: 0 });
  });
});
