// Gems and XP: magnetism, collection and level-ups.

import { DT } from '../data/balance';
import { GEMS } from '../data/rookies';
import type { World } from './world';

/** How close the knight pulls gems in from, after Gem Magnet (the renderer draws it). */
export function magnetRadius(w: Pick<World, 'progression'>): number {
  return GEMS.magnetRadius * w.progression.mods.knight.magnetMul;
}

export function updateGems(w: World) {
  if (w.gems.length === 0) return;
  const knight = w.players.find((p) => p.state !== 'dead');
  if (!knight) return;
  // Once the field is clear between waves, everything left flies home.
  const vacuum = w.spawnQueue.length === 0 && w.monsters.every((m) => m.state === 'dead');
  const magnet = magnetRadius(w);
  for (let k = w.gems.length - 1; k >= 0; k--) {
    const g = w.gems[k];
    const dx = knight.x - g.x;
    const dy = knight.y - g.y;
    const d = Math.hypot(dx, dy);
    if (!g.magnet && (d <= magnet || vacuum)) g.magnet = true;
    if (g.magnet) {
      g.speed = Math.min(GEMS.flySpeed * 2.5, g.speed + GEMS.flySpeed * 3 * DT);
      const step = Math.min(d, g.speed * DT);
      if (d > 1e-6) {
        g.x += (dx / d) * step;
        g.y += (dy / d) * step;
      }
    }
    if (Math.hypot(knight.x - g.x, knight.y - g.y) <= GEMS.collectRadius) {
      w.gems.splice(k, 1);
      w.events.push({ type: 'gemCollected', value: g.value });
      grantXp(w, g.value);
    }
  }
}

/** Adds XP and emits one levelUp event per level gained. */
export function grantXp(w: World, amount: number) {
  const before = w.progression.level;
  w.progression.addXp(amount);
  for (let l = before + 1; l <= w.progression.level; l++) w.events.push({ type: 'levelUp', level: l });
}
