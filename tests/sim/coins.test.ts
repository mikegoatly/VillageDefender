import { MONSTERS } from '../../src/data/monsters';
import { describe, expect, it } from 'vitest';
import { COINS } from '../../src/data/towns';
import type { WaveDef } from '../../src/data/waves';
import { fighterBot } from '../helpers/bots';
import { fieldRows } from '../helpers/mapBuilder';
import { aWorld, resolveChoices, runUntil } from '../helpers/worldBuilder';

// Three single-cell buildings around the centre of a 30x30 field.
const rows = () => fieldRows(30, [{ id: 0, i: 12, j: 12 }, { id: 1, i: 17, j: 12 }, { id: 2, i: 14, j: 17 }]);
const town = () => aWorld().withMap(rows()).withKnightAt(25, 27).god();
const waves = (n: number): WaveDef[] => Array.from({ length: n }, () => ({ monsters: { zombie: 1 }, sides: 1 as const }));

describe('coins', () => {
  it('pays per kill by kind', () => {
    const { world } = town().withMonster('zombie', 3, 3).withMonster('orc', 4, 3).withMonster('brute', 5, 3).build();
    world.debugKillAll();
    expect(world.coins).toBe(MONSTERS.zombie.coins + MONSTERS.orc.coins + MONSTERS.brute.coins);
    expect(world.killsByKind).toEqual({ zombie: 1, orc: 1, brute: 1 });
  });

  it('pays for a cleared wave when the next one starts', () => {
    const { world } = town().withWaves(waves(4)).build();
    expect(world.coins).toBe(0);
    runUntil(world, (w) => w.wave >= 1, 60 * 30);
    expect(world.wave).toBe(1);
    expect(world.coins).toBe(0);
    runUntil(world, (w) => w.wave >= 2, 60 * 60);
    expect(world.coins).toBe(COINS.perWaveCleared * 1);
    runUntil(world, (w) => w.wave >= 3, 60 * 60);
    expect(world.coins).toBe(COINS.perWaveCleared * (1 + 2));
  });

  it('adds the win bonus: perWaveCleared x waves + perStar x stars', () => {
    const { world } = town().withWaves(waves(4)).build();
    world.debugEnd(true);
    expect(world.status).toBe('won');
    expect(world.stars).toBe(3);
    expect(world.coins).toBe(COINS.perWaveCleared * 4 + COINS.perStar * 3);
  });

  it('the win bonus follows the stars', () => {
    const { world } = town().withWaves(waves(4)).build();
    world.debugSetBuildingHp(0, 0);
    world.debugEnd(true);
    expect(world.stars).toBe(2);
    expect(world.coins).toBe(COINS.perWaveCleared * 4 + COINS.perStar * 2);
  });

  it('pays no win bonus for a loss', () => {
    const { world } = town().withWaves(waves(4)).build();
    world.debugEnd(false);
    expect(world.status).toBe('lost');
    expect(world.coins).toBe(0);
  });

  it('a real win pays kills, then the win bonus', () => {
    const { world } = aWorld().withMap(rows()).withKnightAt(15, 15).withWaves(waves(1)).build();
    const bot = fighterBot();
    for (let k = 0; k < 60 * 120 && world.status === 'playing'; k++) {
      resolveChoices(world, () => 0);
      world.tick([bot(world)]);
    }
    expect(world.status).toBe('won');
    expect(world.stars).toBe(3);
    expect(world.coins).toBe(MONSTERS.zombie.coins + COINS.perWaveCleared + COINS.perStar * 3);
  });
});

describe('runResult', () => {
  it('reports the run for the profile', () => {
    const { world } = town().withWaves(waves(4)).withMonster('zombie', 3, 3).withMonster('zombie', 4, 3).withMonster('brute', 5, 3).build();
    world.debugKillAll();
    world.debugSetBuildingHp(1, 0);
    world.debugGiveXp(10_000);
    resolveChoices(world, () => 0);
    world.debugEnd(true);
    const r = world.runResult();
    expect(r).toMatchObject({
      townId: world.townId, won: true, stars: 2, standing: 2, totalBuildings: 3,
      kills: { zombie: 2, brute: 1 },
    });
    expect(r.knightLevel).toBe(world.progression.level);
    expect(r.knightLevel).toBeGreaterThan(1);
    expect(r.coins).toBe(2 * MONSTERS.zombie.coins + MONSTERS.brute.coins + COINS.perWaveCleared * 4 + COINS.perStar * 2);
  });

  it('reports a loss', () => {
    const { world } = town().build();
    world.debugEnd(false);
    expect(world.runResult()).toMatchObject({ won: false, stars: 0, standing: 3, kills: {}, coins: 0 });
  });

  it('rounds coins', () => {
    const { world } = town().build();
    world.coins = 12.6;
    expect(world.runResult().coins).toBe(13);
    world.coins = 12.4;
    expect(world.runResult().coins).toBe(12);
  });

  it('copies the kill table', () => {
    const { world } = town().withMonster('zombie', 3, 3).build();
    world.debugKillAll();
    const r = world.runResult();
    r.kills.zombie = 99;
    expect(world.killsByKind.zombie).toBe(1);
  });
});
