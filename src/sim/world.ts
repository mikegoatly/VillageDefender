// The game simulation. Fixed timestep, deterministic for a given seed and input sequence.
// No Phaser or DOM: render/ reads this state, input/ feeds InputState in.

import { DT, KNIGHT, KNOCKBACK_DAMPING, SEPARATION, WAVES, ZOMBIE } from '../data/balance';
import { FlowField } from './flowField';
import { screenDirToGround } from './iso';
import { generateTown, inBounds, isWalkable, type MapOptions, type Side, type TownMap } from './map';
import { Rng } from './rng';
import { SpatialHash } from './spatialHash';
import type { InputState, Vec2 } from './types';

export type UnitKind = 'knight' | 'zombie';
export type UnitState = 'idle' | 'walk' | 'attack' | 'dodge' | 'dead';

export interface Unit {
  id: number;
  kind: UnitKind;
  team: 'player' | 'enemy';
  x: number;
  y: number;
  /** Knockback / impulse velocity, decays over time. */
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  /** Ground-space unit vector the unit faces. */
  facing: Vec2;
  state: UnitState;
  stateTime: number;
  attackCooldown: number;
  /** Swing/bite hit still to be applied in the current attack. */
  hitPending: boolean;
  /** Seconds of invulnerability left (dodge, after being hurt). */
  invuln: number;
  dodgeCooldown: number;
  /** Previous tick's dodge input, for rising-edge detection. */
  dodgeHeld: boolean;
  /** Whether the unit moved under its own power this tick (for walk/idle animation). */
  moving: boolean;
}

export type SimEvent =
  | { type: 'swing'; unit: number }
  | { type: 'hit'; unit: number; by: number; damage: number; x: number; y: number }
  | { type: 'death'; unit: number }
  | { type: 'playerHurt'; unit: number; damage: number }
  | { type: 'playerDied'; unit: number }
  | { type: 'waveWarning'; wave: number; sides: Side[] }
  | { type: 'waveStart'; wave: number; count: number };

export interface WorldOptions {
  seed: number;
  mapOptions?: MapOptions;
  /** Players; milestone 1 wires up one, the sim supports N (decision 3). */
  players?: number;
  /** Debug: players take no damage. */
  god?: boolean;
  /** Debug: start at this wave. */
  startWave?: number;
  /** Tests: use this map instead of generating one. */
  map?: TownMap;
  /** Tests: disable wave spawning entirely. */
  noWaves?: boolean;
}

interface PendingWave {
  wave: number;
  at: number;
  sides: Side[];
  warned: boolean;
}

export class World {
  readonly map: TownMap;
  readonly players: Unit[] = [];
  readonly monsters: Unit[] = [];
  /** Events produced by the most recent tick. */
  events: SimEvent[] = [];
  time = 0;
  tickCount = 0;
  status: 'playing' | 'lost' = 'playing';
  wave = 0;
  kills = 0;

  private nextId = 1;
  private readonly rng: Rng;
  private readonly flow: FlowField;
  /** Living monsters only, rebuilt at the start of each tick (targeting and swing hits). */
  private readonly enemyHash = new SpatialHash<Unit>(1);
  /** Every living unit, rebuilt before separation (physics only). */
  private readonly bodyHash = new SpatialHash<Unit>(1);
  private pending: PendingWave;
  private spawnQueue: { at: number; side: Side }[] = [];
  private readonly god: boolean;
  private readonly noWaves: boolean;

  constructor(opts: WorldOptions) {
    this.rng = new Rng(opts.seed * 7919 + 17);
    this.map = opts.map ?? generateTown(opts.seed, opts.mapOptions);
    this.flow = new FlowField(this.map);
    this.god = !!opts.god;
    this.noWaves = !!opts.noWaves;
    const c = this.map.centre;
    const n = opts.players ?? 1;
    for (let p = 0; p < n; p++) {
      // Stand on the road just south-east of the crossroads.
      this.players.push(this.makeUnit('knight', c + 0.5 + p * 0.6, c + 2.5));
    }
    const first = Math.max(1, opts.startWave ?? 1);
    this.wave = first - 1;
    this.pending = { wave: first, at: WAVES.firstAt, sides: this.pickSides(first), warned: false };
  }

  // ------------------------------------------------------------------ tick

  tick(inputs: InputState[]) {
    this.events = [];
    if (this.status !== 'playing') return;
    this.time += DT;
    this.tickCount++;

    this.rebuildEnemyHash();
    this.players.forEach((p, k) => this.updateKnight(p, inputs[k]));
    this.updateFlowTarget();
    this.updateWaves();
    for (const m of this.monsters) this.updateMonster(m);

    this.separate();
    for (const u of this.players) this.integrate(u);
    for (const m of this.monsters) this.integrate(m);

    // Remove corpses once their death animation has played.
    for (let k = this.monsters.length - 1; k >= 0; k--) {
      const m = this.monsters[k];
      if (m.state === 'dead' && m.stateTime > ZOMBIE.corpseTime) this.monsters.splice(k, 1);
    }

    if (this.players.every((p) => p.state === 'dead')) {
      this.status = 'lost';
    }
  }

  // ------------------------------------------------------------------ knight

  private updateKnight(u: Unit, input: InputState | undefined) {
    this.tickTimers(u);
    if (u.state === 'dead') return;
    const inp = input ?? { move: { x: 0, y: 0 }, attack: false, dodge: false } as InputState;
    const move = screenDirToGround(inp.move.x, inp.move.y);
    const moveLen = Math.hypot(move.x, move.y);

    // Dodge on the rising edge of the button.
    if (inp.dodge && !u.dodgeHeld && u.dodgeCooldown <= 0 && u.state !== 'dodge') {
      const dir = moveLen > 0.1 ? norm(move) : u.facing;
      u.facing = dir;
      this.setState(u, 'dodge');
      u.dodgeCooldown = KNIGHT.dodgeCooldown;
      u.invuln = Math.max(u.invuln, KNIGHT.dodgeDuration);
    }
    u.dodgeHeld = inp.dodge;

    if (u.state === 'dodge') {
      u.x += u.facing.x * KNIGHT.dodgeSpeed * DT;
      u.y += u.facing.y * KNIGHT.dodgeSpeed * DT;
      u.moving = true;
      if (u.stateTime >= KNIGHT.dodgeDuration) this.setState(u, 'idle');
      return;
    }

    // Attack: hold to auto-swing at the nearest enemy (decision 2).
    if (inp.attack && u.attackCooldown <= 0 && u.state !== 'attack') {
      const target = this.nearestMonster(u.x, u.y, KNIGHT.acquireRange);
      if (target) u.facing = norm({ x: target.x - u.x, y: target.y - u.y });
      else if (moveLen > 0.1) u.facing = norm(move);
      this.setState(u, 'attack');
      u.hitPending = true;
      u.attackCooldown = KNIGHT.attackCooldown;
      this.events.push({ type: 'swing', unit: u.id });
    }

    if (u.state === 'attack') {
      if (u.hitPending && u.stateTime >= KNIGHT.attackHitTime) {
        u.hitPending = false;
        this.knightSwingHits(u);
      }
      if (u.stateTime >= KNIGHT.attackDuration) this.setState(u, 'idle');
    }

    const speed = u.speed * (u.state === 'attack' ? KNIGHT.attackMoveFactor : 1);
    u.moving = moveLen > 0.05;
    if (u.moving) {
      u.x += move.x * speed * DT;
      u.y += move.y * speed * DT;
      if (u.state !== 'attack') u.facing = norm(move);
    }
    if (u.state !== 'attack') this.setState(u, u.moving ? 'walk' : 'idle', true);
  }

  private knightSwingHits(u: Unit) {
    const reach = KNIGHT.attackRange;
    const cosArc = Math.cos(KNIGHT.attackArc);
    this.enemyHash.query(u.x, u.y, reach + 0.5, (m) => {
      if (m.state === 'dead' || m.team === u.team) return;
      const dx = m.x - u.x;
      const dy = m.y - u.y;
      const d = Math.hypot(dx, dy);
      if (d - m.radius > reach) return;
      // Inside the arc (or overlapping the knight, which always counts).
      if (d > u.radius + m.radius && (dx * u.facing.x + dy * u.facing.y) / d < cosArc) return;
      this.damage(m, KNIGHT.attackDamage, u);
      const k = d > 1e-4 ? KNIGHT.knockback / d : 0;
      m.vx += dx * k;
      m.vy += dy * k;
    });
  }

  // ------------------------------------------------------------------ monsters

  private updateMonster(m: Unit) {
    this.tickTimers(m);
    if (m.state === 'dead') return;
    const target = this.nearestPlayer(m.x, m.y);
    m.moving = false;
    if (!target) {
      this.setState(m, 'idle', true);
      return;
    }
    const dx = target.x - m.x;
    const dy = target.y - m.y;
    const d = Math.hypot(dx, dy);
    const reach = m.radius + target.radius + ZOMBIE.attackReach;

    if (m.state === 'attack') {
      m.facing = norm({ x: dx, y: dy });
      if (m.hitPending && m.stateTime >= ZOMBIE.attackWindup) {
        m.hitPending = false;
        if (d <= reach + 0.1) this.hurtPlayer(target, ZOMBIE.damage);
      }
      if (m.stateTime >= ZOMBIE.attackWindup + 0.25) this.setState(m, 'idle');
      return;
    }

    if (d <= reach && m.attackCooldown <= 0) {
      this.setState(m, 'attack');
      m.hitPending = true;
      m.attackCooldown = ZOMBIE.attackCooldown;
      m.facing = norm({ x: dx, y: dy });
      return;
    }
    if (d <= reach) {
      this.setState(m, 'idle', true);
      return;
    }

    // Steer: straight at the target when close, otherwise follow the flow field.
    let sx = dx;
    let sy = dy;
    if (d > 1.5) {
      const next = this.flow.next(Math.round(m.x), Math.round(m.y));
      if (next) {
        sx = next[0] - m.x;
        sy = next[1] - m.y;
      }
    }
    const dir = norm({ x: sx, y: sy });
    m.x += dir.x * m.speed * DT;
    m.y += dir.y * m.speed * DT;
    m.facing = dir;
    m.moving = true;
    this.setState(m, 'walk', true);
  }

  private updateFlowTarget() {
    // Milestone 1: all monsters hunt the (first living) knight.
    const p = this.players.find((u) => u.state !== 'dead');
    if (!p) return;
    const ti = Math.round(p.x);
    const tj = Math.round(p.y);
    if (ti !== this.flow.targetI || tj !== this.flow.targetJ) this.flow.compute(ti, tj);
  }

  // ------------------------------------------------------------------ waves

  private updateWaves() {
    if (this.noWaves) return;
    const pw = this.pending;
    if (!pw.warned && this.time >= pw.at - WAVES.warning) {
      pw.warned = true;
      this.events.push({ type: 'waveWarning', wave: pw.wave, sides: pw.sides });
    }
    if (this.time >= pw.at) {
      this.wave = pw.wave;
      const count = WAVES.baseCount + WAVES.perWave * (pw.wave - 1);
      for (let k = 0; k < count; k++) {
        this.spawnQueue.push({ at: this.time + k * WAVES.spawnSpacing, side: pw.sides[k % pw.sides.length] });
      }
      this.events.push({ type: 'waveStart', wave: pw.wave, count });
      const next = pw.wave + 1;
      this.pending = { wave: next, at: pw.at + WAVES.interval, sides: this.pickSides(next), warned: false };
    }
    while (this.spawnQueue.length && this.spawnQueue[0].at <= this.time) {
      const s = this.spawnQueue.shift()!;
      if (this.monsters.length < WAVES.maxAlive) this.spawnMonster(s.side);
    }
  }

  private pickSides(wave: number): Side[] {
    const all: Side[] = ['top', 'right', 'bottom', 'left'];
    const a = this.rng.pick(all);
    if (wave < WAVES.twoSidesFrom) return [a];
    const rest = all.filter((s) => s !== a);
    return [a, this.rng.pick(rest)];
  }

  private spawnMonster(side: Side) {
    const cells = this.map.edges[side];
    if (!cells.length) return;
    const [i, j] = this.rng.pick(cells);
    this.addMonster(i + this.rng.range(-0.3, 0.3), j + this.rng.range(-0.3, 0.3));
  }

  /** Adds a zombie at a ground position. Public for tests and debug tools. */
  addMonster(x: number, y: number): Unit {
    const m = this.makeUnit('zombie', x, y);
    this.monsters.push(m);
    return m;
  }

  // ------------------------------------------------------------------ combat helpers

  private damage(u: Unit, amount: number, by: Unit) {
    u.hp -= amount;
    this.events.push({ type: 'hit', unit: u.id, by: by.id, damage: amount, x: u.x, y: u.y });
    if (u.hp <= 0) {
      u.hp = 0;
      this.setState(u, 'dead');
      this.events.push({ type: 'death', unit: u.id });
      if (u.team === 'enemy') this.kills++;
    }
  }

  private hurtPlayer(p: Unit, amount: number) {
    if (this.god || p.invuln > 0 || p.state === 'dead') return;
    p.hp -= amount;
    p.invuln = KNIGHT.hurtInvuln;
    this.events.push({ type: 'playerHurt', unit: p.id, damage: amount });
    if (p.hp <= 0) {
      p.hp = 0;
      this.setState(p, 'dead');
      this.events.push({ type: 'playerDied', unit: p.id });
    }
  }

  private rebuildEnemyHash() {
    this.enemyHash.clear();
    for (const m of this.monsters) if (m.state !== 'dead') this.enemyHash.insert(m);
  }

  nearestMonster(x: number, y: number, range: number): Unit | null {
    let best: Unit | null = null;
    let bestD = range;
    this.enemyHash.query(x, y, range, (m) => {
      if (m.state === 'dead' || m.team !== 'enemy') return;
      const d = Math.hypot(m.x - x, m.y - y) - m.radius;
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    });
    return best;
  }

  private nearestPlayer(x: number, y: number): Unit | null {
    let best: Unit | null = null;
    let bestD = Infinity;
    for (const p of this.players) {
      if (p.state === 'dead') continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  // ------------------------------------------------------------------ physics

  /** Soft push-apart between overlapping units (monsters and knights). */
  private separate() {
    const all = this.bodyHash;
    all.clear();
    for (const m of this.monsters) if (m.state !== 'dead') all.insert(m);
    for (const p of this.players) if (p.state !== 'dead') all.insert(p);
    const visit = (u: Unit) => {
      if (u.state === 'dead') return;
      all.query(u.x, u.y, u.radius * 2 + 0.1, (o) => {
        if (o === u || o.state === 'dead' || o.id < u.id) return;
        const dx = o.x - u.x;
        const dy = o.y - u.y;
        const d = Math.hypot(dx, dy);
        const min = u.radius + o.radius;
        if (d >= min || d < 1e-6) return;
        const push = ((min - d) / d) * SEPARATION * 0.5;
        // A dodging knight shoves through; otherwise both give way.
        const wu = u.state === 'dodge' ? 0 : 1;
        const wo = o.state === 'dodge' ? 0 : 1;
        u.x -= dx * push * wu * 2 / (wu + wo || 1);
        u.y -= dy * push * wu * 2 / (wu + wo || 1);
        o.x += dx * push * wo * 2 / (wu + wo || 1);
        o.y += dy * push * wo * 2 / (wu + wo || 1);
      });
    };
    for (const m of this.monsters) visit(m);
    for (const p of this.players) visit(p);
  }

  /** Applies knockback velocity, then resolves collisions with blocked cells and the map edge. */
  private integrate(u: Unit) {
    if (u.vx !== 0 || u.vy !== 0) {
      u.x += u.vx * DT;
      u.y += u.vy * DT;
      const damp = Math.exp(-KNOCKBACK_DAMPING * DT);
      u.vx *= damp;
      u.vy *= damp;
      if (Math.abs(u.vx) < 0.01 && Math.abs(u.vy) < 0.01) u.vx = u.vy = 0;
    }
    this.collideCells(u);
  }

  /** Pushes a circle out of every non-walkable cell it overlaps. Cell (i, j) spans i±0.5, j±0.5. */
  collideCells(u: Unit) {
    for (let pass = 0; pass < 2; pass++) {
      const ci = Math.round(u.x);
      const cj = Math.round(u.y);
      for (let j = cj - 1; j <= cj + 1; j++) {
        for (let i = ci - 1; i <= ci + 1; i++) {
          if (isWalkable(this.map, i, j)) continue;
          const nx = clamp(u.x, i - 0.5, i + 0.5);
          const ny = clamp(u.y, j - 0.5, j + 0.5);
          const dx = u.x - nx;
          const dy = u.y - ny;
          const d2 = dx * dx + dy * dy;
          if (d2 >= u.radius * u.radius) continue;
          if (d2 > 1e-9) {
            const d = Math.sqrt(d2);
            u.x = nx + (dx / d) * u.radius;
            u.y = ny + (dy / d) * u.radius;
          } else {
            // Centre inside the cell: push out along the shallowest axis.
            const ox = u.x - i;
            const oy = u.y - j;
            if (Math.abs(ox) > Math.abs(oy)) u.x = i + Math.sign(ox || 1) * (0.5 + u.radius);
            else u.y = j + Math.sign(oy || 1) * (0.5 + u.radius);
          }
        }
      }
    }
    // Safety: never leave the map entirely.
    if (!inBounds(this.map, Math.round(u.x), Math.round(u.y))) {
      const c = this.map.centre;
      u.x += Math.sign(c - u.x) * 0.05;
      u.y += Math.sign(c - u.y) * 0.05;
    }
  }

  // ------------------------------------------------------------------ util

  private makeUnit(kind: UnitKind, x: number, y: number): Unit {
    const k = kind === 'knight';
    const stats = k ? KNIGHT : ZOMBIE;
    const speed = k ? KNIGHT.speed : ZOMBIE.speed + this.rng.range(-ZOMBIE.speedJitter, ZOMBIE.speedJitter);
    return {
      id: this.nextId++, kind, team: k ? 'player' : 'enemy', x, y, vx: 0, vy: 0,
      radius: stats.radius, hp: stats.hp, maxHp: stats.hp, speed,
      facing: { x: 0.7071, y: 0.7071 }, state: 'idle', stateTime: 0,
      attackCooldown: 0, hitPending: false, invuln: 0, dodgeCooldown: 0, dodgeHeld: false, moving: false,
    };
  }

  private tickTimers(u: Unit) {
    u.stateTime += DT;
    u.attackCooldown = Math.max(0, u.attackCooldown - DT);
    u.dodgeCooldown = Math.max(0, u.dodgeCooldown - DT);
    u.invuln = Math.max(0, u.invuln - DT);
  }

  /** Changes state and resets stateTime; `keepTime` leaves the timer if the state is unchanged. */
  private setState(u: Unit, s: UnitState, keepTime = false) {
    if (u.state === s && keepTime) return;
    if (u.state === 'dead') return;
    u.state = s;
    u.stateTime = 0;
  }
}

function norm(v: Vec2): Vec2 {
  const l = Math.hypot(v.x, v.y);
  return l > 1e-6 ? { x: v.x / l, y: v.y / l } : { x: 0.7071, y: 0.7071 };
}

function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}
