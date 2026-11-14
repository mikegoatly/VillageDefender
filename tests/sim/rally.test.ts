import { describe, expect, it } from 'vitest';
import { DT } from '../../src/data/balance';
import { RALLY } from '../../src/data/rookies';
import { emptyInput, type InputState } from '../../src/sim/types';
import { fieldRows } from '../helpers/mapBuilder';
import { aWorld, collectEvents, runSeconds, runTicks } from '../helpers/worldBuilder';

const rows = () => fieldRows(40, [{ id: 0, i: 5, j: 5 }]);
const town = () => aWorld().withMap(rows()).withKnightAt(25, 25);
const rallyInput = (): InputState => ({ ...emptyInput(), rally: true });
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('rally', () => {
  it('the rising edge starts the rally and its cooldown, with an event', () => {
    const { world } = town().build();
    const events = collectEvents(world, 1, rallyInput());
    expect(events).toContainEqual({ type: 'rally' });
    expect(world.rallyTime).toBeCloseTo(RALLY.duration, 6);
    expect(world.rallyCooldown).toBeCloseTo(RALLY.cooldown, 6);
  });

  it('does nothing without the button', () => {
    const { world } = town().build();
    runSeconds(world, 1);
    expect(world.rallyTime).toBe(0);
    expect(world.rallyCooldown).toBe(0);
  });

  it('rally time and cooldown count down', () => {
    const { world } = town().build();
    runTicks(world, 1, rallyInput());
    runSeconds(world, 1);
    expect(world.rallyTime).toBeCloseTo(RALLY.duration - 1, 1);
    expect(world.rallyCooldown).toBeCloseTo(RALLY.cooldown - 1, 1);
    runSeconds(world, RALLY.duration);
    expect(world.rallyTime).toBe(0);
  });

  it('a held button does not retrigger, even after the cooldown', () => {
    const { world } = town().build();
    const events = collectEvents(world, Math.round((RALLY.cooldown + 5) / DT), rallyInput());
    expect(events.filter((e) => e.type === 'rally')).toHaveLength(1);
  });

  it('the cooldown blocks a second press, and re-use works once it has passed', () => {
    const { world } = town().build();
    runTicks(world, 1, rallyInput());
    runSeconds(world, RALLY.duration + 1); // rally over, still cooling down
    expect(world.rallyTime).toBe(0);
    const blocked = collectEvents(world, 2, rallyInput());
    expect(blocked.filter((e) => e.type === 'rally')).toEqual([]);
    expect(world.rallyTime).toBe(0);

    runTicks(world, 1); // release
    runSeconds(world, RALLY.cooldown);
    const again = collectEvents(world, 1, rallyInput());
    expect(again.filter((e) => e.type === 'rally')).toHaveLength(1);
    expect(world.rallyTime).toBeGreaterThan(0);
  });

  it('far-away rookies move toward the knight, and gather around him', () => {
    const { world, rookies, knight } = town().withRookie('swordsman', 18, 25).withRookie('archer', 25, 17).build();
    const before = rookies.map((r) => dist(r, knight));
    runSeconds(world, 1); // no rally: they stay put (nothing to fight)
    rookies.forEach((r, k) => expect(dist(r, knight)).toBeCloseTo(before[k], 1));

    runTicks(world, 1, rallyInput());
    runSeconds(world, 2);
    rookies.forEach((r, k) => expect(dist(r, knight), `rookie ${k}`).toBeLessThan(before[k] - 5));
    runSeconds(world, RALLY.duration);
    rookies.forEach((r, k) => expect(dist(r, knight), `rookie ${k}`).toBeLessThan(RALLY.closeEnough + 0.7));
  });

  it('rookies stay with the knight afterwards (their post moves to him)', () => {
    const { world, rookies, knight } = town().withRookie('swordsman', 18, 25).build();
    runTicks(world, 1, rallyInput());
    runSeconds(world, RALLY.duration + 6);
    expect(dist(rookies[0], knight)).toBeLessThan(RALLY.closeEnough + 0.7);
  });

  it('rookies that are close enough keep fighting while rallying', () => {
    const { world, monsters } = town().withRookie('swordsman', 25.5, 25).withMonster('zombie', 26.3, 25.2).build();
    runTicks(world, 1, rallyInput());
    runSeconds(world, 3);
    expect(monsters[0].state).toBe('dead');
  });
});
