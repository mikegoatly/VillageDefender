import { emptyInput, type InputState } from '../sim/types';

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

/** Keys whose default browser action (page scroll) we suppress. */
const PREVENT_DEFAULT = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

/** Keyboard -> InputState. Tracks physical keys (event.code), so layout does not matter. */
export class KeyboardSource {
  private readonly down = new Set<string>();
  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (PREVENT_DEFAULT.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    this.down.add(e.code);
  };
  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.down.delete(e.code);
  };
  private readonly onBlur = (): void => {
    this.down.clear();
  };

  constructor(private readonly target: Window = window) {
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
  }

  /** True while any key is held (used for active-device detection). */
  hasInput(): boolean {
    return this.down.size > 0;
  }

  poll(): InputState {
    const s = emptyInput();
    let x = 0;
    let y = 0;
    for (const code of this.down) {
      const v = MOVE_KEYS[code];
      if (v) { x += v[0]; y += v[1]; }
    }
    const len = Math.hypot(x, y);
    // Opposing keys cancel (len 0); diagonals are normalised to length 1.
    if (len > 0) { x /= len; y /= len; }
    s.move = { x, y };
    const d = this.down;
    s.attack = d.has('Space');
    s.dodge = d.has('ShiftLeft') || d.has('ShiftRight') || d.has('KeyK');
    s.ability1 = d.has('KeyQ');
    s.ability2 = d.has('KeyE');
    s.rally = d.has('KeyR');
    s.pause = d.has('Escape') || d.has('KeyP');
    return s;
  }

  destroy(): void {
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
    this.down.clear();
  }
}
