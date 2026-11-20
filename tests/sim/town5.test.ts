// Town 5 (Lanternwick), phase 1: the night town's entry and its map (a denser forest, lamp posts).

import { describe, expect, it } from 'vitest';
import { MONSTERS } from '../../src/data/monsters';
import { TOWN_BY_ID, TOWNS } from '../../src/data/towns';
import { TOWN5_WAVES } from '../../src/data/waves';
import { generateTown, Ground, isWalkable } from '../../src/sim/map';
import { World } from '../../src/sim/world';
import { holdAttack, runSeconds } from '../helpers/worldBuilder';

const lanternwick = TOWN_BY_ID.lanternwick;

describe('Town 5: Lanternwick', () => {
  it('is the fifth town, unlocked by a star in the fourth, with the night theme', () => {
    expect(TOWNS.map((t) => t.id)).toEqual(['village', 'riverside', 'graveyard', 'frostpeak', 'lanternwick']);
    expect(lanternwick.unlockStars).toBe(1);
    expect(lanternwick.map.theme).toBe('night');
    expect(lanternwick.bossName).toBe('Pumpkin King');
    expect(lanternwick.waves).toBe(TOWN5_WAVES);
  });

  it('has ten placeholder waves of existing monsters, with a boss in the last', () => {
    expect(TOWN5_WAVES).toHaveLength(10);
    for (const w of TOWN5_WAVES) for (const k of Object.keys(w.monsters)) expect(MONSTERS[k as keyof typeof MONSTERS]).toBeDefined();
    const last = Object.keys(TOWN5_WAVES[9].monsters) as (keyof typeof MONSTERS)[];
    expect(last.some((k) => MONSTERS[k].boss)).toBe(true);
  });

  it.each([1, 2, 3])('seed %i keeps the meadow\'s buildings, thickens the forest and lines the roads with lamps', (seed) => {
    const night = generateTown(seed, lanternwick.map);
    const meadow = generateTown(seed);
    expect(night.buildings).toEqual(meadow.buildings);
    const trees = (m: typeof night) => m.decor.filter((d) => d.kind === 'tree').length;
    expect(trees(night)).toBeGreaterThan(trees(meadow) * 2);

    const lamps = night.decor.filter((d) => d.kind === 'lamp');
    expect(lamps.length).toBeGreaterThanOrEqual(12);
    const c = night.centre;
    for (const l of lamps) {
      // On open grass right beside a road, and never in the way.
      expect(l.blocks).toBe(false);
      expect(isWalkable(night, l.i, l.j)).toBe(true);
      expect(night.ground[l.j * night.size + l.i]).toBe(Ground.Grass);
      expect(Math.min(Math.abs(l.i - c), Math.abs(l.j - c))).toBe(1);
    }
  });

  it('other towns get no lamps', () => {
    for (const t of TOWNS.filter((x) => x.map.theme !== 'night')) {
      expect(generateTown(1, t.map).decor.some((d) => d.kind === 'lamp')).toBe(false);
    }
  });

  it('the early waves and the boss wave play without errors', () => {
    const early = new World({ seed: 5, mapOptions: lanternwick.map, waves: lanternwick.waves, god: true });
    expect(() => runSeconds(early, 60, () => holdAttack())).not.toThrow();
    const last = new World({ seed: 5, mapOptions: lanternwick.map, waves: lanternwick.waves, god: true, startWave: 10 });
    expect(() => runSeconds(last, 40, () => holdAttack())).not.toThrow();
  });
});
