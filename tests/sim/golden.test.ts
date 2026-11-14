// Golden behaviour fingerprint. Recorded before the world.ts split (2026-11-14) to prove that
// refactors keep the simulation bit-for-bit identical: same tick order, same RNG call order.
// If a change is MEANT to alter behaviour (balance, new mechanics), update the snapshot with
// `npx vitest run tests/sim/golden.test.ts -u` and say so in the commit message.

import { describe, expect, it } from 'vitest';
import { DT } from '../../src/data/balance';
import { STARTING_ROLES } from '../../src/data/roles';
import { TOWNS } from '../../src/data/towns';
import { WEAPON_ORDER, type WeaponKind } from '../../src/data/weapons';
import { World } from '../../src/sim/world';
import { defenderBot, defenderChooser, defenderPlan, fighterBot, fighterChooser, type Bot } from '../helpers/bots';
import type { Chooser } from '../helpers/worldBuilder';

/** FNV-1a over a string, as 8 hex chars. */
function fnv(h: number, s: string): number {
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

const r = (n: number) => n.toFixed(4);

function fingerprint(seed: number, weapon: WeaponKind, bot: Bot, choose: Chooser, planned: boolean): string {
  const world = new World(planned
    ? { seed, planning: true, planningPoints: TOWNS[0].planningPoints, allowedRoles: STARTING_ROLES, weapon }
    : { seed, weapon });
  if (planned) {
    defenderPlan(world);
    world.start();
  }
  let h = 2166136261;
  const maxTicks = Math.round(400 / DT);
  let guard = 0;
  while (world.status === 'playing' && world.tickCount < maxTicks && guard++ < maxTicks * 2) {
    for (let k = 0; world.choosing && k < 100; k++) {
      const idx = choose(world.progression.offers!);
      h = fnv(h, `pick:${world.progression.offers![idx].id}`);
      world.chooseUpgrade(idx);
    }
    world.tick([bot(world)]);
    for (const e of world.events) h = fnv(h, JSON.stringify(e));
    // Sample unit state every second so drift is caught even when no events fire.
    if (world.tickCount % 60 === 0) {
      for (const u of [...world.players, ...world.rookies, ...world.monsters]) {
        h = fnv(h, `${u.id}:${u.kind}:${r(u.x)}:${r(u.y)}:${r(u.hp)}:${u.state}`);
      }
      for (const b of world.buildings) h = fnv(h, `b${b.id}:${r(b.hp)}`);
    }
  }
  const k = world.players[0];
  return [
    `status=${world.status}/${world.lossReason}`, `ticks=${world.tickCount}`, `wave=${world.wave}`,
    `kills=${JSON.stringify(world.killsByKind)}`, `coins=${r(world.coins)}`, `stars=${world.stars}`,
    `standing=${world.standingBuildings()}`, `level=${world.progression.level}`,
    `knight=${r(k.x)},${r(k.y)},${r(k.hp)}`, `hash=${h.toString(16).padStart(8, '0')}`,
  ].join(' ');
}

describe('golden simulation fingerprints', () => {
  for (const weapon of WEAPON_ORDER) {
    it(`planned defender with ${weapon}, seeds 1-3`, () => {
      const out = [1, 2, 3].map((s) => fingerprint(s, weapon, defenderBot(), defenderChooser, true));
      expect(out).toMatchSnapshot();
    });
  }
  it('unplanned fighter with sword, seeds 4-5', () => {
    const out = [4, 5].map((s) => fingerprint(s, 'sword', fighterBot(), fighterChooser, false));
    expect(out).toMatchSnapshot();
  });
});
