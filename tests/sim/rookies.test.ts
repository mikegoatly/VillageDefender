import { describe, expect, it } from 'vitest';
import { DT } from '../../src/data/balance';
import { MONSTERS } from '../../src/data/monsters';
import { ARMY, ROOKIES } from '../../src/data/rookies';
import { isWalkable } from '../../src/sim/map';
import type { World } from '../../src/sim/world';
import { distanceToNearestBlocked } from '../helpers/assertions';
import { fieldRows } from '../helpers/mapBuilder';
import { aWorld, collectEvents, runSeconds, runTicks, runUntil } from '../helpers/worldBuilder';

// One 2x2 building at cells (10..11, 10..11); knight parked far away in the south-east.
const rows = () => fieldRows(30, [{ id: 0, i: 10, j: 10, w: 2, h: 2 }]);
const town = () => aWorld().withMap(rows()).withKnightAt(25, 27);
const alive = (w: World) => w.rookies.filter((r) => r.state !== 'dead');
const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('recruitment', () => {
  it('nobody joins before the first kill threshold', () => {
    const { world } = town().build();
    world.kills = ARMY.thresholds[0] - 1;
    runTicks(world, 30);
    expect(world.rookies).toHaveLength(0);
    expect(world.nextRookieAt()).toBe(ARMY.thresholds[0]);
  });

  it('a rookie steps out next to a standing building when kills reach the threshold', () => {
    const { world } = town().build();
    world.kills = ARMY.thresholds[0];
    const events = collectEvents(world, 2);
    expect(world.rookies).toHaveLength(1);
    expect(events).toContainEqual({ type: 'rookieJoined', unit: world.rookies[0].id, kind: 'swordsman', building: 0 });
    const r = world.rookies[0];
    expect(isWalkable(world.map, Math.round(r.x), Math.round(r.y))).toBe(true);
    expect(distanceToNearestBlocked(world.map, r.x, r.y)).toBeLessThanOrEqual(0.6);
    expect(r.team).toBe('player');
    expect(r.hp).toBe(ROOKIES.swordsman.hp);
    expect(world.nextRookieAt()).toBe(ARMY.thresholds[1]);
  });

  it('classes follow the order swordsman, archer, swordsman', () => {
    const { world } = town().build();
    for (const t of ARMY.thresholds.slice(0, 3)) {
      world.kills = t;
      runTicks(world, 3);
    }
    expect(world.rookies.map((r) => r.kind)).toEqual(['swordsman', 'archer', 'swordsman']);
  });

  it('respects the cap, and garrison raises it', () => {
    const { world } = town().build();
    world.kills = 10_000;
    runTicks(world, 20);
    expect(alive(world)).toHaveLength(ARMY.baseCap);

    const bigger = town().withUpgrades({ garrison: 2 }).build();
    bigger.world.kills = 10_000;
    runTicks(bigger.world, 20);
    expect(alive(bigger.world)).toHaveLength(ARMY.baseCap + 2);
  });

  it('noRookies disables recruitment', () => {
    const { world } = town().noRookies().build();
    world.kills = 10_000;
    runTicks(world, 60);
    expect(world.rookies).toHaveLength(0);
  });

  it('nobody joins when no building is standing', () => {
    const { world } = town().build();
    world.buildings[0].ruined = true;
    world.buildings[0].hp = 0;
    world.kills = 10_000;
    runTicks(world, 20);
    expect(world.rookies).toHaveLength(0);
  });

  it('a fallen rookie is replaced after ARMY.respawnDelay', () => {
    const { world } = town().build();
    world.kills = ARMY.thresholds[0];
    runTicks(world, 2);
    const r = world.rookies[0];
    r.hp = 1;
    world.addMonster(r.x + 0.3, r.y, 'zombie');
    runUntil(world, () => r.state === 'dead', 120);
    expect(r.state).toBe('dead');
    world.monsters.splice(0);
    const diedAt = world.time;

    runUntil(world, () => alive(world).length > 0, Math.round((ARMY.respawnDelay + 5) / DT));
    expect(alive(world)).toHaveLength(1);
    expect(world.time - diedAt).toBeGreaterThan(ARMY.respawnDelay - 1);
    expect(world.time - diedAt).toBeLessThan(ARMY.respawnDelay + 1);
    expect(alive(world)[0].id).not.toBe(r.id);
    expect(world.kills).toBeLessThan(ARMY.thresholds[1]); // a replacement, not a new threshold recruit
  });
});

describe('rookie combat', () => {
  it('a swordsman attacks a monster that is hitting a building rather than a closer idle one', () => {
    // Orc already beside the building; the rookie starts beyond huntRange of it. A zombie closer
    // to the rookie is the only thing it can see at first.
    const { world, monsters, rookies } = town()
      .withMonster('orc', 9.2, 10.5)
      .withMonster('zombie', 19.5, 10.5)
      .withRookie('swordsman', 16, 10.5)
      .build();
    const [orc, zombie] = monsters;
    const r = rookies[0];
    expect(distance(r, orc)).toBeGreaterThan(ARMY.huntRange);
    runTicks(world, 1);
    expect(r.targetId).toBe(zombie.id);
    runSeconds(world, MONSTERS.orc.attackWindup); // the orc is mid-attack on the building by the next retarget
    expect(orc.state).toBe('attack');
    expect(orc.attackBuilding).toBe(0);
    expect(distance(r, zombie)).toBeLessThan(distance(r, orc));
    expect(r.targetId).toBe(orc.id);
  });

  it('a swordsman kills a monster beside him and credits the kill', () => {
    const { world, monsters, rookies } = town().withMonster('zombie', 20, 20.8).withRookie('swordsman', 20, 20).build();
    runUntil(world, () => monsters[0].state === 'dead', 600);
    expect(monsters[0].state).toBe('dead');
    expect(rookies[0].unitKills).toBe(1);
    expect(world.gems).toHaveLength(1);
  });

  describe('archer', () => {
    it('shoots from range with a projectile that damages and is then removed', () => {
      const { world, monsters } = town().withMonster('brute', 20, 15).withRookie('archer', 20, 20).build();
      const brute = monsters[0];
      runUntil(world, () => world.projectiles.length > 0, 120);
      expect(world.projectiles).toHaveLength(1);
      expect(world.projectiles[0].owner).toBe(world.rookies[0].id);
      expect(distance(world.rookies[0], brute)).toBeGreaterThan(ROOKIES.archer.keepAway);
      runUntil(world, () => brute.hp < brute.maxHp, 120);
      expect(brute.maxHp - brute.hp).toBe(ROOKIES.archer.damage);
      expect(world.projectiles).toHaveLength(0);
    });

    it('an arrow that misses expires instead of flying forever', () => {
      const { world } = town().withMonster('zombie', 20, 16).withRookie('archer', 20, 20).build();
      runUntil(world, () => world.projectiles.length > 0, 120);
      expect(world.projectiles).toHaveLength(1);
      world.monsters.splice(0);
      runSeconds(world, 3);
      expect(world.projectiles).toHaveLength(0);
    });

    it('backs away when a monster is closer than keepAway', () => {
      const { world, monsters, rookies } = town().withMonster('zombie', 20, 21).withRookie('archer', 20, 20).build();
      const start = distance(rookies[0], monsters[0]);
      expect(start).toBeLessThan(ROOKIES.archer.keepAway);
      runSeconds(world, 0.4);
      expect(distance(rookies[0], monsters[0])).toBeGreaterThan(start + 0.2);
      expect(rookies[0].y).toBeLessThan(20); // moved away from the zombie (which is at +y)
    });

    it('stands and shoots (does not close in) when the target is within range', () => {
      const { world, rookies } = town().withMonster('brute', 20, 16).withRookie('archer', 20, 20).build();
      runSeconds(world, 1);
      expect(distance(rookies[0], { x: 20, y: 20 })).toBeLessThan(0.3);
    });
  });

  it('promotes to veteran at ARMY.rankKills[1] kills, raising max HP', () => {
    const { world, rookies } = town().withRookie('swordsman', 20, 20).build();
    const r = rookies[0];
    const events: World['events'] = [];
    for (let k = 0; k < ARMY.rankKills[1]; k++) {
      expect(r.rank, `before kill ${k}`).toBe(0);
      expect(r.maxHp).toBe(ROOKIES.swordsman.hp);
      const z = world.addMonster(r.x + 0.6, r.y, 'zombie');
      z.hp = 1;
      for (let t = 0; t < 600 && z.state !== 'dead'; t++) {
        runTicks(world, 1);
        events.push(...world.events);
      }
      expect(z.state, `kill ${k}`).toBe('dead');
    }
    expect(r.unitKills).toBe(ARMY.rankKills[1]);
    expect(r.rank).toBe(1);
    expect(r.maxHp).toBeCloseTo(ROOKIES.swordsman.hp * ARMY.rankMul[1]);
    expect(r.hp).toBe(r.maxHp);
    expect(events).toContainEqual({ type: 'rookiePromoted', unit: r.id, rank: 1 });
  });

  describe('what monsters attack', () => {
    it('a zombie attacks a rookie that is closer than the knight', () => {
      const { world, monsters, rookies, knight } = town().withKnightAt(14, 16).withMonster('zombie', 14, 13).withRookie('swordsman', 14, 15).build();
      const z = monsters[0];
      runUntil(world, () => z.state === 'attack', 300);
      expect(z.state).toBe('attack');
      expect(z.targetId).toBe(rookies[0].id);
      runSeconds(world, 1);
      expect(rookies[0].hp).toBeLessThan(rookies[0].maxHp);
      expect(knight.hp).toBe(knight.maxHp);
    });

    it('an orc ignores rookies and goes for the building', () => {
      const { world, monsters, rookies } = town().withMonster('orc', 14, 14.5).withRookie('swordsman', 14, 15.2).build();
      const orc = monsters[0];
      for (let t = 0; t < 180 && orc.state !== 'dead'; t++) {
        runTicks(world, 1);
        expect(orc.targetId).toBe(-1);
      }
      expect(rookies[0].hp).toBe(rookies[0].maxHp);
    });
  });

  it('a rookie dying emits a death event and leaves the list after the corpse delay', () => {
    const { world, rookies } = town().withRookie('swordsman', 20, 20).build();
    const r = rookies[0];
    r.hp = 1;
    world.addMonster(r.x + 0.3, r.y, 'zombie');
    const events = collectEvents(world, 60);
    expect(events).toContainEqual({ type: 'death', unit: r.id });
    runSeconds(world, 2);
    expect(world.rookies).not.toContain(r);
  });
});

describe('rookie movement', () => {
  it('walks around a building to reach a post on the other side within a time bound', () => {
    const { world, rookies } = town().noRookies().withRookie('swordsman', 7.5, 10.5).build();
    const r = rookies[0];
    r.postX = 14;
    r.postY = 10.5;
    let t = 0;
    let detoured = false;
    for (; t < 10 * 60 && distance(r, { x: 14, y: 10.5 }) > 0.7; t++) {
      runTicks(world, 1);
      expect(isWalkable(world.map, Math.round(r.x), Math.round(r.y)), `tick ${t}`).toBe(true);
      if (r.y < 9.4 || r.y > 11.6) detoured = true;
    }
    expect(distance(r, { x: 14, y: 10.5 })).toBeLessThanOrEqual(0.7);
    expect(detoured).toBe(true);
    expect(t * DT).toBeLessThan(7);
  });

  it('a rookie returns to its post after being displaced', () => {
    const { world, rookies } = town().withRookie('swordsman', 20, 20).build();
    const r = rookies[0];
    r.x = 23;
    runSeconds(world, 3);
    expect(distance(r, { x: 20, y: 20 })).toBeLessThan(0.7);
  });

  it('follows the knight when there are no buildings to defend', () => {
    // (A town whose buildings all fall ends the level, so this only occurs on a map without any.)
    const { world, rookies } = aWorld().withKnightAt(25, 25).withRookie('swordsman', 20, 20).build();
    runSeconds(world, 5);
    expect(distance(rookies[0], world.players[0])).toBeLessThan(1.5);
  });
});
