// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { LevelUpPanel } from '../../src/ui/LevelUpPanel';
import type { UpgradeOffer } from '../../src/data/upgrades';

function anOffer(o: Partial<UpgradeOffer> = {}): UpgradeOffer {
  return { id: 'blade', name: 'Sharpened Blade', description: '+20% sword damage', pool: 'knight', level: 1, max: 5, ...o };
}
const OFFERS: UpgradeOffer[] = [
  anOffer(),
  anOffer({ id: 'recruit', name: 'Recruitment Drive', description: 'Fewer kills', pool: 'army', level: 0, max: 3 }),
  anOffer({ id: 'walls', name: 'Reinforced Walls', description: 'More HP', pool: 'town', level: 2, max: 3 }),
];

describe('LevelUpPanel', () => {
  let root: HTMLElement;
  let panel: LevelUpPanel;
  let onChoose: Mock<(i: number) => void>;
  let clock: number;
  let rafQueue: Map<number, FrameRequestCallback>;
  let rafId: number;
  let pad: { connected: boolean; axes: number[]; buttons: { pressed: boolean }[] } | null;

  const step = () => {
    const q = [...rafQueue.entries()];
    rafQueue.clear();
    for (const [, cb] of q) cb(clock);
  };
  const press = (key: string, init: KeyboardEventInit = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true, ...init }));
  const cards = () => [...root.querySelectorAll<HTMLElement>('.card')];
  const focused = () => cards().findIndex((c) => c.classList.contains('focus'));
  const ready = () => { clock += 301; };
  const setPad = (buttons: Record<number, boolean> = {}, axes: number[] = [0, 0]) => {
    const b = Array.from({ length: 16 }, (_, i) => ({ pressed: !!buttons[i] }));
    pad = { connected: true, axes, buttons: b };
  };

  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
    clock = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    rafQueue = new Map();
    rafId = 0;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { rafQueue.set(++rafId, cb); return rafId; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => { rafQueue.delete(id); });
    pad = null;
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
    onChoose = vi.fn<(i: number) => void>();
    panel = new LevelUpPanel(root, onChoose);
  });
  afterEach(() => {
    panel.destroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders title, 3 cards with name, description, badge and pips', () => {
    panel.show(OFFERS, 4);
    expect(panel.visible).toBe(true);
    expect(root.querySelector('h2')!.textContent).toBe('Level 4!');
    expect(root.textContent).toContain('Choose an upgrade');
    const cs = cards();
    expect(cs).toHaveLength(3);
    expect(cs[0].querySelector('.name')!.textContent).toBe('Sharpened Blade');
    expect(cs[0].querySelector('.desc')!.textContent).toBe('+20% sword damage');
    expect(cs.map((c) => c.querySelector('.badge')!.textContent)).toEqual(['Knight', 'Army', 'Town']);
    expect(cs[0].querySelectorAll('.pip.on')).toHaveLength(1);
    expect(cs[0].querySelectorAll('.pip.next')).toHaveLength(1);
    expect(cs[0].querySelectorAll('.pip.off')).toHaveLength(3);
    expect(cs[1].querySelectorAll('.pip.on')).toHaveLength(0);
    expect(cs[2].querySelectorAll('.pip')).toHaveLength(3);
  });

  it('defaults focus to the middle card', () => {
    panel.show(OFFERS, 2);
    expect(focused()).toBe(1);
  });

  it.each([[0], [1], [2]])('key %i chooses that card', (i) => {
    panel.show(OFFERS, 2);
    ready();
    press(String(i + 1));
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith(i);
    expect(panel.visible).toBe(false);
  });

  it('arrows / A / D move focus (clamped) and Enter or Space choose', () => {
    panel.show(OFFERS, 2);
    ready();
    press('ArrowLeft');
    expect(focused()).toBe(0);
    press('ArrowLeft');
    expect(focused()).toBe(0);
    press('d');
    press('ArrowRight');
    press('ArrowRight');
    expect(focused()).toBe(2);
    press('Enter');
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith(2);
    panel.show(OFFERS.map((o) => ({ ...o, level: o.level + 1 })), 3);
    ready();
    press(' ');
    expect(onChoose).toHaveBeenLastCalledWith(1);
  });

  it('click chooses', () => {
    panel.show(OFFERS, 2);
    ready();
    cards()[2].click();
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith(2);
  });

  it('ignores input during the first 300 ms', () => {
    panel.show(OFFERS, 2);
    clock += 299;
    press('1');
    press('Enter');
    cards()[0].click();
    expect(onChoose).not.toHaveBeenCalled();
    expect(panel.visible).toBe(true);
    clock += 1;
    press('1');
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith(0);
  });

  it('fires onChoose only once for repeated input', () => {
    panel.show(OFFERS, 2);
    ready();
    press('1');
    press('2');
    cards()[0].click();
    expect(onChoose).toHaveBeenCalledTimes(1);
  });

  it('show is idempotent for the same offers (does not reset the guard)', () => {
    panel.show(OFFERS, 2);
    ready();
    panel.show(OFFERS.map((o) => ({ ...o })), 2);
    press('3');
    expect(onChoose).toHaveBeenCalledWith(2);
  });

  it('hide / visible and no key handling when hidden', () => {
    panel.show(OFFERS, 2);
    ready();
    panel.hide();
    expect(panel.visible).toBe(false);
    expect(root.querySelector('.vd-levelup')!.classList.contains('show')).toBe(false);
    press('1');
    expect(onChoose).not.toHaveBeenCalled();
  });

  it('destroy removes DOM, key listener and rAF loop', () => {
    panel.show(OFFERS, 2);
    ready();
    panel.destroy();
    expect(root.querySelector('.vd-levelup')).toBeNull();
    expect(rafQueue.size).toBe(0);
    press('1');
    expect(onChoose).not.toHaveBeenCalled();
  });

  describe('gamepad', () => {
    it('a direction held from before show is ignored until released', () => {
      setPad({ 14: true });
      panel.show(OFFERS, 2);
      ready();
      step();
      expect(focused()).toBe(1);
      setPad({});
      step();
      setPad({ 14: true });
      step();
      expect(focused()).toBe(0);
    });

    it('D-pad and stick move focus on edges only', () => {
      setPad({});
      panel.show(OFFERS, 2);
      ready();
      step();
      setPad({ 14: true });
      step();
      expect(focused()).toBe(0);
      step(); // still held: no further move
      expect(focused()).toBe(0);
      setPad({ 15: true });
      step();
      expect(focused()).toBe(1);
      setPad({}, [0.4, 0]);
      step();
      expect(focused()).toBe(1);
      setPad({}, [0.8, 0]);
      step();
      expect(focused()).toBe(2);
      step();
      expect(focused()).toBe(2);
    });

    it('A held from before show does not choose; release then press does', () => {
      setPad({ 0: true });
      panel.show(OFFERS, 2);
      ready();
      step();
      step();
      expect(onChoose).not.toHaveBeenCalled();
      setPad({});
      step();
      expect(onChoose).not.toHaveBeenCalled();
      setPad({ 0: true });
      step();
      expect(onChoose).toHaveBeenCalledTimes(1);
      expect(onChoose).toHaveBeenCalledWith(1);
      expect(panel.visible).toBe(false);
    });

    it('A pressed within 300 ms is ignored', () => {
      setPad({});
      panel.show(OFFERS, 2);
      step();
      setPad({ 0: true });
      clock += 100;
      step();
      expect(onChoose).not.toHaveBeenCalled();
    });

    it('chooses the focused card after moving', () => {
      setPad({});
      panel.show(OFFERS, 2);
      ready();
      step();
      setPad({ 14: true });
      step();
      setPad({ 0: true });
      step();
      expect(onChoose).toHaveBeenCalledTimes(1);
      expect(onChoose).toHaveBeenCalledWith(0);
    });
  });
});
