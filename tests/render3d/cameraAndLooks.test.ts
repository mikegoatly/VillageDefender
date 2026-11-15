import { describe, expect, it } from 'vitest';
import { fitView, frustumFor, projectGround } from '../../src/render3d/camera';
import { animFor, characterModelPaths, lookFor } from '../../src/render3d/characters';
import { generateTown } from '../../src/sim/map';
import { aWorld } from '../helpers/worldBuilder';

describe('fitView', () => {
  it('keeps every edge cell of the town inside the view', () => {
    for (const seed of [1, 7, 42]) {
      const map = generateTown(seed);
      const v = fitView(map);
      const c = projectGround(v.x, v.z);
      for (const side of Object.values(map.edges)) {
        for (const [i, j] of side) {
          const p = projectGround(i, j);
          expect(Math.abs(p.sx - c.sx)).toBeLessThanOrEqual(v.halfW);
          expect(Math.abs(p.sy - c.sy)).toBeLessThanOrEqual(v.halfH);
        }
      }
    }
  });
});

describe('frustumFor', () => {
  const view = { x: 0, z: 0, halfW: 20, halfH: 10, reach: 30 };

  it('fits a wide screen by height and a narrow one by width', () => {
    expect(frustumFor(view, 4)).toEqual({ halfW: 40, halfH: 10 });
    expect(frustumFor(view, 1)).toEqual({ halfW: 20, halfH: 20 });
  });
});

describe('animFor', () => {
  it('maps sim state to an animation', () => {
    expect(animFor({ state: 'dead', moving: true })).toBe('die');
    expect(animFor({ state: 'attack', moving: true })).toBe('attack');
    expect(animFor({ state: 'dodge', moving: false })).toBe('sprint');
    expect(animFor({ state: 'idle', moving: true })).toBe('walk');
    expect(animFor({ state: 'idle', moving: false })).toBe('idle');
  });
});

describe('lookFor', () => {
  it('gives the knight a batch per weapon', () => {
    const { knight } = aWorld().build();
    expect(lookFor(knight, 'sword').key).not.toBe(lookFor(knight, 'hammer').key);
    expect(lookFor(knight, 'hammer').attachments[0].model).toContain('hammer');
  });

  it('draws brutes as bigger, tinted orcs that share the orc batch', () => {
    const { monsters } = aWorld().withMonster('orc', 3, 3).withMonster('brute', 4, 4).build();
    const orc = lookFor(monsters[0], 'sword');
    const brute = lookFor(monsters[1], 'sword');
    expect(brute.key).toBe(orc.key);
    expect(brute.scale).toBeGreaterThan(orc.scale);
    expect(brute.tint).not.toBe(orc.tint);
  });

  it('keeps translucent ghosts in their own batch', () => {
    const { monsters } = aWorld().withMonster('ghost', 3, 3).withMonster('zombie', 4, 4).build();
    expect(lookFor(monsters[0], 'sword').alpha).toBeLessThan(1);
    expect(lookFor(monsters[0], 'sword').key).not.toBe(lookFor(monsters[1], 'sword').key);
  });

  it('grows rookies with rank', () => {
    const { rookies } = aWorld().withRookie('swordsman', 3, 3).build();
    const base = lookFor(rookies[0], 'sword').scale;
    rookies[0].rank = 2;
    expect(lookFor(rookies[0], 'sword').scale).toBeGreaterThan(base);
  });
});

describe('characterModelPaths', () => {
  it('lists each model once, including attachments', () => {
    const paths = characterModelPaths();
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain('mini-dungeon/shield-round');
    expect(paths).toContain('graveyard/character-zombie');
  });
});
