// Regressions for the 2026-11-14 play-test notes (docs/Notes.txt).
import { describe, expect, it } from 'vitest';
import { MONSTERS } from '../../src/data/monsters';
import { ARMY } from '../../src/data/rookies';
import { UPGRADES } from '../../src/data/upgrades';
import { emptyInput } from '../../src/sim/types';
import { shoot } from '../../src/sim/projectiles';
import { fieldRows } from '../helpers/mapBuilder';
import { aWorld, collectEvents, runSeconds } from '../helpers/worldBuilder';

/** 30×30 field with one 2×6 wall-like building at i 14–15, j 12–17. */
const wallRows = () => fieldRows(30, [{ id: 0, i: 14, j: 12, w: 2, h: 6 }]);

describe('play-test notes', () => {
  it('archers do not shoot through buildings', () => {
    // Long wall (j 5-24) between an archer and a zombie that is within bow range.
    const longWall = fieldRows(30, [{ id: 0, i: 14, j: 5, w: 2, h: 20 }]);
    const { world, monsters } = aWorld().withMap(longWall).withKnightAt(2, 27).noRookies()
      .withRookie('archer', 12.3, 15).withMonster('zombie', 17.2, 15).build();
    const z = monsters[0];
    z.speed = 0; // parked behind the wall
    const events = collectEvents(world, 60);
    expect(events.filter((e) => e.type === 'shot').length).toBe(0);
    expect(z.hp).toBe(z.maxHp);
  });

  it('rookie arrows stop at buildings', () => {
    const longWall = fieldRows(30, [{ id: 0, i: 14, j: 5, w: 2, h: 20 }]);
    const { world, rookies, monsters } = aWorld().withMap(longWall).withKnightAt(2, 27).noRookies()
      .withRookie('archer', 12.3, 15).withMonster('zombie', 17.2, 15).build();
    monsters[0].speed = 0;
    shoot(world, 12.3, 15, monsters[0], 10, 9, rookies[0].id);
    runSeconds(world, 1);
    expect(monsters[0].hp).toBe(monsters[0].maxHp);
    expect(world.projectiles.length).toBe(0);
  });

  it('archers still shoot with a clear line', () => {
    const { world } = aWorld().withMap(wallRows()).withKnightAt(2, 27).noRookies()
      .withRookie('archer', 5, 5).withMonster('zombie', 8, 5).build();
    const events = collectEvents(world, 60 * 2);
    expect(events.some((e) => e.type === 'shot')).toBe(true);
  });

  it('rookies go after a living boss within ARMY.bossRange even when nothing else is near', () => {
    const { world, rookies, monsters } = aWorld().withKnightAt(2, 2).noRookies()
      .withRookie('swordsman', 10, 10).withMonster('warlord', 10 + ARMY.bossRange - 2, 10).build();
    const r = rookies[0];
    const boss = monsters[0];
    const start = Math.hypot(boss.x - r.x, boss.y - r.y);
    runSeconds(world, 1);
    expect(Math.hypot(boss.x - r.x, boss.y - r.y)).toBeLessThan(start - 1);
  });

  it('big wreckers swat a knight standing in their way', () => {
    // Brute heading for the building; the knight stands right next to it.
    const { world, knight } = aWorld().withMap(wallRows()).withKnightAt(20.5, 15).noRookies()
      .withMonster('brute', 21, 15).build();
    const hp = knight.hp;
    runSeconds(world, 2);
    expect(knight.hp).toBeLessThan(hp);
    expect(MONSTERS.brute.swatsBlockers).toBe(true);
    expect(MONSTERS.orc.swatsBlockers).toBeFalsy();
  });

  it('vampires lunge: they close distance faster when the target is in lunge range', () => {
    const lunge = MONSTERS.vampire.lunge!;
    const { world, monsters } = aWorld().withKnightAt(10, 10).noRookies().god()
      .withMonster('vampire', 10 + lunge.range - 0.5, 10).build();
    const v = monsters[0];
    const start = v.x;
    world.tick([emptyInput()]);
    const moved = start - v.x;
    // One tick at normal speed would move speed*DT; the lunge multiplies it.
    expect(moved).toBeGreaterThan((v.speed / 60) * 1.5);
  });

  it('upgrade cards do not mention the sword (they apply to every weapon)', () => {
    for (const u of UPGRADES) expect(u.describe(0).toLowerCase()).not.toContain('sword');
  });
});
