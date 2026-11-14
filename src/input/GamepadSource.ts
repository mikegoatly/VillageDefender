import { emptyInput, type InputState } from '../sim/types';

/**
 * Radial deadzone with rescale: inside `dz` -> 0; beyond it the magnitude ramps 0..1
 * (direction preserved). Magnitude is clamped to 1 (stick corners can report > 1).
 */
export function applyRadialDeadzone(x: number, y: number, dz: number): { x: number; y: number } {
  const mag = Math.hypot(x, y);
  if (mag <= dz || mag === 0) return { x: 0, y: 0 };
  const scaled = Math.min(1, (mag - dz) / (1 - dz));
  return { x: (x / mag) * scaled, y: (y / mag) * scaled };
}

export const STICK_DEADZONE = 0.2;
const TRIGGER_THRESHOLD = 0.3;

type PadLike = Pick<Gamepad, 'axes' | 'buttons' | 'connected'>;

/** Gamepad (standard mapping) -> InputState. Uses the first connected pad. */
export class GamepadSource {
  constructor(private readonly getPads: () => ArrayLike<PadLike | null> = () => navigator.getGamepads?.() ?? []) {}

  private firstPad(): PadLike | null {
    const pads = this.getPads();
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (p && p.connected) return p;
    }
    return null;
  }

  /** Reads the pad now. Returns neutral input when no pad is connected. */
  poll(): InputState {
    const s = emptyInput();
    const pad = this.firstPad();
    if (!pad) return s;
    const b = (i: number): boolean => !!pad.buttons[i]?.pressed;

    const stick = applyRadialDeadzone(pad.axes[0] ?? 0, pad.axes[1] ?? 0, STICK_DEADZONE);
    // D-pad: 12 up, 13 down, 14 left, 15 right. Overrides the stick when pressed.
    let dx = (b(15) ? 1 : 0) - (b(14) ? 1 : 0);
    let dy = (b(13) ? 1 : 0) - (b(12) ? 1 : 0);
    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      dx /= len;
      dy /= len;
      s.move = { x: dx, y: dy };
    } else {
      s.move = stick;
    }

    s.attack = b(0) || (pad.buttons[7]?.value ?? 0) > TRIGGER_THRESHOLD;
    s.dodge = b(1);
    s.ability1 = b(2);
    s.ability2 = b(3);
    s.rally = b(4);
    s.pause = b(9);
    return s;
  }
}

/** True when the state is anything but neutral. */
export function isNonNeutral(s: InputState): boolean {
  return s.move.x !== 0 || s.move.y !== 0 || s.attack || s.dodge || s.ability1 || s.ability2 || s.rally || s.pause;
}
