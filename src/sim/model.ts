// Simulation data model: units, buildings, projectiles, gems, events and options.
// Plain data only; behaviour lives in the system modules (see world.ts for the tick order).

import type { MonsterKind } from '../data/monsters';
import type { RookieKind } from '../data/rookies';
import type { RoleKind } from '../data/roles';
import type { WaveDef } from '../data/waves';
import type { WeaponKind } from '../data/weapons';
import type { MetaBoosts } from '../data/shop';
import type { BossState } from './bossState';
import type { MapOptions, Side, TownMap } from './map';
import type { Vec2 } from './types';

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
  /** Sprinting monsters (vampire lunge, necromancer flee): seconds of sprint left, and its cooldown. */
  burstTime: number;
  burstCooldown: number;
  /** Necromancer: seconds until the next raise. Sapper: seconds of fuse left (0 = not lit). */
  abilityIn: number;
  /** Id of the necromancer that raised this monster (raised monsters give no xp or coins). */
  raisedBy?: number;
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
  /** arrow: friendly shot; axe: thrown axe; bolt: a monster's lobbed arrow (lands at tx, ty). */
  kind: 'arrow' | 'axe' | 'bolt';
  /** Bolt: the building it is aimed at (-1 or missing = aimed at a unit). It lands when ttl runs out. */
  building?: number;
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
  | { type: 'monsterRaised'; unit: number; by: number; x: number; y: number }
  | { type: 'fuseLit'; unit: number; x: number; y: number; radius: number; time: number }
  | { type: 'explosion'; unit: number; x: number; y: number; radius: number }
  | { type: 'bossSpawn'; unit: number }
  | { type: 'bossSlamWarn'; unit: number; x: number; y: number; radius: number; time: number }
  | { type: 'bossSlam'; unit: number; x: number; y: number; radius: number }
  | { type: 'bossCharge'; unit: number; building: number }
  | { type: 'bossBoulderWarn'; unit: number; x: number; y: number; radius: number; time: number }
  | { type: 'bossBoulder'; unit: number; x: number; y: number; radius: number }
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
  /** Level-up cards that may be offered (decision 44); defaults to all. */
  cards?: string[];
  /** Shop ranks per weapon (decision 49); missing means rank 0. */
  weaponRanks?: Partial<Record<WeaponKind, number>>;
  /** Permanent shop boosts (decision 43); defaults to none. */
  boosts?: Partial<MetaBoosts>;
  /** Basic attack (decision 39); defaults to the sword. */
  weapon?: WeaponKind;
}

export interface PendingWave {
  wave: number;
  at: number;
  sides: Side[];
  warned: boolean;
}

