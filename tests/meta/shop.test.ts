import { describe, expect, it } from 'vitest';
import { noBoosts, SHOP, SHOP_BY_ID } from '../../src/data/shop';
import { MAX_WEAPON_RANK, WEAPON_ORDER } from '../../src/data/weapons';
import { Profile } from '../../src/meta/profile';
import { memoryStore } from '../helpers/profile';

const aRichProfile = (coins = 5000) => {
  const store = memoryStore();
  const profile = new Profile(store);
  profile.addCoins(coins);
  return { store, profile };
};

describe('shop boosts', () => {
  it('buying deducts coins, counts the stack and shows in boosts()', () => {
    const { profile } = aRichProfile(250);
    expect(profile.buy('boost-hp')).toEqual({ ok: true });
    expect(profile.data.coins).toBe(150);
    expect(profile.bought('boost-hp')).toBe(1);
    expect(profile.boosts().knightHpMul).toBeCloseTo(1.1);
  });

  it('stacks up to the cost length, then is maxed', () => {
    const { profile } = aRichProfile();
    const max = SHOP_BY_ID['boost-hp'].cost.length;
    for (let i = 0; i < max; i++) expect(profile.buy('boost-hp')).toEqual({ ok: true });
    expect(profile.bought('boost-hp')).toBe(max);
    expect(profile.priceOf('boost-hp')).toBeNull();
    const coins = profile.data.coins;
    expect(profile.buy('boost-hp')).toEqual({ ok: false, reason: 'maxed' });
    expect(profile.data.coins).toBe(coins);
    expect(profile.boosts().knightHpMul).toBeCloseTo(1 + 0.1 * max);
  });

  it('refuses when short of coins and for unknown items', () => {
    const { profile } = aRichProfile(50);
    expect(profile.buy('boost-hp')).toEqual({ ok: false, reason: 'coins' });
    expect(profile.buy('nope')).toEqual({ ok: false, reason: 'unknown' });
    expect(profile.data.coins).toBe(50);
  });

  it('are stored in boostsReady, not purchases, and survive save/load', () => {
    const { store, profile } = aRichProfile();
    profile.buy('boost-hp');
    profile.buy('boost-plan');
    expect(profile.data.boostsReady).toEqual({ 'boost-hp': 1, 'boost-plan': 1 });
    expect(profile.data.purchases).toEqual({});
    const loaded = new Profile(store);
    expect(loaded.data.boostsReady).toEqual({ 'boost-hp': 1, 'boost-plan': 1 });
    expect(loaded.bought('boost-hp')).toBe(1);
    expect(loaded.boosts().planningPoints).toBe(1);
  });

  it('consumeBoosts resets everything, makes them buyable again, and persists', () => {
    const { store, profile } = aRichProfile();
    const max = SHOP_BY_ID['boost-hp'].cost.length;
    for (let i = 0; i < max; i++) profile.buy('boost-hp');
    profile.buy('boost-start');
    profile.consumeBoosts();
    expect(profile.boosts()).toEqual(noBoosts());
    expect(profile.bought('boost-hp')).toBe(0);
    expect(profile.priceOf('boost-hp')).toBe(SHOP_BY_ID['boost-hp'].cost[0]);
    expect(profile.buy('boost-hp')).toEqual({ ok: true });
    profile.consumeBoosts();
    expect(new Profile(store).data.boostsReady).toEqual({});
    expect(new Profile(store).boosts()).toEqual(noBoosts());
  });

  it('consumeBoosts leaves permanent unlocks alone', () => {
    const { profile } = aRichProfile();
    profile.buy('card-arc');
    profile.buy('boost-hp');
    profile.consumeBoosts();
    expect(profile.data.cards).toContain('arc');
    expect(profile.data.purchases['card-arc']).toBe(1);
  });
});

describe('shop unlocks', () => {
  it('a card is added to the pool once, then unavailable', () => {
    const { profile } = aRichProfile();
    expect(profile.data.cards).not.toContain('arc');
    expect(profile.buy('card-arc')).toEqual({ ok: true });
    expect(profile.data.cards.filter((c) => c === 'arc')).toHaveLength(1);
    expect(profile.priceOf('card-arc')).toBeNull();
    expect(profile.buy('card-arc')).toEqual({ ok: false, reason: 'maxed' });
    expect(profile.data.cards.filter((c) => c === 'arc')).toHaveLength(1);
    expect(profile.data.boostsReady).toEqual({});
  });
});

describe('shop catalogue', () => {
  it('never sells roles', () => {
    for (const item of SHOP) expect(item.kind, item.id).not.toBe('role');
  });

  it('never sells weapons', () => {
    for (const item of SHOP) {
      expect(item.kind, item.id).not.toBe('weapon');
      expect(item.id, item.id).not.toMatch(/^(weapon|unlock-weapon)/);
    }
  });

  it('every item has a positive, non-empty cost list and a unique id', () => {
    expect(new Set(SHOP.map((i) => i.id)).size).toBe(SHOP.length);
    for (const item of SHOP) {
      expect(item.cost.length, item.id).toBeGreaterThan(0);
      for (const c of item.cost) expect(c, item.id).toBeGreaterThan(0);
    }
  });
});

describe('weapon ranks (decision 49)', () => {
  it('every weapon has a rank item capped at MAX_WEAPON_RANK', () => {
    for (const w of WEAPON_ORDER) expect(SHOP_BY_ID[`rank-${w}`].cost.length).toBe(MAX_WEAPON_RANK);
  });

  it('a locked weapon cannot be ranked up', () => {
    const { profile } = aRichProfile();
    expect(profile.data.weapons).not.toContain('hammer');
    expect(profile.priceOf('rank-hammer')).toBeNull();
    expect(profile.buy('rank-hammer')).toEqual({ ok: false, reason: 'maxed' });
    expect(profile.weaponRank('hammer')).toBe(0);
  });

  it('ranks are permanent: bought ranks survive save/load and consumeBoosts', () => {
    const { store, profile } = aRichProfile();
    profile.buy('rank-sword');
    profile.buy('rank-sword');
    profile.consumeBoosts();
    const loaded = new Profile(store);
    expect(loaded.weaponRank('sword')).toBe(2);
    expect(loaded.weaponRanks()).toMatchObject({ sword: 2, spear: 0 });
    expect(loaded.priceOf('rank-sword')).toBe(SHOP_BY_ID['rank-sword'].cost[2]);
  });

  it('an unlocked weapon can be ranked to the cap, then is maxed', () => {
    const { profile } = aRichProfile();
    profile.unlockAllWeapons(['axes']);
    for (let i = 0; i < MAX_WEAPON_RANK; i++) expect(profile.buy('rank-axes')).toEqual({ ok: true });
    expect(profile.priceOf('rank-axes')).toBeNull();
    expect(profile.weaponRank('axes')).toBe(MAX_WEAPON_RANK);
  });
});
