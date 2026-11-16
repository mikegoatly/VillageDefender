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

/**
 * Gamepad (standard mapping) -> InputState. All connected pads are merged (buttons OR-ed, the
 * stick pushed furthest wins, any D-pad overrides the sticks), so a controller works whichever
 * slot it landed in, even behind an idle device such as a virtual HID in slot 0.
 */
export class GamepadSource {
  constructor(private readonly getPads: () => ArrayLike<PadLike | null> = () => navigator.getGamepads?.() ?? []) {}

  /** Reads the pads now. Returns neutral input when no pad is connected. */
  poll(): InputState {
    const s = emptyInput();
    const pads = this.getPads();
    let sx = 0;
    let sy = 0;
    let dx = 0;
    let dy = 0;
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      if (!pad || !pad.connected) continue;
      const b = (n: number): boolean => !!pad.buttons[n]?.pressed;
      const x = pad.axes[0] ?? 0;
      const y = pad.axes[1] ?? 0;
      if (Math.hypot(x, y) > Math.hypot(sx, sy)) { sx = x; sy = y; }
      // D-pad: 12 up, 13 down, 14 left, 15 right.
      dx += (b(15) ? 1 : 0) - (b(14) ? 1 : 0);
      dy += (b(13) ? 1 : 0) - (b(12) ? 1 : 0);
      s.attack ||= b(0) || (pad.buttons[7]?.value ?? 0) > TRIGGER_THRESHOLD;
      s.dodge ||= b(1);
      s.ability1 ||= b(2);
      s.ability2 ||= b(3);
      s.rally ||= b(4);
      s.pause ||= b(9);
    }
    dx = Math.sign(dx);
    dy = Math.sign(dy);
    if (dx !== 0 || dy !== 0) {
      const len = Math.hypot(dx, dy);
      s.move = { x: dx / len, y: dy / len };
    } else {
      s.move = applyRadialDeadzone(sx, sy, STICK_DEADZONE);
    }
    return s;
  }
}

/** True when the state is anything but neutral. */
export function isNonNeutral(s: InputState): boolean {
  return s.move.x !== 0 || s.move.y !== 0 || s.attack || s.dodge || s.ability1 || s.ability2 || s.rally || s.pause;
}
