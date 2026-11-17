import { describe, expect, it } from 'vitest';
import { DT, KNIGHT } from '../../src/data/balance';
import { MONSTERS, type MonsterKind } from '../../src/data/monsters';
import { TRAP } from '../../src/data/traps';
import type { UpgradeOffer } from '../../src/data/upgrades';
import { emptyInput, type InputState } from '../../src/sim/types';
import type { Unit, World } from '../../src/sim/world';
import { fieldRows } from '../helpers/mapBuilder';
import { aWorld, collectEvents, dummy, runSeconds, runTicks, runUntil } from '../helpers/worldBuilder';

// A house in the top-left corner; the knight stands in the middle of the field.
const rows = () => fieldRows(40, [{ id: 0, i: 5, j: 5 }]);
const town = () => aWorld().withMap(rows()).withKnightAt(25, 25).withPowers('trap');
const press = (): InputState => ({ ...emptyInput(), ability1: true });

/** Presses the trap button once, then waits until `n` traps are set. */
function setTraps(world: World, n = 1) {
  for (let k = 0; k < n; k++) {
    runTicks(world, 1, press());
    runTicks(world, 1);
    world.trapCooldown = 0; // skip the wait between traps
    runUntil(world, (w) => w.traps.length >= k + 1, 2400);
  }
}

describe('trap power', () => {
  it('does nothing without the power', () => {
    const { world } = aWorld().withMap(rows()).withKnightAt(25, 25).build();
    runTicks(world, 1, press());
    expect(world.trapRunners).toHaveLength(0);
    expect(world.trapCooldown).toBe(0);
  });

  it('a press sends a villager from the nearest building to the knight and starts the cooldown', () => {
    const { world, knight } = town().build();
    const events = collectEvents(world, 1, press());
    expect(events).toContainEqual(expect.objectContaining({ type: 'trapCalled', x: knight.x, y: knight.y }));
    expect(world.trapRunners).toHaveLength(1);
    expect(world.trapRunners[0].x).toBeCloseTo(5, 0);
    expect(world.trapCooldown).toBeGreaterThan(TRAP.cooldown - 0.1);
  });

  it('the villager sets the trap where the knight stood, even if the knight moves on', () => {
    const { world, knight } = town().build();
    runTicks(world, 1, press());
    knight.x = 10;
    knight.y = 10;
    runUntil(world, (w) => w.traps.length === 1, 2400);
    expect(world.traps).toHaveLength(1);
    expect(world.traps[0].x).toBeCloseTo(25, 1);
    expect(world.traps[0].y).toBeCloseTo(25, 1);
    expect(world.trapRunners).toHaveLength(0);
  });

  it('the villager walks at a believable pace, slower than the knight', () => {
    const { world } = town().build();
    runTicks(world, 1, press());
    const r = world.trapRunners[0];
    const [x0, y0] = [r.x, r.y];
    runSeconds(world, 1);
    expect(Math.hypot(r.x - x0, r.y - y0)).toBeCloseTo(TRAP.runnerSpeed, 0);
    expect(TRAP.runnerSpeed).toBeLessThan(KNIGHT.speed);
  });

  it('building takes the full set time, with progress to show, and the trap only appears at the end', () => {
    const { world } = town().build();
    runTicks(world, 1, press());
    runUntil(world, (w) => w.trapRunners[0]?.setLeft !== null, 2400);
    const r = world.trapRunners[0];
    expect(r.setTotal).toBeCloseTo(TRAP.setTime, 6);
    runSeconds(world, TRAP.setTime / 2);
    expect(world.traps).toHaveLength(0);
    expect(r.setLeft).toBeCloseTo(TRAP.setTime / 2, 1);
    runSeconds(world, TRAP.setTime / 2 + 0.1);
    expect(world.traps).toHaveLength(1);
  });

  it('a monster arriving while the villager builds stops the trap', () => {
    const { world } = town().build();
    runTicks(world, 1, press());
    runUntil(world, (w) => w.trapRunners[0]?.setLeft !== null, 2400);
    runSeconds(world, TRAP.setTime / 2);
    put(world, 'zombie', 25.1, 25);
    runSeconds(world, 0.2);
    expect(world.trapRunners).toHaveLength(0);
    expect(world.traps).toHaveLength(0);
    expect(world.trapCooldown).toBe(0);
  });

  it('a held button does not call a second villager', () => {
    const { world } = town().build();
    const events = collectEvents(world, Math.round((TRAP.cooldown + 3) / DT), press());
    expect(events.filter((e) => e.type === 'trapCalled')).toHaveLength(1);
  });

  it('the cooldown blocks a second call until it has passed', () => {
    const { world } = town().build();
    setTraps(world);
    world.trapCooldown = 5;
    runTicks(world, 1, press());
    expect(world.trapRunners).toHaveLength(0);
    world.trapCooldown = 0;
    runTicks(world, 1);
    runTicks(world, 1, press());
    expect(world.trapRunners).toHaveLength(1);
  });

  it('holds at most two traps at once, counting villagers still on their way', () => {
    const { world } = town().build();
    setTraps(world, 2);
    expect(world.traps).toHaveLength(2);
    runTicks(world, 1);
    runTicks(world, 1, press());
    expect(world.trapRunners).toHaveLength(0);
  });

  it('a villager on the way takes up one of the two slots', () => {
    const { world } = town().build();
    runTicks(world, 1, press());
    world.trapCooldown = 0;
    runTicks(world, 1);
    runTicks(world, 1, press());
    world.trapCooldown = 0;
    runTicks(world, 1);
    runTicks(world, 1, press());
    expect(world.trapRunners).toHaveLength(2);
  });

  it('the trap cap grows with Trap Line', () => {
    const { world } = town().withUpgrades({ trapcap: 1 }).build();
    setTraps(world, 3);
    expect(world.traps).toHaveLength(3);
  });

  it('a monster reaching the villager stops the trap and refunds the cooldown', () => {
    const { world, monsters } = town().withMonster('zombie', 25, 25).build();
    dummy(monsters[0]); // waits right where the villager is headed
    const events = collectEvents(world, 1, press());
    expect(events.some((e) => e.type === 'trapCalled')).toBe(true);
    runUntil(world, (w) => w.trapRunners.length === 0, 2400);
    expect(world.traps).toHaveLength(0);
    expect(world.trapCooldown).toBe(0);
  });

  it('reports the downed villager', () => {
    const { world, monsters } = town().withMonster('zombie', 25, 25).build();
    dummy(monsters[0]);
    runTicks(world, 1, press());
    const events = collectEvents(world, 2400);
    expect(events.filter((e) => e.type === 'trapRunnerDown')).toHaveLength(1);
  });
});

/** Adds a stationary monster (tanky unless `hp` is given) at a spot; call after the trap is set. */
function put(world: World, kind: MonsterKind, x = 25, y = 25, hp: number | null = 100000): Unit {
  const m = world.addMonster(x, y, kind);
  return hp === null ? Object.assign(m, { speed: 0 }) : dummy(m, hp);
}

describe('trap damage', () => {
  it('hurts a monster standing in it and not one outside it', () => {
    const { world } = town().build();
    setTraps(world);
    const inside = put(world, 'zombie', 25, 25, 1000);
    const outside = put(world, 'zombie', 25 + TRAP.radius + 2, 25, 1000);
    runSeconds(world, 1);
    expect(inside.hp).toBeLessThan(1000);
    expect(outside.hp).toBe(1000);
  });

  it('kills weak monsters and pays out as for any kill', () => {
    const { world } = town().build();
    setTraps(world);
    const m = put(world, 'zombie', 25, 25, null);
    runSeconds(world, 2);
    expect(m.state).toBe('dead');
    expect(world.kills).toBe(1);
    expect(world.coins).toBeGreaterThan(0);
  });

  it('wears out after its damage budget and is removed', () => {
    const { world } = town().build();
    setTraps(world);
    const m = put(world, 'zombie');
    const events = collectEvents(world, Math.round(10 / DT));
    expect(world.traps).toHaveLength(0);
    expect(events.filter((e) => e.type === 'trapSpent')).toHaveLength(1);
    expect(100000 - m.hp).toBeCloseTo(TRAP.budget, 0);
  });

  it('shares its budget between monsters: the budget is the total damage', () => {
    const { world } = town().build();
    setTraps(world);
    const all = [put(world, 'zombie', 25.3, 25), put(world, 'zombie', 24.7, 25), put(world, 'zombie', 25, 25.4)];
    runSeconds(world, 10);
    const total = all.reduce((s, m) => s + (100000 - m.hp), 0);
    expect(world.traps).toHaveLength(0);
    expect(total).toBeCloseTo(TRAP.budget, 0);
  });

  it('does not hurt the knight, rookies or buildings', () => {
    const { world, knight, rookies } = town().withRookie('swordsman', 25.3, 25).build();
    const building = world.buildings[0];
    setTraps(world);
    put(world, 'zombie', 26.2, 25); // inside the trap, but too far to bite the friendlies standing in it
    const hp = [knight.hp, rookies[0].hp, building.hp];
    runSeconds(world, 3);
    expect([knight.hp, rookies[0].hp, building.hp]).toEqual(hp);
    expect(world.traps).toHaveLength(1);
  });

  it('leaves a flying monster alone', () => {
    const { world } = town().build();
    setTraps(world);
    const m = put(world, 'zombie', 25, 25, 1000);
    const zombie = MONSTERS.zombie;
    MONSTERS.zombie = { ...zombie, flying: true };
    try {
      runSeconds(world, 2);
    } finally {
      MONSTERS.zombie = zombie;
    }
    expect(m.hp).toBe(1000);
    expect(world.traps).toHaveLength(1);
  });

  it('leaves a burrowed monster alone', () => {
    const { world } = town().build();
    setTraps(world);
    const m = put(world, 'gravedigger', 25, 25, 1000);
    m.burrowed = true;
    runSeconds(world, 2);
    expect(m.hp).toBe(1000);
  });

  it('a boss takes half damage per pulse', () => {
    const { world } = town().build();
    setTraps(world);
    const boss = put(world, 'warlord', 25, 25, null);
    const before = boss.hp;
    runUntil(world, () => boss.hp < before, 100);
    expect(before - boss.hp).toBeCloseTo(TRAP.dps * TRAP.pulse * TRAP.bossMul, 5);
  });

  it('a boss loses only half the budget, nowhere near enough to die', () => {
    const { world } = town().build();
    setTraps(world, 2);
    const boss = put(world, 'warlord', 25, 25, null);
    const full = boss.hp;
    runSeconds(world, 15);
    const lost = full - boss.hp;
    expect(world.traps).toHaveLength(0); // both spent
    expect(lost).toBeCloseTo(2 * TRAP.budget * TRAP.bossMul, 0);
    expect(lost).toBeLessThan(full * 0.25);
    expect(boss.state).not.toBe('dead');
  });
});

describe('trap upgrades', () => {
  it('Heavy Jaws raises the damage budget', () => {
    const { world } = town().withUpgrades({ trapdmg: 2 }).build();
    setTraps(world);
    const m = put(world, 'zombie');
    runSeconds(world, 20);
    expect(100000 - m.hp).toBeCloseTo(TRAP.budget * 1.8, 0);
  });

  it('Wide Snare widens the trap', () => {
    const { world } = town().withUpgrades({ traprad: 2 }).build();
    setTraps(world);
    expect(world.traps[0].radius).toBeCloseTo(TRAP.radius * 1.5, 6);
  });

  it('Nimble Hands shortens the time spent building', () => {
    const { world } = town().withUpgrades({ trapbuild: 2 }).build();
    runTicks(world, 1, press());
    runUntil(world, (w) => w.trapRunners[0]?.setLeft !== null, 2400);
    expect(world.trapRunners[0].setTotal).toBeCloseTo(TRAP.setTime * 0.75 * 0.75, 6);
  });

  it('Trap Cache shortens the cooldown', () => {
    const { world } = town().withUpgrades({ trapquick: 1 }).build();
    runTicks(world, 1, press());
    expect(world.trapCooldown).toBeCloseTo(TRAP.cooldown * 0.75, 1);
  });

  it('Tangle Snare slows monsters inside the trap', () => {
    const { world } = town().withUpgrades({ trapslow: 1 }).build();
    setTraps(world);
    expect(world.traps[0].slow).toBeCloseTo(0.3, 6);
    const m = put(world, 'zombie', 25.5, 25);
    runSeconds(world, 0.5);
    expect(m.slowIn).toBeGreaterThan(0);
    expect(m.slowBy).toBeCloseTo(0.3, 6);
  });

  it('trap cards are only offered with the power', () => {
    const offered = (w: World) => {
      const seen = new Set<string>();
      for (let k = 0; k < 40; k++) {
        w.progression.offers = null;
        w.progression.addXp(w.progression.xpToNext);
        (w.progression.offers as UpgradeOffer[] | null)?.forEach((o) => seen.add(o.id));
      }
      return [...seen];
    };
    expect(offered(aWorld().withMap(rows()).build().world).filter((id) => id.startsWith('trap'))).toEqual([]);
    expect(offered(town().build().world).some((id) => id.startsWith('trap'))).toBe(true);
  });
});
