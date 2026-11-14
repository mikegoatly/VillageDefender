import { describe, expect, it } from 'vitest';
import { KNIGHT } from '../../src/data/balance';
import { groundDirToScreen } from '../../src/sim/iso';
import { distanceToNearestBlocked } from '../helpers/assertions';
import { aWorld, moveScreen, runSeconds } from '../helpers/worldBuilder';

// Wall of blocked cells for i >= 12 in an open field.
const walledField = Array.from({ length: 30 }, () => '.'.repeat(12) + '#'.repeat(18));

function groundMove(gx: number, gy: number) {
  const s = groundDirToScreen(gx, gy);
  const l = Math.hypot(s.x, s.y);
  return moveScreen(s.x / l, s.y / l);
}

describe('collision', () => {
  it.each([[1, 0], [1, 1], [1, -1]])('never penetrates a wall when driven toward ground dir (%d, %d)', (gx, gy) => {
    const { world, knight } = aWorld().withMap(walledField).withKnightAt(8, 15).build();
    let minDist = Infinity;
    runSeconds(world, 2, () => {
      minDist = Math.min(minDist, world.map ? distanceToNearestBlocked(world.map, knight.x, knight.y) : Infinity);
      return groundMove(gx, gy);
    });
    minDist = Math.min(minDist, distanceToNearestBlocked(world.map, knight.x, knight.y));
    expect(KNIGHT.radius - minDist).toBeLessThan(1e-3);
    expect(knight.x).toBeLessThan(11.5);
  });

  it('slides along a wall when moving diagonally into it', () => {
    const { world, knight } = aWorld().withMap(walledField).withKnightAt(10, 8).build();
    runSeconds(world, 2, () => groundMove(1, 1));
    expect(knight.y - 8).toBeGreaterThan(2);
    expect(knight.x).toBeLessThan(11.5);
  });
});
