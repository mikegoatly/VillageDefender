// Orc Warlord (Town 1 boss, decision 41): the boss abilities, run from the monster update.

import { DT } from '../data/balance';
import { BOSS, MONSTERS } from '../data/monsters';
import type { BossState } from './bossState';
import { applyKnockback, damageBuilding, hurtFriendly } from './combat';
import { SIDES } from './map';
import type { BuildingState, Unit } from './model';
import { adjacentBuilding, nearestFriendly } from './queries';
import { centreOf } from './units';
import { spawnMonster } from './waves';
import type { World } from './world';

/**
 * Runs the Warlord's abilities. Returns true when an ability controlled the unit this tick (the
 * normal monster AI is skipped), false to let the normal building-wrecking AI run.
 */
export function updateWarlord(w: World, m: Unit, s: BossState): boolean {
  s.slamCd = Math.max(0, s.slamCd - DT);
  s.chargeIn = Math.max(0, s.chargeIn - DT);
  s.summonIn -= DT;

  // Summoning runs alongside everything else.
  if (s.summonIn <= 0) {
    s.summonIn = BOSS.summon.every;
    const side = w.rng.pick(SIDES);
    for (let k = 0; k < BOSS.summon.count; k++) spawnMonster(w, side, 'orc');
    w.events.push({ type: 'bossSummon', unit: m.id, count: BOSS.summon.count, side });
  }

  if (s.ability === 'slamWindup') {
    s.abilityTime += DT;
    m.moving = false;
    if (s.abilityTime >= BOSS.slam.telegraph) {
      s.ability = 'none';
      s.slamCd = BOSS.slam.cooldown;
      w.events.push({ type: 'bossSlam', unit: m.id, x: s.slamX, y: s.slamY, radius: BOSS.slam.radius });
      for (const f of [...w.players, ...w.rookies].filter((u) => u.state !== 'dead')) {
        const dx = f.x - s.slamX;
        const dy = f.y - s.slamY;
        const d = Math.hypot(dx, dy);
        if (d > BOSS.slam.radius + f.radius) continue;
        hurtFriendly(w, f, BOSS.slam.damage);
        applyKnockback(f, dx, dy, d, BOSS.slam.knockback, 0);
      }
    }
    return true;
  }

  if (s.ability === 'chargeWindup') {
    s.abilityTime += DT;
    m.moving = false;
    if (s.abilityTime >= BOSS.charge.windup) {
      s.ability = 'charging';
      s.abilityTime = 0;
    }
    return true;
  }

  if (s.ability === 'charging') {
    s.abilityTime += DT;
    const b = w.buildings[s.chargeTarget];
    const hit = adjacentBuilding(w, m, 0.3);
    if (!b || b.ruined || s.abilityTime >= BOSS.charge.maxTime || hit) {
      if (hit) damageBuilding(w, w.buildings[hit.id], BOSS.charge.buildingDamage, m);
      s.ability = 'none';
      s.chargeIn = BOSS.charge.every;
      return true;
    }
    const speed = MONSTERS.warlord.speed * BOSS.charge.speedMul;
    m.x += s.chargeDir.x * speed * DT;
    m.y += s.chargeDir.y * speed * DT;
    m.facing = s.chargeDir;
    m.moving = true;
    return true;
  }

  // Start a slam when friendlies are close.
  const near = nearestFriendly(w, m.x, m.y);
  if (near && s.slamCd <= 0 && Math.hypot(near.x - m.x, near.y - m.y) <= BOSS.slam.triggerRange) {
    s.ability = 'slamWindup';
    s.abilityTime = 0;
    s.slamX = m.x;
    s.slamY = m.y;
    w.events.push({ type: 'bossSlamWarn', unit: m.id, x: m.x, y: m.y, radius: BOSS.slam.radius, time: BOSS.slam.telegraph });
    return true;
  }

  // Start a charge at the nearest standing building that isn't adjacent already.
  if (s.chargeIn <= 0 && !adjacentBuilding(w, m, 0.6)) {
    let best: BuildingState | null = null;
    let bestD = Infinity;
    for (const b of w.buildings) {
      if (b.ruined) continue;
      const [cx, cy] = centreOf(b.cells);
      const d = Math.hypot(cx - m.x, cy - m.y);
      if (d < bestD && d > 1.5) {
        bestD = d;
        best = b;
      }
    }
    if (best) {
      const [cx, cy] = centreOf(best.cells);
      const l = Math.hypot(cx - m.x, cy - m.y) || 1;
      s.ability = 'chargeWindup';
      s.abilityTime = 0;
      s.chargeTarget = best.id;
      s.chargeDir = { x: (cx - m.x) / l, y: (cy - m.y) / l };
      m.facing = s.chargeDir;
      w.events.push({ type: 'bossCharge', unit: m.id, building: best.id });
      return true;
    }
    s.chargeIn = 2;
  }
  return false;
}
