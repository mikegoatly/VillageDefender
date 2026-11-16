import { describe, expect, it } from 'vitest';
import { MONSTERS, type MonsterKind } from '../../src/data/monsters';
import { isWalkable } from '../../src/sim/map';
import type { Unit } from '../../src/sim/world';
import { fieldRows } from '../helpers/mapBuilder';
import { emptyInput } from '../../src/sim/types';
import { aWorld, collectEvents, runSeconds, runUntil, tank } from '../helpers/worldBuilder';

/** Rookies that never swing, so they only serve as a target. */
const harmless = (r: Unit) => { r.attackCooldown = 1e9; return r; };

describe('skeleton (stalker)', () => {
  it('chases the knight past nearby buildings and ignores rookies', () => {
    // Skeleton starts hard against a building and 2 cells from a rookie; the knight is 15 cells away.
    const { world, knight, monsters: [skel], rookies: [rookie] } = aWorld()
      .withMap(fieldRows(30, [{ id: 0, i: 11, j: 10 }]))
      .withKnightAt(25, 10)
      .withMonster('skeleton', 10, 10)
      .withRookie('swordsman', 10, 12)
      .build();
    tank(skel);
    harmless(rookie);
    const building = world.buildings[0];
    runSeconds(world, 3);
    expect(skel.x).toBeGreaterThan(12);
    expect(skel.attackBuilding).toBe(-1);
    expect(building.hp).toBe(building.maxHp);
    runUntil(world, () => knight.hp < knight.maxHp, 600);
    expect(knight.hp).toBe(knight.maxHp - MONSTERS.skeleton.damage);
    expect(rookie.hp).toBe(rookie.maxHp);
    expect(building.hp).toBe(building.maxHp);
  });

  it('keeps hunting the knight when a rookie stands next to it', () => {
    const { world, knight, monsters: [skel], rookies: [rookie] } = aWorld()
      .withKnightAt(25, 20)
      .withMonster('skeleton', 20, 20)
      .withRookie('swordsman', 19.4, 20.6)
      .build();
    tank(skel);
    harmless(rookie);
    runUntil(world, () => knight.hp < knight.maxHp, 600);
    expect(knight.hp).toBeLessThan(knight.maxHp);
    expect(skel.targetId).toBe(knight.id);
    expect(rookie.hp).toBe(rookie.maxHp);
  });
});

describe('vampire (leech)', () => {
  const vampireWorld = (rookies: boolean) => {
    const b = aWorld().withKnightAt(20, 18).withMonster('vampire', 20, 20);
    if (rookies) b.withRookie('swordsman', 24, 20);
    const built = b.build();
    tank(built.monsters[0], 500);
    built.monsters[0].hp = 100;
    if (rookies) harmless(built.rookies[0]);
    return built;
  };

  it('targets the nearest rookie over a closer knight', () => {
    const { world, knight, monsters: [vamp], rookies: [rookie] } = vampireWorld(true);
    runUntil(world, () => rookie.hp < rookie.maxHp, 600);
    expect(rookie.hp).toBeLessThan(rookie.maxHp);
    expect(vamp.targetId).toBe(rookie.id);
    expect(knight.hp).toBe(knight.maxHp);
  });

  it('heals by the damage it deals (lifesteal)', () => {
    const { world, monsters: [vamp], rookies: [rookie] } = vampireWorld(true);
    const def = MONSTERS.vampire;
    const before = vamp.hp;
    runUntil(world, () => rookie.hp < rookie.maxHp, 600);
    expect(rookie.maxHp - rookie.hp).toBe(def.damage);
    expect(vamp.hp).toBeCloseTo(before + def.damage * def.lifesteal!);
  });

  it('does not heal past its max HP', () => {
    const { world, monsters: [vamp], rookies: [rookie] } = vampireWorld(true);
    vamp.hp = vamp.maxHp - 1;
    runUntil(world, () => rookie.hp < rookie.maxHp, 600);
    expect(vamp.hp).toBe(vamp.maxHp);
  });

  it('falls back to the knight when there are no rookies', () => {
    const { world, knight, monsters: [vamp] } = vampireWorld(false);
    const before = vamp.hp;
    runUntil(world, () => knight.hp < knight.maxHp, 600);
    expect(knight.hp).toBe(knight.maxHp - MONSTERS.vampire.damage);
    expect(vamp.targetId).toBe(knight.id);
    expect(vamp.hp).toBeCloseTo(before + MONSTERS.vampire.damage * MONSTERS.vampire.lifesteal!);
  });

  it('goes back to the knight once its rookie falls', () => {
    const { world, knight, monsters: [vamp], rookies: [rookie] } = vampireWorld(true);
    rookie.hp = 1;
    runUntil(world, () => rookie.state === 'dead', 600);
    expect(rookie.state).toBe('dead');
    runUntil(world, () => knight.hp < knight.maxHp, 600);
    expect(knight.hp).toBeLessThan(knight.maxHp);
    expect(vamp.targetId).toBe(knight.id);
  });
});

describe('ghost (phaser)', () => {
  // A wall of blocked cells (i = 9..10, j = 4..16) between the monster at (5, 10) and the building at (15, 10).
  const wallRows = () => {
    const rows = fieldRows(30, [{ id: 0, i: 15, j: 10 }]).map((r) => r.split(''));
    for (let j = 4; j <= 16; j++) rows[j][9] = rows[j][10] = '#';
    return rows.map((r) => r.join(''));
  };

  function walk(kind: MonsterKind, seconds: number) {
    const { world, monsters: [m] } = aWorld().withMap(wallRows()).withKnightAt(28, 28).withMonster(kind, 5, 10).build();
    let inWall = false;
    let maxX = m.x;
    const buildingHits: { by: number; damage: number }[] = [];
    for (let k = 0; k < Math.round(seconds * 60); k++) {
      world.tick([emptyInput()]);
      if (!isWalkable(world.map, Math.round(m.x), Math.round(m.y))) inWall = true;
      maxX = Math.max(maxX, m.x);
      for (const e of world.events) if (e.type === 'buildingHit') buildingHits.push({ by: e.by, damage: e.damage });
    }
    return { world, m, inWall, maxX, buildingHits };
  }

  it('walks through a wall of blocked cells on its way to a building', () => {
    const r = walk('ghost', 14);
    expect(r.inWall).toBe(true);
    expect(r.maxX).toBeGreaterThan(14);
  });

  it('attacks the building it reached', () => {
    const r = walk('ghost', 14);
    expect(r.buildingHits.length).toBeGreaterThan(0);
    expect(r.buildingHits.every((h) => h.by === r.m.id && h.damage === MONSTERS.ghost.buildingDamage)).toBe(true);
    const b = r.world.buildings[0];
    expect(b.hp).toBeLessThan(b.maxHp);
  });

  it('a non-phasing raider is held back by the same wall (control)', () => {
    const r = walk('orc', 3);
    expect(r.inWall).toBe(false);
    // Straight-line distance is 10 cells; an orc in 3 s covers at most ~6, and must also detour.
    expect(r.maxX).toBeLessThan(9.5);
  });
});

describe('xp and coins per kind', () => {
  it.each(Object.keys(MONSTERS) as MonsterKind[])('%s drops its definition xp and coins', (kind) => {
    const { world } = aWorld().withKnightAt(10, 10).withMonster(kind, 20, 20).build();
    world.debugKillAll();
    runSeconds(world, 0.1);
    expect(world.kills).toBe(1);
    expect(world.killsByKind[kind]).toBe(1);
    expect(world.coins).toBe(MONSTERS[kind].coins);
    expect(world.gems).toHaveLength(1);
    expect(world.gems[0].value).toBe(MONSTERS[kind].xp);
  });

  it('knight kills credit coins and xp the same way', () => {
    const { world, knight, monsters: [skel] } = aWorld().withKnightAt(20, 20).withMonster('skeleton', 20.5, 20).build();
    skel.speed = 0;
    const events = collectEvents(world, 120, { ...emptyInput(), attack: true });
    expect(events.some((e) => e.type === 'death' && e.unit === skel.id)).toBe(true);
    expect(world.coins).toBe(MONSTERS.skeleton.coins);
    expect(knight.hp).toBeGreaterThan(0);
    runSeconds(world, 2);
    expect(world.progression.xp).toBe(MONSTERS.skeleton.xp);
  });
});
