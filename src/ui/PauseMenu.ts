// In-game pause overlay: Resume, Restart, Sound and Quit to menu. Mouse/touch, keyboard and
// gamepad; same palette and input-guard conventions as the other overlays. The game flow
// freezes the sim while it is open; this class only handles the menu itself.

import { PadNav } from '../input/PadNav';
import { glyph, promptBar } from './prompts';

/** Input is ignored this long after show() so the press that paused cannot pick an item. */
export const PAUSE_INPUT_GUARD_MS = 250;

export interface PauseHost {
  onResume(): void;
  onRestart(): void;
  onQuit(): void;
  muted(): boolean;
  setMuted(muted: boolean): void;
  uiSound?(): void;
}

const STYLE = `
.vd-pause { position: fixed; inset: 0; z-index: 95; display: none; align-items: center; justify-content: center;
  flex-direction: column; gap: 8px; background: #3b2418aa; pointer-events: auto; color: #3b2418;
  font: 600 15px system-ui, sans-serif; touch-action: manipulation; user-select: none; -webkit-user-select: none; }
.vd-pause.show { display: flex; }
.vd-pause .panel { background: #f3e3d0; border: 3px solid #3b2418; border-radius: 12px; padding: 16px 28px;
  display: flex; flex-direction: column; gap: 10px; align-items: center; max-height: 90vh; overflow-y: auto; box-sizing: border-box; }
.vd-pause h2 { margin: 0 0 4px; font-size: 28px; }
.vd-pause button { font: inherit; font-size: 17px; min-width: 200px; padding: 8px 20px; border-radius: 6px;
  border: 2px solid #3b2418; background: #ffd75e; color: #3b2418; cursor: pointer; }
.vd-pause button.secondary { background: #f3e3d0; }
.vd-pause button:focus, .vd-pause button.focus { outline: 4px solid #ffd75e; outline-offset: 2px; box-shadow: 0 0 0 2px #3b2418, 0 0 12px 4px #ffd75ecc; }
@media (max-height: 420px) {
  .vd-pause .panel { padding: 8px 18px; gap: 6px; }
  .vd-pause h2 { font-size: 20px; }
  .vd-pause button { font-size: 14px; padding: 5px 14px; }
}
`;

function now(): number {
  return performance.now();
}

export class PauseMenu {
  private readonly el: HTMLDivElement;
  private readonly panel: HTMLDivElement;
  private readonly soundBtn: HTMLButtonElement;
  private buttons: HTMLButtonElement[] = [];
  private focus = 0;
  private shownAt = 0;
  private raf: number | null = null;
  private readonly pad = new PadNav();
  private _visible = false;

  constructor(root: HTMLElement, private readonly host: PauseHost) {
    if (!document.getElementById('vd-pause-style')) {
      const s = document.createElement('style');
      s.id = 'vd-pause-style';
      s.textContent = STYLE;
      document.head.appendChild(s);
    }
    this.el = document.createElement('div');
    this.el.className = 'vd-pause';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', 'Paused');
    this.panel = document.createElement('div');
    this.panel.className = 'panel';
    const h = document.createElement('h2');
    h.textContent = 'Paused';
    this.panel.appendChild(h);
    const resume = this.button('resume', 'Resume', () => this.resume());
    resume.prepend(glyph('start', true));
    this.button('restart', 'Restart town', () => this.host.onRestart(), 'secondary');
    this.soundBtn = this.button('sound', '', () => {
      this.host.setMuted(!this.host.muted());
      this.syncSound();
    }, 'secondary');
    this.button('quit', 'Quit to menu', () => this.host.onQuit(), 'secondary');
    this.el.appendChild(this.panel);
    this.el.appendChild(promptBar([[['dpad', 'stick'], 'Move'], ['a', 'Select'], [['b', 'start'], 'Resume']]));
    // A tap on the dimmed backdrop (outside the panel) resumes.
    this.el.addEventListener('click', (e) => {
      if (e.target === this.el && this.guardOpen()) this.resume();
    });
    root.appendChild(this.el);
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('keyup', this.onKeyUp);
  }

  get visible(): boolean {
    return this._visible;
  }

  show(): void {
    if (this._visible) return;
    this._visible = true;
    this.shownAt = now();
    this.pad.reset(); // the Start press that paused must be released before it counts
    this.syncSound();
    this.el.classList.add('show');
    this.setFocus(0);
    this.startPadLoop();
  }

  hide(): void {
    this._visible = false;
    this.el.classList.remove('show');
    this.stopPadLoop();
  }

  destroy(): void {
    this.hide();
    window.removeEventListener('keydown', this.onKey);
    window.removeEventListener('keyup', this.onKeyUp);
    this.el.remove();
  }

  private button(key: string, text: string, onClick: () => void, cls = ''): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.dataset.key = key;
    b.textContent = text;
    b.addEventListener('click', () => {
      if (!this._visible || !this.guardOpen()) return;
      this.host.uiSound?.();
      onClick();
    });
    this.panel.appendChild(b);
    this.buttons.push(b);
    return b;
  }

  private syncSound(): void {
    const muted = this.host.muted();
    this.soundBtn.textContent = muted ? 'Sound: Off' : 'Sound: On';
    this.soundBtn.setAttribute('aria-pressed', String(muted));
  }

  private resume(): void {
    if (!this._visible) return;
    this.hide();
    this.host.onResume();
  }

  private guardOpen(): boolean {
    return now() - this.shownAt >= PAUSE_INPUT_GUARD_MS;
  }

  private setFocus(i: number): void {
    const n = this.buttons.length;
    this.focus = ((i % n) + n) % n;
    this.buttons.forEach((b, k) => b.classList.toggle('focus', k === this.focus));
    this.buttons[this.focus].focus();
  }

  private activate(): void {
    this.buttons[this.focus]?.click();
  }

  private readonly onKey = (e: KeyboardEvent): void => {
    if (!this._visible || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    const handled = ['ArrowUp', 'ArrowDown', 'Enter', ' ', 'Escape', 'p', 'P', 'w', 'W', 's', 'S'].includes(k);
    if (!handled) return;
    e.preventDefault();
    if (!this.guardOpen() || e.repeat) return;
    if (k === 'Escape' || k === 'p' || k === 'P') this.resume();
    else if (k === 'ArrowUp' || k === 'w' || k === 'W') this.setFocus(this.focus - 1);
    else if (k === 'ArrowDown' || k === 's' || k === 'S') this.setFocus(this.focus + 1);
    else this.activate();
  };

  /** Stops the browser's own Space-up click so Space does not activate a button twice. */
  private readonly onKeyUp = (e: KeyboardEvent): void => {
    if (this._visible && e.key === ' ') e.preventDefault();
  };

  private startPadLoop(): void {
    if (this.raf !== null) return;
    const tick = (): void => {
      this.raf = null;
      if (!this._visible) return;
      this.pollPad();
      if (this._visible) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private stopPadLoop(): void {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
  }

  private pollPad(): void {
    const f = this.pad.poll(now());
    if (!this.guardOpen()) return;
    if (f.dir === 'up' || f.dir === 'left') this.setFocus(this.focus - 1);
    else if (f.dir === 'down' || f.dir === 'right') this.setFocus(this.focus + 1);
    if (f.pressed.has('start') || f.pressed.has('b')) this.resume();
    else if (f.pressed.has('a')) this.activate();
  }
}
