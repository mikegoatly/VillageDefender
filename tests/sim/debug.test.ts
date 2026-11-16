import { describe, expect, it } from 'vitest';
import { WAVES } from '../../src/data/balance';
import { MAX_WEAPON_RANK } from '../../src/data/weapons';
import { XP_DROP } from '../../src/data/rookies';
import type { WaveDef } from '../../src/data/waves';
import { fieldRows } from '../helpers/mapBuilder';
import { aWorld, runSeconds } from '../helpers/worldBuilder';

const WAVES3: WaveDef[] = [1, 2, 3].map(() => ({ monsters: { zombie: 2 }, sides: 1 }));
const buildingsMap = (n: number) =>
  fieldRows(30, Array.from({ length: n }, (_, k) => ({ id: k, i: 2 + k * 3, j: 5 })));
const quiet = () => aWorld().withMap(buildingsMap(3)).withKnightAt(15, 27);

describe('World debug methods', () => {
  it('debugSpawn adds the requested number of monsters at a point and on an edge', () => {
    const { world } = quiet().build();
    world.debugSpawn('zombie', 3, { x: 15, y: 15 });
    expect(world.monsters).toHaveLength(3);
    for (const m of world.monsters) expect(Math.hypot(m.x - 15, m.y - 15)).toBeLessThan(1);
    world.debugSpawn('orc', 2, 'top');
    expect(world.monsters.filter((m) => m.kind === 'orc')).toHaveLength(2);
  });

  it('debugGiveXp levels up and emits levelUp events', () => {
    const { world } = quiet().build();
    world.debugGiveXp(10_000);
    expect(world.progression.level).toBeGreaterThan(2);
    const levels = world.events.filter((e) => e.type === 'levelUp').map((e) => (e as { level: number }).level);
    expect(levels).toEqual(Array.from({ length: world.progression.level - 1 }, (_, i) => i + 2));
    expect(world.choosing).toBe(true);
  });

  it('debugGiveUpgrade applies mods (tough raises maxHp) and returns false when maxed', () => {
    const { world, knight } = quiet().build();
    const before = knight.maxHp;
    expect(world.debugGiveUpgrade('tough')).toBe(true);
    expect(knight.maxHp).toBe(before + 25);
    expect(world.progression.level).toBe(1);
    while (world.debugGiveUpgrade('tough')) { /* take all stacks */ }
    const maxed = knight.maxHp;
    expect(world.debugGiveUpgrade('tough')).toBe(false);
    expect(knight.maxHp).toBe(maxed);
    expect(world.debugGiveUpgrade('nope')).toBe(false);
  });

  it('debugSetWeapon equips a weapon at a clamped rank, mid-run', () => {
    const { world } = quiet().build();
    const base = world.weaponDef.damage;
    world.debugSetWeapon('hammer', 2);
    expect(world.weapon).toBe('hammer');
    expect(world.weaponRank).toBe(2);
    world.debugSetWeapon('hammer', 99);
    expect(world.weaponRank).toBe(MAX_WEAPON_RANK);
    world.debugSetWeapon('sword', 3);
    expect(world.weaponDef.damage).toBeGreaterThan(base);
  });

  it('debugAddRookie adds a rookie of the kind next to the knight and emits rookieJoined', () => {
    const { world, knight } = quiet().noRookies().build();
    world.debugAddRookie('archer');
    expect(world.rookies).toHaveLength(1);
    expect(world.rookies[0].kind).toBe('archer');
    expect(Math.hypot(world.rookies[0].x - knight.x, world.rookies[0].y - knight.y)).toBeLessThan(2);
    expect(world.events).toContainEqual(expect.objectContaining({ type: 'rookieJoined', kind: 'archer' }));
  });

  it('debugHealKnight restores full HP', () => {
    const { world, knight } = quiet().build();
    knight.hp = 1;
    world.debugHealKnight();
    expect(knight.hp).toBe(knight.maxHp);
  });

  it('debugJumpToWave warns, then starts the chosen wave', () => {
    const { world } = quiet().withWaves(WAVES3).build();
    world.debugJumpToWave(3);
    expect(world.debugInfo().nextWave).toBe(3);
    const seen: string[] = [];
    for (let t = 0; t < (WAVES.warning + 3) * 60 && !seen.includes('waveStart'); t++) {
      runSeconds(world, 1 / 60);
      for (const e of world.events) if (e.type === 'waveWarning' || e.type === 'waveStart') {
        expect(e.wave).toBe(3);
        seen.push(e.type);
      }
    }
    expect(seen).toEqual(['waveWarning', 'waveStart']);
    expect(world.wave).toBe(3);
  });

  it('debugKillAll kills every monster, drops gems and counts kills', () => {
    const { world } = quiet().withMonster('zombie', 10, 10).withMonster('orc', 20, 10).build();
    world.debugKillAll();
    expect(world.monsters.every((m) => m.state === 'dead')).toBe(true);
    expect(world.kills).toBe(2);
    expect(world.gems).toHaveLength(2);
    expect(world.gems.map((g) => g.value).sort()).toEqual([XP_DROP.zombie ?? 1, XP_DROP.orc ?? 1].sort());
  });

  it('debugSetBuildingHp(id, 0) ruins the building and emits buildingDestroyed', () => {
    const { world } = quiet().build();
    world.debugSetBuildingHp(1, 0);
    expect(world.buildings[1].ruined).toBe(true);
    expect(world.events).toContainEqual({ type: 'buildingDestroyed', building: 1 });
    expect(world.buildings[0].ruined).toBe(false);
  });

  it('debugSetBuildingHp with a fraction sets hp to that share of max', () => {
    const { world } = quiet().build();
    const b = world.buildings[0];
    world.debugSetBuildingHp(0, 0.5);
    expect(b.hp).toBeCloseTo(b.maxHp * 0.5);
    world.debugSetBuildingHp(0, 1);
    expect(b.hp).toBe(b.maxHp);
  });

  it('debugEnd(true) wins with stars by standing buildings; debugEnd(false) loses as knight', () => {
    const win = quiet().withWaves(WAVES3).build().world;
    win.debugEnd(true);
    expect(win.status).toBe('won');
    expect(win.stars).toBe(win.starsFor(3));

    const hurt = quiet().withWaves(WAVES3).build().world;
    hurt.debugSetBuildingHp(0, 0);
    hurt.debugEnd(true);
    expect(hurt.status).toBe('won');
    expect(hurt.stars).toBe(hurt.starsFor(2));
    expect(hurt.stars).toBeLessThan(win.stars);

    const lose = quiet().build().world;
    lose.debugEnd(false);
    expect(lose.status).toBe('lost');
    expect(lose.lossReason).toBe('knight');
  });

  it('debugInfo exposes flow arrays sized map.size squared', () => {
    const { world } = quiet().build();
    const info = world.debugInfo();
    const n = world.map.size * world.map.size;
    expect(info.knightFlow).toHaveLength(n);
    expect(info.buildingFlow).toHaveLength(n);
    expect(info.nextRookieAt).toBe(world.nextRookieAt());
  });

  it('world.god is mutable at runtime and stops knight damage', () => {
    const { world, knight } = quiet().withMonster('zombie', 15.5, 27).build();
    world.god = true;
    runSeconds(world, 3);
    expect(knight.hp).toBe(knight.maxHp);
  });
});
