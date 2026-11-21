// Night towns (Lanternwick): how the light looks (heights, colours, falloff), how dark it is, and the
// warm-light map that lights the scene with no real lights (nightDark.ts draws it). The sources and
// their reach come from the sim (sim/light.ts, data/night.ts), so what looks lit is what is lit.
// Pure (no three.js), unit-tested.

import { nightLevel } from '../data/night';
import { lightSpots, staticSpots, type Lightable, type LightKind, type LightSpot } from '../sim/light';

export { nightLevel };
export type { LightKind };

export interface LightSource {
  /** Stable id while the source exists. */
  key: string;
  kind: LightKind;
  /** Ground position (x, z) and height. */
  x: number;
  y: number;
  z: number;
  /** Reach of the light (world units): the sim's lit radius (NIGHT.radius). */
  radius: number;
  color: number;
}

/** Height and colour of each kind of light; reach is the sim's (NIGHT.radius). */
export const NIGHT_LIGHT: Record<LightKind, { y: number; color: number }> = {
  lantern: { y: 1.2, color: 0xffd6a6 },
  window: { y: 1.0, color: 0xffb066 },
  lamp: { y: 1.25, color: 0xffd08a },
  // A will-o'-wisp: a cold green-blue glow at the height it floats.
  wisp: { y: 0.6, color: 0x9affd8 },
  // A pumpkin fire on the ground: hot orange, low.
  fire: { y: 0.7, color: 0xff8a30 },
};

/**
 * How each kind of light shines (three.js physical point-light units, as the shader draws them):
 * peak intensity and decay. Reach is LIGHT_REACH × the sim's lit radius, so a light is still clearly
 * bright at the lit edge. Lights are dimmer at dusk (DUSK_LIGHT × at level 0, full at level 1).
 */
export const LIGHT_SHINE: Record<LightKind, { intensity: number; decay: number }> = {
  lantern: { intensity: 5, decay: 1.4 },
  window: { intensity: 2.6, decay: 1.5 },
  lamp: { intensity: 4, decay: 1.5 },
  wisp: { intensity: 2.2, decay: 1.6 },
  fire: { intensity: 7, decay: 1.4 },
};
export const LIGHT_REACH = 1.35;
export const DUSK_LIGHT = 0.55;

/** How bright the lights are at a shown night level (dusk 0 .. full night 1). */
export function duskLight(level: number): number {
  return DUSK_LIGHT + (1 - DUSK_LIGHT) * level;
}

/**
 * A point light's strength at distance `d` (three.js's physical falloff: inverse power `decay`, faded
 * smoothly to nothing at `cutoff`). The night shader mirrors this exactly.
 */
export function pointFalloff(d: number, decay: number, cutoff: number): number {
  const edge = Math.min(1, Math.max(0, 1 - (d / cutoff) ** 4));
  return (1 / Math.max(d ** decay, 0.01)) * edge * edge;
}

/** Eases the shown night level towards `target` at `rate` per second (night falls, never snaps). */
export function approach(current: number, target: number, rate: number, dt: number): number {
  const step = rate * dt;
  return Math.abs(target - current) <= step ? target : current + Math.sign(target - current) * step;
}

/**
 * Every light source in the town right now, from the sim's list: the knight's lantern first (while he
 * lives), wisps, fires, every standing building's window light, every lit, standing lamp post.
 */
export function lightSources(world: Lightable): LightSource[] {
  return lightSpots(world).map(toSource);
}

/**
 * The lights that never move: windows of standing buildings and lit, standing lamp posts. Unlike
 * lightSources these stay listed through a blackout (the renderer fades them with its flicker).
 */
export function staticLightSources(world: Lightable): LightSource[] {
  const spots: LightSpot[] = [];
  staticSpots(world, spots);
  return spots.map(toSource);
}

function toSource(s: LightSpot): LightSource {
  return { key: s.key, kind: s.kind, x: s.x, y: NIGHT_LIGHT[s.kind].y, z: s.y, radius: s.radius, color: NIGHT_LIGHT[s.kind].color };
}

/**
 * The warm-light maps: the static lights' light on the ground, baked into textures (`res` texels per
 * cell) so the shader lights every window and lamp with texture reads instead of real lights.
 * - `color`: the light arriving (linear, before the angle to the surface), stored as
 *   sqrt(light / scale) for precision in the dim edges.
 * - `dir`: where it comes from: the brightness-weighted mean direction to the lights, x and z as
 *   0.5 + 0.5·v in R and G, up (for the ground) in B; A is left for the lit map (nightDark.LightMap).
 *   The shader lights a surface by the angle between this and its normal, so walls and units are lit
 *   on the side facing the light, as real point lights would light them.
 */
export const WARM_MAP = { res: 2, scale: 6 };

export interface WarmMap {
  color: Uint8Array;
  dir: Uint8Array;
}

/** The warm-light maps, (size·res)² RGBA texels each, for these sources (see WARM_MAP). */
export function warmMapValues(sources: readonly LightSource[], size: number, res = WARM_MAP.res, out?: WarmMap): WarmMap {
  const n = size * res;
  // Per texel: light r, g, b, its brightness, and brightness-weighted direction x, up, z.
  const sum = new Float32Array(n * n * 7);
  for (const s of sources) {
    const spec = LIGHT_SHINE[s.kind];
    const cutoff = s.radius * LIGHT_REACH;
    const [r, g, b] = linearRgb(s.color);
    const bright = (r + g + b) / 3;
    // Texel t covers world [t/res - 0.5, (t+1)/res - 0.5] (cell i is centred on i, as in the light map).
    const lo = (v: number) => Math.max(0, Math.floor((v - cutoff + 0.5) * res));
    const hi = (v: number) => Math.min(n - 1, Math.ceil((v + cutoff + 0.5) * res));
    for (let tj = lo(s.z); tj <= hi(s.z); tj++) {
      const dz = s.z - ((tj + 0.5) / res - 0.5);
      for (let ti = lo(s.x); ti <= hi(s.x); ti++) {
        const dx = s.x - ((ti + 0.5) / res - 0.5);
        const d = Math.hypot(dx, dz, s.y);
        if (d >= cutoff) continue;
        const e = spec.intensity * pointFalloff(d, spec.decay, cutoff);
        const k = (tj * n + ti) * 7;
        sum[k] += e * r;
        sum[k + 1] += e * g;
        sum[k + 2] += e * b;
        const w = e * bright;
        sum[k + 3] += w;
        sum[k + 4] += (w * dx) / d;
        sum[k + 5] += (w * s.y) / d;
        sum[k + 6] += (w * dz) / d;
      }
    }
  }
  const color = out?.color ?? new Uint8Array(n * n * 4);
  const dir = out?.dir ?? new Uint8Array(n * n * 4);
  const byte = (v: number) => Math.round(255 * Math.min(1, Math.max(0, v)));
  for (let t = 0; t < n * n; t++) {
    const k = t * 7;
    for (let c = 0; c < 3; c++) color[t * 4 + c] = byte(Math.sqrt(sum[k + c] / WARM_MAP.scale));
    color[t * 4 + 3] = 255;
    const w = sum[k + 3];
    dir[t * 4] = byte(0.5 + (w > 0 ? (0.5 * sum[k + 4]) / w : 0));
    dir[t * 4 + 1] = byte(0.5 + (w > 0 ? (0.5 * sum[k + 6]) / w : 0));
    dir[t * 4 + 2] = byte(w > 0 ? sum[k + 5] / w : 0);
  }
  return { color, dir };
}

/**
 * Bilinear upsampling of a per-cell map (cell i centred on i) to `res` texels per cell (texel t
 * centred on (t + 0.5)/res − 0.5). Sampled bilinearly again it gives back the per-cell map's own
 * bilinear surface (exactly between cell centres, so the lit map's half-way contour on the cell edges
 * stays put), so the lit map can ride in the direction map's alpha. Writes channel `channel` of RGBA `out`.
 */
export function upsampleInto(values: Uint8Array, size: number, res: number, out: Uint8Array, channel: number) {
  const n = size * res;
  const at = (i: number, j: number) => values[Math.min(size - 1, Math.max(0, j)) * size + Math.min(size - 1, Math.max(0, i))];
  for (let tj = 0; tj < n; tj++) {
    const z = (tj + 0.5) / res - 0.5;
    const j = Math.floor(z);
    const fz = z - j;
    for (let ti = 0; ti < n; ti++) {
      const x = (ti + 0.5) / res - 0.5;
      const i = Math.floor(x);
      const fx = x - i;
      const top = at(i, j) * (1 - fx) + at(i + 1, j) * fx;
      const bottom = at(i, j + 1) * (1 - fx) + at(i + 1, j + 1) * fx;
      out[(tj * n + ti) * 4 + channel] = Math.round(top * (1 - fz) + bottom * fz);
    }
  }
}

/** A hex sRGB colour as linear RGB (what three.js's colour management hands the shaders). */
export function linearRgb(hex: number): [number, number, number] {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return [lin(((hex >> 16) & 255) / 255), lin(((hex >> 8) & 255) / 255), lin((hex & 255) / 255)];
}

/**
 * Lightning: a quick double flash, 0..1 by seconds since the strike (0 after LIGHTNING.length).
 * Strikes come every LIGHTNING.every seconds (render-side randomness, never the sim's RNG).
 */
export const LIGHTNING = { every: [15, 35] as const, length: 0.26, thunderAfter: 0.5 };

export function lightningFlash(t: number): number {
  if (t < 0 || t >= LIGHTNING.length) return 0;
  // Two spikes: a sharp first one and a slightly weaker echo, each falling off fast.
  const spike = (at: number, peak: number, fall: number) => (t < at ? 0 : peak * Math.exp(-(t - at) / fall));
  return Math.min(1, spike(0, 1, 0.035) + spike(0.12, 0.85, 0.04));
}

/**
 * The Pumpkin King's blackout as it looks (render only; the sim's `blackoutWarn` / `blackout` decide
 * what is lit): how bright windows, lamps and wisps are, 0..1. While the warning runs they stutter,
 * dark more and more often as it runs out; in the blackout they are out (eased down over `fall` s);
 * for `back` s after it they stutter back on. Steps every `step` s, `random` picks each step.
 */
export const BLACKOUT_FX = { step: 0.07, low: 0.08, fall: 0.25, back: 0.9 };

export class BlackoutFlicker {
  /** 0..1, the brightness of every light the blackout puts out. */
  value = 1;
  private stepLeft = 0;
  private sinceBack = Infinity;
  private wasOut = false;
  private stuttering = 1;

  constructor(private readonly random: () => number = Math.random) {}

  update(world: { blackoutWarn: number; blackout: number }, telegraph: number, dt: number): number {
    const fx = BLACKOUT_FX;
    const out = world.blackout > 0;
    if (this.wasOut && !out) this.sinceBack = 0;
    this.wasOut = out;
    this.sinceBack += dt;
    if (out) {
      this.value = Math.max(0, this.value - dt / fx.fall);
      return this.value;
    }
    // Chance of a dark step: rises through the warning; falls away as the lights come back.
    let dark = 0;
    if (world.blackoutWarn > 0) dark = 0.2 + 0.6 * (1 - world.blackoutWarn / Math.max(telegraph, 1e-6));
    else if (this.sinceBack < fx.back) dark = 0.7 * (1 - this.sinceBack / fx.back);
    if (dark <= 0) {
      this.value = 1;
      return 1;
    }
    this.stepLeft -= dt;
    if (this.stepLeft <= 0) {
      this.stepLeft = fx.step;
      this.stuttering = this.random() < dark ? fx.low : 1;
    }
    this.value = this.stuttering;
    return this.value;
  }
}

/** A fire's light, 0..1: flares up over 0.3 s, flickers, and dies down over its last second. */
export function fireLight(age: number, left: number, clock: number, seed: number): number {
  const grow = Math.min(1, Math.max(0, age / 0.3));
  const die = Math.min(1, Math.max(0, left));
  const flicker = 0.82 + 0.1 * Math.sin(clock * 17 + seed) + 0.08 * Math.sin(clock * 29.3 + seed * 2.1);
  return grow * die * flicker;
}
