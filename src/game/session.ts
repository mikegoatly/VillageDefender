// One play session = one World plus the options it was started with. A restart (retry, new town,
// back to menu) throws the session away and creates a new one.
//
// URL params (debug / automated play-testing, plan §5.4):
//   ?seed=42   map + spawn seed        ?speed=4   sim speed multiplier
//   ?god=1     knight takes no damage  ?wave=5    start at this wave
//   ?plan=0    skip the planning phase ?town=riverside

import { TOWN_BY_ID, TOWNS, type TownDef } from '../data/towns';
import { Profile } from '../meta/profile';
import { World } from '../sim/world';

export interface Params {
  seed: number;
  speed: number;
  god: boolean;
  wave: number;
  /** ?plan=0 skips the planning phase (automation). */
  plan: boolean;
  /** ?town=riverside picks a town directly (automation/debug). */
  town?: string;
}

/** What a restart may override. */
export interface SessionData {
  seed?: number;
  town?: string;
  menu?: boolean;
}

export interface Session {
  world: World;
  params: Params;
  town: TownDef;
  /** True while the front-end menu is showing over the background town. */
  inMenu: boolean;
}

export function readParams(search: string = location.search): Params {
  const q = new URLSearchParams(search);
  return {
    seed: Number(q.get('seed') ?? Math.floor(Math.random() * 1e6)),
    speed: Number(q.get('speed') ?? 1),
    god: q.get('god') === '1',
    wave: Number(q.get('wave') ?? 1),
    plan: q.get('plan') !== '0',
    town: q.get('town') ?? undefined,
  };
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 1e6);
}

/** The player's persistent profile (coins, unlocks), shared across sessions. */
let profile: Profile | null = null;
export function getProfile(): Profile {
  return (profile ??= new Profile());
}

export function createSession(data: SessionData, profile: Profile, search: string = location.search): Session {
  // The menu shows on a normal launch; URL params (automation, debug links) go straight in.
  const q = new URLSearchParams(search);
  const automation = ['town', 'seed', 'plan', 'wave', 'god'].some((k) => q.has(k));
  const inMenu = data.menu ?? !automation;
  const params = readParams(search);
  if (data.seed !== undefined) params.seed = data.seed;
  // Town: session data (menu / retry) > ?town= > the first town.
  const town = TOWN_BY_ID[data.town ?? params.town ?? ''] ?? TOWNS[0];
  const boosts = profile.boosts();
  const world = new World({
    seed: params.seed, god: params.god, startWave: params.wave,
    planning: params.plan || inMenu, planningPoints: town.planningPoints + boosts.planningPoints,
    allowedRoles: profile.data.roles, townId: town.id, waves: town.waves,
    mapOptions: town.map, cards: profile.data.cards, powers: profile.data.powers, boosts, weaponRanks: profile.weaponRanks(),
    weapon: profile.data.weapons.includes(profile.data.weapon) ? profile.data.weapon : 'sword',
  });
  return { world, params, town, inMenu };
}
