// Night towns (Lanternwick): how far each light reaches, when darkness starts to matter, and lamp
// posts. Shared by the sim (sim/light.ts: what is lit) and the renderer (render3d/nightLights.ts:
// what looks lit), so the two never disagree.

import type { MonsterKind } from './monsters';

export const NIGHT = {
  /** Reach of each light (cells): a unit closer than this to a source stands in its light (wisp: a will-o'-wisp's own glow). */
  radius: { lantern: 4.5, window: 3.5, lamp: 3.5, wisp: 2 },
  /** Window light spills onto the street this far outside a building's camera-facing corner. */
  windowOut: 1,
  /** Darkness rules apply once nightLevel(wave) reaches this: wave 3 (waves 1–2 are dusk, all lit). */
  darkFrom: 0.5,
  /** Lamp post hit points (gloom moths drain them and the lamp goes out; breakers knock them straight over). */
  lampHp: 30,
  /** A breaker knocks a lamp over when its edge comes this close to the post. */
  lampReach: 0.3,
  /** Monsters that knock lamp posts over by walking through them (every boss does too). */
  breakers: ['brute'] as MonsterKind[],
};

/** Darkness by wave: 0 = dusk (wave 1 and planning), 1 = full night (wave 4 on). */
export function nightLevel(wave: number): number {
  return Math.min(1, Math.max(0, (wave - 1) / 3));
}
