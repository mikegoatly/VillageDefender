// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { PauseMenu, PAUSE_INPUT_GUARD_MS, type PauseHost } from '../../src/ui/PauseMenu';
import { aPad, type FakePad } from '../helpers/pad';

describe('PauseMenu', () => {
  let root: HTMLElement;
  let menu: PauseMenu;
  let isMuted: boolean;
  let host: { [K in keyof PauseHost]-?: Mock<NonNullable<PauseHost[K]>> };
  let clock: number;
  let raf: FrameRequestCallback[];
  let pad: FakePad | null;

  const shown = () => root.querySelector('.vd-pause')!.classList.contains('show');
  const focused = () => root.querySelector<HTMLButtonElement>('.vd-pause button.focus')?.dataset.key;
  const press = (key: string, init: KeyboardEventInit = {}) =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true, ...init }));
  const ready = () => { clock += PAUSE_INPUT_GUARD_MS; };
  /** Runs one animation frame with `p` connected. */
  const frame = (p: FakePad | null) => {
    pad = p;
    const q = raf;
    raf = [];
    for (const cb of q) cb(clock);
  };

  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
    clock = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    raf = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => raf.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => { raf = []; });
    pad = null;
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
    isMuted = false;
    host = {
      onResume: vi.fn(), onRestart: vi.fn(), onQuit: vi.fn(), uiSound: vi.fn(),
      muted: vi.fn(() => isMuted),
      setMuted: vi.fn((m: boolean) => { isMuted = m; }),
    };
    menu = new PauseMenu(root, host);
  });
  afterEach(() => {
    menu.destroy();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('opens on Resume and ignores input during the guard', () => {
    menu.show();
    expect(shown()).toBe(true);
    expect(focused()).toBe('resume');
    press('Escape');
    expect(shown()).toBe(true);
    ready();
    press('Escape');
    expect(shown()).toBe(false);
    expect(host.onResume).toHaveBeenCalledTimes(1);
  });

  it('moves focus with the arrow keys (wrapping) and activates with Enter', () => {
    menu.show();
    ready();
    press('ArrowUp');
    expect(focused()).toBe('quit');
    press('ArrowDown');
    press('ArrowDown');
    expect(focused()).toBe('restart');
    press('Enter');
    expect(host.onRestart).toHaveBeenCalledTimes(1);
  });

  it('toggles sound and shows its state', () => {
    menu.show();
    ready();
    const sound = root.querySelector<HTMLButtonElement>('button[data-key=sound]')!;
    expect(sound.textContent).toBe('Sound: On');
    sound.click();
    expect(host.setMuted).toHaveBeenLastCalledWith(true);
    expect(sound.textContent).toBe('Sound: Off');
  });

  it('ignores a Start held from pausing, then resumes on a fresh Start or B', () => {
    menu.show();
    ready();
    frame(aPad(['start']));
    expect(shown()).toBe(true);
    frame(aPad());
    frame(aPad(['start']));
    expect(shown()).toBe(false);

    menu.show();
    ready();
    frame(aPad());
    frame(aPad(['b']));
    expect(shown()).toBe(false);
    expect(host.onResume).toHaveBeenCalledTimes(2);
  });

  it('navigates with the D-pad and picks with A', () => {
    menu.show();
    ready();
    frame(aPad());
    frame(aPad(['down']));
    frame(aPad());
    frame(aPad(['down']));
    frame(aPad());
    frame(aPad(['down']));
    expect(focused()).toBe('quit');
    frame(aPad(['a']));
    expect(host.onQuit).toHaveBeenCalledTimes(1);
  });

  it('resumes on a tap outside the panel but not inside it', () => {
    menu.show();
    ready();
    root.querySelector<HTMLElement>('.vd-pause .panel')!.click();
    expect(shown()).toBe(true);
    root.querySelector<HTMLElement>('.vd-pause')!.click();
    expect(shown()).toBe(false);
  });
});
