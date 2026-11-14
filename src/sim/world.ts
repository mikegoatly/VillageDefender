// The game simulation. Fixed timestep, deterministic for a given seed and input sequence.
// No Phaser or DOM: render/ reads this state, input/ feeds InputState in.

import { BUILDING, DT, KNIGHT, KNOCKBACK_DAMPING, SEPARATION, STARS, WAVES } from '../data/balance';
import { MONSTERS, type MonsterDef, type MonsterKind } from '../data/monsters';
import { ARMY, GEMS, RALLY, ROOKIES, TOWN_ARROWS, type RookieKind } from '../data/rookies';
import { WEAPONS, type WeaponDef, type WeaponKind } from '../data/weapons';
import { newBossState, updateWarlord, type BossHost, type BossState } from './boss';
import type { UpgradeHost } from '../data/upgrades';
import { ROLE_EFFECTS, ROLES, type RoleKind } from '../data/roles';
import { COINS } from '../data/towns';
import type { RunResult } from '../data/achievements';
import { TOWN1_WAVES, spawnOrder, type WaveDef } from '../data/waves';
import { FlowField } from './flowField';
import { screenDirToGround } from './iso';
import { generateTown, inBounds, isWalkable, type MapOptions, type Side, type TownMap } from './map';
import { Pather } from './pather';
import { Progression } from './progression';
import { Rng } from './rng';
import { SpatialHash } from './spatialHash';
import type { InputState, Vec2 } from './types';

export type UnitKind = 'knight' | RookieKind | MonsterKind;
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
  /** Swing/bite/shot still to be applied in the current attack. */
  hitPending: boolean;
  /** Building being attacked in the current attack, or -1 when attacking a unit. */
  attackBuilding: number;
  /** Seconds of invulnerability left (dodge, after being hurt). */
  invuln: number;
  dodgeCooldown: number;
  /** Previous tick's dodge input, for rising-edge detection. */
  dodgeHeld: boolean;
  /** Whether the unit moved under its own power this tick (for walk/idle animation). */
  moving: boolean;
  /** Rookies: 0 rookie, 1 veteran, 2 captain. */
  rank: number;
  /** Kills credited to this unit (rookie promotions). */
  unitKills: number;
  /** AI: current target unit id (-1 none) and time until re-evaluating it. */
  targetId: number;
  retargetIn: number;
  /** AI: where a rookie returns to when idle. */
  postX: number;
  postY: number;
  /** Orc Warlord only. */
  boss?: BossState;
}

export interface BuildingState {
  id: number;
  hp: number;
  maxHp: number;
  /** HP before town upgrades (maxHp = baseMaxHp × town.maxHpMul). */
  baseMaxHp: number;
  ruined: boolean;
  cells: [number, number][];
  /** World time of the last hit, for render flashes and HP bar visibility. */
  lastHit: number;
  /** Arrow-slit cooldown. */
  shotIn: number;
  /** Role chosen while planning (null = plain house). */
  role: RoleKind | null;
  /** Watchtower cooldown. */
  towerShotIn: number;
}

export interface Projectile {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  /** Seconds left before it falls to the ground. */
  ttl: number;
  /** Unit id credited with kills (-1 for buildings). */
  owner: number;
  kind: 'arrow' | 'axe';
  /** Axe: flies out to maxDist, then returns to its owner, hitting each enemy once per leg. */
  returning: boolean;
  travelled: number;
  maxDist: number;
  hitIds: number[];
}

export interface Gem {
  id: number;
  x: number;
  y: number;
  value: number;
  /** Flying toward the knight. */
  magnet: boolean;
  speed: number;
}

export type SimEvent =
  | { type: 'swing'; unit: number; weapon?: WeaponKind }
  | { type: 'hit'; unit: number; by: number; damage: number; x: number; y: number }
  | { type: 'death'; unit: number }
  | { type: 'playerHurt'; unit: number; damage: number }
  | { type: 'playerDied'; unit: number }
  | { type: 'buildingHit'; building: number; by: number; damage: number }
  | { type: 'buildingDestroyed'; building: number }
  | { type: 'waveWarning'; wave: number; sides: Side[] }
  | { type: 'waveStart'; wave: number; count: number }
  | { type: 'gemCollected'; value: number }
  | { type: 'levelUp'; level: number }
  | { type: 'upgradeChosen'; id: string }
  | { type: 'rookieJoined'; unit: number; kind: RookieKind; building: number }
  | { type: 'rookiePromoted'; unit: number; rank: number }
  | { type: 'shot'; projectile: number; from: number }
  | { type: 'rally' }
  | { type: 'axeThrow'; projectile: number }
  | { type: 'bossSpawn'; unit: number }
  | { type: 'bossSlamWarn'; unit: number; x: number; y: number; radius: number; time: number }
  | { type: 'bossSlam'; unit: number; x: number; y: number; radius: number }
  | { type: 'bossCharge'; unit: number; building: number }
  | { type: 'bossSummon'; unit: number; count: number; side: Side }
  | { type: 'levelEnd'; won: boolean; stars: number; reason: 'knight' | 'town' | null };

export interface WorldOptions {
  seed: number;
  mapOptions?: MapOptions;
  /** Players; the sim supports N (decision 3), the game wires up one. */
  players?: number;
  /** Debug: players take no damage. */
  god?: boolean;
  /** Debug: start at this wave. */
  startWave?: number;
  /** Tests: use this map instead of generating one. */
  map?: TownMap;
  /** Tests: disable wave spawning (and therefore winning) entirely. */
  noWaves?: boolean;
  /** Tests: disable rookie recruitment. */
  noRookies?: boolean;
  /** Wave table; defaults to town 1. */
  waves?: WaveDef[];
  /** Start in the planning phase: tick() does nothing until start() (decision 29). */
  planning?: boolean;
  /** Planning points available (decision 36). */
  planningPoints?: number;
  /** Roles the player has unlocked; defaults to all. */
  allowedRoles?: RoleKind[];
  townId?: string;
  /** Basic attack (decision 39); defaults to the sword. */
  weapon?: WeaponKind;
}

interface PendingWave {
  wave: number;
  at: number;
  sides: Side[];
  warned: boolean;
}

export class World implements UpgradeHost {
  readonly map: TownMap;
  readonly players: Unit[] = [];
  readonly rookies: Unit[] = [];
  readonly monsters: Unit[] = [];
  readonly buildings: BuildingState[];
  readonly projectiles: Projectile[] = [];
  readonly gems: Gem[] = [];
  readonly progression: Progression;
  /** Events produced by the most recent tick (or upgrade choice). */
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
  /** Rally: seconds left active, and cooldown. */
  rallyTime = 0;
  rallyCooldown = 0;
  /** 'planning' until start(); the sim only advances while 'running'. */
  phase: 'planning' | 'running';
  readonly planningPoints: number;
  readonly allowedRoles: RoleKind[];
  readonly townId: string;
  /** Coins earned this run (decision 30). */
  coins = 0;
  readonly killsByKind: Record<string, number> = {};
  /** Basic attack; can change during planning (decision 39). */
  weapon: WeaponKind;

  private nextId = 1;
  private readonly rng: Rng;
  /** Toward the (first living) knight. */
  private readonly knightFlow: FlowField;
  /** Toward the nearest walkable cell next to any standing building. */
  private readonly buildingFlow: FlowField;
  private buildingFlowDirty = true;
  /** Building id per cell, -1 for none. Ruined buildings keep their cells (rubble blocks). */
  private readonly cellBuilding: Int32Array;
  /** Living monsters only, rebuilt at the start of each tick (targeting and hits). */
  private readonly enemyHash = new SpatialHash<Unit>(1);
  /** Every living unit, rebuilt before separation (physics only). */
  private readonly bodyHash = new SpatialHash<Unit>(1);
  private readonly pathers = new Map<number, Pather>();
  private readonly waves: WaveDef[];
  private pending: PendingWave | null;
  private spawnQueue: { at: number; side: Side; kind: MonsterKind }[] = [];
  /** Players take no damage (debug; mutable at runtime). */
  god: boolean;
  private readonly noWaves: boolean;
  private readonly noRookies: boolean;
  /** Rookies recruited so far (including fallen ones), and the respawn timer. */
  private recruited = 0;
  private recruitIn = 0;
  private rallyHeld = false;

  constructor(opts: WorldOptions) {
    this.rng = new Rng(opts.seed * 7919 + 17);
    this.progression = new Progression(new Rng(opts.seed * 104729 + 3));
    this.map = opts.map ?? generateTown(opts.seed, opts.mapOptions);
    this.knightFlow = new FlowField(this.map);
    this.buildingFlow = new FlowField(this.map);
    this.god = !!opts.god;
    this.noWaves = !!opts.noWaves;
    this.noRookies = !!opts.noRookies;
    this.waves = opts.waves ?? TOWN1_WAVES;
    this.totalWaves = this.waves.length;
    this.phase = opts.planning ? 'planning' : 'running';
    this.planningPoints = opts.planningPoints ?? 0;
    this.allowedRoles = opts.allowedRoles ?? (Object.keys(ROLES) as RoleKind[]);
    this.townId = opts.townId ?? 'village';
    this.weapon = opts.weapon ?? 'sword';
    this.bossHost = this.makeBossHost();

    this.cellBuilding = new Int32Array(this.map.size * this.map.size).fill(-1);
    this.buildings = this.map.buildings.map((b) => {
      // One wall block per storey per cell, plus one roof per cell. Every building counts the same
      // toward stars, so size adds HP only gently: base + a bonus per extra wall block.
      const wallBlocks = Math.max(1, b.blocks.length - b.cells.length);
      const hp = BUILDING.baseHp + (wallBlocks - 1) * BUILDING.hpPerExtraBlock;
      for (const [i, j] of b.cells) this.cellBuilding[j * this.map.size + i] = b.id;
      return { id: b.id, hp, maxHp: hp, baseMaxHp: hp, ruined: false, cells: b.cells, lastHit: -1, shotIn: 0, role: null, towerShotIn: 0 };
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

  /** True while the game is paused for an upgrade choice. */
  get choosing(): boolean {
    return this.progression.offers !== null;
  }

  get rookieCap(): number {
    return ARMY.baseCap + this.progression.mods.army.capAdd + this.standingRoles('barracks').length;
  }

  // ------------------------------------------------------------------ planning (3b)

  /** Points not yet spent on roles. */
  get planningPointsLeft(): number {
    return this.planningPoints - this.buildings.reduce((n, b) => n + (b.role ? ROLES[b.role].cost : 0), 0);
  }

  /**
   * Sets or clears a building's role during planning. Returns false if not allowed
   * (wrong phase, locked role, not enough points).
   */
  setRole(buildingId: number, role: RoleKind | null): boolean {
    const b = this.buildings[buildingId];
    if (this.phase !== 'planning' || !b) return false;
    if (role === null) {
      b.role = null;
      return true;
    }
    if (!this.allowedRoles.includes(role)) return false;
    const refund = b.role ? ROLES[b.role].cost : 0;
    if (this.planningPointsLeft + refund < ROLES[role].cost) return false;
    b.role = role;
    return true;
  }

  /** Chooses the knight's weapon during planning. */
  setWeapon(kind: WeaponKind): boolean {
    if (this.phase !== 'planning') return false;
    this.weapon = kind;
    return true;
  }

  /** Ends planning; the first wave's countdown starts now. */
  start() {
    this.phase = 'running';
  }

  /** Standing buildings with a role. */
  standingRoles(role: RoleKind): BuildingState[] {
    return this.buildings.filter((b) => b.role === role && !b.ruined);
  }

  /** Damage multiplier from smithies near a ground point. */
  smithyMulAt(x: number, y: number): number {
    const r = ROLES.smithy.radius;
    for (const b of this.standingRoles('smithy')) {
      const [cx, cy] = centreOf(b.cells);
      if (Math.hypot(cx - x, cy - y) <= r) return ROLE_EFFECTS.smithyDamageMul;
    }
    return 1;
  }

  /** What this run reports to the profile. */
  runResult(): RunResult {
    return {
      townId: this.townId, won: this.status === 'won', stars: this.stars,
      standing: this.standingBuildings(), totalBuildings: this.buildings.length,
      knightLevel: this.progression.level, wave: this.wave, kills: { ...this.killsByKind }, coins: Math.round(this.coins),
    };
  }

  /** The living boss, if one is on the field. */
  get boss(): Unit | null {
    return this.monsters.find((m) => m.kind === 'warlord' && m.state !== 'dead') ?? null;
  }

  get weaponDef(): WeaponDef {
    return WEAPONS[this.weapon];
  }

  /** Kills needed for the next rookie, or null when all thresholds are used. */
  nextRookieAt(): number | null {
    const t = ARMY.thresholds[this.recruited];
    return t === undefined ? null : Math.round(t * this.progression.mods.army.thresholdMul);
  }

  // ------------------------------------------------------------------ upgrades

  /** Picks one of the offered upgrade cards. Unpauses when no more choices are queued. */
  chooseUpgrade(index: number) {
    const id = this.progression.choose(index, this);
    if (!id) return;
    this.events.push({ type: 'upgradeChosen', id });
    this.applyMods();
  }

  healKnights(amount: number) {
    for (const p of this.players) if (p.state !== 'dead') p.hp = Math.min(p.maxHp, p.hp + amount);
  }

  repairBuildings(fraction: number) {
    for (const b of this.buildings) if (!b.ruined) b.hp = Math.min(b.maxHp, b.hp + b.maxHp * fraction);
  }

  /** Applies derived stats (max HP of knights, rookies and buildings) after mods change. */
  private applyMods() {
    const m = this.progression.mods;
    for (const p of this.players) {
      const max = KNIGHT.hp + m.knight.maxHpAdd;
      if (p.state !== 'dead') p.hp += max - p.maxHp;
      p.maxHp = max;
      p.speed = KNIGHT.speed * m.knight.speedMul;
    }
    for (const r of this.rookies) this.applyRookieStats(r);
    for (const b of this.buildings) {
      const max = b.baseMaxHp * m.town.maxHpMul;
      if (!b.ruined) b.hp = (b.hp / b.maxHp) * max;
      b.maxHp = max;
    }
  }

  // ------------------------------------------------------------------ tick

  tick(inputs: InputState[]) {
    this.events = [];
    if (this.status !== 'playing' || this.choosing || this.phase !== 'running') return;
    this.time += DT;
    this.tickCount++;

    this.rebuildEnemyHash();
    this.players.forEach((p, k) => this.updateKnight(p, inputs[k]));
    this.updateRally(inputs[0]);
    this.updateRecruitment();
    for (const r of this.rookies) this.updateRookie(r);
    this.updateFlowFields();
    this.updateWaves();
    for (const m of this.monsters) this.updateMonster(m);
    this.updateProjectiles();
    this.updateTown();

    this.separate();
    for (const u of this.players) this.integrate(u);
    for (const r of this.rookies) this.integrate(r);
    for (const m of this.monsters) this.integrate(m);
    this.updateGems();

    // Remove corpses once their death animation has played.
    for (let k = this.monsters.length - 1; k >= 0; k--) {
      const m = this.monsters[k];
      if (m.state === 'dead' && m.stateTime > MONSTERS[m.kind as MonsterKind].corpseTime) this.monsters.splice(k, 1);
    }
    for (let k = this.rookies.length - 1; k >= 0; k--) {
      const r = this.rookies[k];
      if (r.state === 'dead' && r.stateTime > 1.4) {
        this.rookies.splice(k, 1);
        this.pathers.delete(r.id);
      }
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
    if (won) this.coins += COINS.perWaveCleared * this.totalWaves + COINS.perStar * this.stars;
    this.events.push({ type: 'levelEnd', won, stars: this.stars, reason });
  }

  // ------------------------------------------------------------------ knight

  private updateKnight(u: Unit, input: InputState | undefined) {
    this.tickTimers(u);
    if (u.state === 'dead') return;
    const km = this.progression.mods.knight;
    if (km.regen > 0) u.hp = Math.min(u.maxHp, u.hp + km.regen * DT);
    const inp = input ?? { move: { x: 0, y: 0 }, attack: false, dodge: false } as InputState;
    const move = screenDirToGround(inp.move.x, inp.move.y);
    const moveLen = Math.hypot(move.x, move.y);

    // Dodge on the rising edge of the button.
    if (inp.dodge && !u.dodgeHeld && u.dodgeCooldown <= 0 && u.state !== 'dodge') {
      const dir = moveLen > 0.1 ? norm(move) : u.facing;
      u.facing = dir;
      this.setState(u, 'dodge');
      u.dodgeCooldown = KNIGHT.dodgeCooldown * km.dodgeCooldownMul;
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

    // Attack: hold to auto-aim at the nearest enemy (decision 2); how it hits depends on the weapon (decision 39).
    const w = this.weaponDef;
    if (w.style === 'spin') {
      this.updateSpin(u, inp.attack, w);
    } else {
      if (inp.attack && u.attackCooldown <= 0 && u.state !== 'attack') {
        const target = this.nearestMonster(u.x, u.y, w.acquireRange * km.rangeMul);
        if (target) u.facing = norm({ x: target.x - u.x, y: target.y - u.y });
        else if (moveLen > 0.1) u.facing = norm(move);
        this.setState(u, 'attack');
        u.hitPending = true;
        u.attackCooldown = w.cooldown * km.cooldownMul;
        this.events.push({ type: 'swing', unit: u.id, weapon: this.weapon });
      }
      if (u.state === 'attack') {
        if (u.hitPending && u.stateTime >= w.hitTime) {
          u.hitPending = false;
          this.weaponHit(u, w);
        }
        if (u.stateTime >= w.duration) this.setState(u, 'idle');
      }
    }

    const speed = u.speed * (u.state === 'attack' ? w.moveFactor : 1);
    u.moving = moveLen > 0.05;
    if (u.moving) {
      u.x += move.x * speed * DT;
      u.y += move.y * speed * DT;
      if (u.state !== 'attack') u.facing = norm(move);
    }
    if (u.state !== 'attack') this.setState(u, u.moving ? 'walk' : 'idle', true);
  }

  /** Applies the knight's weapon at the moment the attack lands. */
  private weaponHit(u: Unit, w: WeaponDef) {
    const km = this.progression.mods.knight;
    const damage = w.damage * km.damageMul * this.smithyMulAt(u.x, u.y);
    const knockback = w.knockback * km.knockbackMul;
    if (w.style === 'arc') {
      this.swingHits(u, w.range * km.rangeMul, Math.min(Math.PI, w.arc * km.arcMul), damage, knockback);
    } else if (w.style === 'area') {
      // Warhammer: slam centred ahead of the knight.
      const reach = w.range * km.rangeMul;
      this.areaHits(u.id, u.x + u.facing.x * reach, u.y + u.facing.y * reach, w.arc * km.arcMul, damage, knockback);
    } else if (w.style === 'boomerang') {
      this.throwAxe(u, w, damage);
    }
  }

  /** Flail: while attack is held, damage pulses hit everything around the knight. */
  private updateSpin(u: Unit, held: boolean, w: WeaponDef) {
    const km = this.progression.mods.knight;
    if (!held) {
      if (u.state === 'attack') this.setState(u, 'idle');
      return;
    }
    this.setState(u, 'attack', true);
    if (u.attackCooldown > 0) return;
    u.attackCooldown = w.cooldown * km.cooldownMul;
    const damage = w.damage * km.damageMul * this.smithyMulAt(u.x, u.y);
    this.areaHits(u.id, u.x, u.y, w.range * km.rangeMul * Math.sqrt(km.arcMul), damage, w.knockback * km.knockbackMul);
    this.events.push({ type: 'swing', unit: u.id, weapon: this.weapon });
  }

  /** Hits every enemy whose body overlaps a circle; knocks them away from its centre. */
  private areaHits(owner: number, cx: number, cy: number, radius: number, damage: number, knockback: number) {
    this.enemyHash.query(cx, cy, radius + 0.6, (m) => {
      if (m.state === 'dead') return;
      const dx = m.x - cx;
      const dy = m.y - cy;
      const d = Math.hypot(dx, dy);
      if (d - m.radius > radius) return;
      this.damage(m, damage, owner);
      const resist = MONSTERS[m.kind as MonsterKind].knockbackResist;
      const k = d > 1e-4 ? (knockback * (1 - resist)) / d : 0;
      m.vx += dx * k;
      m.vy += dy * k;
    });
  }

  private throwAxe(u: Unit, w: WeaponDef, damage: number) {
    const km = this.progression.mods.knight;
    const p: Projectile = {
      id: this.nextId++, x: u.x, y: u.y, vx: u.facing.x * w.projectileSpeed, vy: u.facing.y * w.projectileSpeed,
      damage, ttl: 6, owner: u.id, kind: 'axe', returning: false, travelled: 0, maxDist: w.range * km.rangeMul, hitIds: [],
    };
    this.projectiles.push(p);
    this.events.push({ type: 'axeThrow', projectile: p.id });
  }

  /** Melee swing: hits every enemy within reach inside the facing arc. */
  private swingHits(u: Unit, reach: number, arc: number, damage: number, knockback: number) {
    const cosArc = Math.cos(arc);
    this.enemyHash.query(u.x, u.y, reach + 0.5, (m) => {
      if (m.state === 'dead' || m.team === u.team) return;
      const dx = m.x - u.x;
      const dy = m.y - u.y;
      const d = Math.hypot(dx, dy);
      if (d - m.radius > reach) return;
      // Inside the arc (or overlapping the attacker, which always counts).
      if (d > u.radius + m.radius && (dx * u.facing.x + dy * u.facing.y) / d < cosArc) return;
      this.damage(m, damage, u.id);
      const resist = MONSTERS[m.kind as MonsterKind].knockbackResist;
      const k = d > 1e-4 ? (knockback * (1 - resist)) / d : 0;
      m.vx += dx * k;
      m.vy += dy * k;
    });
  }

  // ------------------------------------------------------------------ rally

  private updateRally(input: InputState | undefined) {
    this.rallyTime = Math.max(0, this.rallyTime - DT);
    this.rallyCooldown = Math.max(0, this.rallyCooldown - DT);
    const held = !!input?.rally;
    if (held && !this.rallyHeld && this.rallyCooldown <= 0) {
      this.rallyTime = RALLY.duration;
      this.rallyCooldown = RALLY.cooldown;
      this.events.push({ type: 'rally' });
    }
    this.rallyHeld = held;
  }

  // ------------------------------------------------------------------ rookies

  private updateRecruitment() {
    if (this.noRookies) return;
    this.recruitIn = Math.max(0, this.recruitIn - DT);
    const alive = this.rookies.filter((r) => r.state !== 'dead').length;
    if (alive >= this.rookieCap || this.recruitIn > 0) return;
    // A new recruit when the next kill threshold is reached; replacements for fallen rookies
    // (recruited but no longer alive) once the respawn delay has passed.
    const next = this.nextRookieAt();
    const owed = this.recruited - alive;
    if (owed <= 0 && (next === null || this.kills < next)) return;
    // Rookies step out of a barracks when there is one (decision 29), else any standing building.
    const barracks = this.standingRoles('barracks');
    const standing = barracks.length ? barracks : this.buildings.filter((b) => !b.ruined);
    if (!standing.length) return;
    const home = standing[Math.floor(this.rng.frac() * standing.length)];
    const door = this.doorOf(home);
    if (!door) return;
    if (owed <= 0) this.recruited++;
    const order = ARMY.order;
    const kind = order[(this.recruited - 1 + Math.max(0, owed - 1)) % order.length];
    const r = this.makeRookie(kind, door[0], door[1]);
    this.rookies.push(r);
    this.recruitIn = owed > 0 ? ARMY.respawnDelay : 0;
    this.events.push({ type: 'rookieJoined', unit: r.id, kind, building: home.id });
  }

  /** A walkable cell next to the building (where a rookie steps out). */
  private doorOf(b: BuildingState): [number, number] | null {
    for (const [i, j] of b.cells) {
      for (const [di, dj] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
        if (isWalkable(this.map, i + di, j + dj)) return [i + di, j + dj];
      }
    }
    return null;
  }

  private makeRookie(kind: RookieKind, x: number, y: number): Unit {
    const def = ROOKIES[kind];
    const r: Unit = {
      ...this.baseUnit(x, y),
      kind, team: 'player', radius: def.radius, hp: def.hp, maxHp: def.hp, speed: def.speed,
      rank: Math.min(2, this.progression.mods.army.startRank), postX: x, postY: y,
    };
    this.applyRookieStats(r);
    r.hp = r.maxHp;
    return r;
  }

  private applyRookieStats(r: Unit) {
    const def = ROOKIES[r.kind as RookieKind];
    const max = def.hp * this.progression.mods.army.hpMul * ARMY.rankMul[r.rank];
    if (r.state !== 'dead') r.hp = Math.min(max, r.hp + Math.max(0, max - r.maxHp));
    r.maxHp = max;
  }

  private rookieDamage(r: Unit): number {
    return ROOKIES[r.kind as RookieKind].damage * this.progression.mods.army.damageMul * ARMY.rankMul[r.rank] * this.smithyMulAt(r.x, r.y);
  }

  private pather(u: Unit): Pather {
    let p = this.pathers.get(u.id);
    if (!p) {
      p = new Pather(this.map);
      this.pathers.set(u.id, p);
    }
    return p;
  }

  /** Rookies defend buildings first, then hunt nearby monsters, then return to their post. */
  private updateRookie(r: Unit) {
    this.tickTimers(r);
    if (r.state === 'dead') return;
    const def = ROOKIES[r.kind as RookieKind];
    r.moving = false;

    if (r.state === 'attack') {
      const target = this.monsterById(r.targetId);
      if (target && target.state !== 'dead') r.facing = norm({ x: target.x - r.x, y: target.y - r.y });
      if (r.hitPending && r.stateTime >= def.attackHitTime) {
        r.hitPending = false;
        if (def.keepAway > 0) {
          if (target && target.state !== 'dead') this.shoot(r.x, r.y, target, this.rookieDamage(r), def.projectileSpeed, r.id);
        } else {
          this.swingHits(r, def.range, KNIGHT.attackArc, this.rookieDamage(r), KNIGHT.knockback * 0.6);
        }
      }
      if (r.stateTime >= def.attackDuration) this.setState(r, 'idle');
      return;
    }

    const knight = this.players.find((p) => p.state !== 'dead');
    // Rally: regroup on the knight, only fighting once there.
    if (this.rallyTime > 0 && knight) {
      const d = Math.hypot(knight.x - r.x, knight.y - r.y);
      if (d > RALLY.closeEnough) {
        r.targetId = -1;
        this.moveRookie(r, knight.x, knight.y, def.speed * 1.25);
        return;
      }
      r.postX = knight.x;
      r.postY = knight.y;
    }

    r.retargetIn -= DT;
    let target = this.monsterById(r.targetId);
    if (!target || target.state === 'dead' || r.retargetIn <= 0) {
      target = this.pickRookieTarget(r);
      r.targetId = target ? target.id : -1;
      r.retargetIn = ARMY.retargetEvery;
    }

    if (!target) {
      // Home building gone? Follow the knight instead.
      if (knight && this.standingBuildings() === 0) {
        r.postX = knight.x;
        r.postY = knight.y;
      }
      if (Math.hypot(r.postX - r.x, r.postY - r.y) > 0.6) this.moveRookie(r, r.postX, r.postY, def.speed);
      else this.setState(r, 'idle', true);
      return;
    }

    const dx = target.x - r.x;
    const dy = target.y - r.y;
    const d = Math.hypot(dx, dy);
    if (def.keepAway > 0) {
      // Archer: back off when crowded, otherwise shoot from range.
      if (d < def.keepAway) {
        const away = norm({ x: -dx, y: -dy });
        this.moveRookie(r, r.x + away.x, r.y + away.y, def.speed);
        return;
      }
      if (d <= def.range) {
        r.facing = norm({ x: dx, y: dy });
        if (r.attackCooldown <= 0) this.startRookieAttack(r, def.attackCooldown);
        else this.setState(r, 'idle', true);
        return;
      }
      this.moveRookie(r, target.x, target.y, def.speed);
      return;
    }
    // Swordsman.
    if (d - target.radius - r.radius <= def.range * 0.8) {
      r.facing = norm({ x: dx, y: dy });
      if (r.attackCooldown <= 0) this.startRookieAttack(r, def.attackCooldown);
      else this.setState(r, 'idle', true);
      return;
    }
    this.moveRookie(r, target.x, target.y, def.speed);
  }

  private startRookieAttack(r: Unit, cooldown: number) {
    this.setState(r, 'attack');
    r.hitPending = true;
    r.attackCooldown = cooldown;
  }

  private moveRookie(r: Unit, tx: number, ty: number, speed: number) {
    const dir = this.pather(r).dirTo(r.x, r.y, tx, ty, r.radius, this.time);
    if (dir.x === 0 && dir.y === 0) {
      this.setState(r, 'idle', true);
      return;
    }
    r.x += dir.x * speed * DT;
    r.y += dir.y * speed * DT;
    r.facing = dir;
    r.moving = true;
    this.setState(r, 'walk', true);
  }

  /** Building attackers within defendRange first (nearest to the rookie), else nearest monster in huntRange. */
  private pickRookieTarget(r: Unit): Unit | null {
    let best: Unit | null = null;
    let bestD = ARMY.defendRange;
    for (const m of this.monsters) {
      // Building attackers idle between swings; they stay targets until they walk off or the building falls.
      const wrecking = m.attackBuilding >= 0 && m.state !== 'walk' && !this.buildings[m.attackBuilding].ruined;
      if (m.state === 'dead' || !wrecking) continue;
      const d = Math.hypot(m.x - r.x, m.y - r.y);
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    }
    if (best) return best;
    return this.nearestMonster(r.x, r.y, ARMY.huntRange);
  }

  private monsterById(id: number): Unit | null {
    if (id < 0) return null;
    for (const m of this.monsters) if (m.id === id) return m;
    return null;
  }

  // ------------------------------------------------------------------ projectiles and town defences

  /** Fires an arrow at a monster, leading it slightly. */
  private shoot(x: number, y: number, target: Unit, damage: number, speed: number, owner: number) {
    const d = Math.hypot(target.x - x, target.y - y);
    const lead = d / speed;
    const tx = target.x + (target.moving ? target.facing.x * target.speed * lead : 0);
    const ty = target.y + (target.moving ? target.facing.y * target.speed * lead : 0);
    const dir = norm({ x: tx - x, y: ty - y });
    const p: Projectile = { id: this.nextId++, x, y, vx: dir.x * speed, vy: dir.y * speed, damage, ttl: 1.2 * (d / speed) + 0.3, owner,
      kind: 'arrow', returning: false, travelled: 0, maxDist: 0, hitIds: [] };
    this.projectiles.push(p);
    this.events.push({ type: 'shot', projectile: p.id, from: owner });
  }

  private updateProjectiles() {
    for (let k = this.projectiles.length - 1; k >= 0; k--) {
      const p = this.projectiles[k];
      if (p.kind === 'axe') {
        if (this.updateAxe(p)) this.projectiles.splice(k, 1);
        continue;
      }
      p.x += p.vx * DT;
      p.y += p.vy * DT;
      p.ttl -= DT;
      let hit: Unit | null = null;
      this.enemyHash.query(p.x, p.y, 0.6, (m) => {
        if (hit || m.state === 'dead') return;
        if (Math.hypot(m.x - p.x, m.y - p.y) <= m.radius + 0.12) hit = m;
      });
      if (hit) this.damage(hit, p.damage, p.owner);
      if (hit || p.ttl <= 0) this.projectiles.splice(k, 1);
    }
  }

  /** Moves a thrown axe out and back; returns true when it should be removed. */
  private updateAxe(p: Projectile): boolean {
    const speed = Math.hypot(p.vx, p.vy);
    const owner = this.players.find((pl) => pl.id === p.owner && pl.state !== 'dead');
    p.ttl -= DT;
    if (p.ttl <= 0 || !owner) return true;
    if (!p.returning) {
      p.travelled += speed * DT;
      if (p.travelled >= p.maxDist) {
        p.returning = true;
        p.hitIds = [];
      }
    } else {
      const dx = owner.x - p.x;
      const dy = owner.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.45) return true;
      p.vx = (dx / d) * speed;
      p.vy = (dy / d) * speed;
    }
    p.x += p.vx * DT;
    p.y += p.vy * DT;
    this.enemyHash.query(p.x, p.y, 0.8, (m) => {
      if (m.state === 'dead' || p.hitIds.includes(m.id)) return;
      if (Math.hypot(m.x - p.x, m.y - p.y) > m.radius + 0.3) return;
      p.hitIds.push(m.id);
      this.damage(m, p.damage, p.owner);
    });
    return false;
  }

  /** Building regen, arrow slits and role effects. */
  private updateTown() {
    const t = this.progression.mods.town;
    for (const b of this.buildings) {
      if (b.ruined) continue;
      if (b.role) this.updateRole(b);
      if (t.regenFrac > 0) b.hp = Math.min(b.maxHp, b.hp + b.maxHp * t.regenFrac * DT);
      if (t.arrowSlits <= 0) continue;
      b.shotIn -= DT;
      if (b.shotIn > 0) continue;
      const [ci, cj] = centreOf(b.cells);
      const target = this.nearestMonster(ci, cj, TOWN_ARROWS.range);
      if (!target) continue;
      this.shoot(ci, cj, target, TOWN_ARROWS.damage, TOWN_ARROWS.speed, -1);
      b.shotIn = Math.max(1.2, TOWN_ARROWS.interval - 0.8 * (t.arrowSlits - 1));
    }
  }

  private updateRole(b: BuildingState) {
    const def = ROLES[b.role!];
    const [cx, cy] = centreOf(b.cells);
    if (b.role === 'chapel') {
      const heal = ROLE_EFFECTS.chapelHealPerSecond * DT;
      for (const list of [this.players, this.rookies]) {
        for (const u of list) {
          if (u.state === 'dead' || Math.hypot(u.x - cx, u.y - cy) > def.radius) continue;
          u.hp = Math.min(u.maxHp, u.hp + heal);
        }
      }
    } else if (b.role === 'watchtower') {
      b.towerShotIn -= DT;
      if (b.towerShotIn > 0) return;
      const target = this.nearestMonster(cx, cy, def.radius);
      if (!target) return;
      const w = ROLE_EFFECTS.watchtower;
      this.shoot(cx, cy, target, w.damage, w.speed, -1);
      b.towerShotIn = w.interval;
    }
  }

  // ------------------------------------------------------------------ gems and XP

  private updateGems() {
    const knight = this.players.find((p) => p.state !== 'dead');
    if (!knight) return;
    // Once the field is clear between waves, everything left flies home.
    const vacuum = this.spawnQueue.length === 0 && this.monsters.every((m) => m.state === 'dead');
    const magnet = GEMS.magnetRadius * this.progression.mods.knight.magnetMul;
    for (let k = this.gems.length - 1; k >= 0; k--) {
      const g = this.gems[k];
      const dx = knight.x - g.x;
      const dy = knight.y - g.y;
      const d = Math.hypot(dx, dy);
      if (!g.magnet && (d <= magnet || vacuum)) g.magnet = true;
      if (g.magnet) {
        g.speed = Math.min(GEMS.flySpeed * 2.5, g.speed + GEMS.flySpeed * 3 * DT);
        const step = Math.min(d, g.speed * DT);
        if (d > 1e-6) {
          g.x += (dx / d) * step;
          g.y += (dy / d) * step;
        }
      }
      if (Math.hypot(knight.x - g.x, knight.y - g.y) <= GEMS.collectRadius) {
        this.gems.splice(k, 1);
        this.events.push({ type: 'gemCollected', value: g.value });
        const before = this.progression.level;
        this.progression.addXp(g.value);
        for (let l = before + 1; l <= this.progression.level; l++) this.events.push({ type: 'levelUp', level: l });
      }
    }
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
    // Boss abilities take over the unit while they run.
    if (m.boss && updateWarlord(this.bossHost, m, m.boss)) {
      this.setState(m, m.moving ? 'walk' : 'idle', true);
      return;
    }

    // Choose a target by archetype (plan section 3.3).
    const hasBuildings = this.standingBuildings() > 0;
    let friend: Unit | null;
    let chase: boolean;
    if (def.target === 'knight') {
      friend = this.nearestOf(this.players, m.x, m.y);
      chase = !!friend;
    } else if (def.target === 'rookies') {
      friend = this.nearestOf(this.rookies, m.x, m.y) ?? this.nearestOf(this.players, m.x, m.y);
      chase = !!friend;
    } else {
      friend = this.nearestFriendly(m.x, m.y);
      chase = !!friend && (!hasBuildings || (def.target === 'nearest' && Math.hypot(friend.x - m.x, friend.y - m.y) <= def.aggroRange));
    }

    if (chase && friend) {
      const dx = friend.x - m.x;
      const dy = friend.y - m.y;
      const d = Math.hypot(dx, dy);
      const reach = m.radius + friend.radius + def.attackReach;
      if (d <= reach) {
        if (m.attackCooldown <= 0) this.startAttack(m, def, { x: dx, y: dy }, -1, friend.id);
        else this.setState(m, 'idle', true);
        return;
      }
      // The knight field only leads to the knight; rookies are always close, so go straight.
      const useField = !def.phasing && friend.kind === 'knight' && d > 1.5;
      this.steer(m, useField ? this.knightFlow : null, dx, dy);
      return;
    }

    // Building attack: any standing building cell within reach?
    const b = this.adjacentBuilding(m, def.attackReach);
    if (b) {
      if (m.attackCooldown <= 0) this.startAttack(m, def, { x: b.dx, y: b.dy }, b.id, -1);
      else this.setState(m, 'idle', true);
      return;
    }
    if (!hasBuildings) {
      this.setState(m, 'idle', true);
      return;
    }
    // The field ends on cells next to buildings; from there close the last gap directly,
    // since a cell centre is 0.5 from the building edge, beyond most monsters' reach.
    m.attackBuilding = -1;
    if (def.phasing) {
      // Ghosts drift straight through anything toward the nearest standing building.
      const cell = this.nearestStandingCell(m.x, m.y);
      this.steer(m, null, cell ? cell[0] - m.x : 0, cell ? cell[1] - m.y : 0);
      return;
    }
    const near = this.nearestBuildingCell(m);
    this.steer(m, this.buildingFlow, near ? near[0] - m.x : 0, near ? near[1] - m.y : 0);
  }

  private startAttack(m: Unit, def: MonsterDef, dir: Vec2, building: number, target: number) {
    this.setState(m, 'attack');
    m.hitPending = true;
    m.attackCooldown = def.attackCooldown;
    m.attackBuilding = building;
    m.targetId = target;
    m.facing = norm(dir);
  }

  private continueAttack(m: Unit, def: MonsterDef) {
    if (m.attackBuilding >= 0) {
      const b = this.buildings[m.attackBuilding];
      if (m.hitPending && m.stateTime >= def.attackWindup) {
        m.hitPending = false;
        if (!b.ruined) {
          this.damageBuilding(b, def.buildingDamage, m);
          const thorns = this.progression.mods.town.thorns;
          if (thorns > 0) this.damage(m, thorns, -1);
        }
      }
    } else {
      const target = this.friendlyById(m.targetId) ?? this.nearestFriendly(m.x, m.y);
      if (target && target.state !== 'dead') {
        const dx = target.x - m.x;
        const dy = target.y - m.y;
        m.facing = norm({ x: dx, y: dy });
        if (m.hitPending && m.stateTime >= def.attackWindup) {
          m.hitPending = false;
          const reach = m.radius + target.radius + def.attackReach;
          if (Math.hypot(dx, dy) <= reach + 0.1) {
            const dealt = this.hurtFriendly(target, def.damage);
            if (def.lifesteal && dealt > 0) m.hp = Math.min(m.maxHp, m.hp + dealt * def.lifesteal);
          }
        }
      }
    }
    if (m.stateTime >= def.attackWindup + 0.25) this.setState(m, 'idle');
  }

  /** Nearest standing building cell within `reach` of the unit's edge, with the direction toward it. */
  private adjacentBuilding(m: Unit, reach: number): { id: number; dx: number; dy: number } | null {
    const ci = Math.round(m.x);
    const cj = Math.round(m.y);
    let best: { id: number; dx: number; dy: number } | null = null;
    let bestD = m.radius + reach + 0.05;
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

  /** Moves along a flow field (or straight along (dx, dy) when field is null or exhausted). */
  private steer(m: Unit, field: FlowField | null, dx: number, dy: number) {
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
    // Tar pits: slowed next to buildings.
    const slow = this.progression.mods.town.slow;
    const speed = m.speed * (slow > 0 && this.adjacentBuilding(m, 0.6) ? 1 - slow : 1);
    const dir = norm({ x: sx, y: sy });
    m.x += dir.x * speed * DT;
    m.y += dir.y * speed * DT;
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
      const warning = WAVES.warning + (this.standingRoles('watchtower').length ? ROLE_EFFECTS.watchtowerExtraWarning : 0);
      if (!pw.warned && this.time >= pw.at - warning) {
        pw.warned = true;
        this.events.push({ type: 'waveWarning', wave: pw.wave, sides: pw.sides });
      }
      if (this.time >= pw.at) {
        // Reaching the next wave pays for surviving the previous one.
        if (pw.wave > 1) this.coins += COINS.perWaveCleared * (pw.wave - 1);
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
    if (kind === 'warlord') {
      m.boss = newBossState();
      this.events.push({ type: 'bossSpawn', unit: m.id });
    }
    this.monsters.push(m);
    return m;
  }

  /** Adds a rookie at a ground position. Public for tests and debug tools. */
  addRookie(x: number, y: number, kind: RookieKind = 'swordsman'): Unit {
    const r = this.makeRookie(kind, x, y);
    this.rookies.push(r);
    return r;
  }

  // ------------------------------------------------------------------ debug
  // Used by the in-game debug panel (src/ui/DebugPanel.ts). Not used by normal play.

  /** Spawns monsters at a ground point (spread slightly) or along a map edge. */
  debugSpawn(kind: MonsterKind, count: number, at: Side | { x: number; y: number }) {
    for (let k = 0; k < count; k++) {
      if (typeof at === 'string') this.spawnMonster(at, kind);
      else this.addMonster(at.x + this.rng.range(-0.4, 0.4), at.y + this.rng.range(-0.4, 0.4), kind);
    }
  }

  debugGiveXp(amount: number) {
    const before = this.progression.level;
    this.progression.addXp(amount);
    for (let l = before + 1; l <= this.progression.level; l++) this.events.push({ type: 'levelUp', level: l });
  }

  /** Takes one stack of an upgrade without a level-up. Returns false when maxed/unknown. */
  debugGiveUpgrade(id: string): boolean {
    const ok = this.progression.grant(id, this);
    if (ok) this.applyMods();
    return ok;
  }

  debugAddRookie(kind: RookieKind) {
    const k = this.players[0];
    const r = this.addRookie(k.x + 0.6, k.y + 0.6, kind);
    this.collideCells(r);
    this.events.push({ type: 'rookieJoined', unit: r.id, kind, building: -1 });
  }

  debugHealKnight() {
    for (const p of this.players) if (p.state !== 'dead') p.hp = p.maxHp;
  }

  /** Next wave becomes `wave`, arriving after its normal warning. */
  debugJumpToWave(wave: number) {
    const w = Math.min(Math.max(1, Math.round(wave)), this.totalWaves);
    this.wave = w - 1;
    this.pending = { wave: w, at: this.time + WAVES.warning + 0.1, sides: this.pickSides(w), warned: false };
  }

  /** Kills every living monster (they drop gems as usual). */
  debugKillAll() {
    for (const m of this.monsters) if (m.state !== 'dead') this.damage(m, m.hp + 1, -1);
  }

  /** Sets a building's HP fraction (0 destroys it, 1 repairs it). */
  debugSetBuildingHp(id: number, fraction: number) {
    const b = this.buildings[id];
    if (!b || b.ruined) return;
    if (fraction <= 0) {
      this.damageBuilding(b, b.hp, this.players[0]);
      return;
    }
    b.hp = b.maxHp * Math.min(1, fraction);
  }

  debugEnd(won: boolean) {
    if (this.status !== 'playing') return;
    if (won) {
      this.pending = null;
      this.spawnQueue = [];
      this.debugKillAll();
      this.end(true, null);
    } else this.end(false, 'knight');
  }

  /** Read-only views of internal state for debug overlays. */
  debugInfo() {
    return {
      knightFlow: this.knightFlow.dist,
      buildingFlow: this.buildingFlow.dist,
      nextWaveAt: this.pending?.at ?? null,
      nextWave: this.pending?.wave ?? null,
      queued: this.spawnQueue.length,
      nextRookieAt: this.nextRookieAt(),
      recruitIn: this.recruitIn,
    };
  }

  // ------------------------------------------------------------------ combat helpers

  /** Damages a monster; `by` is the attacking unit id (-1 for buildings/thorns). */
  private damage(u: Unit, amount: number, by: number) {
    u.hp -= amount;
    this.events.push({ type: 'hit', unit: u.id, by, damage: amount, x: u.x, y: u.y });
    if (u.hp <= 0) {
      u.hp = 0;
      this.setState(u, 'dead');
      this.events.push({ type: 'death', unit: u.id });
      if (u.team === 'enemy') {
        this.kills++;
        this.killsByKind[u.kind] = (this.killsByKind[u.kind] ?? 0) + 1;
        this.coins += MONSTERS[u.kind as MonsterKind].coins;
        this.gems.push({ id: this.nextId++, x: u.x, y: u.y, value: MONSTERS[u.kind as MonsterKind].xp, magnet: false, speed: 0 });
        const killer = this.rookies.find((r) => r.id === by);
        if (killer) this.creditRookieKill(killer);
      }
    }
  }

  private creditRookieKill(r: Unit) {
    r.unitKills++;
    const next = r.rank + 1;
    if (next < ARMY.rankKills.length && r.unitKills >= ARMY.rankKills[next]) {
      r.rank = next;
      this.applyRookieStats(r);
      r.hp = r.maxHp;
      this.events.push({ type: 'rookiePromoted', unit: r.id, rank: next });
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

  /** Damages the knight or a rookie. Returns the damage actually dealt. */
  private hurtFriendly(p: Unit, amount: number): number {
    if (p.invuln > 0 || p.state === 'dead') return 0;
    const isKnight = p.kind === 'knight';
    if (isKnight && this.god) return 0;
    p.hp -= amount;
    p.invuln = isKnight ? KNIGHT.hurtInvuln : 0.15;
    if (isKnight) this.events.push({ type: 'playerHurt', unit: p.id, damage: amount });
    else this.events.push({ type: 'hit', unit: p.id, by: -1, damage: amount, x: p.x, y: p.y });
    if (p.hp <= 0) {
      p.hp = 0;
      this.setState(p, 'dead');
      if (isKnight) this.events.push({ type: 'playerDied', unit: p.id });
      else {
        this.events.push({ type: 'death', unit: p.id });
        this.recruitIn = Math.max(this.recruitIn, ARMY.respawnDelay);
      }
    }
    return amount;
  }

  /** Nearest living unit of a list. */
  private nearestOf(list: Unit[], x: number, y: number): Unit | null {
    let best: Unit | null = null;
    let bestD = Infinity;
    for (const u of list) {
      if (u.state === 'dead') continue;
      const d = Math.hypot(u.x - x, u.y - y);
      if (d < bestD) {
        bestD = d;
        best = u;
      }
    }
    return best;
  }

  /** Nearest cell of any standing building (whole map; used by phasing monsters). */
  private nearestStandingCell(x: number, y: number): [number, number] | null {
    let best: [number, number] | null = null;
    let bestD = Infinity;
    for (const b of this.buildings) {
      if (b.ruined) continue;
      for (const [i, j] of b.cells) {
        const d = Math.hypot(i - x, j - y);
        if (d < bestD) {
          bestD = d;
          best = [i, j];
        }
      }
    }
    return best;
  }

  /** What the boss module may touch (see sim/boss.ts). Built in the constructor so getters see live state. */
  private bossHost!: BossHost;

  private makeBossHost(): BossHost {
    const w = this;
    return {
    get time() { return w.time; },
    get buildings() { return w.buildings; },
    get events() { return w.events; },
    friendlies: () => [...this.players, ...this.rookies].filter((u) => u.state !== 'dead'),
    nearestFriendlyTo: (x, y) => this.nearestFriendly(x, y),
    hurtFriendlyBy: (t, n) => { this.hurtFriendly(t, n); },
    damageBuildingBy: (b, n, by) => this.damageBuilding(b, n, by),
    adjacentBuildingTo: (m, reach) => this.adjacentBuilding(m, reach),
    spawnFromEdge: (side, kind) => this.spawnMonster(side, kind),
    randomSide: () => this.rng.pick(['top', 'right', 'bottom', 'left'] as const),
    };
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

  /** Nearest living knight or rookie. */
  private nearestFriendly(x: number, y: number): Unit | null {
    let best: Unit | null = null;
    let bestD = Infinity;
    for (const list of [this.players, this.rookies]) {
      for (const p of list) {
        if (p.state === 'dead') continue;
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < bestD) {
          bestD = d;
          best = p;
        }
      }
    }
    return best;
  }

  private friendlyById(id: number): Unit | null {
    if (id < 0) return null;
    for (const list of [this.players, this.rookies]) for (const p of list) if (p.id === id) return p;
    return null;
  }

  // ------------------------------------------------------------------ physics

  /** Soft push-apart between overlapping units. */
  private separate() {
    const all = this.bodyHash;
    all.clear();
    const lists = [this.monsters, this.rookies, this.players];
    for (const list of lists) for (const u of list) if (u.state !== 'dead') all.insert(u);
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
    for (const list of lists) for (const u of list) visit(u);
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
    // Phasing monsters (ghosts) ignore buildings and trees; only the map edge contains them.
    if (u.team === 'enemy' && MONSTERS[u.kind as MonsterKind].phasing) this.keepOnMap(u);
    else this.collideCells(u);
  }

  private keepOnMap(u: Unit) {
    if (inBounds(this.map, Math.round(u.x), Math.round(u.y))) return;
    const c = this.map.centre;
    const d = Math.hypot(c - u.x, c - u.y) || 1;
    u.x += ((c - u.x) / d) * 0.08;
    u.y += ((c - u.y) / d) * 0.08;
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
      rank: 0, unitKills: 0, targetId: -1, retargetIn: 0, postX: x, postY: y,
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

function centreOf(cells: [number, number][]): [number, number] {
  let x = 0;
  let y = 0;
  for (const [i, j] of cells) {
    x += i;
    y += j;
  }
  return [x / cells.length, y / cells.length];
}

function norm(v: Vec2): Vec2 {
  const l = Math.hypot(v.x, v.y);
  return l > 1e-6 ? { x: v.x / l, y: v.y / l } : { x: 0.7071, y: 0.7071 };
}

function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}
