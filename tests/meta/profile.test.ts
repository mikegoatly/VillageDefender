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
