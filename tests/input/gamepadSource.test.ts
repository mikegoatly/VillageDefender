import { describe, expect, it } from 'vitest';
import { GamepadSource } from '../../src/input/GamepadSource';
import { aPad, type FakePad } from '../helpers/pad';

/** A connected device with no standard buttons (virtual HID, wheel, etc.) that never moves. */
const idleDevice = (): FakePad => ({ id: 'Virtual HID Device', connected: true, axes: [0, 0], buttons: [] });

const source = (...pads: (FakePad | null)[]) => new GamepadSource(() => pads);

describe('GamepadSource', () => {
  it('reads the stick and buttons from a single pad', () => {
    const s = source(aPad(['a', 'b', 'lb'], [1, 0])).poll();
    expect(s.move).toEqual({ x: 1, y: 0 });
    expect(s).toMatchObject({ attack: true, dodge: true, rally: true });
  });

  it('reads a pad that is not in the first slot', () => {
    const s = source(idleDevice(), aPad(['a'], [-1, 0])).poll();
    expect(s.move).toEqual({ x: -1, y: 0 });
    expect(s.attack).toBe(true);
  });

  it('skips empty and disconnected slots', () => {
    const gone = { ...aPad(['b'], [0, 1]), connected: false };
    const s = source(null, gone, aPad(['x'], [0, -1])).poll();
    expect(s.move).toEqual({ x: 0, y: -1 });
    expect(s).toMatchObject({ dodge: false, ability1: true });
  });

  it('merges buttons across pads and takes the stick pushed furthest', () => {
    const s = source(aPad(['a'], [0.3, 0]), aPad(['y'], [0, 1])).poll();
    expect(s.move).toEqual({ x: 0, y: 1 });
    expect(s).toMatchObject({ attack: true, ability2: true });
  });

  it('lets the d-pad on any pad override the sticks', () => {
    const s = source(aPad([], [1, 0]), aPad(['up'])).poll();
    expect(s.move).toEqual({ x: 0, y: -1 });
  });
});
