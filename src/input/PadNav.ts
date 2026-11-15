// Menu-style gamepad reading shared by the DOM overlays (menu, planning, level-up, end panel):
// rising-edge buttons, D-pad/left-stick directions with hold-to-repeat, and "held since the
// screen opened" suppression. All connected pads are merged, so it does not matter which slot
// the controller landed in.

import { setInputMode, type PadStyle } from './inputMode';

export type PadButton = 'a' | 'b' | 'x' | 'y' | 'lb' | 'rb' | 'start' | 'back';
export type PadDir = 'up' | 'down' | 'left' | 'right';

/** Standard-mapping button index for each logical button. */
export const PAD_BUTTON_INDEX: Record<PadButton, number> = { a: 0, b: 1, x: 2, y: 3, lb: 4, rb: 5, back: 8, start: 9 };
const BUTTONS = Object.keys(PAD_BUTTON_INDEX) as PadButton[];

/** Stick press / release thresholds (hysteresis, so a stick resting near the edge does not chatter). */
const STICK_ON = 0.5;
const STICK_OFF = 0.35;
export const PAD_REPEAT_DELAY_MS = 380;
export const PAD_REPEAT_RATE_MS = 110;

type PadLike = Pick<Gamepad, 'axes' | 'buttons' | 'connected'> & { id?: string };

export interface PadFrame {
  /** Buttons that went down this frame (and were released at least once since reset()). */
  pressed: Set<PadButton>;
  /** Direction steps this frame: the first press, then repeats while held. At most one. */
  dir: PadDir | null;
  /** True when any pad is connected. */
  connected: boolean;
}

/** Controller family from the Gamepad id, for button glyphs. */
export function padStyleOf(id: string): PadStyle {
  const s = id.toLowerCase();
  if (/xbox|xinput|045e/.test(s)) return 'xbox';
  // Sony pads report "Wireless Controller" on some platforms (checked after Xbox, which also says it).
  if (/054c|playstation|dualsense|dualshock|wireless controller/.test(s)) return 'ps';
  if (/057e|nintendo|switch|joy-con|pro controller/.test(s)) return 'switch';
  return 'xbox';
}

export class PadNav {
  private held = new Set<PadButton>();
  /** Buttons seen up since reset(); only these can fire. */
  private armed = new Set<PadButton>();
  private dir: PadDir | null = null;
  private dirSince = 0;
  private lastRepeat = 0;
  private stickDir: PadDir | null = null;
  /** A direction may fire once the stick/D-pad has been seen neutral since reset(). */
  private dirArmed = false;

  constructor(private readonly getPads: () => ArrayLike<PadLike | null> = () => navigator.getGamepads?.() ?? []) {}

  /** Call when a screen opens: anything already held must be released before it counts. */
  reset(): void {
    this.armed.clear();
    this.dir = null;
    this.stickDir = null;
    this.dirArmed = false;
  }

  poll(now: number): PadFrame {
    const pads = this.getPads();
    const down = new Set<PadButton>();
    let ax = 0;
    let ay = 0;
    let dpad: PadDir | null = null;
    let connected = false;
    let activeId: string | null = null;
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i];
      if (!p || !p.connected) continue;
      connected = true;
      const b = (n: number): boolean => !!p.buttons[n]?.pressed;
      let any = false;
      for (const name of BUTTONS) if (b(PAD_BUTTON_INDEX[name])) { down.add(name); any = true; }
      if (b(12)) dpad = 'up';
      else if (b(13)) dpad = 'down';
      else if (b(14)) dpad = 'left';
      else if (b(15)) dpad = 'right';
      const x = p.axes[0] ?? 0;
      const y = p.axes[1] ?? 0;
      if (Math.abs(x) > Math.abs(ax)) ax = x;
      if (Math.abs(y) > Math.abs(ay)) ay = y;
      if (any || b(12) || b(13) || b(14) || b(15) || Math.hypot(x, y) > STICK_ON) activeId = p.id ?? '';
    }

    const pressed = new Set<PadButton>();
    for (const name of BUTTONS) {
      if (!down.has(name)) this.armed.add(name);
      else if (!this.held.has(name) && this.armed.has(name)) pressed.add(name);
    }
    this.held = down;

    const stick = this.readStick(ax, ay);
    if (dpad === null && stick === null) this.dirArmed = true;
    // A direction held from before reset() is ignored (no first step, no repeats) until let go.
    const cur = this.dirArmed ? dpad ?? stick : null;
    let step: PadDir | null = null;
    if (cur === null) {
      this.dir = null;
    } else if (cur !== this.dir) {
      step = cur;
      this.dir = cur;
      this.dirSince = now;
      this.lastRepeat = now;
    } else if (now - this.dirSince >= PAD_REPEAT_DELAY_MS && now - this.lastRepeat >= PAD_REPEAT_RATE_MS) {
      step = cur;
      this.lastRepeat = now;
    }

    if (activeId !== null) setInputMode('gamepad', padStyleOf(activeId));
    return { pressed, dir: step, connected };
  }

  private readStick(x: number, y: number): PadDir | null {
    const mag = Math.max(Math.abs(x), Math.abs(y));
    if (this.stickDir !== null && mag < STICK_OFF) this.stickDir = null;
    else if (mag >= STICK_ON || (this.stickDir !== null && mag >= STICK_OFF)) {
      this.stickDir = Math.abs(x) >= Math.abs(y) ? (x < 0 ? 'left' : 'right') : (y < 0 ? 'up' : 'down');
    }
    return this.stickDir;
  }
}

/** Unit vector for a direction (screen space, y down). */
export function dirVec(d: PadDir): { x: number; y: number } {
  return d === 'up' ? { x: 0, y: -1 } : d === 'down' ? { x: 0, y: 1 } : d === 'left' ? { x: -1, y: 0 } : { x: 1, y: 0 };
}
