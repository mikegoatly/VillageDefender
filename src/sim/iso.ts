// Ground plane ↔ isometric screen projection.
// Sketch Town grid diamonds are 232×110 px at native size: a ground step of +1 along x moves
// (+116, +55) on screen, +1 along y moves (-116, +55). Only the ratio matters to the sim.

import type { Vec2 } from './types';

export const ISO_HX = 116;
export const ISO_HY = 55;

/** Ground position → screen position at the given tile display scale. */
export function groundToScreen(gx: number, gy: number, scale = 1): Vec2 {
  return { x: (gx - gy) * ISO_HX * scale, y: (gx + gy) * ISO_HY * scale };
}

/**
 * Screen-space direction (e.g. stick input, y down) → ground direction with the same length.
 * Movement is screen-relative: pushing "up" moves the unit straight up the screen.
 */
export function screenDirToGround(sx: number, sy: number): Vec2 {
  const len = Math.hypot(sx, sy);
  if (len < 1e-6) return { x: 0, y: 0 };
  // Invert the projection: sx ∝ gx - gy, sy ∝ gx + gy.
  const a = sx / ISO_HX;
  const b = sy / ISO_HY;
  const gx = (a + b) / 2;
  const gy = (b - a) / 2;
  const g = Math.hypot(gx, gy);
  const out = Math.min(1, len);
  return { x: (gx / g) * out, y: (gy / g) * out };
}

/** Ground direction → screen direction (unnormalised), for picking sprite facings. */
export function groundDirToScreen(gx: number, gy: number): Vec2 {
  return { x: (gx - gy) * ISO_HX, y: (gx + gy) * ISO_HY };
}
