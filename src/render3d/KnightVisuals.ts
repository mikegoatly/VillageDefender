// Visible effects of the knight's upgrades (plan: every upgrade shows, and stacks show more).
// Strength comes from upgradeTier, so one stack is a hint and the last adds a flourish:
// - Sharpened Blade: weapon glow (UnitBatches), more hit sparks and, maxed, motes off the weapon;
// - Swift Strikes: speed streaks along each slash and, maxed, a second echo slash;
// - Fleet Foot: dust kicked up while walking, then wind streaks;
// - Second Wind: pale green motes rising while healing;
// - Gem Magnet: a ring at the pickup radius and sparkle trails behind flying gems;
// - Heavy Blows: impact rings on struck monsters and, maxed, ground cracks (knocked-back
//   monsters also skid, leaving dust: see dashSize);
// - Nimble: dash afterimages and a ping when the dodge is ready again.
// Long Reach, Wide Sweep and Toughness change the weapon, slash and body size directly.

import { magnetRadius } from '../sim/gems';
import type { Unit, World } from '../sim/world';
import type { Effects } from './Effects';
import { DashEchoes, Rate, SpacedTrails, type DustEmit } from './motionFx';
import type { Particles } from './Particles';
import type { Echo } from './UnitBatches';
import { lerp, upgradeTier, type KnightGear } from './upgradeFx';

const KFX = {
  /** Motes per second off a maxed blade; the hand sits `ahead` and `right` of the knight and circles by `wobble`. */
  blade: { rate: 6, size: 0.04, life: 0.6, rise: 0.5, ahead: 0.25, right: 0.2, wobble: 0.08, spin: 5.3 },
  swift: { streaks: 8, y: 0.42, size: 0.045, life: 0.25, speed: 2.5, echoDelay: 0.06, echoReach: 0.8 },
  boots: { spacing: 0.6, size: 0.5, sizeMax: 0.9, wind: { size: 0.035, life: 0.3, speed: 3 } },
  regen: { rate: 4, rateMax: 12, color: 0xc8ffb4, size: 0.08, capstoneSize: 1.5, life: 1, y: 0.2, rise: 0.8, spread: [0.15, 0.35] },
  magnet: {
    opacity: 0.1, opacityMax: 0.25, color: 0x9fd8ff, size: 0.04, life: 0.3, y: 0.18, spacing: 0.3,
    /** Maxed, the ring breathes between `low` and full strength `hz` times a second. */
    breathe: { low: 0.7, hz: 0.64 },
  },
  heavy: { ring: 0.35, ringMax: 0.7, perFrame: 2, crackLines: 3, crack: 0.6 },
  nimble: { ping: 0x9fe8ff, pingSize: 1.1 },
};
const HAND_Y = 0.6;
const FEET_Y = 0.12;
const WIND = 0xffffff;

export class KnightVisuals {
  private readonly echoes = new DashEchoes();
  private readonly walk = new SpacedTrails(KFX.boots.spacing);
  private readonly gems = new SpacedTrails(KFX.magnet.spacing);
  private readonly blade = new Rate();
  private readonly regen = new Rate();
  private lastDodgeCooldown = 0;
  private heavyThisFrame = 0;
  private clock = 0;

  constructor(private readonly particles: Particles, private readonly effects: Effects, private readonly dustColor: number) {}

  /** Per-frame effects; returns the dash afterimages to draw behind the knight. */
  sync(world: World, dt: number, gear: KnightGear): readonly Echo[] {
    this.clock += dt;
    this.heavyThisFrame = 0;
    const magnet = upgradeTier(world, 'magnet');
    this.syncGems(world, magnet.t);
    const k = world.players[0];
    if (!k || k.state === 'dead') {
      this.effects.magnetRing(null, 0, 0, 0);
      return [];
    }
    this.syncBlade(k, dt, gear);
    this.syncWalk(world, k);
    this.syncRegen(world, k, dt);
    this.syncMagnet(world, k, magnet);
    return this.syncNimble(world, k);
  }

  /** Swift Strikes: streaks flying off a slash (or thrust) and, maxed, an echo just behind it. */
  onSlash(world: World, k: Unit, reach: number, halfArc: number, color: number, thrust = false) {
    const { t, capstone } = upgradeTier(world, 'swift');
    if (t <= 0) return;
    const { streaks, y, size, life, speed, echoDelay, echoReach } = KFX.swift;
    const n = Math.round(streaks * t);
    const fa = Math.atan2(k.facing.y, k.facing.x);
    for (let s = 0; s < n; s++) {
      const a = fa - halfArc + (2 * halfArc * (s + 0.5)) / n;
      // Thrown along the swing, tangent to the arc.
      this.particles.mote(k.x + Math.cos(a) * reach, y, k.y + Math.sin(a) * reach, WIND, size, life, -Math.sin(a) * speed, 0, Math.cos(a) * speed);
    }
    if (capstone) {
      const { x, y: z } = k;
      const { x: fx, y: fz } = k.facing;
      const echo = thrust ? this.effects.thrust : this.effects.slash;
      this.effects.later(echoDelay, () => echo.call(this.effects, x, z, fx, fz, reach * echoReach, halfArc, color));
    }
  }

  /** Heavy Blows: an impact ring on a monster the knight hits (and, maxed, cracks under it). */
  onKnightHit(world: World, m: Unit, scale: number) {
    const { t, capstone } = upgradeTier(world, 'heavy');
    if (t <= 0 || this.heavyThisFrame >= KFX.heavy.perFrame) return;
    this.heavyThisFrame++;
    const { ring, ringMax, crackLines, crack } = KFX.heavy;
    this.effects.shockwave(m.x, m.y, lerp(ring, ringMax, t) * scale, this.dustColor);
    if (capstone) this.effects.crack(m.x, m.y, crack * scale, crackLines, m.id);
  }

  private syncBlade(k: Unit, dt: number, gear: KnightGear) {
    if (gear.blade < 1) return;
    const { rate, size, life, rise, ahead, right, wobble, spin } = KFX.blade;
    for (let n = this.blade.take(rate, dt); n > 0; n--) {
      // The weapon hand: in front of the knight and to his right.
      const a = this.clock * spin + n;
      const hx = k.x + k.facing.x * ahead + k.facing.y * right + Math.cos(a) * wobble;
      const hz = k.y + k.facing.y * ahead - k.facing.x * right + Math.sin(a) * wobble;
      this.particles.mote(hx, HAND_Y, hz, gear.weapon.color, size, life, 0, rise, 0);
    }
  }

  private syncWalk(world: World, k: Unit) {
    this.walk.begin();
    const { t, capstone } = upgradeTier(world, 'boots');
    // The emitted size carries the dust size, negative when maxed (wind streaks too).
    const size = lerp(KFX.boots.size, KFX.boots.sizeMax, t) * (capstone ? -1 : 1);
    if (t > 0 && k.moving && k.state !== 'dodge') this.walk.add(k.id, k.x, k.y, -k.facing.x, -k.facing.y, size, this.emitStep);
    this.walk.end();
  }

  private readonly emitStep: DustEmit = (x, z, dirX, dirZ, size) => {
    this.particles.dust(x, z, dirX, dirZ, this.dustColor, Math.abs(size));
    if (size >= 0) return;
    const { size: s, life, speed } = KFX.boots.wind;
    this.particles.mote(x, FEET_Y, z, WIND, s, life, dirX * speed, 0, dirZ * speed);
  };

  private syncRegen(world: World, k: Unit, dt: number) {
    const { t, capstone } = upgradeTier(world, 'regen');
    if (t <= 0 || k.hp >= k.maxHp) {
      this.regen.reset();
      return;
    }
    const { rate, rateMax, color, size, capstoneSize, life, y, rise, spread } = KFX.regen;
    for (let n = this.regen.take(lerp(rate, rateMax, t), dt); n > 0; n--) {
      // Scattered round his feet by a cheap deterministic hash of the clock.
      const a = this.clock * 7.3 + n * 2.4;
      const r = lerp(spread[0], spread[1], (this.clock * 13 + n * 0.37) % 1);
      this.particles.mote(k.x + Math.cos(a) * r, y, k.y + Math.sin(a) * r, color, size * (capstone ? capstoneSize : 1), life, 0, rise, 0);
    }
  }

  private syncMagnet(world: World, k: Unit, { t, capstone }: { t: number; capstone: boolean }) {
    if (t <= 0) {
      this.effects.magnetRing(null, 0, 0, 0);
      return;
    }
    const { opacity, opacityMax, breathe } = KFX.magnet;
    const base = lerp(opacity, opacityMax, t);
    const pulse = capstone ? lerp(breathe.low, 1, 0.5 + 0.5 * Math.sin(this.clock * Math.PI * 2 * breathe.hz)) : 1;
    this.effects.magnetRing(k.x, k.y, magnetRadius(world), base * pulse);
  }

  /** Gem Magnet: sparkles behind gems flying to the knight, bigger with stacks. */
  private syncGems(world: World, t: number) {
    this.gems.begin();
    if (t > 0) for (const g of world.gems) if (g.magnet) this.gems.add(g.id, g.x, g.y, 0, 0, 1 + t, this.emitSparkle);
    this.gems.end();
  }

  private readonly emitSparkle: DustEmit = (x, z, _dx, _dz, size) => {
    const { color, size: s, life, y } = KFX.magnet;
    this.particles.mote(x, y, z, color, s * size, life);
  };

  /** Nimble: afterimages during a dodge (one per stack) and a ping when it is ready again. */
  private syncNimble(world: World, k: Unit): readonly Echo[] {
    const level = world.progression.levels.dodge ?? 0;
    const ready = this.lastDodgeCooldown > 0 && k.dodgeCooldown <= 0;
    this.lastDodgeCooldown = k.dodgeCooldown;
    if (level <= 0) return [];
    if (ready) this.effects.pulse(k.x, k.y, KFX.nimble.ping, KFX.nimble.pingSize);
    this.echoes.update(k, this.clock);
    return this.echoes.echoes(level, this.clock);
  }
}
