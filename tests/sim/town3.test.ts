// Town 3 (haunted graveyard): theme, bone knight armour, banshee wail, gravedigger tunnelling and the Gravekeeper.

import { describe, expect, it } from 'vitest';
import { GRAVEKEEPER, MONSTERS } from '../../src/data/monsters';
import { TOWN_BY_ID, TOWNS } from '../../src/data/towns';
import { TOWN3_WAVES } from '../../src/data/waves';
import { areaHits, damageUnit } from '../../src/sim/combat';
import { generateTown } from '../../src/sim/map';
import { fieldRows } from '../helpers/mapBuilder';
import { aWorld, collectEvents, holdAttack, runSeconds, runTicks, runUntil, tank } from '../helpers/worldBuilder';

const graveyard = TOWN_BY_ID.graveyard;

describe('Town 3: haunted graveyard', () => {
  it('is the third town, unlocked by a star in the second, with its own theme and boss', () => {
    expect(TOWNS.map((t) => t.id).slice(0, 3)).toEqual(['village', 'riverside', 'graveyard']);
    expect(graveyard.unlockStars).toBe(1);
    expect(graveyard.map.theme).toBe('graveyard');
    expect(graveyard.waves).toBe(TOWN3_WAVES);
    expect(MONSTERS.gravekeeper.name).toBe(graveyard.bossName);
  });

  it.each([1, 2, 3])('seed %i has far more gravestones than the same meadow, and the theme is on the map', (seed) => {
    const grave = generateTown(seed, graveyard.map);
    const meadow = generateTown(seed);
    const rocks = (m: typeof grave) => m.decor.filter((d) => d.kind === 'rock').length;
    expect(grave.theme).toBe('graveyard');
    expect(meadow.theme).toBe('meadow');
    expect(rocks(grave)).toBeGreaterThan(rocks(meadow) * 1.5);
    // Same buildings: the theme only changes what grows outside the town.
    expect(grave.buildings.map((b) => b.cells)).toEqual(meadow.buildings.map((b) => b.cells));
  });

  it('introduces every new monster, ends with the Gravekeeper, and the late waves come from three sides', () => {
    const kinds = new Set(TOWN3_WAVES.flatMap((w) => Object.keys(w.monsters)));
    for (const k of ['boneKnight', 'banshee', 'gravedigger', 'gravekeeper']) expect(kinds.has(k)).toBe(true);
    expect(TOWN3_WAVES).toHaveLength(10);
    expect(TOWN3_WAVES[9].monsters.gravekeeper).toBe(1);
    expect(TOWN3_WAVES.filter((w) => w.sides === 3).length).toBeGreaterThanOrEqual(5);
  });
});

describe('bone knight', () => {
  const knightWorld = () => {
    const built = aWorld().withKnightAt(20, 20).withMonster('boneKnight', 10, 10).build();
    built.monsters[0].facing = { x: 1, y: 0 };
    return built;
  };

  it('takes reduced damage from a friendly standing in front of it', () => {
    const { world, knight, monsters: [b] } = knightWorld();
    knight.x = b.x + 1;
    knight.y = b.y;
    damageUnit(world, b, 10, knight.id);
    expect(b.hp).toBe(b.maxHp - 10 * (1 - MONSTERS.boneKnight.armor!.front));
  });

  it('takes full damage from behind', () => {
    const { world, knight, monsters: [b] } = knightWorld();
    knight.x = b.x - 1;
    knight.y = b.y;
    damageUnit(world, b, 10, knight.id);
    expect(b.hp).toBe(b.maxHp - 10);
  });

  it('takes full damage from sources with no position (thorns, blasts)', () => {
    const { world, monsters: [b] } = knightWorld();
    damageUnit(world, b, 10, -1);
    expect(b.hp).toBe(b.maxHp - 10);
  });

  it('area hits (hammer, flail) ignore the armour even from the front', () => {
    const { world, knight, monsters: [b] } = knightWorld();
    knight.x = b.x + 1;
    knight.y = b.y;
    runTicks(world, 1); // builds the enemy hash
    const before = b.hp;
    areaHits(world, knight.id, b.x, b.y, 1, 10, 0);
    expect(before - b.hp).toBe(10);
  });
});

describe('banshee', () => {
  const bansheeWorld = (knightDx = 1.5) => {
    // A far-off building keeps her from chasing the knight; she stays put so only the wail matters.
    const built = aWorld().withMap(fieldRows(40, [{ id: 0, i: 35, j: 35 }])).withKnightAt(10 + knightDx, 10).withMonster('banshee', 10, 10).build();
    tank(built.monsters[0]).speed = 0;
    return built;
  };
  const wail = MONSTERS.banshee.wail!;

  it('winds up with a warning, then hurts and stuns a knight in the circle', () => {
    const { world, knight } = bansheeWorld();
    const events = collectEvents(world, Math.round((wail.first + wail.telegraph + 0.3) * 60));
    const warn = events.findIndex((e) => e.type === 'wailWarn');
    const fire = events.findIndex((e) => e.type === 'wail');
    expect(warn).toBeGreaterThanOrEqual(0);
    expect(fire).toBeGreaterThan(warn);
    expect(knight.hp).toBe(knight.maxHp - wail.damage);
    expect(knight.stun).toBeGreaterThan(0);
  });

  it('a stunned knight cannot attack, and recovers afterwards', () => {
    const { world, knight, monsters: [b] } = bansheeWorld();
    runUntil(world, () => knight.stun > 0, 60 * 8);
    b.x = 1; // out of the way so only the stun matters
    const cooldown = knight.attackCooldown;
    runSeconds(world, wail.stun / 2, () => holdAttack());
    expect(knight.attackCooldown).toBeLessThanOrEqual(cooldown);
    expect(knight.state).toBe('idle');
    runSeconds(world, wail.stun, () => holdAttack());
    expect(knight.stun).toBe(0);
    expect(knight.attackCooldown).toBeGreaterThan(0); // swung once the stun wore off
  });

  it('a dodging knight is neither hurt nor stunned', () => {
    const { world, knight } = bansheeWorld();
    runSeconds(world, wail.first + wail.telegraph - 0.1);
    knight.invuln = 1; // mid-dodge when the wail lands
    runSeconds(world, 0.4);
    expect(knight.hp).toBe(knight.maxHp);
    expect(knight.stun).toBe(0);
  });

  it('does not wail at a knight out of range', () => {
    const { world, knight } = bansheeWorld(wail.range + 3);
    const events = collectEvents(world, 60 * 6);
    expect(events.some((e) => e.type === 'wailWarn')).toBe(false);
    expect(knight.hp).toBe(knight.maxHp);
  });

  it('only wails again after its cooldown', () => {
    const { world } = bansheeWorld();
    const events = collectEvents(world, Math.round((wail.first + wail.every - 1) * 60));
    expect(events.filter((e) => e.type === 'wail')).toHaveLength(1);
  });
});

describe('gravedigger', () => {
  const digWorld = (knightAt: [number, number] = [1, 1]) => aWorld()
    .withMap(fieldRows(30, [{ id: 0, i: 20, j: 10 }]))
    .withKnightAt(...knightAt)
    .withMonster('gravedigger', 5, 10)
    .build();

  it('starts burrowed and cannot be hurt by the knight swinging at it', () => {
    const { world, monsters: [d] } = digWorld([5.4, 10]);
    expect(d.burrowed).toBe(true);
    runSeconds(world, 0.5, () => holdAttack());
    expect(d.hp).toBe(d.maxHp);
    expect(world.kills).toBe(0);
  });

  it('tunnels straight to the nearest building and surfaces within range of it', () => {
    const { world, monsters: [d] } = digWorld();
    const events = collectEvents(world, 60 * 20);
    expect(events.some((e) => e.type === 'monsterSurfaced' && e.unit === d.id)).toBe(true);
    expect(d.burrowed).toBe(false);
    expect(Math.hypot(20 - d.x, 10 - d.y)).toBeLessThan(MONSTERS.gravedigger.burrows!.surfaceRange + 1.5);
  });

  it('once up it is a normal monster: it can be hurt and it wrecks the building', () => {
    const { world, monsters: [d] } = digWorld();
    tank(d);
    runUntil(world, () => !d.burrowed, 60 * 20);
    const b = world.buildings[0];
    runUntil(world, () => b.hp < b.maxHp, 60 * 15);
    expect(b.hp).toBe(b.maxHp - MONSTERS.gravedigger.buildingDamage);
    d.x = world.players[0].x;
    d.y = world.players[0].y;
    runTicks(world, 1);
    const hp = d.hp;
    damageUnit(world, d, 5, world.players[0].id);
    expect(d.hp).toBe(hp - 5);
  });
});

describe('Gravekeeper', () => {
  const bossWorld = () => {
    const map = generateTown(1, graveyard.map);
    const c = map.centre;
    const { world: w, knight, monsters: [boss] } = aWorld()
      .withTownMap(map).noRookies().withKnightAt(c, c).withMonster('gravekeeper', c + 6, c).build();
    tank(boss);
    return { w, knight, boss };
  };

  it('raises skeletons and a bone knight beside gravestones, which pay nothing', () => {
    const { w, boss } = bossWorld();
    boss.boss!.tollIn = 1e9;
    const events = collectEvents(w, Math.round((GRAVEKEEPER.raise.first + 0.2) * 60));
    expect(events.filter((e) => e.type === 'monsterRaised')).toHaveLength(GRAVEKEEPER.raise.count);
    const raised = w.monsters.filter((m) => m.raisedBy === boss.id);
    expect(raised.map((m) => m.kind)).toEqual(GRAVEKEEPER.raise.kinds);
    const coins = w.coins;
    damageUnit(w, raised[0], 1000, w.players[0].id);
    expect(w.coins).toBe(coins);
  });

  it('never has more than the cap of raised monsters alive', () => {
    const { w, boss } = bossWorld();
    boss.boss!.tollIn = 1e9;
    for (const m of w.monsters) if (m !== boss) tank(m);
    w.players[0].x = 1;
    w.players[0].y = 1;
    runSeconds(w, GRAVEKEEPER.raise.every * 8);
    const alive = w.monsters.filter((m) => m.raisedBy === boss.id && m.state !== 'dead').length;
    expect(alive).toBeLessThanOrEqual(GRAVEKEEPER.raise.maxAlive);
    expect(alive).toBeGreaterThan(GRAVEKEEPER.raise.count);
  });

  it('rings a toll on the knight: telegraph first, then damage and a stun', () => {
    const { w, knight, boss } = bossWorld();
    boss.boss!.raiseIn = 1e9;
    const t = GRAVEKEEPER.toll;
    const events = collectEvents(w, Math.round((t.every * 0.4 + t.telegraph + 0.5) * 60));
    const warn = events.find((e) => e.type === 'bossSlamWarn');
    expect(warn).toBeDefined();
    expect(events.findIndex((e) => e.type === 'bossSlam')).toBeGreaterThan(events.findIndex((e) => e.type === 'bossSlamWarn'));
    expect(knight.hp).toBe(knight.maxHp - t.damage);
    expect(knight.stun).toBeGreaterThan(0);
  });

  it('a knight who steps out of the circle during the telegraph is untouched', () => {
    const { w, knight, boss } = bossWorld();
    boss.boss!.raiseIn = 1e9;
    runUntil(w, () => boss.boss!.ability === 'tollWindup', 60 * 10);
    knight.x += GRAVEKEEPER.toll.radius + 2;
    runSeconds(w, GRAVEKEEPER.toll.telegraph + 0.3);
    expect(knight.hp).toBe(knight.maxHp);
    expect(knight.stun).toBe(0);
  });
});
