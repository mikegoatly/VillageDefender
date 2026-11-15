// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { PAD_REPEAT_DELAY_MS, PAD_REPEAT_RATE_MS, PadNav, padStyleOf } from '../../src/input/PadNav';
import { aPad, type FakePad } from '../helpers/pad';

describe('PadNav', () => {
  let pads: (FakePad | null)[];
  let nav: PadNav;
  const set = (...p: (FakePad | null)[]) => { pads = p; };
  beforeEach(() => {
    delete document.documentElement.dataset.input;
    delete document.documentElement.dataset.pad;
    pads = [aPad()];
    nav = new PadNav(() => pads);
  });

  describe('buttons', () => {
    it('fires on the rising edge only once', () => {
      nav.poll(0);
      set(aPad(['a']));
      expect(nav.poll(10).pressed.has('a')).toBe(true);
      expect(nav.poll(20).pressed.has('a')).toBe(false);
    });

    it('fires again after release and re-press', () => {
      nav.poll(0);
      set(aPad(['b']));
      nav.poll(10);
      set(aPad());
      nav.poll(20);
      set(aPad(['b']));
      expect(nav.poll(30).pressed.has('b')).toBe(true);
    });

    it('a button held at construction does not fire until released and pressed again', () => {
      set(aPad(['a']));
      expect(nav.poll(0).pressed.has('a')).toBe(false);
      expect(nav.poll(10).pressed.has('a')).toBe(false);
      set(aPad());
      nav.poll(20);
      set(aPad(['a']));
      expect(nav.poll(30).pressed.has('a')).toBe(true);
    });

    it('a button held across reset() is ignored until released', () => {
      nav.poll(0);
      set(aPad(['a']));
      expect(nav.poll(10).pressed.has('a')).toBe(true);
      nav.reset();
      expect(nav.poll(20).pressed.has('a')).toBe(false);
      expect(nav.poll(30).pressed.has('a')).toBe(false);
      set(aPad());
      nav.poll(40);
      set(aPad(['a']));
      expect(nav.poll(50).pressed.has('a')).toBe(true);
    });

    it('reports connection state', () => {
      expect(nav.poll(0).connected).toBe(true);
      set(null);
      expect(nav.poll(10).connected).toBe(false);
    });

    it('sees a button on a second pad when the first is null or idle', () => {
      set(null, aPad());
      nav.poll(0);
      set(null, aPad(['x']));
      expect(nav.poll(10).pressed.has('x')).toBe(true);
      set(aPad(), aPad());
      nav.poll(20);
      set(aPad(), aPad(['y']));
      expect(nav.poll(30).pressed.has('y')).toBe(true);
    });
  });

  describe('d-pad direction', () => {
    it('fires once on press, then repeats after the delay at the repeat rate', () => {
      nav.poll(0);
      set(aPad(['down']));
      expect(nav.poll(100).dir).toBe('down');
      expect(nav.poll(100 + PAD_REPEAT_DELAY_MS - 1).dir).toBeNull();
      expect(nav.poll(100 + PAD_REPEAT_DELAY_MS).dir).toBe('down');
      expect(nav.poll(100 + PAD_REPEAT_DELAY_MS + PAD_REPEAT_RATE_MS - 1).dir).toBeNull();
      expect(nav.poll(100 + PAD_REPEAT_DELAY_MS + PAD_REPEAT_RATE_MS).dir).toBe('down');
    });

    it.each(['up', 'down', 'left', 'right'] as const)('reports %s', (d) => {
      nav.poll(0);
      set(aPad([d]));
      expect(nav.poll(10).dir).toBe(d);
    });

    it('releasing and pressing again fires immediately', () => {
      nav.poll(0);
      set(aPad(['left']));
      nav.poll(10);
      set(aPad());
      expect(nav.poll(20).dir).toBeNull();
      set(aPad(['left']));
      expect(nav.poll(30).dir).toBe('left');
    });

    it('a direction held across reset() is ignored until neutral is seen', () => {
      nav.poll(0);
      set(aPad(['right']));
      nav.reset();
      expect(nav.poll(10).dir).toBeNull();
      expect(nav.poll(10 + PAD_REPEAT_DELAY_MS + 5).dir).toBeNull();
      set(aPad());
      nav.poll(1000);
      set(aPad(['right']));
      expect(nav.poll(1010).dir).toBe('right');
    });

    it('a direction held at construction is ignored until neutral', () => {
      set(aPad(['up']));
      expect(nav.poll(0).dir).toBeNull();
      expect(nav.poll(1000).dir).toBeNull();
    });
  });

  describe('left stick', () => {
    const stick = (x: number, y: number) => set(aPad([], [x, y]));
    beforeEach(() => { nav.poll(0); });

    it('fires at 0.6 and picks the dominant axis', () => {
      stick(0.6, 0);
      expect(nav.poll(10).dir).toBe('right');
      stick(0, 0);
      nav.poll(20);
      stick(-0.7, 0.6);
      expect(nav.poll(30).dir).toBe('left');
      stick(0, 0);
      nav.poll(40);
      stick(0.2, -0.9);
      expect(nav.poll(50).dir).toBe('up');
      stick(0, 0);
      nav.poll(60);
      stick(0.1, 0.9);
      expect(nav.poll(70).dir).toBe('down');
    });

    it('does not fire below the press threshold', () => {
      stick(0.4, 0);
      expect(nav.poll(10).dir).toBeNull();
    });

    it('hysteresis: staying at 0.4 neither re-fires nor releases; 0.2 releases', () => {
      stick(0.6, 0);
      expect(nav.poll(10).dir).toBe('right');
      stick(0.4, 0);
      expect(nav.poll(20).dir).toBeNull();
      expect(nav.poll(30).dir).toBeNull();
      // a repeat after the delay proves the direction never released
      expect(nav.poll(10 + PAD_REPEAT_DELAY_MS).dir).toBe('right');
      stick(0.2, 0);
      expect(nav.poll(1000).dir).toBeNull();
      stick(0.6, 0);
      expect(nav.poll(1010).dir).toBe('right'); // fresh press after release
    });
  });

  describe('input mode', () => {
    it('does nothing to the document while idle', () => {
      nav.poll(0);
      expect(document.documentElement.dataset.input).toBeUndefined();
    });

    it('marks gamepad mode and pad style on activity', () => {
      nav.poll(0);
      set(aPad(['a']));
      nav.poll(10);
      expect(document.documentElement.dataset.input).toBe('gamepad');
      expect(document.documentElement.dataset.pad).toBe('xbox');
    });

    it.each([
      ['DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', 'ps'],
      ['Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)', 'switch'],
    ])('sets data-pad from id %s', (id, style) => {
      nav.poll(0);
      set(aPad(['b'], [0, 0], id));
      nav.poll(10);
      expect(document.documentElement.dataset.pad).toBe(style);
    });

    it('stick movement counts as activity', () => {
      nav.poll(0);
      set(aPad([], [0.9, 0]));
      nav.poll(10);
      expect(document.documentElement.dataset.input).toBe('gamepad');
    });
  });
});

describe('padStyleOf', () => {
  it.each([
    ['Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', 'xbox'],
    ['DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', 'ps'],
    ['Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)', 'switch'],
    ['Some Unknown Pad', 'xbox'],
  ])('%s -> %s', (id, style) => {
    expect(padStyleOf(id)).toBe(style);
  });
});
