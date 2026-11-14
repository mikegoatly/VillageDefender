import { describe, expect, it } from 'vitest';
import { DT, KNIGHT, ZOMBIE } from '../../src/data/balance';
import { emptyInput } from '../../src/sim/types';
import {
  aWorld, collectEvents, holdAttack, holdDodge, moveScreen, runSeconds, runTicks, runUntil,
} from '../helpers/worldBuilder';
import { groundDirToScreen } from '../../src/sim/iso';

const SWINGS = Math.ceil(ZOMBIE.hp / KNIGHT.attackDamage);

describe('knight combat', () => {
  it('kills a zombie in front within the expected number of swings', () => {
    const { world, zombies } = aWorld().withKnightAt(20, 20).withZombieAt(20.6, 20).build();
    runTicks(world, 1); // let the spatial hash see the zombie
    let swings = 0;
    const ticks = runUntil(world, (w) => {
      swings += w.events.filter((e) => e.type === 'swing').length;
      return zombies[0].state === 'dead';
    }, 300, holdAttack());
    expect(zombies[0].state).toBe('dead');
    expect(swings).toBe(SWINGS);
    // Kill lands on the last swing's hit time.
    const seconds = ticks * DT;
    expect(seconds).toBeGreaterThan((SWINGS - 1) * KNIGHT.attackCooldown);
    expect(seconds).toBeLessThan(SWINGS * KNIGHT.attackCooldown);
    expect(world.kills).toBe(1);
  });

  it('does not hit a zombie behind the knight with a swing aimed at one in front', () => {
    const { world, zombies } = aWorld().withKnightAt(20, 20).withZombieAt(20.6, 20).withZombieAt(19.0, 20).build();
    const [front, behind] = zombies;
    runTicks(world, 1);
    runUntil(world, () => front.hp < front.maxHp, 60, holdAttack());
    expect(front.hp).toBe(front.maxHp - KNIGHT.attackDamage);
    expect(behind.hp).toBe(behind.maxHp);
  });

  it('knocks the zombie back', () => {
    const { world, zombies } = aWorld().withKnightAt(20, 20).withZombieAt(20.6, 20).build();
    const z = zombies[0];
    runTicks(world, 1);
    const before = Math.hypot(z.x - 20, z.y - 20);
    runUntil(world, () => z.hp < z.maxHp, 60, holdAttack());
    expect(Math.hypot(z.vx, z.vy)).toBeGreaterThan(0);
    runTicks(world, 6, holdAttack());
    expect(Math.hypot(z.x - 20, z.y - 20)).toBeGreaterThan(before);
  });
});

describe('zombie combat', () => {
  it('bites an idle knight for ZOMBIE.damage after the windup', () => {
    const { world, knight } = aWorld().withKnightAt(20, 20).withZombieAt(20.5, 20).build();
    runSeconds(world, ZOMBIE.attackWindup - 0.1);
    expect(knight.hp).toBe(knight.maxHp);
    runSeconds(world, 0.2);
    expect(knight.hp).toBe(knight.maxHp - ZOMBIE.damage);
  });

  it('god mode prevents damage', () => {
    const { world, knight } = aWorld().god().withKnightAt(20, 20).withZombieAt(20.5, 20).build();
    runSeconds(world, 4);
    expect(knight.hp).toBe(knight.maxHp);
  });

  it('loses the game when the knight dies', () => {
    const { world, knight } = aWorld().withKnightAt(20, 20).withZombieAt(20.5, 20).build();
    knight.hp = 1;
    const events = collectEvents(world, 60);
    expect(knight.hp).toBe(0);
    expect(world.status).toBe('lost');
    expect(events.some((e) => e.type === 'playerDied')).toBe(true);
  });
});

describe('dodge', () => {
  // Knight pinned against a wall so the dodge cannot carry it out of the zombie's reach.
  const rows = Array.from({ length: 30 }, () => '.'.repeat(16) + '#'.repeat(14));
  const toWall = () => {
    const s = groundDirToScreen(1, 0);
    const l = Math.hypot(s.x, s.y);
    return moveScreen(s.x / l, s.y / l);
  };

  function scenario(dodgeAtTick: number | null) {
    const { world, knight } = aWorld().withMap(rows).withKnightAt(15.25, 15).withZombieAt(14.7, 15).build();
    // Zombie starts its bite on tick 1; the hit lands at about tick 24.
    for (let t = 1; t <= 40; t++) {
      const input = t >= (dodgeAtTick ?? 1e9) && t < (dodgeAtTick ?? 1e9) + 1 ? { ...toWall(), dodge: true } : emptyInput();
      world.tick([input]);
    }
    return knight;
  }

  it('control: without dodging the knight is bitten', () => {
    expect(scenario(null).hp).toBe(KNIGHT.hp - ZOMBIE.damage);
  });

  it('takes no damage while dodging', () => {
    expect(scenario(18).hp).toBe(KNIGHT.hp);
  });

  it('holding dodge does not retrigger until released', () => {
    const { world, knight } = aWorld().god().withKnightAt(20, 20).build();
    let entries = 0;
    let prev = knight.state;
    for (let t = 0; t < 180; t++) {
      world.tick([holdDodge()]);
      if (knight.state === 'dodge' && prev !== 'dodge') entries++;
      prev = knight.state;
    }
    expect(entries).toBe(1);
    // Release for a tick, press again: second dodge allowed.
    world.tick([emptyInput()]);
    world.tick([holdDodge()]);
    expect(knight.state).toBe('dodge');
  });
});

describe('knight combat (regressions)', () => {
  it('does not damage the knight with its own swing', () => {
    const { world, knight } = aWorld().withKnightAt(20, 20).withZombieAt(21.0, 20).build();
    runTicks(world, 1);
    const events = collectEvents(world, 30, holdAttack());
    expect(events.filter((e) => e.type === 'hit' && e.unit === knight.id)).toEqual([]);
    expect(knight.hp).toBe(knight.maxHp);
  });

  it.each([[0, -1], [-1, 0], [0, 1]])('swings at a zombie in ground direction (%d, %d), not at the default facing', (dx, dy) => {
    const { world, zombies } = aWorld().withKnightAt(20, 20).withZombieAt(20 + dx * 0.9, 20 + dy * 0.9).build();
    runTicks(world, 1);
    runUntil(world, () => zombies[0].hp < zombies[0].maxHp, 40, holdAttack());
    expect(zombies[0].hp).toBe(zombies[0].maxHp - KNIGHT.attackDamage);
  });
});
