import { describe, expect, it } from 'vitest';
import { BUILDING, KNIGHT } from '../../src/data/balance';
import { MONSTERS } from '../../src/data/monsters';
import { isWalkable } from '../../src/sim/map';
import { fieldRows, mapFromAscii } from '../helpers/mapBuilder';
import { aWorld, collectEvents, holdAttack, runSeconds, runTicks, runUntil } from '../helpers/worldBuilder';

// Building 0: 2x2 at cells (10..11, 10..11). Building 1: 2x2 at (20..21, 10..11). Knight parked far away.
const rows = () => fieldRows(30, [{ id: 0, i: 10, j: 10, w: 2, h: 2 }, { id: 1, i: 20, j: 10, w: 2, h: 2 }]);
const town = () => aWorld().withMap(rows()).withKnightAt(25, 27);
/** Expected building HP for a number of wall blocks. */
const hpFor = (wallBlocks: number) => BUILDING.baseHp + (wallBlocks - 1) * BUILDING.hpPerExtraBlock;

describe('building state', () => {
  it('derives hp from blocks: a one-storey 2x2 has base + 3 extra blocks', () => {
    const { world } = town().build();
    expect(world.buildings).toHaveLength(2);
    for (const b of world.buildings) {
      expect(b.hp).toBe(hpFor(4));
      expect(b.maxHp).toBe(b.hp);
      expect(b.ruined).toBe(false);
    }
    expect(world.standingBuildings()).toBe(2);
  });

  it('doubles hp for a second storey', () => {
    const map = mapFromAscii(rows());
    for (const [i, j] of map.buildings[0].cells) map.buildings[0].blocks.push({ i, j, level: 0, part: 'wall' });
    const { world } = aWorld().withTownMap(map).build();
    expect(world.buildings[0].maxHp).toBe(hpFor(8));
    expect(world.buildings[1].maxHp).toBe(hpFor(4));
  });

  // Bug: the building flow field ends on cells next to a building, and a monster standing at
  // such a cell's centre is 0.5 from the building edge — beyond its reach — while the field
  // says it has arrived. It idled forever, so the level could never be won.
  it.each(['orc', 'brute', 'zombie'] as const)('%s parked at the centre of a cell next to a building still attacks it', (kind) => {
    for (const [x, y] of [[9, 10], [12, 11], [10, 9], [11, 12], [9, 9]]) {
      const { world } = town().withMonster(kind, x, y).build();
      runSeconds(world, 4);
      const b = world.buildings[0];
      expect(b.hp, `${kind} at ${x},${y}`).toBeLessThan(b.maxHp);
    }
  });

  it('maps cells to buildings with buildingAt', () => {
    const { world } = town().build();
    expect(world.buildingAt(10, 10)?.id).toBe(0);
    expect(world.buildingAt(21, 11)?.id).toBe(1);
    expect(world.buildingAt(15, 15)).toBeNull();
    expect(world.buildingAt(-1, 0)).toBeNull();
  });
});

describe('monsters damaging buildings', () => {
  it('an orc beside a building damages it by buildingDamage after the windup', () => {
    const def = MONSTERS.orc;
    const { world } = town().withMonster('orc', 9.2, 10.5).build();
    const b = world.buildings[0];
    runSeconds(world, def.attackWindup - 0.1);
    expect(b.hp).toBe(b.maxHp);
    runSeconds(world, 0.2);
    expect(b.hp).toBe(b.maxHp - def.buildingDamage);
    // Next attack after the cooldown.
    runSeconds(world, def.attackCooldown);
    expect(b.hp).toBe(b.maxHp - 2 * def.buildingDamage);
  });

  it('emits buildingHit events and stamps lastHit', () => {
    const { world, monsters } = town().withMonster('orc', 9.2, 10.5).build();
    const events = collectEvents(world, 40);
    const hit = events.find((e) => e.type === 'buildingHit');
    expect(hit).toMatchObject({ type: 'buildingHit', building: 0, by: monsters[0].id, damage: MONSTERS.orc.buildingDamage });
    expect(world.buildings[0].lastHit).toBeGreaterThan(0);
  });

  it('a brute deals its own buildingDamage', () => {
    const def = MONSTERS.brute;
    const { world } = town().withMonster('brute', 9.1, 10.5).build();
    const b = world.buildings[0];
    runSeconds(world, def.attackWindup + 0.1);
    expect(b.hp).toBe(b.maxHp - def.buildingDamage);
  });

  describe('when a building is destroyed', () => {
    function ruinWithOrc() {
      const built = town().withMonster('orc', 9.2, 10.5).build();
      built.world.buildings[0].hp = MONSTERS.orc.buildingDamage; // one hit left
      const events = collectEvents(built.world, 60);
      return { ...built, events };
    }

    it('is ruined at 0 hp and emits buildingDestroyed exactly once', () => {
      const { world, events } = ruinWithOrc();
      const b = world.buildings[0];
      expect(b.hp).toBe(0);
      expect(b.ruined).toBe(true);
      expect(events.filter((e) => e.type === 'buildingDestroyed')).toEqual([{ type: 'buildingDestroyed', building: 0 }]);
      // Run on: it must not be destroyed again or keep taking hits.
      const later = collectEvents(world, 300);
      expect(later.filter((e) => e.type === 'buildingDestroyed')).toEqual([]);
      expect(later.filter((e) => e.type === 'buildingHit' && e.building === 0)).toEqual([]);
      expect(world.standingBuildings()).toBe(1);
    });

    it('keeps blocking as rubble', () => {
      const { world } = ruinWithOrc();
      for (const [i, j] of world.buildings[0].cells) {
        expect(isWalkable(world.map, i, j)).toBe(false);
        expect(world.buildingAt(i, j)?.ruined).toBe(true);
      }
    });

    it('sends the orc on to another standing building', () => {
      const { world, monsters } = ruinWithOrc();
      const orc = monsters[0];
      const distTo1 = () => Math.hypot(orc.x - 20, orc.y - 10.5);
      const before = distTo1();
      runSeconds(world, 3);
      expect(distTo1()).toBeLessThan(before - 3);
      expect(orc.x).toBeGreaterThan(11);
    });
  });
});

describe('knockbackResist', () => {
  /** Knockback speed right after the knight's first swing lands on a lone monster. */
  function knockbackSpeed(kind: 'zombie' | 'brute') {
    const { world, monsters } = aWorld().withKnightAt(20, 20).withMonster(kind, 20.6, 20).build();
    const m = monsters[0];
    runTicks(world, 1);
    runUntil(world, () => m.hp < m.maxHp, 60, holdAttack());
    expect(m.hp).toBe(m.maxHp - KNIGHT.attackDamage);
    return Math.hypot(m.vx, m.vy);
  }

  it('pushes a brute much less than a zombie for the same swing', () => {
    const z = knockbackSpeed('zombie');
    const b = knockbackSpeed('brute');
    expect(z).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(0);
    expect(b).toBeLessThan(z * 0.25);
  });
});
