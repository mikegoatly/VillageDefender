// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hitStopFor } from '../../src/game/GameController';
import { aGame, type BuiltGame } from '../helpers/game';
import { aWorld } from '../helpers/worldBuilder';

describe('hitStopFor', () => {
  it('freezes briefly on a heavy hit to a living monster, not on a light one', () => {
    const { world, monsters } = aWorld().withMonster('orc', 3, 3).build();
    const hit = (damage: number) => ({ type: 'hit', unit: monsters[0].id, by: 0, damage, x: 3, y: 3 }) as const;
    expect(hitStopFor(world, hit(20))).toBeGreaterThan(0);
    expect(hitStopFor(world, hit(19))).toBe(0);
  });

  it('ignores hits on units that are not monsters', () => {
    const { world, knight } = aWorld().build();
    expect(hitStopFor(world, { type: 'hit', unit: knight.id, by: 0, damage: 99, x: 0, y: 0 })).toBe(0);
  });

  it('freezes longer for a boss death than a brute death, and not for fodder', () => {
    const { world, monsters } = aWorld().withMonster('warlord', 3, 3).withMonster('brute', 4, 4).withMonster('zombie', 5, 5).build();
    const death = (i: number) => hitStopFor(world, { type: 'death', unit: monsters[i].id });
    expect(death(0)).toBeGreaterThan(death(1));
    expect(death(1)).toBeGreaterThan(0);
    expect(death(2)).toBe(0);
  });
});

describe('GameController', () => {
  let game: BuiltGame | undefined;
  beforeEach(() => {
    document.body.innerHTML = '';
  });
  afterEach(() => {
    game?.controller.destroy();
    game = undefined;
  });

  it('steps the sim at the fixed rate and draws once per frame', () => {
    game = aGame(aWorld().build().world);
    game.frames(60);
    expect(game.world.time).toBeGreaterThan(0.95);
    expect(game.world.time).toBeLessThan(1.05);
    expect(game.renderer.sync).toHaveBeenCalledTimes(60);
  });

  it('runs the sim faster with a speed multiplier', () => {
    game = aGame(aWorld().build().world, { params: { speed: 4 } });
    game.frames(60);
    expect(game.world.time).toBeGreaterThan(3.8);
  });

  it('forwards sim events to audio and the renderer', () => {
    // A zombie on top of the knight gets hit by the held attack.
    const { world, knight } = aWorld().withKnightAt(5, 5).withZombieAt(5.6, 5).god().build();
    game = aGame(world);
    game.controller.setInputOverride({ move: { x: 0, y: 0 }, attack: true, dodge: false, ability1: false, ability2: false, rally: false, pause: false });
    game.frames(60);
    expect(knight.hp).toBeGreaterThan(0);
    expect(game.audio.handleEvents).toHaveBeenCalled();
    const types = game.renderer.onEvent.mock.calls.map(([, e]) => e.type);
    expect(types).toContain('hit');
  });

  it('step() advances exactly n ticks and redraws', () => {
    game = aGame(aWorld().build().world);
    const before = game.world.tickCount;
    game.controller.step(7);
    expect(game.world.tickCount).toBe(before + 7);
    expect(game.renderer.sync).toHaveBeenCalledTimes(1);
  });

  describe('planning', () => {
    it('shows auras while planning and hides them when the town starts', () => {
      game = aGame(aWorld().withSeed(3).noWaves(false).inPlanning().build().world);
      expect(game.renderer.setPlanning).toHaveBeenLastCalledWith(true);
      expect(game.audio.music).toHaveBeenLastCalledWith('plan');
      game.frames(30);
      expect(game.world.time).toBe(0);

      game.controller.startTown();
      expect(game.world.phase).not.toBe('planning');
      expect(game.renderer.setPlanning).toHaveBeenLastCalledWith(false);
      expect(game.audio.music).toHaveBeenLastCalledWith('play');
      game.frames(30);
      expect(game.world.time).toBeGreaterThan(0);
    });

    it('selects the building under a click and shows an assigned role', () => {
      game = aGame(aWorld().withSeed(3).noWaves(false).inPlanning().build().world);
      const b = game.world.buildings[0];
      const [i, j] = b.cells[0];
      game.renderer.click(i, j);
      expect(game.renderer.highlightBuilding).toHaveBeenLastCalledWith(b.id);

      game.controller.assignRole(b.id, 'barracks');
      expect(game.world.buildings[b.id].role).toBe('barracks');
      expect(game.renderer.setRole).toHaveBeenLastCalledWith(b.id, 'barracks');
    });

    it('does not show a role the sim refused', () => {
      game = aGame(aWorld().withSeed(3).noWaves(false).inPlanning(0).build().world);
      game.controller.assignRole(0, 'barracks');
      expect(game.renderer.setRole).not.toHaveBeenCalled();
    });

    it('ignores a weapon the profile has not unlocked', () => {
      game = aGame(aWorld().withSeed(3).noWaves(false).inPlanning().build().world);
      game.controller.chooseWeapon('flail');
      expect(game.world.weapon).toBe('sword');
      expect(game.renderer.knightWeaponChanged).not.toHaveBeenCalled();
    });
  });

  it('records a finished run in the profile exactly once', () => {
    game = aGame(aWorld().withSeed(3).noWaves(false).build().world);
    game.world.debugEnd(true);
    game.frames(1);
    const coins = game.profile.data.coins;
    expect(coins).toBeGreaterThan(0);
    game.frames(30);
    expect(game.profile.data.coins).toBe(coins);
    expect(game.audio.music).toHaveBeenLastCalledWith(null);
  });

  it('retry restarts with the same seed and town; new town picks another seed', () => {
    game = aGame(aWorld().build().world, { params: { seed: 77 } });
    game.controller.restart(77);
    expect(game.restarts).toEqual([{ seed: 77, town: 'village' }]);
    game.controller.restart();
    expect(game.restarts[1].town).toBe('village');
    expect(typeof game.restarts[1].seed).toBe('number');
  });

  it('destroy tears down its UI, audio and renderer', () => {
    game = aGame(aWorld().build().world);
    game.controller.destroy();
    expect(game.renderer.destroy).toHaveBeenCalledTimes(1);
    expect(game.audio.destroy).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.over')).toBeNull();
    game = undefined;
  });
});
