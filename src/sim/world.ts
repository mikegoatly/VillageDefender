// The game simulation. Fixed timestep, deterministic for a given seed and input sequence.
// No rendering or DOM: render3d/ reads this state, input/ feeds InputState in.

import { BUILDING, DT, STARS, WAVES } from '../data/balance';
import type { MonsterKind } from '../data/monsters';
import { ROLE_EFFECTS, ROLES, type RoleKind } from '../data/roles';
import { ARMY, type RookieKind } from '../data/rookies';
import { COINS } from '../data/towns';
import { noBoosts, type MetaBoosts } from '../data/shop';
import type { PowerKind, UpgradeHost } from '../data/upgrades';
import { TOWN1_WAVES, type WaveDef } from '../data/waves';
import { rankedWeapon, type WeaponDef, type WeaponKind } from '../data/weapons';
import type { RunResult } from '../data/achievements';
import { debugAddRookie, debugEnd, debugGiveUpgrade, debugGiveXp, debugHealKnight, debugSetWeapon, debugInfo, debugJumpToWave, debugKillAll, debugSetBuildingHp, debugSpawn } from './debug';
import { FlowField } from './flowField';
import { updateGems } from './gems';
import { makeKnight, updateKnight, updateRally } from './knight';
import { generateTown, isWadeable, type Side, type TownMap } from './map';
import { reapMonsters, updateFlowFields, updateMonster } from './monsters';
import { Pather } from './pather';
import { integrate, separate } from './physics';
import { Progression } from './progression';
import { updateProjectiles } from './projectiles';
import { nearestMonster, rebuildEnemyHash } from './queries';
import { Rng } from './rng';
import { reapRookies, updateRecruitment, updateRookie } from './rookies';
import { makeRookie } from './rookieStats';
import { SpatialHash } from './spatialHash';
import { updateTraps } from './traps';
import { applyMods, updateTown } from './town';
import type { InputState } from './types';
import { centreOf } from './units';
import { addMonster, pickSides, updateWaves } from './waves';

export type { BuildingState, Gem, PendingWave, Projectile, SimEvent, Trap, TrapRunner, Unit, UnitKind, UnitState, WorldOptions } from './model';
import type { BuildingState, Gem, PendingWave, Projectile, SimEvent, Trap, TrapRunner, Unit, WorldOptions } from './model';

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
  /** Trap power (decision 52): set traps, villagers on their way to set one, and the cooldown. */
  readonly traps: Trap[] = [];
  readonly trapRunners: TrapRunner[] = [];
  trapCooldown = 0;
  /** @internal */ trapHeld = false;
  /** Powers unlocked for this run. */
  readonly powers: PowerKind[];
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
  /** Shop ranks per weapon (decision 49). */
  readonly weaponRanks: Partial<Record<WeaponKind, number>>;
  private rankedDef: WeaponDef | null = null;
  private rankedRank = 0;

  /** @internal */ nextId = 1;
  /** @internal */ readonly rng: Rng;
  /** Toward the (first living) knight. @internal */
  readonly knightFlow: FlowField;
  /** Toward the nearest walkable cell next to any standing building. @internal */
  readonly buildingFlow: FlowField;
  /** @internal */ buildingFlowDirty = true;
  /** Like buildingFlow, but through river water (waders, decision 45). Computed only when a wader is alive. @internal */
  readonly wadeFlow: FlowField;
  /** @internal */ wadeFlowDirty = true;
  /** Permanent shop boosts for this run (decision 43). */
  readonly boosts: MetaBoosts;
  private startBoostsApplied = false;
  /** Building id per cell, -1 for none. Ruined buildings keep their cells (rubble blocks). */
  private readonly cellBuilding: Int32Array;
  /** Per cell: world time until which the Frost Giant's stomp keeps it iced over. @internal */
  readonly frostUntil: Float32Array;
  /** Living shieldbearers (monsters with a ward), rebuilt with the enemy hash. @internal */
  readonly wards: Unit[] = [];
  /** Living monsters only, rebuilt at the start of each tick (targeting and hits). @internal */
  readonly enemyHash = new SpatialHash<Unit>(1);
  /** Every living unit, rebuilt before separation (physics only). @internal */
  readonly bodyHash = new SpatialHash<Unit>(1);
  /** @internal */ readonly pathers = new Map<number, Pather>();
  /** @internal */ readonly waves: WaveDef[];
  /** @internal */ pending: PendingWave | null;
  /** @internal */ spawnQueue: { at: number; side: Side; kind: MonsterKind }[] = [];
  /** Players take no damage (debug; mutable at runtime). */
  god: boolean;
  /** @internal */ readonly noWaves: boolean;
  /** @internal */ readonly noRookies: boolean;
  /** Rookies recruited so far (including fallen ones). @internal */
  recruited = 0;
  /** Respawn timer for the next recruit. @internal */
  recruitIn = 0;
  /** @internal */ rallyHeld = false;

  constructor(opts: WorldOptions) {
    this.rng = new Rng(opts.seed * 7919 + 17);
    this.powers = [...(opts.powers ?? [])];
    this.progression = new Progression(new Rng(opts.seed * 104729 + 3), opts.cards, this.powers);
    this.map = opts.map ?? generateTown(opts.seed, opts.mapOptions);
    this.knightFlow = new FlowField(this.map);
    this.buildingFlow = new FlowField(this.map);
    this.wadeFlow = new FlowField(this.map, isWadeable);
    this.boosts = { ...noBoosts(), ...opts.boosts };
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
    this.weaponRanks = { ...(opts.weaponRanks ?? {}) };

    this.frostUntil = new Float32Array(this.map.size * this.map.size);
    this.cellBuilding = new Int32Array(this.map.size * this.map.size).fill(-1);
    this.buildings = this.map.buildings.map((b) => {
      // One wall block per storey per cell, plus one roof per cell. Every building counts the same
      // toward stars, so size adds HP only gently: base + a bonus per extra wall block.
      const wallBlocks = Math.max(1, b.blocks.length - b.cells.length);
      const hp = BUILDING.baseHp + (wallBlocks - 1) * BUILDING.hpPerExtraBlock;
      for (const [i, j] of b.cells) this.cellBuilding[j * this.map.size + i] = b.id;
      const max = hp * this.boosts.buildingHpMul;
      return { id: b.id, hp: max, maxHp: max, baseMaxHp: max, ruined: false, cells: b.cells, lastHit: -1, shotIn: 0, role: null, towerShotIn: 0 };
    });

    const c = this.map.centre;
    const n = opts.players ?? 1;
    for (let p = 0; p < n; p++) {
      // Stand on the road just south-east of the crossroads.
      this.players.push(makeKnight(this, c + 0.5 + p * 0.6, c + 2.5));
    }
    const first = Math.min(Math.max(1, opts.startWave ?? 1), this.totalWaves);
    this.wave = first - 1;
    this.pending = { wave: first, at: WAVES.firstAt, sides: pickSides(this, first), warned: false };
    if (this.phase === 'running') this.applyStartBoosts();
  }

  // ------------------------------------------------------------------ queries

  hasPower(power: PowerKind): boolean {
    return this.powers.includes(power);
  }

  standingBuildings(): number {
    let n = 0;
    for (const b of this.buildings) if (!b.ruined) n++;
    return n;
  }

  /** True when at least one building still stands (cheaper than counting). */
  hasStandingBuilding(): boolean {
    for (const b of this.buildings) if (!b.ruined) return true;
    return false;
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
    this.applyStartBoosts();
  }

  /** Start-of-run boosts (once): starting level-ups. Knight and building HP boosts apply at creation. */
  private applyStartBoosts() {
    if (this.startBoostsApplied) return;
    this.startBoostsApplied = true;
    this.progression.grantLevels(this.boosts.startLevels);
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
    return this.monsters.find((m) => m.boss && m.state !== 'dead') ?? null;
  }

  /** The current weapon at its shop rank (cached; it only changes during planning). */
  get weaponDef(): WeaponDef {
    const rank = this.weaponRanks[this.weapon] ?? 0;
    if (this.rankedDef?.kind !== this.weapon || this.rankedRank !== rank) {
      this.rankedDef = rankedWeapon(this.weapon, rank);
      this.rankedRank = rank;
    }
    return this.rankedDef;
  }

  get weaponRank(): number {
    return this.weaponRanks[this.weapon] ?? 0;
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
    applyMods(this);
  }

  healKnights(amount: number) {
    for (const p of this.players) if (p.state !== 'dead') p.hp = Math.min(p.maxHp, p.hp + amount);
  }

  repairBuildings(fraction: number) {
    for (const b of this.buildings) if (!b.ruined) b.hp = Math.min(b.maxHp, b.hp + b.maxHp * fraction);
  }

  // ------------------------------------------------------------------ tick

  tick(inputs: InputState[]) {
    this.events = [];
    if (this.status !== 'playing' || this.choosing || this.phase !== 'running') return;
    this.time += DT;
    this.tickCount++;

    rebuildEnemyHash(this);
    this.players.forEach((p, k) => updateKnight(this, p, inputs[k]));
    updateRally(this, inputs[0]);
    updateTraps(this, inputs[0]);
    updateRecruitment(this);
    for (const r of this.rookies) updateRookie(this, r);
    updateFlowFields(this);
    updateWaves(this);
    for (const m of this.monsters) updateMonster(this, m);
    updateProjectiles(this);
    updateTown(this);

    separate(this);
    for (const u of this.players) integrate(this, u);
    for (const r of this.rookies) integrate(this, r);
    for (const m of this.monsters) integrate(this, m);
    updateGems(this);

    // Remove corpses once their death animation has played.
    reapMonsters(this);
    reapRookies(this);


    this.checkEnd();
  }

  private checkEnd() {
    if (this.players.every((p) => p.state === 'dead')) return this.end(false, 'knight');
    if (this.buildings.length > 0 && this.standingBuildings() === 0) return this.end(false, 'town');
    if (this.noWaves) return;
    const allSpawned = this.pending === null && this.spawnQueue.length === 0;
    if (allSpawned && this.monsters.every((m) => m.state === 'dead')) this.end(true, null);
  }

  /** @internal */ end(won: boolean, reason: 'knight' | 'town' | null) {
    this.status = won ? 'won' : 'lost';
    this.lossReason = reason;
    this.stars = won ? this.starsFor(this.standingBuildings()) : 0;
    if (won) this.coins += COINS.perWaveCleared * this.totalWaves + COINS.perStar * this.stars;
    this.events.push({ type: 'levelEnd', won, stars: this.stars, reason });
  }

  /** Adds a monster at a ground position. Public for tests and debug tools. */
  addMonster(x: number, y: number, kind: MonsterKind = 'zombie'): Unit { return addMonster(this, x, y, kind); }

  /** Adds a rookie at a ground position. Public for tests and debug tools. */
  addRookie(x: number, y: number, kind: RookieKind = 'swordsman'): Unit {
    const r = makeRookie(this, kind, x, y);
    this.rookies.push(r);
    return r;
  }

  // ------------------------------------------------------------------ debug
  // Used by the in-game debug panel (src/ui/DebugPanel.ts). Not used by normal play.

  /** Spawns monsters at a ground point (spread slightly) or along a map edge. */
  debugSpawn(kind: MonsterKind, count: number, at: Side | { x: number; y: number }) { return debugSpawn(this, kind, count, at); }

  debugGiveXp(amount: number) { return debugGiveXp(this, amount); }

  /** Takes one stack of an upgrade without a level-up. Returns false when maxed/unknown. */
  debugGiveUpgrade(id: string): boolean { return debugGiveUpgrade(this, id); }

  debugAddRookie(kind: RookieKind) { return debugAddRookie(this, kind); }

  debugHealKnight() { return debugHealKnight(this); }
  debugSetWeapon(kind: WeaponKind, rank: number) { return debugSetWeapon(this, kind, rank); }

  /** Next wave becomes `wave`, arriving after its normal warning. */
  debugJumpToWave(wave: number) { return debugJumpToWave(this, wave); }

  /** Kills every living monster (they drop gems as usual). */
  debugKillAll() { return debugKillAll(this); }

  /** Sets a building's HP fraction (0 destroys it, 1 repairs it). */
  debugSetBuildingHp(id: number, fraction: number) { return debugSetBuildingHp(this, id, fraction); }

  debugEnd(won: boolean) { return debugEnd(this, won); }

  /** Read-only views of internal state for debug overlays. */
  debugInfo() { return debugInfo(this); }

  // ------------------------------------------------------------------ system delegates

  nearestMonster(x: number, y: number, range: number): Unit | null { return nearestMonster(this, x, y, range); }
}
