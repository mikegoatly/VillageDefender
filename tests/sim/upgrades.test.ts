import { describe, expect, it } from 'vitest';
import { KNIGHT } from '../../src/data/balance';
import { MONSTERS } from '../../src/data/monsters';
import { ARMY, ROOKIES, TOWN_ARROWS } from '../../src/data/rookies';
import { computeMods } from '../../src/data/upgrades';
import { fieldRows } from '../helpers/mapBuilder';
import { aWorld, collectEvents, holdAttack, pickUpgrade, runSeconds, runTicks, runUntil, step } from '../helpers/worldBuilder';

// Building 0: 2x2 at cells (10..11, 10..11), centre (10.5, 10.5). Building 1 is far to the east.
const rows = () => fieldRows(30, [{ id: 0, i: 10, j: 10, w: 2, h: 2 }, { id: 1, i: 20, j: 10, w: 2, h: 2 }]);
const town = () => aWorld().withMap(rows()).withKnightAt(25, 27);

describe('pickUpgrade helper', () => {
  it('goes through the real pick path: level, mods and events', () => {
    const { world } = aWorld().build();
    pickUpgrade(world, 'blade');
    expect(world.progression.levels.blade).toBe(1);
    expect(world.progression.mods.knight.damageMul).toBeCloseTo(1.2);
    expect(world.events.some((e) => e.type === 'upgradeChosen' && e.id === 'blade')).toBe(true);
    expect(world.choosing).toBe(false);
  });

  it('withUpgrades stacks and matches computeMods', () => {
    const { world } = aWorld().withUpgrades({ blade: 2, garrison: 1, slits: 1 }).build();
    expect(world.progression.mods).toEqual(computeMods({ blade: 2, garrison: 1, slits: 1 }));
  });
});

describe('knight upgrades', () => {
  /** Damage dealt by the knight's first swing to a lone zombie. */
  function firstHit(upgrades: Record<string, number>) {
    const { world, monsters } = aWorld().withUpgrades(upgrades).withKnightAt(20, 20).withMonster('zombie', 20.6, 20).build();
    const z = monsters[0];
    runUntil(world, () => z.hp < z.maxHp, 60, holdAttack());
    return { world, z, damage: z.maxHp - z.hp };
  }

  it('blade raises swing damage by 20% per stack', () => {
    expect(firstHit({}).damage).toBe(KNIGHT.attackDamage);
    expect(firstHit({ blade: 2 }).damage).toBeCloseTo(KNIGHT.attackDamage * 1.4);
  });

  it('blade lets a zombie die in one swing instead of two', () => {
    const base = firstHit({});
    expect(base.z.state).not.toBe('dead');
    const sharp = firstHit({ blade: 4 }); // 15 * 1.8 = 27 >= 24 hp
    expect(sharp.z.state).toBe('dead');
    expect(sharp.world.kills).toBe(1);
  });

  it('swift shortens the swing cooldown by 10% per stack', () => {
    for (const [stacks, mul] of [[0, 1], [1, 0.9], [3, 0.729]] as const) {
      const { world, knight } = aWorld().withUpgrades({ swift: stacks }).build();
      runUntil(world, (w) => w.events.some((e) => e.type === 'swing'), 10, holdAttack());
      expect(knight.attackCooldown, `swift ${stacks}`).toBeCloseTo(KNIGHT.attackCooldown * mul, 6);
    }
  });

  it('swift makes the knight swing more often', () => {
    const swings = (n: number) => {
      const { world } = aWorld().withUpgrades({ swift: n }).build();
      return collectEvents(world, 600, holdAttack()).filter((e) => e.type === 'swing').length;
    };
    expect(swings(3)).toBeGreaterThan(swings(0));
  });

  it('tough raises max HP by 25 per stack and heals on pick', () => {
    const { world, knight } = aWorld().build();
    knight.hp = 100;
    pickUpgrade(world, 'tough');
    expect(knight.maxHp).toBe(KNIGHT.hp + 25);
    // onPick heals 25 (capped at the old max) and the max-HP rise then adds its 25 on top.
    expect(knight.hp).toBeGreaterThanOrEqual(125);
    expect(knight.hp).toBeLessThanOrEqual(knight.maxHp);
    pickUpgrade(world, 'tough');
    expect(knight.maxHp).toBe(KNIGHT.hp + 50);
  });

  it('tough at full HP leaves the knight at the new full HP', () => {
    const { world, knight } = aWorld().build();
    pickUpgrade(world, 'tough');
    expect(knight.hp).toBe(knight.maxHp);
  });

  it('boots raise move speed', () => {
    const { knight } = aWorld().withUpgrades({ boots: 2 }).build();
    expect(knight.speed).toBeCloseTo(KNIGHT.speed * 1.2);
  });
});

describe('town upgrades', () => {
  it('walls scale building max HP by 25% per stack, keeping the HP fraction, and repair 25%', () => {
    const { world } = town().build();
    const b = world.buildings[0];
    const base = b.maxHp;
    b.hp = base * 0.4;
    pickUpgrade(world, 'walls');
    expect(b.baseMaxHp).toBe(base);
    expect(b.maxHp).toBeCloseTo(base * 1.25);
    expect(b.hp / b.maxHp).toBeCloseTo(0.65); // 40% + 25% repair
    pickUpgrade(world, 'walls');
    expect(b.maxHp).toBeCloseTo(base * 1.5);
    expect(b.hp / b.maxHp).toBeCloseTo(0.9);
  });

  it('walls leave a full-HP building full and a ruined one ruined', () => {
    const { world } = town().build();
    const [full, ruined] = world.buildings;
    ruined.hp = 0;
    ruined.ruined = true;
    pickUpgrade(world, 'walls');
    expect(full.hp).toBeCloseTo(full.maxHp);
    expect(ruined.hp).toBe(0);
    expect(ruined.ruined).toBe(true);
  });

  it('thorns damage a monster each time it hits a building', () => {
    const orc = MONSTERS.orc;
    for (const stacks of [0, 1, 2]) {
      const { world, monsters } = town().withUpgrades({ thorns: stacks }).withMonster('orc', 9.2, 10.5).build();
      runSeconds(world, orc.attackWindup + 0.1);
      expect(world.buildings[0].hp, `thorns ${stacks}`).toBe(world.buildings[0].maxHp - orc.buildingDamage);
      expect(monsters[0].hp, `thorns ${stacks}`).toBe(orc.hp - 4 * stacks);
    }
  });

  it('thorns do not hurt a monster that attacks the knight', () => {
    const { world, monsters } = aWorld().withUpgrades({ thorns: 3 }).withKnightAt(20, 20).withMonster('zombie', 20.4, 20).build();
    runSeconds(world, 1);
    expect(monsters[0].hp).toBe(monsters[0].maxHp);
  });

  describe('arrow slits', () => {
    it('make a standing building shoot a monster inside TOWN_ARROWS.range', () => {
      const { world, monsters } = town().withUpgrades({ slits: 1 }).withMonster('brute', 10.5 + TOWN_ARROWS.range - 0.8, 10.5).build();
      const events = collectEvents(world, 5);
      expect(events.find((e) => e.type === 'shot')).toMatchObject({ type: 'shot', from: -1 });
      runSeconds(world, 1.5);
      expect(monsters[0].hp).toBeLessThan(monsters[0].maxHp);
    });

    it('do nothing without the upgrade', () => {
      const { world } = town().withMonster('brute', 10.5 + TOWN_ARROWS.range - 0.8, 10.5).build();
      const events = collectEvents(world, 300);
      expect(events.filter((e) => e.type === 'shot')).toEqual([]);
    });

    it('do not shoot a monster beyond the range', () => {
      const { world } = town().withUpgrades({ slits: 1 }).withMonster('brute', 10.5, 10.5 + TOWN_ARROWS.range + 3).build();
      const events = collectEvents(world, 30);
      expect(events.filter((e) => e.type === 'shot')).toEqual([]);
    });

    it('a ruined building stops shooting', () => {
      const { world } = town().withUpgrades({ slits: 1 }).withMonster('brute', 10.5 + TOWN_ARROWS.range - 0.8, 10.5).build();
      world.buildings[0].ruined = true;
      world.buildings[0].hp = 0;
      const events = collectEvents(world, 60);
      expect(events.filter((e) => e.type === 'shot')).toEqual([]);
    });

    it('higher levels shoot more often', () => {
      const shots = (stacks: number) => {
        const { world } = town().withUpgrades({ slits: stacks }).withMonster('brute', 10.5 + TOWN_ARROWS.range - 0.8, 10.5).build();
        return collectEvents(world, 60 * 10).filter((e) => e.type === 'shot').length;
      };
      expect(shots(1)).toBeGreaterThanOrEqual(2);
      expect(shots(3)).toBeGreaterThan(shots(1));
    });
  });

  it('crews regenerate building HP per second (and never past max)', () => {
    const { world } = town().withUpgrades({ crews: 2 }).build();
    const b = world.buildings[0];
    b.hp = b.maxHp * 0.5;
    runSeconds(world, 10);
    expect(b.hp / b.maxHp).toBeCloseTo(0.5 + 0.008 * 10, 3);
    b.hp = b.maxHp - 0.001;
    runTicks(world, 30);
    expect(b.hp).toBe(b.maxHp);
  });

  it('crews do not repair without the upgrade, nor ruins with it', () => {
    const plain = town().build();
    plain.world.buildings[0].hp = 100;
    runSeconds(plain.world, 5);
    expect(plain.world.buildings[0].hp).toBe(100);

    const crewed = town().withUpgrades({ crews: 3 }).build();
    const ruin = crewed.world.buildings[0];
    ruin.hp = 0;
    ruin.ruined = true;
    runSeconds(crewed.world, 5);
    expect(ruin.hp).toBe(0);
  });

  describe('braziers (tar pits)', () => {
    /** Distance an orc walks in one tick from (x, 10.5). */
    function stepLength(stacks: number, x: number) {
      const { world, monsters } = town().withUpgrades({ braziers: stacks }).withMonster('orc', x, 10.5).build();
      const m = monsters[0];
      const [x0, y0] = [m.x, m.y];
      step(world);
      return Math.hypot(m.x - x0, m.y - y0);
    }

    it('slow a monster next to a building by 25% per stack', () => {
      const plain = stepLength(0, 12.2);
      expect(plain).toBeGreaterThan(0);
      expect(stepLength(1, 12.2)).toBeCloseTo(plain * 0.75, 6);
      expect(stepLength(2, 12.2)).toBeCloseTo(plain * 0.5, 6);
    });

    it('do not slow a monster away from buildings', () => {
      expect(stepLength(2, 15)).toBeCloseTo(stepLength(0, 15), 6);
    });
  });
});

describe('army upgrades', () => {
  it('garrison raises the rookie cap by 1 per stack', () => {
    const { world } = aWorld().build();
    expect(world.rookieCap).toBe(ARMY.baseCap);
    pickUpgrade(world, 'garrison');
    expect(world.rookieCap).toBe(ARMY.baseCap + 1);
    pickUpgrade(world, 'garrison');
    expect(world.rookieCap).toBe(ARMY.baseCap + 2);
  });

  it('recruit lowers the kills needed for the next rookie', () => {
    const { world } = aWorld().build();
    expect(world.nextRookieAt()).toBe(ARMY.thresholds[0]);
    pickUpgrade(world, 'recruit');
    expect(world.nextRookieAt()).toBe(Math.round(ARMY.thresholds[0] * 0.8));
    pickUpgrade(world, 'recruit');
    expect(world.nextRookieAt()).toBe(Math.round(ARMY.thresholds[0] * 0.8 * 0.8));
  });

  it('recruit makes a rookie join at the lowered kill count', () => {
    const { world } = town().withUpgrades({ recruit: 2 }).build();
    world.kills = world.nextRookieAt()! - 1;
    runTicks(world, 5);
    expect(world.rookies).toHaveLength(0);
    world.kills++;
    runTicks(world, 2);
    expect(world.rookies).toHaveLength(1);
  });

  it('veterans: new rookies start at rank 1, then captains at rank 2', () => {
    const { world } = aWorld().build();
    expect(world.addRookie(5, 5).rank).toBe(0);
    pickUpgrade(world, 'veterans');
    const vet = world.addRookie(5, 5);
    expect(vet.rank).toBe(1);
    expect(vet.maxHp).toBeCloseTo(ROOKIES.swordsman.hp * ARMY.rankMul[1]);
    pickUpgrade(world, 'veterans');
    expect(world.addRookie(5, 5).rank).toBe(2);
  });

  it('drill and arms scale rookie HP and damage', () => {
    const { world } = aWorld().build();
    const before = world.addRookie(5, 5);
    pickUpgrade(world, 'drill');
    expect(before.maxHp).toBeCloseTo(ROOKIES.swordsman.hp * 1.3); // existing rookies are updated too
    expect(world.addRookie(28, 28).maxHp).toBeCloseTo(ROOKIES.swordsman.hp * 1.3);
    pickUpgrade(world, 'arms');
    const zombie = world.addMonster(before.x + 0.5, before.y);
    runUntil(world, () => zombie.hp < zombie.maxHp, 120);
    expect(zombie.maxHp - zombie.hp).toBeCloseTo(ROOKIES.swordsman.damage * 1.3);
  });
});
