// Orc Warlord (Town 1 boss, decision 41). Kept out of world.ts: the World hands the boss a narrow
// host interface for the few things its abilities need.

import { DT } from '../data/balance';
import { BOSS, MONSTERS } from '../data/monsters';
import type { Side } from './map';
import type { BuildingState, SimEvent, Unit } from './world';

export interface BossHost {
  readonly time: number;
  readonly buildings: BuildingState[];
  readonly events: SimEvent[];
  /** Living knights and rookies. */
  friendlies(): Unit[];
  nearestFriendlyTo(x: number, y: number): Unit | null;
  hurtFriendlyBy(target: Unit, amount: number): void;
  damageBuildingBy(b: BuildingState, amount: number, by: Unit): void;
  adjacentBuildingTo(m: Unit, reach: number): { id: number; dx: number; dy: number } | null;
  spawnFromEdge(side: Side, kind: 'orc'): void;
  randomSide(): Side;
}

/** Boss-only state, kept on the unit. */
export interface BossState {
  ability: 'none' | 'slamWindup' | 'chargeWindup' | 'charging';
  abilityTime: number;
  slamCd: number;
  chargeIn: number;
  summonIn: number;
  chargeTarget: number;
  chargeDir: { x: number; y: number };
  slamX: number;
  slamY: number;
}

export function newBossState(): BossState {
  return {
    ability: 'none', abilityTime: 0, slamCd: 2, chargeIn: BOSS.charge.every * 0.6, summonIn: BOSS.summon.every * 0.5,
    chargeTarget: -1, chargeDir: { x: 0, y: 0 }, slamX: 0, slamY: 0,
  };
}

/**
 * Runs the Warlord's abilities. Returns true when an ability controlled the unit this tick (the
 * normal monster AI is skipped), false to let the normal building-wrecking AI run.
 */
export function updateWarlord(host: BossHost, m: Unit, s: BossState): boolean {
  s.slamCd = Math.max(0, s.slamCd - DT);
  s.chargeIn = Math.max(0, s.chargeIn - DT);
  s.summonIn -= DT;

  // Summoning runs alongside everything else.
  if (s.summonIn <= 0) {
    s.summonIn = BOSS.summon.every;
    const side = host.randomSide();
    for (let k = 0; k < BOSS.summon.count; k++) host.spawnFromEdge(side, 'orc');
    host.events.push({ type: 'bossSummon', unit: m.id, count: BOSS.summon.count, side });
  }

  if (s.ability === 'slamWindup') {
    s.abilityTime += DT;
    m.moving = false;
    if (s.abilityTime >= BOSS.slam.telegraph) {
      s.ability = 'none';
      s.slamCd = BOSS.slam.cooldown;
      host.events.push({ type: 'bossSlam', unit: m.id, x: s.slamX, y: s.slamY, radius: BOSS.slam.radius });
      for (const f of host.friendlies()) {
        const dx = f.x - s.slamX;
        const dy = f.y - s.slamY;
        const d = Math.hypot(dx, dy);
        if (d > BOSS.slam.radius + f.radius) continue;
        host.hurtFriendlyBy(f, BOSS.slam.damage);
        const k = d > 1e-4 ? BOSS.slam.knockback / d : 0;
        f.vx += dx * k;
        f.vy += dy * k;
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
    const b = host.buildings[s.chargeTarget];
    const hit = host.adjacentBuildingTo(m, 0.3);
    if (!b || b.ruined || s.abilityTime >= BOSS.charge.maxTime || hit) {
      if (hit) host.damageBuildingBy(host.buildings[hit.id], BOSS.charge.buildingDamage, m);
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
  const near = host.nearestFriendlyTo(m.x, m.y);
  if (near && s.slamCd <= 0 && Math.hypot(near.x - m.x, near.y - m.y) <= BOSS.slam.triggerRange) {
    s.ability = 'slamWindup';
    s.abilityTime = 0;
    s.slamX = m.x;
    s.slamY = m.y;
    host.events.push({ type: 'bossSlamWarn', unit: m.id, x: m.x, y: m.y, radius: BOSS.slam.radius, time: BOSS.slam.telegraph });
    return true;
  }

  // Start a charge at the nearest standing building that isn't adjacent already.
  if (s.chargeIn <= 0 && !host.adjacentBuildingTo(m, 0.6)) {
    let best: BuildingState | null = null;
    let bestD = Infinity;
    for (const b of host.buildings) {
      if (b.ruined) continue;
      const [cx, cy] = centre(b);
      const d = Math.hypot(cx - m.x, cy - m.y);
      if (d < bestD && d > 1.5) {
        bestD = d;
        best = b;
      }
    }
    if (best) {
      const [cx, cy] = centre(best);
      const l = Math.hypot(cx - m.x, cy - m.y) || 1;
      s.ability = 'chargeWindup';
      s.abilityTime = 0;
      s.chargeTarget = best.id;
      s.chargeDir = { x: (cx - m.x) / l, y: (cy - m.y) / l };
      m.facing = s.chargeDir;
      host.events.push({ type: 'bossCharge', unit: m.id, building: best.id });
      return true;
    }
    s.chargeIn = 2;
  }
  return false;
}

function centre(b: BuildingState): [number, number] {
  let x = 0;
  let y = 0;
  for (const [i, j] of b.cells) {
    x += i;
    y += j;
  }
  return [x / b.cells.length, y / b.cells.length];
}
