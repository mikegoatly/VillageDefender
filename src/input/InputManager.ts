import { emptyInput, type InputDevice, type InputState } from '../sim/types';
import { GamepadSource, isNonNeutral } from './GamepadSource';
import { KeyboardSource } from './KeyboardSource';
import { TouchSource } from './TouchSource';
import type { TouchMode } from '../ui/TouchControls';

/** Touch buttons are interactive for touch, a labelled legend for a controller, hidden for keyboard. */
const TOUCH_MODE: Record<InputDevice, TouchMode> = { touch: 'touch', gamepad: 'pad', keyboard: 'off' };

export interface InputManagerOptions {
  root: HTMLElement;
  alwaysAttack?: boolean;
}

export interface DeviceInput {
  device: InputDevice;
  state: InputState;
}

/** Merge priority: earlier wins for movement. */
const PRIORITY: InputDevice[] = ['touch', 'gamepad', 'keyboard'];

/**
 * Pure merge: move comes from the highest-priority device (touch > gamepad > keyboard)
 * that has non-zero move; all buttons are OR-ed.
 */
export function mergeInputs(inputs: DeviceInput[]): InputState {
  const out = emptyInput();
  const byPriority = [...inputs].sort((a, b) => PRIORITY.indexOf(a.device) - PRIORITY.indexOf(b.device));
  for (const { state } of byPriority) {
    if (out.move.x === 0 && out.move.y === 0 && (state.move.x !== 0 || state.move.y !== 0)) {
      out.move = { x: state.move.x, y: state.move.y };
    }
    out.attack ||= state.attack;
    out.dodge ||= state.dodge;
    out.ability1 ||= state.ability1;
    out.ability2 ||= state.ability2;
    out.rally ||= state.rally;
    out.pause ||= state.pause;
  }
  return out;
}

export class InputManager {
  private device: InputDevice = 'keyboard';
  private readonly keyboard = new KeyboardSource();
  private readonly gamepad = new GamepadSource();
  private readonly touch: TouchSource;
  private readonly listeners = new Set<(d: InputDevice) => void>();
  private override: InputState | null = null;
  private alwaysAttack: boolean;
  /** Per-source activity last poll, so we switch device on the neutral->active edge only. */
  private wasActive: Record<InputDevice, boolean> = { keyboard: false, gamepad: false, touch: false };
  private readonly onRootPointerDown = (e: PointerEvent): void => {
    // The overlay is hidden while another device is active, so a finger landing on the
    // game itself must switch back to touch.
    if (e.pointerType === 'touch' || e.pointerType === 'pen') this.setDevice('touch');
  };

  constructor(private readonly opts: InputManagerOptions) {
    this.alwaysAttack = opts.alwaysAttack ?? false;
    this.touch = new TouchSource(opts.root);
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    if (coarse) this.device = 'touch';
    this.touch.setMode(TOUCH_MODE[this.device]);
    opts.root.addEventListener('pointerdown', this.onRootPointerDown);
  }

  get activeDevice(): InputDevice {
    return this.device;
  }

  onDeviceChange(cb: (d: InputDevice) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  setOverride(state: InputState | null): void {
    this.override = state;
  }

  /** Shows the touch trap button (decision 52). */
  setTrapAvailable(on: boolean): void {
    this.touch.controls.setTrapAvailable(on);
  }

  setAlwaysAttack(on: boolean): void {
    this.alwaysAttack = on;
  }

  /** Merged state for player 0. Call once per rendered frame. */
  poll(): InputState {
    const kb = this.keyboard.poll();
    const gp = this.gamepad.poll();
    const tc = this.touch.poll();

    const active: Record<InputDevice, boolean> = {
      keyboard: this.keyboard.hasInput(),
      gamepad: isNonNeutral(gp),
      touch: this.touch.hasInput(),
    };
    for (const d of PRIORITY) {
      if (active[d] && !this.wasActive[d]) this.setDevice(d);
    }
    this.wasActive = active;
    if (this.device === 'gamepad') this.touch.controls.showPadPressed(gp);

    const state = this.override
      ? { ...this.override, move: { ...this.override.move } }
      : mergeInputs([
          { device: 'touch', state: tc },
          { device: 'gamepad', state: gp },
          { device: 'keyboard', state: kb },
        ]);
    if (this.alwaysAttack) state.attack = true;
    return state;
  }

  destroy(): void {
    this.opts.root.removeEventListener('pointerdown', this.onRootPointerDown);
    this.keyboard.destroy();
    this.touch.destroy();
    this.listeners.clear();
  }

  private setDevice(d: InputDevice): void {
    if (d === this.device) return;
    this.device = d;
    this.touch.setMode(TOUCH_MODE[d]);
    for (const cb of [...this.listeners]) cb(d);
  }
}
