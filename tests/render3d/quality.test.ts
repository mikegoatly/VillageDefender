// The automatic quality step-down: fewer pixels once frames stay slow.

import { describe, expect, it } from 'vitest';
import { AUTO_DPR, PixelRatioGovernor } from '../../src/render3d/quality';

/** Feeds `seconds` of frames of `ms` each; returns every cap it stepped to. */
function run(g: PixelRatioGovernor, ms: number, seconds: number): number[] {
  const steps: number[] = [];
  for (let t = 0; t < seconds * 1000; t += ms) {
    const cap = g.frame(ms);
    if (cap !== null) steps.push(cap);
  }
  return steps;
}

describe('PixelRatioGovernor', () => {
  it('leaves fast frames alone', () => {
    const g = new PixelRatioGovernor(2, 2);
    expect(run(g, 16.7, 20)).toEqual([]);
    expect(g.cap).toBe(2);
  });

  it('steps down a window at a time while frames stay slow, never below the floor', () => {
    const g = new PixelRatioGovernor(2, 2);
    expect(run(g, 40, AUTO_DPR.window * 1.1)).toEqual([1.5]);
    expect(run(g, 40, 30)).toEqual([1]);
    expect(g.cap).toBe(AUTO_DPR.floor);
  });

  it('ignores hitches (a town loading) and very long frames (a hidden tab)', () => {
    const g = new PixelRatioGovernor(2, 2);
    for (let k = 0; k < 10; k++) g.frame(200);
    g.frame(5000);
    expect(run(g, 16.7, 10)).toEqual([]);
  });

  it('does nothing on a screen already at the floor', () => {
    const g = new PixelRatioGovernor(2, 1);
    expect(run(g, 60, 10)).toEqual([]);
  });
});
