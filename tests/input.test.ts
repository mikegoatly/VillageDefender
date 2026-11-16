// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { InputManager, mergeInputs } from '../src/input/InputManager';
import { applyRadialDeadzone } from '../src/input/GamepadSource';
import { TouchSource } from '../src/input/TouchSource';
import { emptyInput, type InputState } from '../src/sim/types';
import { aPad, type FakePad } from './helpers/pad';

function key(type: 'keydown' | 'keyup', code: string): KeyboardEvent {
  const e = new KeyboardEvent(type, { code, cancelable: true });
  window.dispatchEvent(e);
  return e;
}
const press = (code: string): KeyboardEvent => key('keydown', code);
const release = (code: string): KeyboardEvent => key('keyup', code);

function inputWith(patch: Partial<InputState>): InputState {
  return { ...emptyInput(), ...patch };
}

describe('InputManager keyboard', () => {
  let root: HTMLElement;
  let im: InputManager;
  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
    im = new InputManager({ root });
  });
  afterEach(() => {
    im.destroy();
    root.remove();
  });

  it('normalises diagonals to length 1', () => {
    press('KeyW');
    press('KeyD');
    const m = im.poll().move;
    expect(Math.hypot(m.x, m.y)).toBeCloseTo(1);
    expect(m.x).toBeGreaterThan(0);
    expect(m.y).toBeLessThan(0);
  });

  it('maps W/Up to y -1 and cancels opposing keys', () => {
    press('ArrowUp');
    expect(im.poll().move).toEqual({ x: 0, y: -1 });
    press('KeyS');
    expect(im.poll().move).toEqual({ x: 0, y: 0 });
  });

  it('release clears the key', () => {
    press('KeyA');
    expect(im.poll().move.x).toBe(-1);
    release('KeyA');
    expect(im.poll().move).toEqual({ x: 0, y: 0 });
  });

  it('window blur clears all keys', () => {
    press('KeyD');
    press('Space');
    window.dispatchEvent(new Event('blur'));
    const s = im.poll();
    expect(s.move).toEqual({ x: 0, y: 0 });
    expect(s.attack).toBe(false);
  });

  it('maps buttons and prevents default on arrows/space', () => {
    const space = press('Space');
    expect(space.defaultPrevented).toBe(true);
    press('ShiftLeft');
    press('KeyQ');
    press('KeyE');
    press('KeyR');
    press('Escape');
    expect(im.poll()).toMatchObject({ attack: true, dodge: true, ability1: true, ability2: true, rally: true, pause: true });
  });

  it('override replaces real input; clearing restores it', () => {
    press('KeyD');
    im.setOverride(inputWith({ move: { x: 0, y: 1 }, rally: true }));
    const s = im.poll();
    expect(s.move).toEqual({ x: 0, y: 1 });
    expect(s.rally).toBe(true);
    im.setOverride(null);
    expect(im.poll().move).toEqual({ x: 1, y: 0 });
  });

  it('alwaysAttack forces attack', () => {
    expect(im.poll().attack).toBe(false);
    im.setAlwaysAttack(true);
    expect(im.poll().attack).toBe(true);
  });

  it('fires onDeviceChange for touch, and stops after unsubscribe', () => {
    const seen: string[] = [];
    const off = im.onDeviceChange((d) => seen.push(d));
    const e = new Event('pointerdown') as Event & { pointerType: string };
    e.pointerType = 'touch';
    root.dispatchEvent(e);
    expect(im.activeDevice).toBe('touch');
    expect(seen).toEqual(['touch']);
    off();
    press('KeyW');
    im.poll();
    expect(im.activeDevice).toBe('keyboard');
    expect(seen).toEqual(['touch']);
  });
});

describe('mergeInputs', () => {
  it('touch move beats keyboard move regardless of order', () => {
    const merged = mergeInputs([
      { device: 'keyboard', state: inputWith({ move: { x: 1, y: 0 } }) },
      { device: 'touch', state: inputWith({ move: { x: 0, y: 0.5 } }) },
    ]);
    expect(merged.move).toEqual({ x: 0, y: 0.5 });
  });

  it('falls through to lower priority when higher has no move', () => {
    const merged = mergeInputs([
      { device: 'touch', state: emptyInput() },
      { device: 'gamepad', state: emptyInput() },
      { device: 'keyboard', state: inputWith({ move: { x: -1, y: 0 } }) },
    ]);
    expect(merged.move).toEqual({ x: -1, y: 0 });
  });

  it('ORs buttons across devices', () => {
    const merged = mergeInputs([
      { device: 'keyboard', state: inputWith({ attack: true }) },
      { device: 'gamepad', state: inputWith({ dodge: true }) },
      { device: 'touch', state: inputWith({ pause: true }) },
    ]);
    expect(merged).toMatchObject({ attack: true, dodge: true, pause: true, rally: false });
  });
});

describe('applyRadialDeadzone', () => {
  it('zeroes inside the deadzone', () => {
    expect(applyRadialDeadzone(0.1, 0.1, 0.2)).toEqual({ x: 0, y: 0 });
  });
  it('ramps from 0 at the edge to 1 at full tilt', () => {
    const edge = applyRadialDeadzone(0.2001, 0, 0.2);
    expect(edge.x).toBeGreaterThanOrEqual(0);
    expect(edge.x).toBeLessThan(0.01);
    expect(applyRadialDeadzone(1, 0, 0.2).x).toBeCloseTo(1);
    expect(applyRadialDeadzone(0.6, 0, 0.2).x).toBeCloseTo(0.5);
  });
  it('preserves direction and clamps magnitude to 1', () => {
    const v = applyRadialDeadzone(1, 1, 0.2);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1);
    expect(v.x).toBeCloseTo(v.y);
    expect(applyRadialDeadzone(-0.6, 0, 0.2).x).toBeCloseTo(-0.5);
  });
});

describe('TouchSource rally button', () => {
  let root: HTMLElement;
  let ts: TouchSource;
  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
    ts = new TouchSource(root);
  });
  afterEach(() => {
    ts.destroy();
    root.remove();
  });
  const fire = (el: Element, type: string, pointerId = 1) => {
    const e = new Event(type, { bubbles: true, cancelable: true }) as Event & { pointerId: number };
    e.pointerId = pointerId;
    el.dispatchEvent(e);
  };

  it('renders a rally button and holds rally while pressed', () => {
    const btn = root.querySelector('.vd-touch-rally')!;
    expect(btn.textContent).toBe('⚑');
    expect(ts.poll().rally).toBe(false);
    fire(btn, 'pointerdown');
    expect(ts.poll().rally).toBe(true);
    expect(btn.classList.contains('vd-pressed')).toBe(true);
    expect(ts.hasInput()).toBe(true);
    fire(btn, 'pointerup');
    expect(ts.poll().rally).toBe(false);
    expect(btn.classList.contains('vd-pressed')).toBe(false);
  });

  it('hiding the overlay releases rally', () => {
    fire(root.querySelector('.vd-touch-rally')!, 'pointerdown');
    ts.setVisible(false);
    expect(ts.poll().rally).toBe(false);
  });
});

describe('InputManager touch buttons as a controller legend', () => {
  let root: HTMLElement;
  let im: InputManager;
  let pads: (FakePad | null)[];
  const realGetPads = navigator.getGamepads;
  const overlay = () => root.querySelector('.vd-touch')!;
  const btn = (name: string) => root.querySelector(`.vd-touch-${name}`)!;
  beforeEach(() => {
    pads = [];
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => pads });
    root = document.createElement('div');
    document.body.appendChild(root);
    im = new InputManager({ root });
  });
  afterEach(() => {
    im.destroy();
    root.remove();
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: realGetPads });
  });

  it('shows the buttons, badged with their pad glyphs, once a pad is used', () => {
    expect(overlay().classList.contains('vd-touch-on')).toBe(false);
    pads = [aPad([], [1, 0])];
    im.poll();
    expect(im.activeDevice).toBe('gamepad');
    expect(overlay().classList.contains('vd-touch-on')).toBe(true);
    expect(overlay().classList.contains('vd-touch-pad')).toBe(true);
    const badge = (name: string) => (btn(name).querySelector('.vd-touch-glyph') as HTMLElement).dataset.btn;
    expect([badge('attack'), badge('dodge'), badge('rally')]).toEqual(['a', 'b', 'lb']);
  });

  it('lights a button while its pad button is held', () => {
    pads = [aPad(['b'])];
    im.poll();
    expect(btn('dodge').classList.contains('vd-pressed')).toBe(true);
    expect(btn('attack').classList.contains('vd-pressed')).toBe(false);
    pads = [aPad([])];
    im.poll();
    expect(btn('dodge').classList.contains('vd-pressed')).toBe(false);
  });

  it('hides them again when the keyboard is used', () => {
    pads = [aPad(['a'])];
    im.poll();
    pads = [aPad([])];
    im.poll();
    press('KeyW');
    im.poll();
    release('KeyW');
    expect(overlay().classList.contains('vd-touch-on')).toBe(false);
    expect(btn('attack').classList.contains('vd-pressed')).toBe(false);
  });
});
