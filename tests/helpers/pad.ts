import { PAD_BUTTON_INDEX, type PadButton } from '../../src/input/PadNav';

export interface FakePad {
  id: string;
  connected: boolean;
  axes: number[];
  buttons: { pressed: boolean; touched: boolean; value: number }[];
}

export const DPAD_INDEX = { up: 12, down: 13, left: 14, right: 15 } as const;

/** Builds a standard-mapping pad. `down` lists logical buttons / d-pad directions held. */
export function aPad(
  down: (PadButton | keyof typeof DPAD_INDEX)[] = [],
  axes: number[] = [0, 0],
  id = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)',
): FakePad {
  const idx = new Set(down.map((d) => (d in DPAD_INDEX ? DPAD_INDEX[d as keyof typeof DPAD_INDEX] : PAD_BUTTON_INDEX[d as PadButton])));
  return { id, connected: true, axes, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: idx.has(i), touched: idx.has(i), value: idx.has(i) ? 1 : 0 })) };
}
