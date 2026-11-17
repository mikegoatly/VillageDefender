import { describe, expect, it } from 'vitest';
import { STARTING_ROLES } from '../../src/data/roles';
import { Profile } from '../../src/meta/profile';
import { aRun, memoryStore } from '../helpers/profile';

const aProfile = () => {
  const store = memoryStore();
  return { store, profile: new Profile(store) };
};

describe('fresh profile', () => {
  it('has the starting roles, no coins and no achievements', () => {
    const { profile } = aProfile();
    expect(profile.data.roles).toEqual(STARTING_ROLES);
    expect(profile.data.coins).toBe(0);
    expect(profile.data.achievements).toEqual([]);
    expect(profile.data.stats).toEqual({ runs: 0, wins: 0, kills: {} });
    expect(profile.hasRole('barracks')).toBe(true);
    expect(profile.hasRole('smithy')).toBe(false);
  });
});

describe('recordRun', () => {
  it('adds coins and lifetime stats', () => {
    const { profile } = aProfile();
    profile.recordRun(aRun({ coins: 40, kills: { zombie: 10, brute: 1 } }));
    const out = profile.recordRun(aRun({ coins: 25, won: true, stars: 1, kills: { zombie: 5 } }));
    expect(out.coins).toBe(25);
    expect(profile.data.coins).toBe(65);
    expect(profile.data.stats).toEqual({ runs: 2, wins: 1, kills: { zombie: 15, brute: 1 } });
  });

  it('tracks best stars per town, flagging only improvements', () => {
    const { profile } = aProfile();
    expect(profile.recordRun(aRun({ won: true, stars: 2 })).newBest).toBe(true);
    expect(profile.data.bestStars.village).toBe(2);
    expect(profile.recordRun(aRun({ won: true, stars: 1 })).newBest).toBe(false);
    expect(profile.recordRun(aRun({ won: true, stars: 2 })).newBest).toBe(false);
    expect(profile.data.bestStars.village).toBe(2);
    expect(profile.recordRun(aRun({ won: true, stars: 3 })).newBest).toBe(true);
    expect(profile.data.bestStars.village).toBe(3);
  });

  it('a loss with zero stars is not a new best', () => {
    const { profile } = aProfile();
    expect(profile.recordRun(aRun()).newBest).toBe(false);
    expect(profile.data.bestStars.village).toBeUndefined();
  });
});

describe('achievements', () => {
  it('first win unlocks the smithy', () => {
    const { profile } = aProfile();
    const out = profile.recordRun(aRun({ won: true, stars: 1 }));
    expect(out.newAchievements.map((a) => a.id)).toEqual(['first-win']);
    expect(out.unlockedRoles).toEqual(['smithy']);
    expect(profile.hasRole('smithy')).toBe(true);
    expect(profile.hasRole('watchtower')).toBe(false);
  });

  it('a lost run unlocks nothing', () => {
    const { profile } = aProfile();
    const out = profile.recordRun(aRun({ stars: 0 }));
    expect(out.newAchievements).toEqual([]);
    expect(out.unlockedRoles).toEqual([]);
  });

  it('three stars unlocks the watchtower (and the first win with it)', () => {
    const { profile } = aProfile();
    const out = profile.recordRun(aRun({ won: true, stars: 3 }));
    expect(out.newAchievements.map((a) => a.id).sort()).toEqual(['first-win', 'three-stars']);
    expect(out.unlockedRoles.sort()).toEqual(['smithy', 'watchtower']);
  });

  it('brute slayer counts brutes across runs', () => {
    const { profile } = aProfile();
    expect(profile.recordRun(aRun({ kills: { brute: 6 } })).newAchievements).toEqual([]);
    const out = profile.recordRun(aRun({ kills: { brute: 4 } }));
    expect(out.newAchievements.map((a) => a.id)).toEqual(['brute-slayer']);
    expect(out.unlockedRoles).toEqual([]);
  });

  it('seasoned needs knight level 8', () => {
    const { profile } = aProfile();
    expect(profile.recordRun(aRun({ knightLevel: 7 })).newAchievements).toEqual([]);
    expect(profile.recordRun(aRun({ knightLevel: 8 })).newAchievements.map((a) => a.id)).toEqual(['seasoned']);
  });

  it('are only awarded once', () => {
    const { profile } = aProfile();
    profile.recordRun(aRun({ won: true, stars: 3, knightLevel: 9, kills: { brute: 10 } }));
    const again = profile.recordRun(aRun({ won: true, stars: 3, knightLevel: 9, kills: { brute: 10 } }));
    expect(again.newAchievements).toEqual([]);
    expect(again.unlockedRoles).toEqual([]);
    expect(profile.data.achievements.slice().sort()).toEqual(['brute-slayer', 'first-win', 'seasoned', 'three-stars']);
    expect(profile.data.roles.filter((r) => r === 'smithy')).toHaveLength(1);
  });

  it('carry the achievement name and description', () => {
    const { profile } = aProfile();
    const [a] = profile.recordRun(aRun({ won: true, stars: 1 })).newAchievements;
    expect(a).toEqual({ id: 'first-win', name: 'Defender', description: 'Save a town' });
  });
});

describe('persistence', () => {
  it('round-trips through the store', () => {
    const { store, profile } = aProfile();
    profile.recordRun(aRun({ won: true, stars: 3, coins: 80, kills: { zombie: 30 } }));
    const loaded = new Profile(store);
    expect(loaded.data).toEqual(profile.data);
    expect(loaded.data.coins).toBe(80);
    expect(loaded.hasRole('watchtower')).toBe(true);
  });

  it('falls back to a fresh profile on corrupt JSON', () => {
    const { store, profile } = aProfile();
    profile.addCoins(5);
    for (const k of store.data.keys()) store.data.set(k, '{not json');
    const loaded = new Profile(store);
    expect(loaded.data.coins).toBe(0);
    expect(loaded.data.roles).toEqual(STARTING_ROLES);
  });

  it('always includes the starting roles when loading', () => {
    const { store, profile } = aProfile();
    profile.save();
    for (const k of store.data.keys()) store.data.set(k, JSON.stringify({ version: 1, coins: 7, roles: ['smithy'] }));
    const loaded = new Profile(store);
    expect(loaded.data.coins).toBe(7);
    expect(loaded.data.roles.slice().sort()).toEqual(['barracks', 'chapel', 'smithy']);
    expect(loaded.data.stats).toEqual({ runs: 0, wins: 0, kills: {} });
  });

  it('survives an empty object', () => {
    const { store, profile } = aProfile();
    profile.save();
    for (const k of store.data.keys()) store.data.set(k, '{}');
    expect(new Profile(store).data.roles).toEqual(STARTING_ROLES);
  });
});

describe('debug helpers', () => {
  it('addCoins adds and saves', () => {
    const { store, profile } = aProfile();
    profile.addCoins(50);
    expect(profile.data.coins).toBe(50);
    expect(new Profile(store).data.coins).toBe(50);
  });

  it('unlockAll adds roles without duplicates', () => {
    const { store, profile } = aProfile();
    profile.unlockAll(['smithy', 'watchtower', 'barracks']);
    expect(profile.data.roles.slice().sort()).toEqual(['barracks', 'chapel', 'smithy', 'watchtower']);
    expect(new Profile(store).hasRole('watchtower')).toBe(true);
  });

  it('reset returns to a fresh, saved profile', () => {
    const { store, profile } = aProfile();
    profile.recordRun(aRun({ won: true, stars: 3, coins: 10 }));
    profile.reset();
    expect(profile.data.coins).toBe(0);
    expect(profile.data.achievements).toEqual([]);
    expect(profile.data.roles).toEqual(STARTING_ROLES);
    expect(new Profile(store).data.coins).toBe(0);
  });
});

describe('weapon unlocks', () => {
  it('a fresh profile has only the sword, selected', () => {
    const { profile } = aProfile();
    expect(profile.data.weapons).toEqual(['sword']);
    expect(profile.data.weapon).toBe('sword');
  });

  it.each([
    ['brute slayer (10 brutes)', { kills: { brute: 10 } }, 'brute-slayer', 'hammer'],
    ['kingslayer (the Warlord, town 1)', { kills: { warlord: 1 } }, 'kingslayer', 'flail'],
    ['troll hunter (the River Troll, town 2)', { kills: { troll: 1 } }, 'troll-hunter', 'spear'],
    ['rest in peace (the Gravekeeper, town 3)', { kills: { gravekeeper: 1 } }, 'grave-keeper', 'axes'],
  ] as const)('%s unlocks a weapon', (_name, run, id, weapon) => {
    const { profile } = aProfile();
    const out = profile.recordRun(aRun(run));
    expect(out.newAchievements.map((a) => a.id)).toEqual([id]);
    expect(out.unlockedWeapons).toEqual([weapon]);
    expect(out.unlockedRoles).toEqual([]);
    expect(profile.data.weapons).toEqual(['sword', weapon]);
  });

  it('levelling up and holding waves does not unlock weapons; bosses do', () => {
    const { profile } = aProfile();
    expect(profile.recordRun(aRun({ wave: 10, knightLevel: 12 })).unlockedWeapons).toEqual([]);
  });

  it('beating town 1 earns only the flail', () => {
    const { profile } = aProfile();
    const out = profile.recordRun(aRun({ won: true, stars: 1, knightLevel: 9, wave: 10, kills: { warlord: 1, brute: 5 } }));
    expect(out.unlockedWeapons).toEqual(['flail']);
  });

  it('brutes count across runs toward the hammer', () => {
    const { profile } = aProfile();
    expect(profile.recordRun(aRun({ kills: { brute: 9 } })).unlockedWeapons).toEqual([]);
    expect(profile.recordRun(aRun({ kills: { brute: 1 } })).unlockedWeapons).toEqual(['hammer']);
  });

  it('weapons are only reported once', () => {
    const { profile } = aProfile();
    profile.recordRun(aRun({ kills: { warlord: 1 } }));
    const again = profile.recordRun(aRun({ kills: { warlord: 1 } }));
    expect(again.unlockedWeapons).toEqual([]);
    expect(profile.data.weapons.slice().sort()).toEqual(['flail', 'sword']);
  });

  it('a big run reports every weapon it earns', () => {
    const { profile } = aProfile();
    const out = profile.recordRun(aRun({ won: true, stars: 3, kills: { brute: 12, warlord: 1, troll: 1, gravekeeper: 1 } }));
    expect(out.unlockedWeapons.slice().sort()).toEqual(['axes', 'flail', 'hammer', 'spear']);
  });
});

describe('weapon choice', () => {
  it('setWeapon selects an unlocked weapon and persists it', () => {
    const { store, profile } = aProfile();
    profile.recordRun(aRun({ kills: { warlord: 1 } }));
    profile.setWeapon('flail');
    expect(profile.data.weapon).toBe('flail');
    expect(new Profile(store).data.weapon).toBe('flail');
  });

  it('setWeapon ignores a weapon that is still locked', () => {
    const { profile } = aProfile();
    profile.setWeapon('axes');
    expect(profile.data.weapon).toBe('sword');
  });

  it('unlockAllWeapons adds every weapon once and saves', () => {
    const { store, profile } = aProfile();
    profile.unlockAllWeapons(['spear', 'hammer', 'axes', 'flail', 'sword']);
    expect(profile.data.weapons.slice().sort()).toEqual(['axes', 'flail', 'hammer', 'spear', 'sword']);
    profile.setWeapon('flail');
    expect(new Profile(store).data.weapon).toBe('flail');
    expect(new Profile(store).data.weapons).toHaveLength(5);
  });

  it('reset goes back to the sword only', () => {
    const { profile } = aProfile();
    profile.unlockAllWeapons(['spear']);
    profile.setWeapon('spear');
    profile.reset();
    expect(profile.data.weapons).toEqual(['sword']);
    expect(profile.data.weapon).toBe('sword');
  });

  it('old saves without weapons still load, with the sword', () => {
    const { store, profile } = aProfile();
    profile.save();
    for (const k of store.data.keys()) store.data.set(k, JSON.stringify({ version: 1, coins: 12, roles: ['smithy'], achievements: ['first-win'], bestStars: { village: 2 } }));
    const loaded = new Profile(store);
    expect(loaded.data.coins).toBe(12);
    expect(loaded.data.weapons).toEqual(['sword']);
    expect(loaded.data.weapon).toBe('sword');
    expect(loaded.data.bestStars.village).toBe(2);
  });

  it('a save missing the sword still gets it back', () => {
    const { store, profile } = aProfile();
    profile.save();
    for (const k of store.data.keys()) store.data.set(k, JSON.stringify({ version: 1, weapons: ['axes'], weapon: 'axes' }));
    const loaded = new Profile(store);
    expect(loaded.data.weapons.slice().sort()).toEqual(['axes', 'sword']);
    expect(loaded.data.weapon).toBe('axes');
  });

  it('unlocks from an old save are kept when new ones arrive', () => {
    const { store, profile } = aProfile();
    profile.save();
    for (const k of store.data.keys()) store.data.set(k, JSON.stringify({ version: 1, weapons: ['sword', 'spear'], achievements: ['seasoned'] }));
    const loaded = new Profile(store);
    const out = loaded.recordRun(aRun({ kills: { warlord: 1 } }));
    expect(out.unlockedWeapons).toEqual(['flail']);
    expect(loaded.data.weapons).toEqual(['sword', 'spear', 'flail']);
  });
});

describe('trap power', () => {
  it('a new profile has no powers', () => {
    const { profile } = aProfile();
    expect(profile.data.powers).toEqual([]);
  });

  it('reaching wave 6 unlocks the trap power, once', () => {
    const { profile } = aProfile();
    expect(profile.recordRun(aRun({ wave: 5 })).unlockedPowers).toEqual([]);
    const out = profile.recordRun(aRun({ wave: 6 }));
    expect(out.unlockedPowers).toEqual(['trap']);
    expect(profile.data.powers).toEqual(['trap']);
    expect(profile.recordRun(aRun({ wave: 8 })).unlockedPowers).toEqual([]);
  });

  it('an old save without powers loads with none, and keeps them once saved', () => {
    const { store, profile } = aProfile();
    profile.save();
    for (const k of store.data.keys()) store.data.set(k, JSON.stringify({ version: 1 }));
    const loaded = new Profile(store);
    expect(loaded.data.powers).toEqual([]);
    loaded.recordRun(aRun({ wave: 6 }));
    expect(new Profile(store).data.powers).toEqual(['trap']);
  });
});

describe('trap power migration', () => {
  it('a save that already earned Holding the line gets the trap power when it loads', () => {
    const { store, profile } = aProfile();
    profile.save();
    for (const k of store.data.keys()) store.data.set(k, JSON.stringify({ version: 1, achievements: ['hold-the-line'] }));
    expect(new Profile(store).data.powers).toEqual(['trap']);
  });
});
