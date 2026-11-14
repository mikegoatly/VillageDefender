// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { Hud, type HudWorld } from '../../src/ui/Hud';

function aHudWorld(o: Partial<HudWorld> & { standing?: number; total?: number } = {}): HudWorld {
  const { standing, total = 7, ...rest } = o;
  const s = standing ?? total;
  return {
    status: 'playing', lossReason: null, wave: 0, totalWaves: 8, time: 0, kills: 0, stars: 0,
    knightLevel: 1, xp: 0, xpToNext: 10, rookies: 0, rookieCap: 3,
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

  it('shows level label and XP bar width', () => {
    hud.update(aHudWorld({ knightLevel: 4, xp: 5, xpToNext: 20 }));
    expect(text('.lv')).toBe('Lv 4');
    expect((root.querySelector('.xp > div') as HTMLElement).style.width).toBe('25%');
    hud.update(aHudWorld({ xp: 99, xpToNext: 20 }));
    expect((root.querySelector('.xp > div') as HTMLElement).style.width).toBe('100%');
    hud.update(aHudWorld({ xp: 5, xpToNext: 0 }));
    expect((root.querySelector('.xp > div') as HTMLElement).style.width).toBe('0%');
  });

  it('shows rookie count and cap', () => {
    hud.update(aHudWorld({ rookies: 2, rookieCap: 4 }));
    expect(text('.rookies')).toBe('⛑ 2/4');
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

  describe('endExtras', () => {
    const extras = {
      coins: 12, wallet: 40,
      achievements: [{ name: 'Slayer', description: 'Kill 100 monsters' }],
      unlocks: ['Smithy'],
    };

    it('shows coins, achievements and unlocks when the run ended', () => {
      hud.update(aHudWorld({ status: 'won', endExtras: extras }));
      expect(text('.extras .coins')).toBe('+12 coins (wallet 40)');
      expect(text('.extras .ach')).toBe('Achievement: Slayer — Kill 100 monsters');
      expect(text('.extras .unlock')).toBe('Unlocked: Smithy');
    });

    it('omits the unlock line when nothing unlocked', () => {
      hud.update(aHudWorld({ status: 'lost', lossReason: 'knight', endExtras: { ...extras, achievements: [], unlocks: [] } }));
      expect(text('.extras .coins')).toContain('+12 coins');
      expect(root.querySelector('.extras .ach')).toBeNull();
      expect(root.querySelector('.extras .unlock')).toBeNull();
    });

    it('renders extras that arrive a frame after the end, without rebuilding the panel', () => {
      hud.update(aHudWorld({ status: 'won' }));
      expect(root.querySelector('.extras .coins')).toBeNull();
      const star = root.querySelector('.star');
      hud.update(aHudWorld({ status: 'won', endExtras: extras }));
      expect(text('.extras .coins')).toBe('+12 coins (wallet 40)');
      expect(root.querySelector('.star')).toBe(star);
    });

    it('is not shown while playing and resets for the next run', () => {
      hud.update(aHudWorld({ endExtras: extras }));
      expect(root.querySelector('.extras')).toBeNull();
      hud.update(aHudWorld({ status: 'won', endExtras: extras }));
      hud.update(aHudWorld());
      hud.update(aHudWorld({ status: 'won' }));
      expect(root.querySelector('.extras .coins')).toBeNull();
      hud.update(aHudWorld({ status: 'won', endExtras: { ...extras, coins: 5 } }));
      expect(text('.extras .coins')).toContain('+5 coins');
    });
  });

  describe('boss bar', () => {
    const boss = (hp: number, maxHp = 100) => ({ name: 'Orc Warlord', hp, maxHp });
    const bossEl = () => root.querySelector('.boss')!;
    const fill = () => (root.querySelector('.boss .bfill') as HTMLElement).style.width;
    const trail = () => (root.querySelector('.boss .btrail') as HTMLElement).style.width;
    const banner = () => root.querySelector('.boss-banner')!;

    afterEach(() => vi.useRealTimers());

    it('is hidden when the boss is omitted, null or dead', () => {
      hud.update(aHudWorld());
      expect(bossEl().classList.contains('show')).toBe(false);
      hud.update(aHudWorld({ boss: null }));
      expect(bossEl().classList.contains('show')).toBe(false);
      hud.update(aHudWorld({ boss: boss(0) }));
      expect(bossEl().classList.contains('show')).toBe(false);
      expect(banner().classList.contains('show')).toBe(false);
    });

    it('shows the upper-cased name and fill width, then hides on death', () => {
      hud.update(aHudWorld({ boss: boss(50) }));
      expect(bossEl().classList.contains('show')).toBe(true);
      expect(text('.bname')).toBe('ORC WARLORD');
      expect(parseFloat(fill())).toBeCloseTo(50);
      hud.update(aHudWorld({ boss: boss(25) }));
      expect(parseFloat(fill())).toBeCloseTo(25);
      expect(parseFloat(trail())).toBeCloseTo(25);
      hud.update(aHudWorld({ boss: boss(0) }));
      expect(bossEl().classList.contains('show')).toBe(false);
    });

    it('trail has a delayed transition and the bar is sized min(560px, 70vw)', () => {
      hud.update(aHudWorld({ boss: boss(100) }));
      const css = document.getElementById('vd-hud-style')!.textContent!;
      expect(css).toMatch(/\.btrail \{[^}]*transition: width 300ms ease-out 400ms/);
      expect(css).toMatch(/\.boss \{[^}]*width: min\(560px, 70vw\)/);
    });

    it('shows the arrival banner for 2.5 s, once per appearance', () => {
      vi.useFakeTimers();
      hud.update(aHudWorld({ boss: boss(100) }));
      expect(banner().textContent).toBe('The Orc Warlord approaches!');
      expect(banner().classList.contains('show')).toBe(true);
      vi.advanceTimersByTime(2499);
      expect(banner().classList.contains('show')).toBe(true);
      vi.advanceTimersByTime(1);
      expect(banner().classList.contains('show')).toBe(false);
      hud.update(aHudWorld({ boss: boss(90) }));
      expect(banner().classList.contains('show')).toBe(false);
      hud.update(aHudWorld({ boss: null }));
      hud.update(aHudWorld({ boss: boss(100) }));
      expect(banner().classList.contains('show')).toBe(true);
    });
  });

  it('destroy removes DOM and key listener', () => {
    hud.update(aHudWorld({ status: 'won' }));
    hud.destroy();
    expect(root.querySelector('.vd-hud')).toBeNull();
    press('r');
    expect(onRetry).not.toHaveBeenCalled();
  });
});
