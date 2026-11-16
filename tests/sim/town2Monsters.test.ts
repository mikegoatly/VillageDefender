// Town 2 monsters: river imp, necromancer, skeleton archer and sapper.

import { describe, expect, it } from 'vitest';
import { KNIGHT } from '../../src/data/balance';
import { MONSTERS } from '../../src/data/monsters';
import { TOWN2_WAVES } from '../../src/data/waves';
import { damageUnit } from '../../src/sim/combat';
import { fieldRows } from '../helpers/mapBuilder';
import { aWorld, collectEvents, dummy, runSeconds, runTicks, runUntil, tank } from '../helpers/worldBuilder';


/** 20×20 field split by a river at column 10 (no bridge), one building on the east bank. */
function riverRows(buildingI = 15): string[] {
  const rows = fieldRows(20, [{ id: 0, i: buildingI, j: 10 }]).map((r) => r.split(''));
  for (let j = 0; j < 20; j++) rows[j][10] = '~';
  return rows.map((r) => r.join(''));
}

describe('river imp', () => {
  it('swims across a river with no bridge and attacks the building on the far bank', () => {
    const { world, monsters: [imp] } = aWorld()
      .withMap(riverRows())
      .withKnightAt(1, 1)
      .withMonster('imp', 4, 10)
      .build();
    tank(imp);
    const b = world.buildings[0];
    runUntil(world, () => b.hp < b.maxHp, 60 * 20);
    expect(imp.x).toBeGreaterThan(11);
    expect(b.hp).toBe(b.maxHp - MONSTERS.imp.buildingDamage);
  });

  it('a zombie on the same bank cannot reach the building (control)', () => {
    const { world, monsters: [z] } = aWorld()
      .withMap(riverRows())
      .withKnightAt(1, 1)
      .withMonster('orc', 4, 10)
      .build();
    tank(z);
    runSeconds(world, 10);
    expect(world.buildings[0].hp).toBe(world.buildings[0].maxHp);
    expect(z.x).toBeLessThan(10);
  });
});

describe('necromancer', () => {
  const necroWorld = () => {
    const built = aWorld()
      .withMap(fieldRows(40, [{ id: 0, i: 30, j: 20 }]))
      .withKnightAt(2, 2)
      .withMonster('necromancer', 10, 20)
      .build();
    tank(built.monsters[0]);
    return built;
  };

  it('stops at its standoff distance from the town instead of walking up to it', () => {
    const { world, monsters: [n] } = necroWorld();
    const events = collectEvents(world, 60 * 20);
    const d = Math.hypot(30 - n.x, 20 - n.y);
    expect(d).toBeLessThanOrEqual(MONSTERS.necromancer.standoff! + 0.6);
    expect(d).toBeGreaterThan(MONSTERS.necromancer.standoff! - 1);
    // Its raised zombies go on to the town; it never hits the building itself.
    expect(events.some((e) => e.type === 'buildingHit' && e.by === n.id)).toBe(false);
  });

  it('raises zombies around itself on a timer, up to its cap', () => {
    const { world, monsters: [n] } = necroWorld();
    const raise = MONSTERS.necromancer.raise!;
    const events = collectEvents(world, Math.round((raise.first + 0.1) * 60));
    expect(events.filter((e) => e.type === 'monsterRaised')).toHaveLength(raise.count);
    const raised = world.monsters.filter((m) => m.raisedBy === n.id);
    expect(raised).toHaveLength(raise.count);
    expect(raised.every((z) => z.kind === raise.kind)).toBe(true);
    // Raised zombies walk off toward the town (and stay alive: nothing fights them); the count stops at the cap.
    runSeconds(world, raise.every * 10);
    const alive = world.monsters.filter((m) => m.raisedBy === n.id && m.state !== 'dead');
    expect(alive).toHaveLength(raise.maxAlive);
  });

  it('raised zombies drop no xp gems or coins', () => {
    const { world, monsters: [n] } = necroWorld();
    runSeconds(world, MONSTERS.necromancer.raise!.first + 0.1);
    const z = world.monsters.find((m) => m.raisedBy === n.id)!;
    const coins = world.coins;
    const gems = world.gems.length;
    damageUnit(world, z, z.hp, world.players[0].id);
    expect(z.state).toBe('dead');
    expect(world.coins).toBe(coins);
    expect(world.gems.length).toBe(gems);
  });

  it('sprints away when the knight comes close', () => {
    const { world, knight, monsters: [n] } = necroWorld();
    knight.x = 12;
    knight.y = 20;
    const flee = MONSTERS.necromancer.flee!;
    runSeconds(world, 1);
    expect(n.x).toBeLessThan(10 - 1);
    expect(Math.hypot(knight.x - n.x, knight.y - n.y)).toBeGreaterThan(flee.range);
  });

  it('only sprints for a while, so a chasing knight catches him', () => {
    const { world, knight, monsters: [n] } = necroWorld();
    const flee = MONSTERS.necromancer.flee!;
    knight.x = 12;
    knight.y = 20;
    runSeconds(world, flee.duration + 0.1);
    // Sprint over: he is back to walking pace (or standing).
    const [x0, y0] = [n.x, n.y];
    runSeconds(world, 0.5);
    // 0.5 s at walking pace, with a little slack for jitter and collisions.
    expect(Math.hypot(n.x - x0, n.y - y0)).toBeLessThanOrEqual(MONSTERS.necromancer.speed * 0.6);
  });

  it('sprints slower than the knight runs', () => {
    expect(MONSTERS.necromancer.flee!.speedMul * MONSTERS.necromancer.speed).toBeLessThan(KNIGHT.speed);
  });

  it('stops raising when it dies', () => {
    const { world, monsters: [n] } = necroWorld();
    n.hp = 0;
    n.state = 'dead';
    const events = collectEvents(world, 60 * 5);
    expect(events.some((e) => e.type === 'monsterRaised')).toBe(false);
  });
});

describe('skeleton archer', () => {
  it('stops in range of the knight and shoots him instead of walking up', () => {
    const { world, knight, monsters: [a] } = aWorld()
      .withKnightAt(20, 20)
      .withMonster('skeletonArcher', 12, 20)
      .build();
    tank(a);
    runUntil(world, () => knight.hp < knight.maxHp, 60 * 10);
    expect(knight.hp).toBe(knight.maxHp - MONSTERS.skeletonArcher.damage);
    expect(Math.hypot(knight.x - a.x, knight.y - a.y)).toBeGreaterThan(MONSTERS.skeletonArcher.ranged!.range - 1);
  });

  it('arrows land where the target stood: a knight who moves away is missed', () => {
    const { world, knight, monsters: [a] } = aWorld()
      .withKnightAt(20, 20)
      .withMonster('skeletonArcher', 16, 20)
      .build();
    tank(a);
    runUntil(world, () => world.projectiles.some((p) => p.kind === 'bolt'), 60 * 5);
    knight.x = 20;
    knight.y = 26; // sidestep well clear of the landing point
    runSeconds(world, 1.5);
    expect(knight.hp).toBe(knight.maxHp);
  });

  it('shoots a building across the river when no friendly is in range', () => {
    const { world, monsters: [a] } = aWorld()
      .withMap(riverRows(13))
      .withKnightAt(1, 1)
      .withMonster('skeletonArcher', 8.5, 10)
      .build();
    tank(a);
    const b = world.buildings[0];
    runUntil(world, () => b.hp < b.maxHp, 60 * 15);
    expect(b.hp).toBe(b.maxHp - MONSTERS.skeletonArcher.buildingDamage);
    expect(a.x).toBeLessThan(10);
  });
});

describe('sapper', () => {
  const sapperWorld = () => aWorld()
    .withMap(fieldRows(30, [{ id: 0, i: 15, j: 10 }, { id: 1, i: 25, j: 25 }]))
    .withKnightAt(2, 28);

  it('lights a fuse next to a building, then blows up: building damage, sapper gone, no reward', () => {
    const { world, monsters: [s] } = sapperWorld().withMonster('sapper', 10, 10).build();
    const ex = MONSTERS.sapper.explodes!;
    const b = world.buildings[0];
    const coins = world.coins;
    const events = collectEvents(world, 60 * 8);
    expect(events.some((e) => e.type === 'fuseLit' && e.unit === s.id)).toBe(true);
    expect(events.some((e) => e.type === 'explosion' && e.unit === s.id)).toBe(true);
    expect(b.hp).toBe(Math.max(0, b.maxHp - ex.buildingDamage));
    expect(world.buildings[1].hp).toBe(world.buildings[1].maxHp);
    expect(s.state).toBe('dead');
    expect(world.coins).toBe(coins);
    expect(world.kills).toBe(0);
  });

  it('hurts friendlies caught in the blast', () => {
    const { world, monsters: [s], rookies: [r] } = sapperWorld()
      .withMonster('sapper', 10, 10)
      .withRookie('swordsman', 14, 11.2)
      .build();
    r.attackCooldown = 1e9;
    tank(r, 1000);
    runUntil(world, () => s.state === 'dead', 60 * 8);
    expect(r.hp).toBe(1000 - MONSTERS.sapper.explodes!.unitDamage);
  });

  it('killed before it gets there, its keg hurts nearby monsters and spares the town', () => {
    const { world, monsters: [s, z] } = sapperWorld()
      .withMonster('sapper', 5, 5)
      .withMonster('zombie', 5.8, 5)
      .build();
    dummy(z, 1000);
    runTicks(world, 1); // builds the enemy hash
    damageUnit(world, s, 1000, world.players[0].id);
    expect(s.state).toBe('dead');
    expect(z.hp).toBe(1000 - MONSTERS.sapper.explodes!.deathDamage);
    expect(world.buildings.every((b) => b.hp === b.maxHp)).toBe(true);
    expect(world.kills).toBe(1);
  });
});

describe('town 2 waves', () => {
  it('introduce every new monster, and the final waves come from three sides', () => {
    const kinds = new Set(TOWN2_WAVES.flatMap((w) => Object.keys(w.monsters)));
    for (const k of ['imp', 'necromancer', 'skeletonArcher', 'sapper', 'troll']) expect(kinds.has(k)).toBe(true);
    expect(TOWN2_WAVES.filter((w) => w.sides === 3).length).toBeGreaterThanOrEqual(4);
  });
});
