// Boss abilities, run from the monster update. Which set a boss uses comes from its MonsterDef.boss:
// Orc Warlord (Town 1, decision 41), River Troll (Town 2, decision 46), Gravekeeper (Town 3, decision 51)
// Frost Giant (Town 4, decision 54) and Pumpkin King (Town 5).

import { DT } from '../data/balance';
import { BOSS, FROST_GIANT, GRAVEKEEPER, MONSTERS, PUMPKIN_KING, TROLL } from '../data/monsters';
import type { BossState } from './bossState';
import { applyKnockback, damageBuilding, hurtFriendliesInRadius, hurtFriendly, stunFriendliesInRadius } from './combat';
import { igniteFire, warnBlackout } from './fire';
import { Ground, isWalkable, SIDES } from './map';
import type { BuildingState, Unit } from './model';
import { adjacentBuilding, nearestFriendly, nearestOf } from './queries';
import { centreOf, norm } from './units';
import { addMonster, spawnMonster } from './waves';
import type { World } from './world';

/** Runs a boss's abilities; true when an ability controlled the unit this tick. */
export function updateBoss(w: World, m: Unit, s: BossState): boolean {
  if (s.kind === 'gravekeeper') return updateGravekeeper(w, m, s);
  if (s.kind === 'frostGiant') return updateFrostGiant(w, m, s);
  if (s.kind === 'pumpkinKing') return lobBoulder(w, m, s, PUMPKIN_KING.pumpkin, true);
  return s.kind === 'troll' ? updateTroll(w, m, s) : updateWarlord(w, m, s);
}

/**
 * Timers that keep running while a boss is busy swinging at a building (the normal monster AI skips
 * updateBoss during an attack), so the Gravekeeper raises the dead on schedule however he is occupied.
 */
export function tickBossTimers(w: World, m: Unit, s: BossState) {
  if (s.kind === 'frostGiant') {
    s.stompIn -= DT;
    s.boulderIn -= DT;
    return;
  }
  if (s.kind === 'pumpkinKing') {
    s.boulderIn -= DT;
    // The blackout is called whatever he is doing (mid-swing too); the world runs it from there.
    s.blackoutIn -= DT;
    if (s.blackoutIn <= 0) {
      s.blackoutIn = PUMPKIN_KING.blackout.every;
      warnBlackout(w, m);
    }
    return;
  }
  if (s.kind !== 'gravekeeper') return;
  s.tollIn -= DT;
  raiseFromGraves(w, m, s);
}

/**
 * Gravekeeper: raises the dead beside random gravestones on a timer (alongside everything else),
 * and rings a death toll on the knight: a telegraphed circle that hurts and stuns whoever stands in it.
 */
function updateGravekeeper(w: World, m: Unit, s: BossState): boolean {
  const t = GRAVEKEEPER.toll;
  if (s.ability === 'tollWindup') {
    s.abilityTime += DT;
    m.moving = false;
    if (s.abilityTime < t.telegraph) return true;
    s.ability = 'none';
    s.tollIn = t.every;
    w.events.push({ type: 'bossSlam', unit: m.id, x: s.tollX, y: s.tollY, radius: t.radius });
    stunFriendliesInRadius(w, s.tollX, s.tollY, t.radius, t.damage, t.stun);
    return true;
  }

  if (s.tollIn <= 0) {
    const target = nearestOf(w.players, m.x, m.y) ?? nearestFriendly(w, m.x, m.y);
    if (target) {
      s.ability = 'tollWindup';
      s.abilityTime = 0;
      s.tollX = target.x;
      s.tollY = target.y;
      m.facing = norm({ x: target.x - m.x, y: target.y - m.y });
      w.events.push({ type: 'bossSlamWarn', unit: m.id, x: s.tollX, y: s.tollY, radius: t.radius, time: t.telegraph });
      return true;
    }
    s.tollIn = 1;
  }
  return false;
}

/** Raises skeletons and bone knights next to gravestones (decor rocks), up to the cap; they pay nothing. */
function raiseFromGraves(w: World, m: Unit, s: BossState) {
  const r = GRAVEKEEPER.raise;
  s.raiseIn -= DT;
  if (s.raiseIn > 0) return;
  s.raiseIn = r.every;
  const graves = w.map.decor.filter((d) => d.kind === 'rock');
  const alive = w.monsters.filter((u) => u.raisedBy === m.id && u.state !== 'dead').length;
  const n = Math.min(r.count, r.maxAlive - alive);
  for (let k = 0; k < n; k++) {
    let x = m.x;
    let y = m.y;
    if (graves.length) {
      const g = w.rng.pick(graves);
      const side = GRAVE_SIDES.find(([di, dj]) => isWalkable(w.map, g.i + di, g.j + dj));
      if (side) {
        x = g.i + side[0];
        y = g.j + side[1];
      }
    }
    const kind = r.kinds[s.raised++ % r.kinds.length];
    const z = addMonster(w, x, y, kind);
    z.raisedBy = m.id;
    w.events.push({ type: 'monsterRaised', unit: z.id, by: m.id, x, y });
  }
}

/** Cells beside a gravestone to raise the dead on. */
const GRAVE_SIDES: [number, number][] = [[0, 1], [1, 0], [0, -1], [-1, 0]];

/**
 * Frost Giant: stomps a telegraphed circle on the knight (hurting whoever is in it and icing the
 * ground there for a while), and hurls ice boulders at buildings like the River Troll.
 */
function updateFrostGiant(w: World, m: Unit, s: BossState): boolean {
  const st = FROST_GIANT.stomp;
  if (s.ability === 'stompWindup') {
    s.abilityTime += DT;
    m.moving = false;
    if (s.abilityTime < st.telegraph) return true;
    s.ability = 'none';
    s.stompIn = st.every;
    w.events.push({ type: 'bossSlam', unit: m.id, x: s.slamX, y: s.slamY, radius: st.radius });
    hurtFriendliesInRadius(w, s.slamX, s.slamY, st.radius, st.damage);
    iceOver(w, s.slamX, s.slamY, st.radius, st.iceTime);
    w.events.push({ type: 'iceStomp', unit: m.id, x: s.slamX, y: s.slamY, radius: st.radius, time: st.iceTime });
    return true;
  }
  if (s.stompIn <= 0 && s.ability === 'none') {
    const target = nearestOf(w.players, m.x, m.y);
    if (target) {
      s.ability = 'stompWindup';
      s.abilityTime = 0;
      s.slamX = target.x;
      s.slamY = target.y;
      m.facing = norm({ x: target.x - m.x, y: target.y - m.y });
      w.events.push({ type: 'bossSlamWarn', unit: m.id, x: s.slamX, y: s.slamY, radius: st.radius, time: st.telegraph });
      return true;
    }
    s.stompIn = 1;
  }
  return lobBoulder(w, m, s, FROST_GIANT.boulder);
}

/** Ices over every walkable cell in a circle until `time` seconds from now. */
function iceOver(w: World, cx: number, cy: number, radius: number, time: number) {
  const r = Math.ceil(radius);
  for (let j = Math.round(cy) - r; j <= Math.round(cy) + r; j++) {
    for (let i = Math.round(cx) - r; i <= Math.round(cx) + r; i++) {
      if (!isWalkable(w.map, i, j) || Math.hypot(i - cx, j - cy) > radius) continue;
      const k = j * w.map.size + i;
      w.frostUntil[k] = Math.max(w.frostUntil[k], w.time + time);
    }
  }
}

/**
 * River Troll: regenerates while standing in the river, and lobs boulders at buildings in range
 * (telegraphed on the target, then damages the building and anyone nearby).
 */
function updateTroll(w: World, m: Unit, s: BossState): boolean {
  const k = Math.round(m.y) * w.map.size + Math.round(m.x);
  if (w.map.ground[k] === Ground.Water) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * TROLL.waterRegen * DT);
  s.boulderIn -= DT;
  return lobBoulder(w, m, s, TROLL.boulder);
}

/**
 * Boulder throw shared by the River Troll, the Frost Giant and the Pumpkin King (callers run boulderIn
 * down). True while it controls the boss. `pumpkin`: a flaming pumpkin, which leaves a fire where it lands.
 */
function lobBoulder(
  w: World, m: Unit, s: BossState,
  bd: { every: number; range: number; telegraph: number; radius: number; buildingDamage: number; unitDamage: number },
  pumpkin = false,
): boolean {
  const tag = pumpkin ? { pumpkin: true as const } : {};

  if (s.ability === 'boulderWindup') {
    s.abilityTime += DT;
    m.moving = false;
    if (s.abilityTime < bd.telegraph) return true;
    s.ability = 'none';
    s.boulderIn = bd.every;
    const b = w.buildings[s.boulderTarget];
    if (b && !b.ruined) {
      const [cx, cy] = centreOf(b.cells);
      w.events.push({ type: 'bossBoulder', unit: m.id, x: cx, y: cy, radius: bd.radius, ...tag });
      damageBuilding(w, b, bd.buildingDamage, m);
      hurtFriendliesInRadius(w, cx, cy, bd.radius, bd.unitDamage);
      if (pumpkin) {
        // The fire catches on the ground beside the house, on the side he threw from.
        const [fx, fy] = besideBuilding(w, b, m.x, m.y) ?? [cx, cy];
        igniteFire(w, fx, fy);
      }
    }
    return true;
  }

  if (s.boulderIn <= 0) {
    // Nearest standing building in range that the troll isn't already wrecking up close.
    let best = -1;
    let bestD = bd.range;
    for (const b of w.buildings) {
      if (b.ruined) continue;
      const [cx, cy] = centreOf(b.cells);
      const d = Math.hypot(cx - m.x, cy - m.y);
      if (d < bestD && d > 2) {
        bestD = d;
        best = b.id;
      }
    }
    if (best >= 0) {
      const [cx, cy] = centreOf(w.buildings[best].cells);
      s.ability = 'boulderWindup';
      s.abilityTime = 0;
      s.boulderTarget = best;
      m.facing = { x: (cx - m.x) / bestD, y: (cy - m.y) / bestD };
      w.events.push({ type: 'bossBoulderWarn', unit: m.id, x: cx, y: cy, radius: bd.radius, time: bd.telegraph, ...tag });
      return true;
    }
    s.boulderIn = 1;
  }
  return false;
}

/** The walkable cell next to a building nearest a point, or null when it is walled in. */
function besideBuilding(w: World, b: BuildingState, x: number, y: number): [number, number] | null {
  let best: [number, number] | null = null;
  let bestD = Infinity;
  for (const [i, j] of b.cells) {
    for (const [di, dj] of GRAVE_SIDES) {
      const ni = i + di;
      const nj = j + dj;
      if (!isWalkable(w.map, ni, nj)) continue;
      const d = Math.hypot(ni - x, nj - y);
      if (d < bestD) {
        bestD = d;
        best = [ni, nj];
      }
    }
  }
  return best;
}

/**
 * Runs the Warlord's abilities. Returns true when an ability controlled the unit this tick (the
 * normal monster AI is skipped), false to let the normal building-wrecking AI run.
 */
function updateWarlord(w: World, m: Unit, s: BossState): boolean {
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
