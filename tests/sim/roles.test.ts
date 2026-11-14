import { describe, expect, it } from 'vitest';
import { WAVES } from '../../src/data/balance';
import { ROLES, ROLE_EFFECTS } from '../../src/data/roles';
import { ARMY } from '../../src/data/rookies';
import type { World } from '../../src/sim/world';
import { fieldRows } from '../helpers/mapBuilder';
import { aWorld, collectEvents, holdAttack, runSeconds, runUntil, step } from '../helpers/worldBuilder';

// Building 0: 2x2 at (10..11, 10..11), centre (10.5, 10.5). Building 1: 2x2 at (20..21, 10..11), centre (20.5, 10.5).
// Building 2: 1x1 at (10, 20), a spare so ruining one role building doesn't end the town.
const rows = () => fieldRows(30, [
  { id: 0, i: 10, j: 10, w: 2, h: 2 }, { id: 1, i: 20, j: 10, w: 2, h: 2 }, { id: 2, i: 10, j: 20 },
]);
const town = () => aWorld().withMap(rows()).withKnightAt(25, 27);
const ruin = (w: World, id: number) => w.debugSetBuildingHp(id, 0);

describe('barracks', () => {
  it('adds one to the rookie cap per standing barracks', () => {
    expect(town().build().world.rookieCap).toBe(ARMY.baseCap);
    expect(town().withPlan({ 0: 'barracks' }).build().world.rookieCap).toBe(ARMY.baseCap + 1);
    const { world } = town().withPlan({ 0: 'barracks', 1: 'barracks' }).build();
    expect(world.rookieCap).toBe(ARMY.baseCap + 2);
    ruin(world, 0);
    expect(world.rookieCap).toBe(ARMY.baseCap + 1);
  });

  it('rookies step out next to the barracks', () => {
    const { world } = town().withPlan({ 1: 'barracks' }).build();
    world.kills = ARMY.thresholds[0];
    const joined = collectEvents(world, 2).filter((e) => e.type === 'rookieJoined');
    expect(joined).toHaveLength(1);
    expect(joined[0]).toMatchObject({ building: 1 });
    const r = world.rookies[0];
    expect(world.buildings[1].cells.some(([i, j]) => Math.hypot(r.x - i, r.y - j) < 2)).toBe(true);
  });

  it('rookies step out of another building once the barracks is ruined', () => {
    const { world } = town().withPlan({ 1: 'barracks' }).build();
    ruin(world, 1);
    world.kills = ARMY.thresholds[0];
    const joined = collectEvents(world, 2).filter((e) => e.type === 'rookieJoined');
    expect(joined).toHaveLength(1);
    expect(joined[0]).not.toMatchObject({ building: 1 });
  });
});

describe('chapel', () => {
  const radius = ROLES.chapel.radius;
  // Chapel centre (10.5, 10.5); inside is 2 away, outside is radius + 2 away.
  const inside: [number, number] = [12.5, 10.5];
  const outside: [number, number] = [10.5 + radius + 2, 10.5];

  it('heals the knight and rookies inside its radius, per second', () => {
    const { world, knight, rookies } = town().withPlan({ 0: 'chapel' }).withKnightAt(...inside).withRookie('swordsman', inside[0], 12.5).build();
    knight.hp = 50;
    rookies[0].hp = 10;
    runSeconds(world, 1);
    expect(knight.hp).toBeCloseTo(50 + ROLE_EFFECTS.chapelHealPerSecond, 1);
    expect(rookies[0].hp).toBeCloseTo(10 + ROLE_EFFECTS.chapelHealPerSecond, 1);
  });

  it('does not heal outside the radius', () => {
    const { world, knight, rookies } = town().withPlan({ 0: 'chapel' }).withKnightAt(...outside).withRookie('swordsman', outside[0], 12.5).build();
    knight.hp = 50;
    rookies[0].hp = 10;
    runSeconds(world, 1);
    expect(knight.hp).toBe(50);
    expect(rookies[0].hp).toBe(10);
  });

  it('does not heal without a chapel, or once it is ruined', () => {
    const plain = town().withKnightAt(...inside).build();
    plain.knight.hp = 50;
    runSeconds(plain.world, 1);
    expect(plain.knight.hp).toBe(50);

    const { world, knight } = town().withPlan({ 0: 'chapel' }).withKnightAt(...inside).build();
    ruin(world, 0);
    knight.hp = 50;
    runSeconds(world, 1);
    expect(knight.hp).toBe(50);
  });

  it('never heals above max hp', () => {
    const { world, knight } = town().withPlan({ 0: 'chapel' }).withKnightAt(...inside).build();
    knight.hp = knight.maxHp - 1;
    runSeconds(world, 2);
    expect(knight.hp).toBe(knight.maxHp);
  });
});

describe('smithy', () => {
  const radius = ROLES.smithy.radius;
  // Smithy centre (10.5, 10.5). A zombie adjacent to the knight takes one swing.
  const knightDamage = (smithy: boolean, kx: number, ky: number) => {
    const b = town().withKnightAt(kx, ky).withZombieAt(kx + 1, ky);
    const { world, zombies } = (smithy ? b.withPlan({ 0: 'smithy' }) : b).build();
    runSeconds(world, 0.2, () => holdAttack());
    return zombies[0].maxHp - zombies[0].hp;
  };

  it('multiplies knight swing damage within the radius', () => {
    const base = knightDamage(false, 12.5, 10.5);
    expect(base).toBeGreaterThan(0);
    expect(knightDamage(true, 12.5, 10.5)).toBeCloseTo(base * ROLE_EFFECTS.smithyDamageMul, 5);
  });

  it('does nothing outside the radius', () => {
    const far = 10.5 + radius + 2;
    expect(knightDamage(true, far, 10.5)).toBe(knightDamage(false, far, 10.5));
  });

  it('stops when the smithy is ruined', () => {
    const { world, zombies } = town().withPlan({ 0: 'smithy' }).withKnightAt(12.5, 10.5).withZombieAt(13.5, 10.5).build();
    ruin(world, 0);
    runSeconds(world, 0.2, () => holdAttack());
    expect(zombies[0].maxHp - zombies[0].hp).toBe(knightDamage(false, 12.5, 10.5));
  });

  it('multiplies rookie damage within the radius', () => {
    const rookieDamage = (smithy: boolean) => {
      const b = town().withRookie('swordsman', 12.5, 10.5).withZombieAt(13.2, 10.5);
      const { world, zombies } = (smithy ? b.withPlan({ 0: 'smithy' }) : b).build();
      runSeconds(world, 0.5);
      return zombies[0].maxHp - zombies[0].hp;
    };
    const base = rookieDamage(false);
    expect(base).toBeGreaterThan(0);
    expect(rookieDamage(true)).toBeCloseTo(base * ROLE_EFFECTS.smithyDamageMul, 5);
  });
});

describe('watchtower', () => {
  const range = ROLES.watchtower.radius;
  // Tower centre (10.5, 10.5). A brute is tanky and slow, so it stays in range for a while.
  const towerShots = (events: ReturnType<typeof collectEvents>) => events.filter((e) => e.type === 'shot' && e.from === -1);

  it('shoots at monsters in range once every interval', () => {
    const { world, monsters } = town().withPlan({ 0: 'watchtower' }).withMonster('brute', 10.5 + range - 1, 10.5).build();
    const shotTicks: number[] = [];
    for (let k = 0; k < 60 * 7; k++) {
      step(world);
      if (towerShots(world.events).length) shotTicks.push(world.tickCount);
    }
    expect(shotTicks.length).toBeGreaterThanOrEqual(3);
    for (let k = 1; k < shotTicks.length; k++) {
      expect((shotTicks[k] - shotTicks[k - 1]) / 60).toBeCloseTo(ROLE_EFFECTS.watchtower.interval, 1);
    }
    expect(monsters[0].hp).toBeLessThan(monsters[0].maxHp);
  });

  it('ignores monsters beyond its range', () => {
    const { world } = town().withPlan({ 0: 'watchtower' }).withMonster('brute', 10.5 + range + 3, 10.5).build();
    expect(towerShots(collectEvents(world, 60 * 2))).toHaveLength(0);
  });

  it('stops shooting when ruined', () => {
    const { world } = town().withPlan({ 0: 'watchtower' }).withMonster('brute', 10.5 + range - 1, 10.5).build();
    ruin(world, 0);
    expect(towerShots(collectEvents(world, 60 * 5))).toHaveLength(0);
  });

  it('a plain building does not shoot', () => {
    const { world } = town().withMonster('brute', 11, 13).build();
    expect(towerShots(collectEvents(world, 60 * 5))).toHaveLength(0);
  });

  it('announces waves watchtowerExtraWarning earlier', () => {
    const warnAt = (tower: boolean) => {
      const b = town().withWaves();
      const { world } = (tower ? b.withPlan({ 0: 'watchtower' }) : b).build();
      runUntil(world, (w) => w.events.some((e) => e.type === 'waveWarning'), 60 * 10);
      return world.time;
    };
    expect(warnAt(false)).toBeCloseTo(WAVES.firstAt - WAVES.warning, 1);
    expect(warnAt(true)).toBeCloseTo(WAVES.firstAt - WAVES.warning - ROLE_EFFECTS.watchtowerExtraWarning, 1);
  });

  it('loses the early warning when ruined', () => {
    const { world } = town().withWaves().withPlan({ 0: 'watchtower' }).build();
    ruin(world, 0);
    runUntil(world, (w) => w.events.some((e) => e.type === 'waveWarning'), 60 * 10);
    expect(world.time).toBeCloseTo(WAVES.firstAt - WAVES.warning, 1);
  });
});
