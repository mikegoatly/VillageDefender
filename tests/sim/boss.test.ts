import { describe, expect, it } from 'vitest';
import { DT } from '../../src/data/balance';
import { BOSS, MONSTERS } from '../../src/data/monsters';
import type { WaveDef } from '../../src/data/waves';
import { Profile } from '../../src/meta/profile';
import { emptyInput } from '../../src/sim/types';
import type { SimEvent, Unit, World } from '../../src/sim/world';
import { groundToScreenMove } from '../helpers/bots';
import { fieldRows, openField } from '../helpers/mapBuilder';
import { memoryStore } from '../helpers/profile';
import { aWorld, collectEvents, runSeconds, step } from '../helpers/worldBuilder';

type Ev<T extends SimEvent['type']> = Extract<SimEvent, { type: T }>;
const ofType = <T extends SimEvent['type']>(events: SimEvent[], type: T) => events.filter((e) => e.type === type) as Ev<T>[];

/** Warlord at (20, 20) in an open field with the knight `knightDx` cells east of him; slam off cooldown. */
function slamArena(knightDx: number) {
  const built = aWorld().withKnightAt(20 + knightDx, 20).withMonster('warlord', 20, 20).build();
  const boss = built.monsters[0];
  boss.boss!.slamCd = 0;
  return { ...built, boss };
}

/** Ticks until `pred` over a tick's events is true (bounded); returns the tick count and the events seen. */
function tickUntilEvent(world: World, type: SimEvent['type'], input = emptyInput(), max = 600) {
  const seen: SimEvent[] = [];
  for (let k = 1; k <= max; k++) {
    step(world, input);
    seen.push(...world.events);
    if (world.events.some((e) => e.type === type)) return { ticks: k, seen };
  }
  return { ticks: -1, seen };
}

describe('boss spawn', () => {
  it('addMonster(warlord) emits bossSpawn and world.boss returns it', () => {
    const { world, monsters: [boss] } = aWorld().withMonster('warlord', 20, 20).build();
    expect(world.events).toContainEqual({ type: 'bossSpawn', unit: boss.id });
    expect(world.boss).toBe(boss);
    expect(boss.boss).toBeDefined();
    expect(boss.hp).toBe(MONSTERS.warlord.hp);
  });

  it('there is no boss unless one was spawned', () => {
    const { world } = aWorld().withZombieAt(20, 20).build();
    expect(world.boss).toBeNull();
    expect(world.monsters[0].boss).toBeUndefined();
  });

  it('the boss wave spawns him on schedule with a bossSpawn event', () => {
    const waves: WaveDef[] = [{ monsters: { warlord: 1 }, sides: 1 }];
    const { world } = aWorld().withWaves(waves).withTownMap(openField()).god().build();
    expect(world.boss).toBeNull();
    const events = collectEvents(world, 7 * 60);
    expect(ofType(events, 'bossSpawn')).toHaveLength(1);
    expect(world.boss).not.toBeNull();
    expect(ofType(events, 'bossSpawn')[0].unit).toBe(world.boss!.id);
  });
});

describe('boss ground slam', () => {
  it('warns, then after the telegraph damages and knocks back the knight', () => {
    const { world, knight, boss } = slamArena(2);
    const startX = knight.x;
    const warn = tickUntilEvent(world, 'bossSlamWarn', emptyInput(), 5);
    expect(warn.ticks).toBe(1);
    expect(ofType(warn.seen, 'bossSlamWarn')[0]).toMatchObject({
      unit: boss.id, x: boss.x, y: boss.y, radius: BOSS.slam.radius, time: BOSS.slam.telegraph,
    });
    // Nothing hurts the knight during the telegraph.
    const slam = tickUntilEvent(world, 'bossSlam');
    expect(Math.abs(slam.ticks * DT - BOSS.slam.telegraph)).toBeLessThan(3 * DT);
    expect(ofType(slam.seen, 'bossSlam')[0]).toMatchObject({ unit: boss.id, radius: BOSS.slam.radius });
    expect(ofType(slam.seen, 'playerHurt').map((e) => e.damage)).toEqual([BOSS.slam.damage]);
    expect(knight.hp).toBe(knight.maxHp - BOSS.slam.damage);
    // Shoved away from the boss.
    runSeconds(world, 0.4);
    expect(knight.x).toBeGreaterThan(startX + 0.5);
  });

  it('does not trigger when the knight is beyond the trigger range', () => {
    const { world } = slamArena(6);
    const events = collectEvents(world, 60);
    expect(ofType(events, 'bossSlamWarn')).toHaveLength(0);
  });

  it('a knight who moves out of the radius in time takes no damage', () => {
    const { world, knight } = slamArena(2);
    tickUntilEvent(world, 'bossSlamWarn', emptyInput(), 5);
    const away = { ...emptyInput(), move: groundToScreenMove(1, 0) };
    const slam = tickUntilEvent(world, 'bossSlam', away);
    expect(slam.ticks).toBeGreaterThan(0);
    runSeconds(world, 0.2);
    expect(ofType(slam.seen, 'playerHurt')).toHaveLength(0);
    expect(knight.hp).toBe(knight.maxHp);
    expect(knight.x).toBeGreaterThan(20 + 2 + BOSS.slam.radius);
  });

  it('god mode shrugs the slam off but still shoves', () => {
    const { world, knight } = slamArena(2);
    world.god = true;
    const slam = tickUntilEvent(world, 'bossSlam');
    expect(slam.ticks).toBeGreaterThan(0);
    expect(knight.hp).toBe(knight.maxHp);
  });

  it('rookies in the radius are hurt too', () => {
    const { world, rookies: [r] } = aWorld().withKnightAt(30, 30).withRookie('swordsman', 21.5, 20).withMonster('warlord', 20, 20).build();
    r.attackCooldown = 1e9;
    world.monsters[0].boss!.slamCd = 0;
    const slam = tickUntilEvent(world, 'bossSlam');
    expect(slam.ticks).toBeGreaterThan(0);
    expect(r.hp).toBeLessThanOrEqual(r.maxHp - BOSS.slam.damage);
  });
});

describe('boss charge', () => {
  // The building is 7 cells east of the boss; the knight is far to the south.
  const chargeArena = () => {
    const built = aWorld()
      .withMap(fieldRows(30, [{ id: 0, i: 17, j: 10 }]))
      .withKnightAt(10, 27)
      .withMonster('warlord', 10, 10)
      .build();
    built.monsters[0].boss!.chargeIn = 0;
    return { ...built, boss: built.monsters[0] };
  };

  it('announces a charge at a building, winds up, then moves fast and smashes it on arrival', () => {
    const { world, boss } = chargeArena();
    const startX = boss.x;
    const charge = tickUntilEvent(world, 'bossCharge', emptyInput(), 5);
    expect(ofType(charge.seen, 'bossCharge')[0]).toMatchObject({ unit: boss.id, building: 0 });

    // Wind-up: he stands still.
    runSeconds(world, BOSS.charge.windup - 0.2);
    expect(boss.x).toBeCloseTo(startX, 1);

    // Charging: per-tick displacement well above his normal walking pace.
    let fastest = 0;
    let hit: Ev<'buildingHit'> | null = null;
    let hitTime = 0;
    for (let k = 0; k < 6 * 60 && !hit; k++) {
      const before = boss.x;
      step(world);
      fastest = Math.max(fastest, (boss.x - before) / DT);
      hit = ofType(world.events, 'buildingHit')[0] ?? null;
      hitTime = world.time;
    }
    expect(fastest).toBeGreaterThan(MONSTERS.warlord.speed * 3);
    expect(hit).not.toBeNull();
    expect(hit).toMatchObject({ by: boss.id, damage: BOSS.charge.buildingDamage });
    expect(world.buildings[0].hp).toBe(world.buildings[0].maxHp - BOSS.charge.buildingDamage);
    // Walking 5+ cells at his normal pace would take over 6 s; the charge lands well before that.
    expect(hitTime).toBeLessThan(BOSS.charge.windup + BOSS.charge.maxTime + 0.5);
  });

  it('does not charge again right away (cooldown)', () => {
    const { world } = chargeArena();
    const events = collectEvents(world, 8 * 60);
    expect(ofType(events, 'bossCharge')).toHaveLength(1);
  });

  it('has no charge target in a field with no buildings', () => {
    const { world, monsters: [boss] } = aWorld().withKnightAt(35, 35).withMonster('warlord', 5, 5).build();
    boss.boss!.chargeIn = 0;
    const events = collectEvents(world, 3 * 60);
    expect(ofType(events, 'bossCharge')).toHaveLength(0);
  });
});

describe('boss summon', () => {
  it('calls BOSS.summon.count orcs every BOSS.summon.every seconds', () => {
    const { world } = aWorld().god().withKnightAt(35, 35).withMonster('warlord', 5, 5).build();
    const summons: { t: number; orcsAdded: number; count: number }[] = [];
    const orcs = () => world.monsters.filter((m: Unit) => m.kind === BOSS.summon.kind).length;
    let before = orcs();
    const total = Math.round((BOSS.summon.every * 2 + 2) / DT);
    for (let k = 0; k < total; k++) {
      step(world);
      const e = ofType(world.events, 'bossSummon')[0];
      if (e) summons.push({ t: world.time, orcsAdded: orcs() - before, count: e.count });
      before = orcs();
    }
    expect(summons.length).toBeGreaterThanOrEqual(2);
    for (const s of summons) {
      expect(s.count).toBe(BOSS.summon.count);
      expect(s.orcsAdded).toBe(BOSS.summon.count);
    }
    expect(summons[1].t - summons[0].t).toBeCloseTo(BOSS.summon.every, 1);
  });
});

describe('killing the boss', () => {
  it('records the kill in the run result', () => {
    const { world, monsters: [boss] } = aWorld().withKnightAt(30, 30).withMonster('warlord', 20, 20).build();
    world.debugKillAll();
    runSeconds(world, 0.1);
    expect(boss.state).toBe('dead');
    expect(world.boss).toBeNull();
    expect(world.killsByKind.warlord).toBe(1);
    expect(world.runResult().kills.warlord).toBe(1);
    expect(world.coins).toBe(MONSTERS.warlord.coins);
  });

  it('the level is not won while the boss lives, and is won once he and the field are cleared', () => {
    const waves: WaveDef[] = [{ monsters: { warlord: 1 }, sides: 1 }];
    const { world } = aWorld().withWaves(waves).withTownMap(openField()).god().build();
    runSeconds(world, 30);
    expect(world.boss).not.toBeNull();
    expect(world.status).toBe('playing');
    runSeconds(world, 30);
    expect(world.status).toBe('playing');
    world.debugKillAll();
    runSeconds(world, 0.1);
    expect(world.status).toBe('won');
    expect(world.runResult()).toMatchObject({ won: true });
    expect(world.runResult().kills.warlord).toBe(1);
  });

  it('defeating him in a run unlocks the flail', () => {
    const { world } = aWorld().withKnightAt(30, 30).withMonster('warlord', 20, 20).build();
    world.debugKillAll();
    runSeconds(world, 0.1);
    const profile = new Profile(memoryStore());
    const out = profile.recordRun(world.runResult());
    expect(out.unlockedWeapons).toEqual(['flail']);
    expect(out.newAchievements.map((a) => a.id)).toContain('kingslayer');
  });
});
