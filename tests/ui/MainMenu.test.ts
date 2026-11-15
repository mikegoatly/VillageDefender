// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { TOWNS } from '../../src/data/towns';
import { Profile } from '../../src/meta/profile';
import { MainMenu, MENU_INPUT_GUARD_MS, type AudioSettings, type MenuHost } from '../../src/ui/MainMenu';
import { memoryStore } from '../helpers/profile';
import { aPad, type FakePad } from '../helpers/pad';
import { PAD_REPEAT_DELAY_MS } from '../../src/input/PadNav';

describe('MainMenu', () => {
  let root: HTMLElement;
  let menu: MainMenu;
  let profile: Profile;
  let audio: AudioSettings;
  let host: MenuHost & { onPlay: Mock<MenuHost['onPlay']>; onResetProgress: Mock<MenuHost['onResetProgress']>; uiSound: Mock<NonNullable<MenuHost['uiSound']>> };
  let clock: number;

  const q = <T extends HTMLElement = HTMLElement>(sel: string) => root.querySelector<T>(sel);
  const qa = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
  const byKey = (key: string) => q<HTMLButtonElement>(`button[data-key="${key}"]`);
  const text = () => root.textContent ?? '';
  const click = (key: string) => byKey(key)!.click();
  const press = (key: string) => window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }));

  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
    clock = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => {});
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [] });
    profile = new Profile(memoryStore());
    audio = { master: 1, sfx: 1, music: 0.5, muted: false };
    host = {
      profile: () => profile,
      audioSettings: () => audio,
      setAudioSettings: (p) => { audio = { ...audio, ...p }; },
      onPlay: vi.fn<MenuHost['onPlay']>(),
      onResetProgress: vi.fn<MenuHost['onResetProgress']>(),
      uiSound: vi.fn<NonNullable<MenuHost['uiSound']>>(),
    };
    menu = new MainMenu(root, host);
    menu.show();
  });

  afterEach(() => {
    menu.destroy();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('renders the title screen with Play, Shop and Settings', () => {
    expect(menu.visible).toBe(true);
    expect(q('h1')!.textContent).toBe('Village Defender');
    expect(byKey('play')).not.toBeNull();
    expect(byKey('shop')!.textContent).toContain('0');
    expect(byKey('settings')).not.toBeNull();
  });

  it('hide() hides it', () => {
    menu.hide();
    expect(menu.visible).toBe(false);
    expect(q('.vd-menu')!.classList.contains('show')).toBe(false);
  });

  it.each([
    ['play', 'Choose a town'],
    ['shop', 'Shop'],
    ['settings', 'Settings'],
  ])('%s opens its screen and Back returns to the title', (key, heading) => {
    click(key);
    expect(q('h2')!.textContent).toBe(heading);
    expect(q('h1')).toBeNull();
    click('back');
    expect(q('h1')!.textContent).toBe('Village Defender');
  });

  it('Escape goes back from a sub-screen once the input guard has passed', () => {
    click('settings');
    press('Escape');
    expect(q('h2')!.textContent).toBe('Settings');
    clock += MENU_INPUT_GUARD_MS + 1;
    press('Escape');
    expect(q('h1')).not.toBeNull();
  });

  describe('towns', () => {
    beforeEach(() => click('play'));

    it('lists every town with its boss', () => {
      expect(qa('.town')).toHaveLength(TOWNS.length);
      for (const t of TOWNS) expect(text()).toContain(t.bossName);
    });

    it('the first town is playable and calls onPlay with its id', () => {
      byKey(`play:${TOWNS[0].id}`)!.click();
      expect(host.onPlay).toHaveBeenCalledWith(TOWNS[0].id);
    });

    it('a locked town has no play button and shows its requirement', () => {
      const t = TOWNS[1];
      expect(profile.townUnlocked(t.id)).toBe(false);
      expect(byKey(`play:${t.id}`)).toBeNull();
      expect(q(`.town[data-id="${t.id}"]`)!.classList.contains('locked')).toBe(true);
      expect(text()).toContain(`Earn ${t.unlockStars}`);
    });

    it('an unlocked second town can be played', () => {
      profile.data.bestStars[TOWNS[0].id] = TOWNS[1].unlockStars;
      click('back');
      click('play');
      expect(byKey(`play:${TOWNS[1].id}`)).not.toBeNull();
      byKey(`play:${TOWNS[1].id}`)!.click();
      expect(host.onPlay).toHaveBeenCalledWith(TOWNS[1].id);
    });
  });

  describe('shop', () => {
    it('buying updates the coins shown, stacks and the profile', () => {
      profile.addCoins(250);
      click('shop');
      expect(q('.wallet')!.textContent).toContain('250');
      expect(q('.row[data-id="boost-hp"] .stacks')!.textContent).toBe('0/3');
      click('buy:boost-hp');
      expect(profile.data.coins).toBe(150);
      expect(profile.bought('boost-hp')).toBe(1);
      expect(q('.wallet')!.textContent).toContain('150');
      expect(q('.row[data-id="boost-hp"] .stacks')!.textContent).toBe('1/3');
      expect(q('.toast')!.textContent).toBe('Bought!');
    });

    it('buy buttons are disabled when you cannot afford the item', () => {
      click('shop');
      expect(byKey('buy:boost-hp')!.disabled).toBe(true);
      byKey('buy:boost-hp')!.click();
      expect(profile.data.coins).toBe(0);
      expect(profile.bought('boost-hp')).toBe(0);
    });

    it('a bought card shows as Owned and is no longer buyable', () => {
      profile.addCoins(500);
      click('shop');
      click('buy:card-arc');
      const b = byKey('buy:card-arc')!;
      expect(b.disabled).toBe(true);
      expect(b.textContent).toBe('Owned');
      expect(profile.data.cards).toContain('arc');
    });

    it('a maxed boost shows Max', () => {
      profile.addCoins(1000);
      click('shop');
      for (let i = 0; i < 3; i++) click('buy:boost-hp');
      expect(byKey('buy:boost-hp')!.textContent).toBe('Max');
      expect(byKey('buy:boost-hp')!.disabled).toBe(true);
    });

    it('has no weapons section or weapon items', () => {
      click('shop');
      const headings = qa('h3').map((h) => h.textContent!.toLowerCase());
      expect(headings).not.toContain('weapons');
      expect(qa('.row.weapon')).toHaveLength(0);
      expect(qa('button[data-key^="buy:weapon"]')).toHaveLength(0);
    });
  });

  describe('weapon ranks', () => {
    it('owned weapons can be ranked; locked ones show Locked', () => {
      profile.addCoins(1000);
      click('shop');
      expect(qa('h3').map((h) => h.textContent)).toContain('Weapon ranks');
      expect(byKey('buy:rank-hammer')!.textContent).toBe('Locked');
      expect(byKey('buy:rank-hammer')!.disabled).toBe(true);
      expect(q('.row[data-id="rank-sword"] .stacks')!.textContent).toBe('0/3');
      click('buy:rank-sword');
      expect(profile.weaponRank('sword')).toBe(1);
      expect(q('.row[data-id="rank-sword"] .stacks')!.textContent).toBe('1/3');
    });
  });

  describe('settings', () => {
    beforeEach(() => click('settings'));

    it('sliders and mute update the audio settings', () => {
      const music = q<HTMLInputElement>('input[data-key="music"]')!;
      music.value = '80';
      music.dispatchEvent(new Event('input', { bubbles: true }));
      expect(audio.music).toBeCloseTo(0.8);
      click('mute');
      expect(audio.muted).toBe(true);
      expect(byKey('mute')!.textContent).toBe('Sound: Off');
    });

    it('reset needs confirmation, and cancel does nothing', () => {
      click('reset');
      expect(host.onResetProgress).not.toHaveBeenCalled();
      click('reset-cancel');
      expect(host.onResetProgress).not.toHaveBeenCalled();
      click('reset');
      click('reset-confirm');
      expect(host.onResetProgress).toHaveBeenCalledTimes(1);
    });
  });

  describe('gamepad', () => {
    let rafQueue: FrameRequestCallback[];
    let pad: FakePad | null;
    const frame = (dt: number, p: FakePad | null) => {
      clock += dt;
      pad = p;
      const queued = rafQueue;
      rafQueue = [];
      queued.forEach((cb) => cb(clock));
    };
    const focusedKey = () => (document.activeElement as HTMLElement | null)?.dataset.key;
    /** Passes the input guard and records a neutral frame so inputs count. */
    const ready = () => frame(MENU_INPUT_GUARD_MS + 1, aPad());

    beforeEach(() => {
      menu.destroy();
      document.body.innerHTML = '';
      root = document.createElement('div');
      document.body.appendChild(root);
      rafQueue = [];
      pad = null;
      vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { rafQueue.push(cb); return rafQueue.length; });
      Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
      menu = new MainMenu(root, host);
      menu.show();
      ready();
    });

    it('down moves focus to the next button', () => {
      expect(focusedKey()).toBe('play');
      frame(16, aPad(['down']));
      expect(focusedKey()).toBe('shop');
    });

    it('A activates the focused button (Play opens the towns screen)', () => {
      frame(16, aPad(['a']));
      expect(q('h2')!.textContent).toBe('Choose a town');
    });

    it('B goes back to the title', () => {
      click('settings');
      ready();
      frame(16, aPad(['b']));
      expect(q('h1')).not.toBeNull();
    });

    it('input is ignored during the guard after a screen change', () => {
      click('settings');
      frame(16, aPad());
      frame(16, aPad(['b']));
      expect(q('h2')!.textContent).toBe('Settings');
    });

    it('holding down repeats after the delay', () => {
      frame(16, aPad(['down']));
      expect(focusedKey()).toBe('shop');
      frame(PAD_REPEAT_DELAY_MS - 20, aPad(['down']));
      expect(focusedKey()).toBe('shop');
      frame(30, aPad(['down']));
      expect(focusedKey()).toBe('settings');
    });

    it('has a prompt bar, with a B glyph only on non-title screens', () => {
      const glyphs = () => qa('.vd-prompts .vd-glyph').map((g) => g.dataset.btn);
      expect(q('.vd-prompts')).not.toBeNull();
      expect(glyphs()).toContain('a');
      expect(glyphs()).not.toContain('b');
      click('shop');
      expect(qa('.vd-prompts')).toHaveLength(1);
      expect(glyphs()).toContain('b');
      click('back');
      expect(glyphs()).not.toContain('b');
    });
  });

  it('clicks play the ui sound', () => {
    click('settings');
    expect(host.uiSound).toHaveBeenCalledWith('uiClick');
  });
});
