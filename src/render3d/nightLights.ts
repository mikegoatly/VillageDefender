// Night towns (Lanternwick): how the light looks (heights, colours), how dark it is, and which sources
// get one of the renderer's few real lights. The sources themselves and their reach come from the sim
// (sim/light.ts, data/night.ts), so what looks lit is what is lit. Pure (no three.js), unit-tested.

import { nightLevel } from '../data/night';
import { lightSpots, type Lightable, type LightKind } from '../sim/light';

export { nightLevel };
export type { LightKind };

export interface LightSource {
  /** Stable id while the source exists (slots follow a source by key). */
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
};

/** Real point lights in the pool (constant, so shaders never recompile). Slot 0 is the knight's lantern. */
export const LIGHT_POOL = 8;
/** How fast a slot's light fades in or out (weight per second), so lights never pop. */
export const LIGHT_FADE = 3;
/** A source already holding a slot counts as this much nearer, so slots don't flicker between neighbours. */
export const LIGHT_KEEP = 0.8;

/** Eases the shown night level towards `target` at `rate` per second (night falls, never snaps). */
export function approach(current: number, target: number, rate: number, dt: number): number {
  const step = rate * dt;
  return Math.abs(target - current) <= step ? target : current + Math.sign(target - current) * step;
}

/**
 * Every light source in the town right now, from the sim's list: the knight's lantern first (while he
 * lives), every standing building's window light, every lit, standing lamp post.
 */
export function lightSources(world: Lightable): LightSource[] {
  return lightSpots(world).map((s) => ({ key: s.key, kind: s.kind, x: s.x, y: NIGHT_LIGHT[s.kind].y, z: s.y, radius: s.radius, color: NIGHT_LIGHT[s.kind].color }));
}

/**
 * The sources that should have a real light: the knight's lantern first, then the `n - 1` nearest
 * to `centre` (sources in `held` count as LIGHT_KEEP as far, so a slot sticks with its source).
 */
export function pickLights(sources: readonly LightSource[], centre: { x: number; z: number }, n: number, held: ReadonlySet<string> = new Set()): LightSource[] {
  const lantern = sources.find((s) => s.kind === 'lantern');
  const dist = (s: LightSource) => Math.hypot(s.x - centre.x, s.z - centre.z) * (held.has(s.key) ? LIGHT_KEEP : 1);
  const rest = sources.filter((s) => s !== lantern).map((s) => ({ s, d: dist(s) })).sort((a, b) => a.d - b.d).map((e) => e.s);
  // One of the n is always kept for the lantern, even while there is none (slot 0).
  return lantern ? [lantern, ...rest.slice(0, n - 1)] : rest.slice(0, n - 1);
}

export interface LightSlot {
  source: LightSource | null;
  /** 0..1: how far faded in. */
  weight: number;
}

/**
 * A fixed pool of light slots following the wanted sources. Slot 0 belongs to the knight's lantern;
 * the others fade out when their source is no longer wanted and are then handed to a newly wanted
 * one, which fades in. Positions follow the source every frame (the knight walks).
 */
export class LightSlots {
  readonly slots: LightSlot[];

  constructor(readonly size = LIGHT_POOL, private readonly fade = LIGHT_FADE) {
    this.slots = Array.from({ length: size }, () => ({ source: null, weight: 0 }));
  }

  update(sources: readonly LightSource[], centre: { x: number; z: number }, dt: number) {
    const held = new Set<string>();
    for (const s of this.slots) if (s.source) held.add(s.source.key);
    const want = new Map(pickLights(sources, centre, this.size, held).map((s) => [s.key, s]));
    const step = this.fade * dt;

    const lantern = this.slots[0];
    const l = want.get('lantern');
    if (l) {
      lantern.source = l;
      lantern.weight = Math.min(1, lantern.weight + step);
      want.delete('lantern');
    } else if (lantern.source) {
      lantern.weight = Math.max(0, lantern.weight - step);
      if (lantern.weight === 0) lantern.source = null;
    }

    for (let k = 1; k < this.size; k++) {
      const slot = this.slots[k];
      if (!slot.source) continue;
      const fresh = want.get(slot.source.key);
      if (fresh) {
        slot.source = fresh;
        slot.weight = Math.min(1, slot.weight + step);
        want.delete(fresh.key);
      } else {
        slot.weight = Math.max(0, slot.weight - step);
        if (slot.weight === 0) slot.source = null;
      }
    }
    // Wanted sources without a slot take the free ones, nearest first, and start faded out.
    for (const s of want.values()) {
      const free = this.slots.find((slot, k) => k > 0 && !slot.source);
      if (!free) break;
      free.source = s;
      free.weight = 0;
    }
  }

  /** Weight of the slot holding this source (0 when none does). */
  weightOf(key: string): number {
    for (const s of this.slots) if (s.source?.key === key) return s.weight;
    return 0;
  }
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
