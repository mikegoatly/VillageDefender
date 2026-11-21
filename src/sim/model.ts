// Simulation data model: units, buildings, projectiles, gems, events and options.
// Plain data only; behaviour lives in the system modules (see world.ts for the tick order).

import type { MonsterKind } from '../data/monsters';
import type { RookieKind } from '../data/rookies';
import type { RoleKind } from '../data/roles';
import type { WaveDef } from '../data/waves';
import type { WeaponKind } from '../data/weapons';
import type { MetaBoosts } from '../data/shop';
import type { PowerKind } from '../data/upgrades';
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
  /** Lamp post being put out in the current attack (gloom moth), or -1. */
  attackLamp: number;
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
  /** Seconds of stun left (banshee wail, gravekeeper toll): the unit can't move or attack. */
  stun: number;
  /** Banshee: seconds of wail wind-up left (0 = not wailing). */
  windup: number;
  /** Frost shaman: seconds until the next heal. */
  healIn: number;
  /** Frost shaman: where its freeze will land (fixed when the telegraph starts). */
  aimX: number;
  aimY: number;
  /** Gravedigger: travelling underground, out of reach of every weapon. */
  burrowed: boolean;
  /** Seconds of trap slow left, and the fraction of speed it takes away. */
  slowIn: number;
  slowBy: number;
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

/** A lamp post (night towns): lights the road while lit and standing; bosses and brutes knock it over. */
export interface Lamp {
  /** Index into world.lamps. */
  id: number;
  x: number;
  y: number;
  /** 0 = knocked over (broken, dark for good). */
  hp: number;
  maxHp: number;
  /** Burning now. */
  lit: boolean;
  /** Inside the town, lit from the start; posts out on the approaches start dark and take lamp oil. */
  startsLit: boolean;
  /** Put out by gloom moths (hp 0 but still standing, unlike one knocked over). */
  snuffed?: boolean;
}

/** A burning patch where a Pumpkin King's pumpkin landed: hurts friendlies in it and is a light (night towns). */
export interface Fire {
  id: number;
  x: number;
  y: number;
  /** Friendlies within this (plus their own radius) are burnt. */
  radius: number;
  /** World time it burns out. */
  until: number;
  /** Seconds until the next burn. */
  pulseIn: number;
}

/** A set trap (decision 52): hurts monsters in its radius until its damage budget is spent. */
export interface Trap {
  id: number;
  x: number;
  y: number;
  radius: number;
  /** Damage it can still deal (counted before the boss reduction). */
  budget: number;
  maxBudget: number;
  /** Seconds until the next damage pulse. */
  pulseIn: number;
  /** Slows monsters inside by this fraction (0..1). */
  slow: number;
}

/** The villager on their way to set a trap, then busy setting it. */
export interface TrapRunner {
  id: number;
  x: number;
  y: number;
  /** Where the trap goes (where the knight stood when it was called). */
  tx: number;
  ty: number;
  /** Seconds of setting left once there; null while still running. */
  setLeft: number | null;
  /** Seconds the setting takes in all (set on arrival), for the progress bar. */
  setTotal: number;
  facing: { x: number; y: number };
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
  | { type: 'trapCalled'; runner: number; x: number; y: number }
  | { type: 'trapSet'; trap: number; x: number; y: number; radius: number }
  | { type: 'trapPulse'; trap: number; x: number; y: number; radius: number }
  | { type: 'trapSpent'; trap: number; x: number; y: number; radius: number }
  | { type: 'trapRunnerDown'; runner: number; x: number; y: number }
  | { type: 'monsterRaised'; unit: number; by: number; x: number; y: number }
  | { type: 'fuseLit'; unit: number; x: number; y: number; radius: number; time: number }
  | { type: 'explosion'; unit: number; x: number; y: number; radius: number }
  | { type: 'bossSpawn'; unit: number }
  | { type: 'bossSlamWarn'; unit: number; x: number; y: number; radius: number; time: number }
  | { type: 'bossSlam'; unit: number; x: number; y: number; radius: number }
  | { type: 'bossCharge'; unit: number; building: number }
  | { type: 'bossBoulderWarn'; unit: number; x: number; y: number; radius: number; time: number; pumpkin?: true }
  | { type: 'bossBoulder'; unit: number; x: number; y: number; radius: number; pumpkin?: true }
  | { type: 'fireStart'; fire: number; x: number; y: number; radius: number; time: number }
  | { type: 'blackoutWarn'; unit: number; time: number }
  | { type: 'blackout'; time: number }
  | { type: 'lightsBack' }
  | { type: 'bossSummon'; unit: number; count: number; side: Side }
  | { type: 'wailWarn'; unit: number; x: number; y: number; radius: number; time: number }
  | { type: 'wail'; unit: number; x: number; y: number; radius: number }
  | { type: 'monsterSurfaced'; unit: number; x: number; y: number }
  | { type: 'kegPlanted'; unit: number; by: number; x: number; y: number }
  | { type: 'monsterSplit'; unit: number; from: number; x: number; y: number }
  | { type: 'monstersHealed'; unit: number; x: number; y: number; radius: number; healed: number[] }
  | { type: 'freezeWarn'; unit: number; x: number; y: number; radius: number; time: number }
  | { type: 'freeze'; unit: number; x: number; y: number; radius: number }
  | { type: 'iceStomp'; unit: number; x: number; y: number; radius: number; time: number }
  | { type: 'lampBroken'; lamp: number; x: number; y: number }
  | { type: 'lampHit'; lamp: number; x: number; y: number }
  | { type: 'lampSnuffed'; lamp: number; x: number; y: number }
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
  /** Powers unlocked for the run (decision 52); none by default. */
  powers?: PowerKind[];
  /** Night towns: lamp posts that may be lit while planning (TownDef.lampOil); 0 by default. */
  lampOil?: number;
}

export interface PendingWave {
  wave: number;
  at: number;
  sides: Side[];
  warned: boolean;
}

