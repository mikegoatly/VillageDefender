// The game simulation. Fixed timestep, deterministic for a given seed and input sequence.
// No Phaser or DOM: render/ reads this state, input/ feeds InputState in.

import { BUILDING, DT, KNIGHT, KNOCKBACK_DAMPING, SEPARATION, STARS, WAVES } from '../data/balance';
import { MONSTERS, type MonsterDef, type MonsterKind } from '../data/monsters';
import { LEVEL1_WAVES, spawnOrder, type WaveDef } from '../data/waves';
import { FlowField } from './flowField';
import { screenDirToGround } from './iso';
import { generateTown, inBounds, isWalkable, type MapOptions, type Side, type TownMap } from './map';
import { Rng } from './rng';
import { SpatialHash } from './spatialHash';
import type { InputState, Vec2 } from './types';

export type UnitKind = 'knight' | MonsterKind;
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
  /** Building being attacked in the current attack, or -1 when attacking a player. */
  attackBuilding: number;
  /** Seconds of invulnerability left (dodge, after being hurt). */
  invuln: number;
  dodgeCooldown: number;
  /** Previous tick's dodge input, for rising-edge detection. */
  dodgeHeld: boolean;
  /** Whether the unit moved under its own power this tick (for walk/idle animation). */
  moving: boolean;
}

export interface BuildingState {
  id: number;
  hp: number;
  maxHp: number;
  ruined: boolean;
  cells: [number, number][];
  /** World time of the last hit, for render flashes and HP bar visibility. */
  lastHit: number;
}

export type SimEvent =
  | { type: 'swing'; unit: number }
  | { type: 'hit'; unit: number; by: number; damage: number; x: number; y: number }
  | { type: 'death'; unit: number }
  | { type: 'playerHurt'; unit: number; damage: number }
  | { type: 'playerDied'; unit: number }
  | { type: 'buildingHit'; building: number; by: number; damage: number }
  | { type: 'buildingDestroyed'; building: number }
  | { type: 'waveWarning'; wave: number; sides: Side[] }
  | { type: 'waveStart'; wave: number; count: number }
  | { type: 'levelEnd'; won: boolean; stars: number; reason: 'knight' | 'town' | null };

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
  /** Tests: disable wave spawning (and therefore winning) entirely. */
  noWaves?: boolean;
  /** Wave table; defaults to level 1. */
  waves?: WaveDef[];
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
  readonly buildings: BuildingState[];
  /** Events produced by the most recent tick. */
  events: SimEvent[] = [];
  time = 0;
  tickCount = 0;
  status: 'playing' | 'won' | 'lost' = 'playing';
  lossReason: 'knight' | 'town' | null = null;
  /** Final star rating (0–3); set when the level ends. */
  stars = 0;
  wave = 0;
  readonly totalWaves: number;
  kills = 0;

  private nextId = 1;
  private readonly rng: Rng;
  /** Toward the (first living) knight. */
  private readonly knightFlow: FlowField;
  /** Toward the nearest walkable cell next to any standing building. */
  private readonly buildingFlow: FlowField;
  private buildingFlowDirty = true;
  /** Building id per cell, -1 for none. Ruined buildings keep their cells (rubble blocks). */
  private readonly cellBuilding: Int32Array;
  /** Living monsters only, rebuilt at the start of each tick (targeting and swing hits). */
  private readonly enemyHash = new SpatialHash<Unit>(1);
  /** Every living unit, rebuilt before separation (physics only). */
  private readonly bodyHash = new SpatialHash<Unit>(1);
  private readonly waves: WaveDef[];
  private pending: PendingWave | null;
  private spawnQueue: { at: number; side: Side; kind: MonsterKind }[] = [];
  private readonly god: boolean;
  private readonly noWaves: boolean;

  constructor(opts: WorldOptions) {
    this.rng = new Rng(opts.seed * 7919 + 17);
    this.map = opts.map ?? generateTown(opts.seed, opts.mapOptions);
    this.knightFlow = new FlowField(this.map);
    this.buildingFlow = new FlowField(this.map);
    this.god = !!opts.god;
    this.noWaves = !!opts.noWaves;
    this.waves = opts.waves ?? LEVEL1_WAVES;
    this.totalWaves = this.waves.length;

    this.cellBuilding = new Int32Array(this.map.size * this.map.size).fill(-1);
    this.buildings = this.map.buildings.map((b) => {
      // One wall block per storey per cell, plus one roof per cell. Every building counts the same
      // toward stars, so size adds HP only gently: base + a bonus per extra wall block.
      const wallBlocks = Math.max(1, b.blocks.length - b.cells.length);
      const hp = BUILDING.baseHp + (wallBlocks - 1) * BUILDING.hpPerExtraBlock;
      for (const [i, j] of b.cells) this.cellBuilding[j * this.map.size + i] = b.id;
      return { id: b.id, hp, maxHp: hp, ruined: false, cells: b.cells, lastHit: -1 };
    });

    const c = this.map.centre;
    const n = opts.players ?? 1;
    for (let p = 0; p < n; p++) {
      // Stand on the road just south-east of the crossroads.
      this.players.push(this.makeKnight(c + 0.5 + p * 0.6, c + 2.5));
    }
    const first = Math.min(Math.max(1, opts.startWave ?? 1), this.totalWaves);
    this.wave = first - 1;
    this.pending = { wave: first, at: WAVES.firstAt, sides: this.pickSides(first), warned: false };
  }

  // ------------------------------------------------------------------ queries

  standingBuildings(): number {
    return this.buildings.reduce((n, b) => n + (b.ruined ? 0 : 1), 0);
  }

  /** Stars for the current standing count (plan §3.2). 0 when lost. */
  starsFor(standing: number): number {
    const total = this.buildings.length;
    if (total === 0) return 3;
    const f = standing / total;
    if (f >= STARS.three) return 3;
    if (f >= STARS.two) return 2;
    return standing > 0 ? 1 : 0;
  }

  buildingAt(i: number, j: number): BuildingState | null {
    if (i < 0 || j < 0 || i >= this.map.size || j >= this.map.size) return null;
    const id = this.cellBuilding[j * this.map.size + i];
    return id >= 0 ? this.buildings[id] : null;
  }

  // ------------------------------------------------------------------ tick

  tick(inputs: InputState[]) {
    this.events = [];
    if (this.status !== 'playing') return;
    this.time += DT;
    this.tickCount++;

    this.rebuildEnemyHash();
    this.players.forEach((p, k) => this.updateKnight(p, inputs[k]));
    this.updateFlowFields();
    this.updateWaves();
    for (const m of this.monsters) this.updateMonster(m);

    this.separate();
    for (const u of this.players) this.integrate(u);
    for (const m of this.monsters) this.integrate(m);

    // Remove corpses once their death animation has played.
    for (let k = this.monsters.length - 1; k >= 0; k--) {
      const m = this.monsters[k];
      if (m.state === 'dead' && m.stateTime > MONSTERS[m.kind as MonsterKind].corpseTime) this.monsters.splice(k, 1);
    }

    this.checkEnd();
  }

  private checkEnd() {
    if (this.players.every((p) => p.state === 'dead')) return this.end(false, 'knight');
    if (this.buildings.length > 0 && this.standingBuildings() === 0) return this.end(false, 'town');
    if (this.noWaves) return;
    const allSpawned = this.pending === null && this.spawnQueue.length === 0;
    if (allSpawned && this.monsters.every((m) => m.state === 'dead')) this.end(true, null);
  }

  private end(won: boolean, reason: 'knight' | 'town' | null) {
    this.status = won ? 'won' : 'lost';
    this.lossReason = reason;
    this.stars = won ? this.starsFor(this.standingBuildings()) : 0;
    this.events.push({ type: 'levelEnd', won, stars: this.stars, reason });
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
      const resist = MONSTERS[m.kind as MonsterKind].knockbackResist;
      const k = d > 1e-4 ? (KNIGHT.knockback * (1 - resist)) / d : 0;
      m.vx += dx * k;
      m.vy += dy * k;
    });
  }

  // ------------------------------------------------------------------ monsters

  private updateMonster(m: Unit) {
    this.tickTimers(m);
    if (m.state === 'dead') return;
    const def = MONSTERS[m.kind as MonsterKind];
    m.moving = false;

    if (m.state === 'attack') {
      this.continueAttack(m, def);
      return;
    }

    // Choose a target: the knight (for 'nearest' types when he's close) or buildings.
    const knight = this.nearestPlayer(m.x, m.y);
    const hasBuildings = this.standingBuildings() > 0;
    const chaseKnight =
      !!knight && (!hasBuildings || (def.target === 'nearest' && Math.hypot(knight.x - m.x, knight.y - m.y) <= def.aggroRange));

    if (chaseKnight && knight) {
      const dx = knight.x - m.x;
      const dy = knight.y - m.y;
      const d = Math.hypot(dx, dy);
      const reach = m.radius + knight.radius + def.attackReach;
      if (d <= reach) {
        if (m.attackCooldown <= 0) this.startAttack(m, def, { x: dx, y: dy }, -1);
        else this.setState(m, 'idle', true);
        return;
      }
      this.steer(m, def, d > 1.5 ? this.knightFlow : null, dx, dy);
      return;
    }

    // Building attack: any standing building cell within reach?
    const b = this.adjacentBuilding(m, def);
    if (b) {
      if (m.attackCooldown <= 0) this.startAttack(m, def, { x: b.dx, y: b.dy }, b.id);
      else this.setState(m, 'idle', true);
      return;
    }
    if (!hasBuildings) {
      this.setState(m, 'idle', true);
      return;
    }
    // The field ends on cells next to buildings; from there close the last gap directly,
    // since a cell centre is 0.5 from the building edge, beyond most monsters' reach.
    const near = this.nearestBuildingCell(m);
    this.steer(m, def, this.buildingFlow, near ? near[0] - m.x : 0, near ? near[1] - m.y : 0);
  }

  /** Closest standing building cell within two cells, or null. */
  private nearestBuildingCell(m: Unit): [number, number] | null {
    const ci = Math.round(m.x);
    const cj = Math.round(m.y);
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (let j = cj - 2; j <= cj + 2; j++) {
      for (let i = ci - 2; i <= ci + 2; i++) {
        const b = this.buildingAt(i, j);
        if (!b || b.ruined) continue;
        const d = Math.hypot(i - m.x, j - m.y);
        if (d < bestD) {
          bestD = d;
          best = [i, j];
        }
      }
    }
    return best;
  }

  private startAttack(m: Unit, def: MonsterDef, dir: Vec2, building: number) {
    this.setState(m, 'attack');
    m.hitPending = true;
    m.attackCooldown = def.attackCooldown;
    m.attackBuilding = building;
    m.facing = norm(dir);
  }

  private continueAttack(m: Unit, def: MonsterDef) {
    if (m.attackBuilding >= 0) {
      const b = this.buildings[m.attackBuilding];
      if (m.hitPending && m.stateTime >= def.attackWindup) {
        m.hitPending = false;
        if (!b.ruined) this.damageBuilding(b, def.buildingDamage, m);
      }
    } else {
      const target = this.nearestPlayer(m.x, m.y);
      if (target) {
        const dx = target.x - m.x;
        const dy = target.y - m.y;
        m.facing = norm({ x: dx, y: dy });
        if (m.hitPending && m.stateTime >= def.attackWindup) {
          m.hitPending = false;
          const reach = m.radius + target.radius + def.attackReach;
          if (Math.hypot(dx, dy) <= reach + 0.1) this.hurtPlayer(target, def.damage);
        }
      }
    }
    if (m.stateTime >= def.attackWindup + 0.25) this.setState(m, 'idle');
  }

  /** Nearest standing building cell within reach, with the direction toward it. */
  private adjacentBuilding(m: Unit, def: MonsterDef): { id: number; dx: number; dy: number } | null {
    const ci = Math.round(m.x);
    const cj = Math.round(m.y);
    const reach = m.radius + def.attackReach + 0.05;
    let best: { id: number; dx: number; dy: number } | null = null;
    let bestD = reach;
    for (let j = cj - 1; j <= cj + 1; j++) {
      for (let i = ci - 1; i <= ci + 1; i++) {
        const b = this.buildingAt(i, j);
        if (!b || b.ruined) continue;
        const nx = clamp(m.x, i - 0.5, i + 0.5);
        const ny = clamp(m.y, j - 0.5, j + 0.5);
        const d = Math.hypot(m.x - nx, m.y - ny);
        if (d <= bestD) {
          bestD = d;
          best = { id: b.id, dx: i - m.x, dy: j - m.y };
        }
      }
    }
    return best;
  }

  /** Moves along a flow field (or straight along (dx, dy) when field is null or exhausted). */
  private steer(m: Unit, _def: MonsterDef, field: FlowField | null, dx: number, dy: number) {
    let sx = dx;
    let sy = dy;
    if (field) {
      const next = field.next(Math.round(m.x), Math.round(m.y));
      if (next) {
        sx = next[0] - m.x;
        sy = next[1] - m.y;
      }
    }
    if (Math.abs(sx) < 1e-6 && Math.abs(sy) < 1e-6) {
      this.setState(m, 'idle', true);
      return;
    }
    const dir = norm({ x: sx, y: sy });
    m.x += dir.x * m.speed * DT;
    m.y += dir.y * m.speed * DT;
    m.facing = dir;
    m.moving = true;
    this.setState(m, 'walk', true);
  }

  private updateFlowFields() {
    const p = this.players.find((u) => u.state !== 'dead');
    if (p) {
      const ti = Math.round(p.x);
      const tj = Math.round(p.y);
      if (ti !== this.knightFlow.targetI || tj !== this.knightFlow.targetJ) this.knightFlow.compute(ti, tj);
    }
    if (this.buildingFlowDirty) {
      this.buildingFlowDirty = false;
      // Sources: walkable cells 4-adjacent to any standing building.
      const sources: [number, number][] = [];
      for (const b of this.buildings) {
        if (b.ruined) continue;
        for (const [i, j] of b.cells) {
          for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            if (isWalkable(this.map, i + di, j + dj)) sources.push([i + di, j + dj]);
          }
        }
      }
      this.buildingFlow.computeMulti(sources);
    }
  }

  // ------------------------------------------------------------------ waves

  private updateWaves() {
    if (this.noWaves) return;
    const pw = this.pending;
    if (pw) {
      if (!pw.warned && this.time >= pw.at - WAVES.warning) {
        pw.warned = true;
        this.events.push({ type: 'waveWarning', wave: pw.wave, sides: pw.sides });
      }
      if (this.time >= pw.at) {
        this.wave = pw.wave;
        const order = spawnOrder(this.waves[pw.wave - 1]);
        order.forEach((kind, k) => {
          this.spawnQueue.push({ at: this.time + k * WAVES.spawnSpacing, side: pw.sides[k % pw.sides.length], kind });
        });
        this.events.push({ type: 'waveStart', wave: pw.wave, count: order.length });
        const next = pw.wave + 1;
        this.pending = next <= this.totalWaves
          ? { wave: next, at: pw.at + WAVES.interval, sides: this.pickSides(next), warned: false }
          : null;
      }
    }
    while (this.spawnQueue.length && this.spawnQueue[0].at <= this.time) {
      const s = this.spawnQueue.shift()!;
      if (this.monsters.length < WAVES.maxAlive) this.spawnMonster(s.side, s.kind);
    }
  }

  private pickSides(wave: number): Side[] {
    const count = this.waves[wave - 1]?.sides ?? 1;
    const pool: Side[] = ['top', 'right', 'bottom', 'left'];
    const out: Side[] = [];
    for (let k = 0; k < count; k++) {
      const s = this.rng.pick(pool);
      out.push(s);
      pool.splice(pool.indexOf(s), 1);
    }
    return out;
  }

  private spawnMonster(side: Side, kind: MonsterKind) {
    const cells = this.map.edges[side];
    if (!cells.length) return;
    const [i, j] = this.rng.pick(cells);
    this.addMonster(i + this.rng.range(-0.15, 0.15), j + this.rng.range(-0.15, 0.15), kind);
  }

  /** Adds a monster at a ground position. Public for tests and debug tools. */
  addMonster(x: number, y: number, kind: MonsterKind = 'zombie'): Unit {
    const def = MONSTERS[kind];
    const m: Unit = {
      ...this.baseUnit(x, y),
      kind, team: 'enemy', radius: def.radius, hp: def.hp, maxHp: def.hp,
      speed: def.speed + this.rng.range(-def.speedJitter, def.speedJitter),
    };
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

  private damageBuilding(b: BuildingState, amount: number, by: Unit) {
    b.hp = Math.max(0, b.hp - amount);
    b.lastHit = this.time;
    this.events.push({ type: 'buildingHit', building: b.id, by: by.id, damage: amount });
    if (b.hp <= 0 && !b.ruined) {
      b.ruined = true;
      this.buildingFlowDirty = true;
      this.events.push({ type: 'buildingDestroyed', building: b.id });
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
      all.query(u.x, u.y, u.radius + 0.5, (o) => {
        if (o === u || o.state === 'dead' || o.id < u.id) return;
        const dx = o.x - u.x;
        const dy = o.y - u.y;
        const d = Math.hypot(dx, dy);
        const min = u.radius + o.radius;
        if (d >= min || d < 1e-6) return;
        const push = ((min - d) / d) * SEPARATION;
        // Heavier units give way less; a dodging knight shoves through.
        const wu = u.state === 'dodge' ? 0 : 1 / mass(u);
        const wo = o.state === 'dodge' ? 0 : 1 / mass(o);
        const total = wu + wo || 1;
        u.x -= dx * push * (wu / total);
        u.y -= dy * push * (wu / total);
        o.x += dx * push * (wo / total);
        o.y += dy * push * (wo / total);
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
          } else if (inBounds(this.map, i, j)) {
            // Centre inside a blocked cell: push out along the shallowest axis.
            const ox = u.x - i;
            const oy = u.y - j;
            if (Math.abs(ox) > Math.abs(oy)) u.x = i + Math.sign(ox || 1) * (0.5 + u.radius);
            else u.y = j + Math.sign(oy || 1) * (0.5 + u.radius);
          }
        }
      }
    }
    // Off the map entirely: walk back toward the centre rather than being shoved further out.
    if (!inBounds(this.map, Math.round(u.x), Math.round(u.y))) {
      const c = this.map.centre;
      const d = Math.hypot(c - u.x, c - u.y) || 1;
      u.x += ((c - u.x) / d) * 0.08;
      u.y += ((c - u.y) / d) * 0.08;
    }
  }

  // ------------------------------------------------------------------ util

  private baseUnit(x: number, y: number) {
    return {
      id: this.nextId++, x, y, vx: 0, vy: 0,
      facing: { x: 0.7071, y: 0.7071 }, state: 'idle' as UnitState, stateTime: 0,
      attackCooldown: 0, hitPending: false, attackBuilding: -1,
      invuln: 0, dodgeCooldown: 0, dodgeHeld: false, moving: false,
    };
  }

  private makeKnight(x: number, y: number): Unit {
    return {
      ...this.baseUnit(x, y),
      kind: 'knight', team: 'player', radius: KNIGHT.radius, hp: KNIGHT.hp, maxHp: KNIGHT.hp, speed: KNIGHT.speed,
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

/** Separation mass: bigger bodies push smaller ones aside. */
function mass(u: Unit): number {
  return u.radius * u.radius * 20;
}

function norm(v: Vec2): Vec2 {
  const l = Math.hypot(v.x, v.y);
  return l > 1e-6 ? { x: v.x / l, y: v.y / l } : { x: 0.7071, y: 0.7071 };
}

function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}
