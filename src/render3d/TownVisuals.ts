// Live effects of the town and army upgrades (the pieces they add to buildings are in
// buildings.ts fortPieces; rookie size and weapon glow in characters.ts):
// - Spiked Doors: a spray of red sparks off a monster that hits a building;
// - Arrow Slits: a puff at the building as each arrow leaves;
// - Repair Crews: hammering sparks on damaged buildings, faster with stacks;
// - Tar Pits: tar dripping off monsters slowed beside buildings;
// - Recruitment Drive and Veteran Volunteers: a bigger burst, in the rank's colour, when a rookie joins.

import { adjacentBuilding, monsterById } from '../sim/queries';
import type { BuildingState, SimEvent, World } from '../sim/world';
import { Rate } from './motionFx';
import type { Particles } from './Particles';
import { HALO_ROOKIE } from './UnitBatches';
import { lerp } from './upgradeFx';

const TFX = {
  thorns: { color: 0xd8352a, sparks: 2, perLevel: 2, speed: 2.2, y: 0.4 },
  slits: { color: 0xb8b0a8, size: 0.12, y: 0.9, puffs: 2, speed: 0.6, life: 0.6 },
  /** Hammer taps per second on each damaged building, at one and at full stacks. */
  crews: { rate: 0.8, rateMax: 2.5, color: 0xffb347, sparks: 3, speed: 1.4, y: [0.3, 0.9], wall: 0.55, spread: 0.37 },
  /** Drips per second across all slowed monsters, at most `cap` a frame from `tries` monsters looked at. */
  tar: { rate: 5, cap: 4, tries: 12, color: 0x1a120c, size: 0.06, life: 0.7, y: 0.3, fall: -0.5, reach: 0.6 },
  join: { motes: 6, perLevel: 4, size: 0.06, life: 0.7, speed: 1.5, y: 0.5 },
};

const isDamaged = (b: BuildingState) => !b.ruined && b.hp < b.maxHp;

export class TownVisuals {
  private readonly crews = new Rate();
  private readonly tar = new Rate();
  /** Round-robin over damaged buildings and slowed monsters, so taps and drips spread out. */
  private turn = 0;

  constructor(private readonly particles: Particles) {}

  onEvent(world: World, e: SimEvent) {
    const levels = world.progression.levels;
    switch (e.type) {
      case 'buildingHit': {
        const thorns = levels.thorns ?? 0;
        const m = thorns > 0 ? monsterById(world, e.by) : null;
        if (!m) return;
        const { color, sparks, perLevel, speed, y } = TFX.thorns;
        this.particles.spark(m.x, y, m.y, sparks + perLevel * thorns, color, speed);
        return;
      }
      case 'shot': {
        if (e.from >= 0 || (levels.slits ?? 0) <= 0) return;
        const p = world.projectiles.find((q) => q.id === e.projectile);
        const { y, puffs, color, size, speed, life } = TFX.slits;
        if (p) this.particles.burst(p.x, y, p.y, puffs, color, size, speed, life);
        return;
      }
      case 'rookieJoined': {
        const r = world.rookies.find((u) => u.id === e.unit);
        if (!r) return;
        const { motes, perLevel, size, life, speed, y } = TFX.join;
        const n = motes + perLevel * (levels.recruit ?? 0);
        const color = HALO_ROOKIE[r.rank] ?? HALO_ROOKIE[0];
        for (let k = 0; k < n; k++) {
          const a = (k / n) * Math.PI * 2;
          this.particles.mote(r.x, y, r.y, color, size, life, Math.cos(a) * speed, 0.6, Math.sin(a) * speed);
        }
        return;
      }
      default:
    }
  }

  sync(world: World, dt: number) {
    this.syncCrews(world, dt);
    this.syncTar(world, dt);
  }

  /** Repair Crews: sparks where the crews hammer on damaged buildings. */
  private syncCrews(world: World, dt: number) {
    const level = world.progression.levels.crews ?? 0;
    if (level <= 0) return;
    let damaged = 0;
    for (const b of world.buildings) if (isDamaged(b)) damaged++;
    if (damaged === 0) {
      this.crews.reset();
      return;
    }
    const { rate, rateMax, color, sparks, speed, y, wall, spread } = TFX.crews;
    for (let n = this.crews.take(lerp(rate, rateMax, (level - 1) / 2) * damaged, dt); n > 0; n--) {
      // The (turn mod damaged)-th damaged building, so taps go round them all.
      let pick = this.turn++ % damaged;
      const b = world.buildings.find((x) => isDamaged(x) && pick-- === 0)!;
      const [i, j] = b.cells[this.turn % b.cells.length];
      // On a camera-facing wall, at a stable spread of heights.
      const side = this.turn % 2;
      this.particles.spark(i + (side ? wall : 0), lerp(y[0], y[1], (this.turn * spread) % 1), j + (side ? 0 : wall), sparks, color, speed);
    }
  }

  /** Tar Pits: drips off monsters slowed beside a building. */
  private syncTar(world: World, dt: number) {
    if ((world.progression.levels.braziers ?? 0) <= 0) return;
    const { rate, cap, tries: maxTries, color, size, life, y, fall, reach } = TFX.tar;
    const n = Math.min(cap, this.tar.take(rate, dt));
    if (n === 0 || world.monsters.length === 0) return;
    const limit = Math.min(maxTries, world.monsters.length);
    for (let k = 0, tries = 0; k < n && tries < limit; tries++) {
      const m = world.monsters[this.turn++ % world.monsters.length];
      if (m.state === 'dead' || !adjacentBuilding(world, m, reach)) continue;
      this.particles.mote(m.x, y, m.y, color, size, life, 0, fall, 0);
      k++;
    }
  }
}
