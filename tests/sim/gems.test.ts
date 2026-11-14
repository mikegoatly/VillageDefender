import { describe, expect, it } from 'vitest';
import { GEMS, XP_DROP } from '../../src/data/rookies';
import type { MonsterKind } from '../../src/data/monsters';
import { xpToNext } from '../../src/sim/progression';
import type { World } from '../../src/sim/world';
import { aWorld, collectEvents, holdAttack, runSeconds, runUntil } from '../helpers/worldBuilder';

/** Drops a gem by hand (the array is public). */
function dropGem(world: World, x: number, y: number, value = 1) {
  world.gems.push({ id: 9000 + world.gems.length, x, y, value, magnet: false, speed: 0 });
}

/** Raw ticks (no auto-pick), so a level-up pause stays visible. */
function tickRaw(world: World, n: number) {
  const events: World['events'] = [];
  for (let k = 0; k < n; k++) { world.tick([{ move: { x: 0, y: 0 }, attack: false, dodge: false, ability1: false, ability2: false, rally: false, pause: false }]); events.push(...world.events); }
  return events;
}

describe('gem drops', () => {
  it.each(['zombie', 'orc', 'brute'] as MonsterKind[])('a killed %s drops a gem worth XP_DROP at its position', (kind) => {
    const { world, monsters } = aWorld().withKnightAt(20, 20).withMonster(kind, 20.6, 20).build();
    const m = monsters[0];
    m.hp = 1;
    runUntil(world, () => m.state === 'dead', 60, holdAttack());
    expect(world.gems).toHaveLength(1);
    expect(world.gems[0].value).toBe(XP_DROP[kind]);
    expect(Math.hypot(world.gems[0].x - m.x, world.gems[0].y - m.y)).toBeLessThan(1);
    expect(world.kills).toBe(1);
  });

  it('XP values rank brute > orc > zombie', () => {
    expect(XP_DROP.brute).toBeGreaterThan(XP_DROP.orc);
    expect(XP_DROP.orc).toBeGreaterThan(XP_DROP.zombie);
  });
});

describe('gem collection', () => {
  it('a gem inside the magnet radius flies to the knight and is collected with an event', () => {
    const { world, knight } = aWorld().withKnightAt(20, 20).build();
    dropGem(world, 20 + GEMS.magnetRadius - 0.2, 20, 2);
    const events = collectEvents(world, 120);
    expect(world.gems).toHaveLength(0);
    expect(events.filter((e) => e.type === 'gemCollected')).toEqual([{ type: 'gemCollected', value: 2 }]);
    expect(world.progression.xp).toBe(2);
    expect(knight.x).toBeCloseTo(20, 3);
  });

  it('flies toward the knight before arriving (magnet flag set, distance shrinks)', () => {
    const { world } = aWorld().withKnightAt(20, 20).build();
    dropGem(world, 21.3, 20);
    const g = world.gems[0];
    runSeconds(world, 0.05);
    expect(g.magnet).toBe(true);
    expect(21.3 - g.x).toBeGreaterThan(0);
  });

  it('a gem outside the radius stays put while monsters are alive', () => {
    const { world } = aWorld().withKnightAt(20, 20).withMonster('zombie', 35, 35).build();
    dropGem(world, 20 + GEMS.magnetRadius + 1, 20);
    const g = world.gems[0];
    const x0 = g.x;
    runSeconds(world, 1);
    expect(g.magnet).toBe(false);
    expect(g.x).toBe(x0);
    expect(world.gems).toHaveLength(1);
  });

  it('once the field is clear, every remaining gem flies in and is collected', () => {
    const { world } = aWorld().withKnightAt(20, 20).withMonster('zombie', 35, 35).build();
    dropGem(world, 26, 20);
    dropGem(world, 10, 25);
    runSeconds(world, 0.5);
    expect(world.gems).toHaveLength(2);
    world.monsters.splice(0);
    runSeconds(world, 6);
    expect(world.gems).toHaveLength(0);
    expect(world.progression.xp).toBe(2);
  });
});

describe('level-up flow', () => {
  it('collecting enough XP opens a choice, freezes time, and chooseUpgrade resumes', () => {
    const { world } = aWorld().withKnightAt(20, 20).build();
    for (let k = 0; k < xpToNext(1); k++) dropGem(world, 20, 20);
    const events = tickRaw(world, 1);
    expect(events.filter((e) => e.type === 'gemCollected')).toHaveLength(xpToNext(1));
    expect(events).toContainEqual({ type: 'levelUp', level: 2 });
    expect(world.choosing).toBe(true);
    expect(world.progression.offers).toHaveLength(3);

    const t = world.time;
    const ticks = world.tickCount;
    tickRaw(world, 30);
    expect(world.time).toBe(t);
    expect(world.tickCount).toBe(ticks);

    world.chooseUpgrade(0);
    expect(world.events.some((e) => e.type === 'upgradeChosen')).toBe(true);
    expect(world.choosing).toBe(false);
    tickRaw(world, 30);
    expect(world.time).toBeGreaterThan(t);
  });

  it('monsters and projectiles are frozen too while choosing', () => {
    const { world, monsters } = aWorld().withKnightAt(20, 20).withMonster('zombie', 30, 30).build();
    world.progression.addXp(xpToNext(1));
    const [x, y] = [monsters[0].x, monsters[0].y];
    tickRaw(world, 60);
    expect([monsters[0].x, monsters[0].y]).toEqual([x, y]);
  });

  it('one big pickup emits a levelUp per level and queues one choice each', () => {
    const { world } = aWorld().withKnightAt(20, 20).build();
    dropGem(world, 20, 20, xpToNext(1) + xpToNext(2) + xpToNext(3));
    const events = tickRaw(world, 1);
    expect(events.filter((e) => e.type === 'levelUp').map((e) => (e as { level: number }).level)).toEqual([2, 3, 4]);
    expect(world.progression.level).toBe(4);
    let choices = 0;
    while (world.choosing && choices < 10) { world.chooseUpgrade(0); choices++; }
    expect(choices).toBe(3);
    expect(world.choosing).toBe(false);
  });

  it('chooseUpgrade with nothing on offer does nothing', () => {
    const { world } = aWorld().build();
    world.chooseUpgrade(0);
    expect(world.events).toEqual([]);
  });
});
