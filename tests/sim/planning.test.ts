import { describe, expect, it } from 'vitest';
import { ROLES, type RoleKind } from '../../src/data/roles';
import { fieldRows } from '../helpers/mapBuilder';
import { aWorld, runTicks } from '../helpers/worldBuilder';

// Three buildings, knight parked away from them.
const rows = () => fieldRows(30, [{ id: 0, i: 10, j: 10 }, { id: 1, i: 15, j: 10 }, { id: 2, i: 20, j: 10 }]);
const planning = (points = 2, allowed?: RoleKind[]) => aWorld().withMap(rows()).withKnightAt(25, 27).inPlanning(points, allowed);

describe('planning phase', () => {
  it('does not advance until start()', () => {
    const { world } = planning().build();
    expect(world.phase).toBe('planning');
    runTicks(world, 30);
    expect(world.time).toBe(0);
    expect(world.tickCount).toBe(0);
    world.start();
    expect(world.phase).toBe('running');
    runTicks(world, 30);
    expect(world.tickCount).toBe(30);
  });

  it('a normal world starts running', () => {
    const { world } = aWorld().withMap(rows()).build();
    expect(world.phase).toBe('running');
  });

  it('tracks points left as roles are assigned', () => {
    const { world } = planning(2).build();
    expect(world.planningPoints).toBe(2);
    expect(world.planningPointsLeft).toBe(2);
    expect(world.setRole(0, 'barracks')).toBe(true);
    expect(world.planningPointsLeft).toBe(2 - ROLES.barracks.cost);
    expect(world.setRole(1, 'chapel')).toBe(true);
    expect(world.planningPointsLeft).toBe(2 - ROLES.barracks.cost - ROLES.chapel.cost);
    expect(world.buildings[0].role).toBe('barracks');
    expect(world.buildings[1].role).toBe('chapel');
  });

  it('refuses a role that costs more than the points left', () => {
    const { world } = planning(1).build();
    expect(world.setRole(0, 'barracks')).toBe(true);
    expect(world.setRole(1, 'chapel')).toBe(false);
    expect(world.buildings[1].role).toBeNull();
    expect(world.planningPointsLeft).toBe(1 - ROLES.barracks.cost);
  });

  it('swapping a role refunds the old cost', () => {
    const { world } = planning(1).build();
    world.setRole(0, 'barracks');
    expect(world.planningPointsLeft).toBe(1 - ROLES.barracks.cost);
    // With no points left, swapping the same building is still allowed.
    expect(world.setRole(0, 'chapel')).toBe(true);
    expect(world.buildings[0].role).toBe('chapel');
    expect(world.planningPointsLeft).toBe(1 - ROLES.chapel.cost);
  });

  it('setRole(id, null) clears the role and gives the points back', () => {
    const { world } = planning(2).build();
    world.setRole(0, 'barracks');
    expect(world.setRole(0, null)).toBe(true);
    expect(world.buildings[0].role).toBeNull();
    expect(world.planningPointsLeft).toBe(2);
  });

  it('respects allowedRoles', () => {
    const { world } = planning(5, ['barracks', 'chapel']).build();
    expect(world.setRole(0, 'smithy')).toBe(false);
    expect(world.setRole(0, 'watchtower')).toBe(false);
    expect(world.buildings[0].role).toBeNull();
    expect(world.setRole(0, 'chapel')).toBe(true);
  });

  it('allows every role by default', () => {
    const { world } = planning(5).build();
    for (const [k, role] of (['barracks', 'chapel', 'smithy', 'watchtower'] as RoleKind[]).entries()) {
      expect(world.setRole(k % 3, role)).toBe(true);
    }
  });

  it('returns false for bad building ids', () => {
    const { world } = planning(5).build();
    expect(world.setRole(-1, 'barracks')).toBe(false);
    expect(world.setRole(99, 'barracks')).toBe(false);
    expect(world.setRole(99, null)).toBe(false);
    expect(world.planningPointsLeft).toBe(5);
  });

  it('refuses changes after start()', () => {
    const { world } = planning(5).build();
    world.setRole(0, 'barracks');
    world.start();
    expect(world.setRole(1, 'chapel')).toBe(false);
    expect(world.setRole(0, null)).toBe(false);
    expect(world.buildings[0].role).toBe('barracks');
    expect(world.buildings[1].role).toBeNull();
  });

  it('withPlan assigns roles and starts the world', () => {
    const { world } = aWorld().withMap(rows()).withPlan({ 0: 'chapel', 2: 'smithy' }).build();
    expect(world.phase).toBe('running');
    expect(world.buildings.map((b) => b.role)).toEqual(['chapel', null, 'smithy']);
  });
});
