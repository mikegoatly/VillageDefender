// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { Hud, type HudWorld } from '../../src/ui/Hud';

function aHudWorld(o: Partial<HudWorld> & { standing?: number; total?: number } = {}): HudWorld {
  const { standing, total = 7, ...rest } = o;
  const s = standing ?? total;
  return {
    status: 'playing', lossReason: null, wave: 0, totalWaves: 8, time: 0, kills: 0, stars: 0,
    players: [{ hp: 10, maxHp: 10 }],
    buildings: Array.from({ length: total }, (_, id) => ({ id, hp: 10, maxHp: 10, ruined: id >= s })),
    ...rest,
  };
}

describe('Hud', () => {
  let root: HTMLElement;
  let hud: Hud;
  let onRetry: Mock<() => void>;
  let onNewTown: Mock<() => void>;

  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
    onRetry = vi.fn<() => void>();
    onNewTown = vi.fn<() => void>();
    hud = new Hud(root, { onRetry, onNewTown });
  });
  afterEach(() => hud.destroy());

  const text = (sel: string) => root.querySelector(sel)!.textContent;
  const panelShown = () => root.querySelector('.over')!.classList.contains('show');
  const press = (key: string, init: KeyboardEventInit = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key, ...init }));

  it('shows wave text, including final wave', () => {
    hud.update(aHudWorld({ wave: 0 }));
    expect(text('.wave')).toBe('Wave 0/8');
    hud.update(aHudWorld({ wave: 3 }));
    expect(text('.wave')).toBe('Wave 3/8');
    hud.update(aHudWorld({ wave: 8 }));
    expect(text('.wave')).toBe('Final wave!');
  });

  it('shows standing buildings and turns red below two thirds', () => {
    hud.update(aHudWorld({ standing: 5, total: 7 }));
    expect(text('.bld')).toContain('5/7');
    expect(root.querySelector('.bld')!.classList.contains('low')).toBe(false);
    hud.update(aHudWorld({ standing: 4, total: 7 }));
    expect(root.querySelector('.bld')!.classList.contains('low')).toBe(true);
  });

  it('flashes when the standing count drops, not otherwise', () => {
    const bar = root.querySelector('.bar')!;
    hud.update(aHudWorld({ standing: 7 }));
    hud.update(aHudWorld({ standing: 7 }));
    expect(bar.classList.contains('flash')).toBe(false);
    hud.update(aHudWorld({ standing: 6 }));
    expect(bar.classList.contains('flash')).toBe(true);
  });

  it('hides the panel while playing', () => {
    hud.update(aHudWorld());
    expect(panelShown()).toBe(false);
  });

  it.each([
    ['won', null, 'Village saved!'],
    ['lost', 'knight', 'The knight has fallen'],
    ['lost', 'town', 'The village is lost'],
  ] as const)('titles %s/%s', (status, lossReason, title) => {
    hud.update(aHudWorld({ status, lossReason }));
    expect(panelShown()).toBe(true);
    expect(text('.over h2')).toBe(title);
  });

  it.each([0, 1, 2, 3])('renders %i filled stars', (stars) => {
    hud.update(aHudWorld({ status: 'won', stars }));
    expect(root.querySelectorAll('.star').length).toBe(3);
    expect(root.querySelectorAll('.star.on').length).toBe(stars);
  });

  it('shows stats and builds the panel once per level end', () => {
    hud.update(aHudWorld({ status: 'won', wave: 8, kills: 42, time: 125, standing: 5, total: 7, stars: 2 }));
    expect(text('.s-bld')).toContain('5/7');
    expect(text('.s-time')).toContain('2:05');
    const star = root.querySelector('.star');
    hud.update(aHudWorld({ status: 'won', wave: 8, kills: 43, time: 126, standing: 5, total: 7, stars: 2 }));
    expect(root.querySelector('.star')).toBe(star);
    hud.update(aHudWorld());
    expect(panelShown()).toBe(false);
    expect(root.querySelector('.star')).toBeNull();
  });

  it('R and N call callbacks only while the panel is visible', () => {
    hud.update(aHudWorld());
    press('r');
    press('n');
    expect(onRetry).not.toHaveBeenCalled();
    expect(onNewTown).not.toHaveBeenCalled();

    hud.update(aHudWorld({ status: 'lost', lossReason: 'knight' }));
    press('r', { ctrlKey: true });
    expect(onRetry).not.toHaveBeenCalled();
    press('r');
    press('N');
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onNewTown).toHaveBeenCalledTimes(1);
  });

  it('buttons call callbacks', () => {
    hud.update(aHudWorld({ status: 'won' }));
    (root.querySelector('.retry') as HTMLElement).click();
    (root.querySelector('.newtown') as HTMLElement).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onNewTown).toHaveBeenCalledTimes(1);
  });

  it('destroy removes DOM and key listener', () => {
    hud.update(aHudWorld({ status: 'won' }));
    hud.destroy();
    expect(root.querySelector('.vd-hud')).toBeNull();
    press('r');
    expect(onRetry).not.toHaveBeenCalled();
  });
});
