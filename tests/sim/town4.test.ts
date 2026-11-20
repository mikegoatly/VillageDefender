// Town 4 (Frostpeak Mine): ice, kobold kegs, shieldbearer wards, frost shamans, shattering golems and the Frost Giant.

import { describe, expect, it } from 'vitest';
import { FROST_GIANT, MONSTERS } from '../../src/data/monsters';
import { TOWN_BY_ID, TOWNS } from '../../src/data/towns';
import { TOWN4_WAVES } from '../../src/data/waves';
import { damageUnit } from '../../src/sim/combat';
import { generateTown, isIce } from '../../src/sim/map';
import { nearestMonster, onIce } from '../../src/sim/queries';
import { World } from '../../src/sim/world';
import { fieldRows } from '../helpers/mapBuilder';
import { aWorld, collectEvents, dummy, holdAttack, moveScreen, runSeconds, runTicks, runUntil, tank } from '../helpers/worldBuilder';

const frostpeak = TOWN_BY_ID.frostpeak;
/** The same field with every open cell turned to ice. */
const iced = (rows: string[]) => rows.map((r) => r.replace(/\./g, '*'));

describe('Town 4: Frostpeak Mine', () => {
  it('is the fourth town, unlocked by a star in the third, with its own theme and boss', () => {
    expect(TOWNS.map((t) => t.id)).toEqual(['village', 'riverside', 'graveyard', 'frostpeak']);
    expect(frostpeak.unlockStars).toBe(1);
    expect(frostpeak.map.theme).toBe('frost');
    expect(frostpeak.waves).toBe(TOWN4_WAVES);
    expect(MONSTERS.frostGiant.name).toBe(frostpeak.bossName);
  });

  it.each([1, 2, 3])('seed %i freezes ponds on open ground, clear of the crossroads, with the same buildings as the meadow', (seed) => {
    const frost = generateTown(seed, frostpeak.map);
    const meadow = generateTown(seed);
    const n = frost.size;
    const ice: [number, number][] = [];
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) if (isIce(frost, i, j)) ice.push([i, j]);
    expect(ice.length).toBeGreaterThan(20);
    for (const [i, j] of ice) {
      expect(frost.blocked[j * n + i]).toBe(0);
      expect(Math.hypot(i - frost.centre, j - frost.centre)).toBeGreaterThan(3);
    }
    expect(frost.buildings.map((b) => b.cells)).toEqual(meadow.buildings.map((b) => b.cells));
  });

  it('introduces every new monster and ends with the Frost Giant', () => {
    const kinds = new Set(TOWN4_WAVES.flatMap((w) => Object.keys(w.monsters)));
    for (const k of ['iceGolem', 'kobold', 'shieldbearer', 'frostShaman', 'frostGiant']) expect(kinds.has(k)).toBe(true);
    expect(TOWN4_WAVES).toHaveLength(10);
    expect(TOWN4_WAVES[9].monsters.frostGiant).toBe(1);
  });

  it('the early waves and the boss wave play without errors', () => {
    const early = new World({ seed: 4, mapOptions: frostpeak.map, waves: frostpeak.waves, god: true });
    expect(() => runSeconds(early, 100, () => holdAttack())).not.toThrow();
    expect(early.wave).toBeGreaterThanOrEqual(5);
    const last = new World({ seed: 4, mapOptions: frostpeak.map, waves: frostpeak.waves, god: true, startWave: 10 });
    expect(() => runSeconds(last, 60, () => holdAttack())).not.toThrow();
    expect(last.monsters.some((m) => m.kind === 'frostGiant')).toBe(true);
  });
});

describe('ice', () => {
  const glide = (rows: string[]) => {
    const { world, knight } = aWorld().withMap(rows).noRookies().withKnightAt(5, 15).build();
    runSeconds(world, 1, () => moveScreen(1, 0));
    const x = knight.x;
    const y = knight.y;
    runSeconds(world, 1);
    return Math.hypot(knight.x - x, knight.y - y);
  };

  it('the knight keeps sliding after letting go on ice, and stops dead on grass', () => {
    expect(glide(iced(fieldRows(30)))).toBeGreaterThan(1);
    expect(glide(fieldRows(30))).toBeLessThan(0.05);
  });

  it('knockback carries a monster much further on ice', () => {
    const pushed = (rows: string[]) => {
      const { world, monsters: [z] } = aWorld().withMap(rows).noRookies().withKnightAt(10, 10).withMonster('zombie', 10.8, 10).build();
      dummy(z);
      const x = z.x;
      runSeconds(world, 0.2, () => holdAttack());
      runSeconds(world, 2);
      return Math.abs(z.x - x);
    };
    expect(pushed(iced(fieldRows(30)))).toBeGreaterThan(pushed(fieldRows(30)) * 3);
  });
});

describe('kobold miner and powder keg', () => {
  const keg = MONSTERS.powderKeg.explodes!;
  const koboldWorld = () => aWorld().withMap(fieldRows(30, [{ id: 0, i: 20, j: 10 }])).noRookies().withKnightAt(2, 2).withMonster('kobold', 12, 10).build();

  it('plants a lit keg beside a building, runs from it, and the keg wrecks the building', () => {
    const { world, monsters: [d] } = koboldWorld();
    tank(d);
    runUntil(world, () => world.monsters.some((m) => m.kind === 'powderKeg'), 60 * 10);
    const k = world.monsters.find((m) => m.kind === 'powderKeg')!;
    const b = world.buildings[0];
    const hp = b.hp;
    runSeconds(world, MONSTERS.kobold.plants!.runFor * 0.8);
    expect(Math.hypot(d.x - k.x, d.y - k.y)).toBeGreaterThan(1.5);
    const events = collectEvents(world, Math.round(keg.fuse * 60));
    expect(events.some((e) => e.type === 'explosion' && e.unit === k.id)).toBe(true);
    expect(hp - b.hp).toBeGreaterThanOrEqual(keg.buildingDamage);
  });

  it('takes no damage, is never a kill, and only the knight can find it', () => {
    const { world, monsters: [k] } = aWorld().withMap(fieldRows(30)).noRookies().withKnightAt(2, 2).withMonster('powderKeg', 10, 10).build();
    runTicks(world, 1);
    damageUnit(world, k, 1000, world.players[0].id);
    expect(k.state).not.toBe('dead');
    expect(world.kills).toBe(0);
    expect(nearestMonster(world, 10, 10, 3)).toBeNull();
    expect(nearestMonster(world, 10, 10, 3, true)).toBe(k);
  });

  it("the knight's swing kicks it a good distance", () => {
    const { world, monsters: [k] } = aWorld().withMap(fieldRows(30)).noRookies().withKnightAt(10, 10).withMonster('powderKeg', 10.6, 10).build();
    const x = k.x;
    runSeconds(world, 0.2, () => holdAttack());
    runSeconds(world, 1);
    expect(Math.hypot(k.x - x, k.y - 10)).toBeGreaterThan(1.5);
  });

  it('blows up the monsters around it, credited to the knight who kicked it', () => {
    const { world, knight, monsters: [k, a, b] } = aWorld().withMap(fieldRows(30)).noRookies().withKnightAt(25, 25)
      .withMonster('powderKeg', 10, 10).withMonster('zombie', 10.8, 10).withMonster('zombie', 9.3, 10).build();
    a.speed = 0;
    b.speed = 0;
    k.targetId = knight.id;
    runSeconds(world, keg.fuse + 0.1);
    expect(a.state).toBe('dead');
    expect(b.state).toBe('dead');
    expect(world.kills).toBe(2);
    expect(knight.hp).toBe(knight.maxHp);
  });
});

describe('shieldbearer', () => {
  const ward = MONSTERS.shieldbearer.ward!;
  const wardWorld = () => {
    const built = aWorld().withMap(fieldRows(30)).noRookies().withKnightAt(25, 25)
      .withMonster('shieldbearer', 10, 10).withMonster('zombie', 10 + ward.radius - 0.5, 10).withMonster('zombie', 10 + ward.radius + 2, 10).build();
    for (const m of built.monsters) dummy(m, 1000);
    runTicks(built.world, 1); // rebuilds the ward list
    return built;
  };

  it('cuts damage to monsters inside its ward, not outside', () => {
    const { world, monsters: [, near, far] } = wardWorld();
    damageUnit(world, near, 10, -1);
    damageUnit(world, far, 10, -1);
    expect(near.maxHp - near.hp).toBe(10 * (1 - ward.reduction));
    expect(far.maxHp - far.hp).toBe(10);
  });

  it('its own ward does not cover itself', () => {
    const { world, monsters: [s] } = wardWorld();
    damageUnit(world, s, 10, -1);
    expect(s.maxHp - s.hp).toBe(10);
  });

  it('once it dies the ward is gone', () => {
    const { world, monsters: [s, near] } = wardWorld();
    damageUnit(world, s, 1e6, -1);
    runTicks(world, 1);
    damageUnit(world, near, 10, -1);
    expect(near.maxHp - near.hp).toBe(10);
  });
});

describe('frost shaman', () => {
  const f = MONSTERS.frostShaman.freezes!;

  it('heals wounded monsters around it', () => {
    const { world, monsters: [, z] } = aWorld().withMap(fieldRows(30, [{ id: 0, i: 28, j: 28 }])).noRookies().withKnightAt(2, 2)
      .withMonster('frostShaman', 10, 10).withMonster('zombie', 11, 10).build();
    z.hp = 5;
    const events = collectEvents(world, 1);
    expect(z.hp).toBe(5 + MONSTERS.frostShaman.heals!.amount);
    expect(events.some((e) => e.type === 'monstersHealed')).toBe(true);
  });

  it('freezes a rookie in range before the knight: telegraph, then damage and a long stun', () => {
    const { world, knight, rookies: [r], monsters: [s] } = aWorld().withMap(fieldRows(30)).noRookies().withKnightAt(12, 10)
      .withRookie('swordsman', 10, 14).withMonster('frostShaman', 10, 10).build();
    s.speed = 0;
    r.speed = 0;
    runSeconds(world, f.first + f.telegraph + 0.2);
    expect(r.stun).toBeGreaterThan(f.stun - 0.5);
    expect(knight.stun).toBe(0);
  });
});

describe('ice golem', () => {
  it('shatters into two shards, and each shard into two icelings, all paying out', () => {
    const { world, monsters: [g] } = aWorld().withMap(fieldRows(30)).noRookies().withKnightAt(25, 25).withMonster('iceGolem', 10, 10).build();
    damageUnit(world, g, 1e6, -1);
    const shards = world.monsters.filter((m) => m.kind === 'iceShard');
    expect(shards).toHaveLength(2);
    for (const s of shards) damageUnit(world, s, 1e6, -1);
    expect(world.monsters.filter((m) => m.kind === 'iceling')).toHaveLength(4);
    expect(world.kills).toBe(3);
    expect(world.coins).toBe(MONSTERS.iceGolem.coins + 2 * MONSTERS.iceShard.coins);
  });
});

describe('Frost Giant', () => {
  const bossWorld = () => {
    const map = generateTown(1, frostpeak.map);
    const c = map.centre;
    const { world: w, knight, monsters: [boss] } = aWorld()
      .withTownMap(map).noRookies().withKnightAt(c, c).withMonster('frostGiant', c + 6, c).build();
    tank(boss);
    boss.speed = 0;
    return { w, knight, boss };
  };
  const st = FROST_GIANT.stomp;

  it('stomps the knight: telegraph, then damage, and the ground there turns to ice for a while', () => {
    const { w, knight, boss } = bossWorld();
    boss.boss!.boulderIn = 1e9;
    expect(onIce(w, knight)).toBe(false);
    const events: typeof w.events = [];
    runUntil(w, () => { events.push(...w.events); return w.events.some((e) => e.type === 'iceStomp'); }, 60 * 12);
    const warn = events.findIndex((e) => e.type === 'bossSlamWarn');
    expect(warn).toBeGreaterThanOrEqual(0);
    expect(events.findIndex((e) => e.type === 'iceStomp')).toBeGreaterThan(warn);
    expect(knight.hp).toBe(knight.maxHp - st.damage);
    expect(onIce(w, knight)).toBe(true);
    boss.boss!.stompIn = 1e9;
    runSeconds(w, st.iceTime + 0.1);
    expect(onIce(w, knight)).toBe(false);
  });

  it('a knight who steps out during the telegraph is untouched', () => {
    const { w, knight, boss } = bossWorld();
    boss.boss!.boulderIn = 1e9;
    runUntil(w, () => boss.boss!.ability === 'stompWindup', 60 * 10);
    knight.x += st.radius + 2;
    runSeconds(w, st.telegraph + 0.3);
    expect(knight.hp).toBe(knight.maxHp);
  });

  it('hurls ice boulders at buildings', () => {
    const { w, boss } = bossWorld();
    boss.boss!.stompIn = 1e9;
    const events = collectEvents(w, 60 * 8);
    expect(events.some((e) => e.type === 'bossBoulder')).toBe(true);
  });
});
