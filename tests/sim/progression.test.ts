import { describe, expect, it, vi } from 'vitest';
import { UPGRADES } from '../../src/data/upgrades';
import { Progression, xpToNext } from '../../src/sim/progression';
import { Rng } from '../../src/sim/rng';

const host = () => ({ healKnights: vi.fn(), repairBuildings: vi.fn() });
const aProgression = (seed = 1) => new Progression(new Rng(seed));
/** Marks every upgrade except `keep` as fully taken. */
function maxAllExcept(p: Progression, keep: string[]) {
  for (const u of UPGRADES) if (!keep.includes(u.id)) p.levels[u.id] = u.max;
}

describe('xpToNext', () => {
  it('follows round(5 * 1.3^(level-1))', () => {
    expect([1, 2, 3, 4, 5].map(xpToNext)).toEqual([5, 7, 8, 11, 14]);
  });

  it('never decreases as the level rises', () => {
    for (let l = 1; l < 30; l++) expect(xpToNext(l + 1)).toBeGreaterThanOrEqual(xpToNext(l));
  });

  it('is exposed on the instance for the current level', () => {
    const p = aProgression();
    expect(p.xpToNext).toBe(5);
    p.addXp(5);
    expect(p.xpToNext).toBe(7);
  });
});

describe('addXp', () => {
  it('accumulates below the threshold without a choice', () => {
    const p = aProgression();
    expect(p.addXp(4)).toBe(0);
    expect(p.level).toBe(1);
    expect(p.xp).toBe(4);
    expect(p.offers).toBeNull();
  });

  it('levels up at the threshold, carries the remainder and opens 3 offers', () => {
    const p = aProgression();
    expect(p.addXp(7)).toBe(1);
    expect(p.level).toBe(2);
    expect(p.xp).toBe(2);
    expect(p.offers).toHaveLength(3);
  });

  it('a big pickup gains several levels at once', () => {
    const p = aProgression();
    expect(p.addXp(5 + 7 + 8 + 3)).toBe(3);
    expect(p.level).toBe(4);
    expect(p.xp).toBe(3);
  });

  it('keeps the open offers when more XP arrives mid-choice', () => {
    const p = aProgression();
    p.addXp(5);
    const offers = p.offers;
    p.addXp(1);
    expect(p.offers).toBe(offers);
  });
});

describe('offers', () => {
  it('are 3 distinct upgrades with name, description, pool and level', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const p = aProgression(seed);
      p.addXp(5);
      const ids = p.offers!.map((o) => o.id);
      expect(new Set(ids).size, `seed ${seed}`).toBe(3);
      for (const o of p.offers!) {
        expect(o.name).toBeTruthy();
        expect(o.description).toBeTruthy();
        expect(['knight', 'army', 'town']).toContain(o.pool);
        expect(o.level).toBe(0);
      }
    }
  });

  it('are deterministic for a seed', () => {
    const a = aProgression(9);
    const b = aProgression(9);
    a.addXp(5);
    b.addXp(5);
    expect(a.offers).toEqual(b.offers);
  });

  it('never include a maxed upgrade', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const p = aProgression(seed);
      p.levels.blade = 5;
      p.levels.swift = 5;
      p.levels.walls = 3;
      for (let k = 0; k < 8; k++) {
        p.addXp(p.xpToNext);
        if (!p.offers) break;
        expect(p.offers.map((o) => o.id)).not.toContain('blade');
        expect(p.offers.map((o) => o.id)).not.toContain('swift');
        expect(p.offers.map((o) => o.id)).not.toContain('walls');
        p.choose(0, host());
      }
    }
  });

  it('offer fewer than 3 cards when fewer than 3 upgrades remain', () => {
    const p = aProgression();
    maxAllExcept(p, ['arc', 'walls']);
    p.addXp(5);
    expect(p.offers!.map((o) => o.id).sort()).toEqual(['arc', 'walls']);
  });

  it('describe() text uses the current level (veterans: veterans then captains)', () => {
    const p = aProgression();
    maxAllExcept(p, ['veterans']);
    p.addXp(5);
    expect(p.offers![0]).toMatchObject({ id: 'veterans', level: 0, description: 'New rookies join as veterans' });
    p.choose(0, host());
    p.addXp(p.xpToNext);
    expect(p.offers![0]).toMatchObject({ id: 'veterans', level: 1, description: 'New rookies join as captains' });
  });

  it('describe() text uses the current level (slits)', () => {
    const p = aProgression();
    maxAllExcept(p, ['slits']);
    p.addXp(5);
    expect(p.offers![0].description).toBe('Buildings shoot arrows at nearby monsters');
    p.choose(0, host());
    p.addXp(p.xpToNext);
    expect(p.offers![0].description).toBe('Buildings shoot faster');
  });
});

describe('choose', () => {
  it('applies the card: levels, mods and onPick', () => {
    const p = aProgression();
    maxAllExcept(p, ['walls']);
    const h = host();
    p.addXp(5);
    expect(p.choose(0, h)).toBe('walls');
    expect(p.levels.walls).toBe(1);
    expect(p.mods.town.maxHpMul).toBeCloseTo(1.25);
    expect(h.repairBuildings).toHaveBeenCalledWith(0.25);
    expect(p.offers).toBeNull();
  });

  it('returns null for a bad index or when nothing is offered', () => {
    const p = aProgression();
    expect(p.choose(0, host())).toBeNull();
    p.addXp(5);
    expect(p.choose(3, host())).toBeNull();
    expect(p.offers).not.toBeNull();
  });

  it('queued level-ups re-roll a fresh offer after each choice, then resume', () => {
    const p = aProgression(3);
    p.addXp(5 + 7 + 8);
    const taken: string[] = [];
    let previous = p.offers;
    for (let k = 0; k < 3; k++) {
      expect(p.offers, `choice ${k}`).not.toBeNull();
      if (k > 0) expect(p.offers).not.toBe(previous);
      expect(p.offers).toHaveLength(3);
      previous = p.offers;
      taken.push(p.choose(0, host())!);
    }
    expect(p.offers).toBeNull();
    expect(Object.values(p.levels).reduce((a, b) => a + b, 0)).toBe(3);
    expect(taken).toHaveLength(3);
  });

  it('a stack taken in one choice is reflected in the next offer\'s level', () => {
    const p = aProgression();
    maxAllExcept(p, ['blade', 'swift']);
    p.addXp(5 + 7);
    const first = p.offers!.find((o) => o.id === 'blade')!;
    expect(first.level).toBe(0);
    p.choose(p.offers!.indexOf(first), host());
    expect(p.offers!.find((o) => o.id === 'blade')!.level).toBe(1);
  });
});

describe('everything maxed', () => {
  it('offers nothing and does not pause, but the level still rises', () => {
    const p = aProgression();
    maxAllExcept(p, []);
    expect(p.addXp(5 + 7)).toBe(2);
    expect(p.level).toBe(3);
    expect(p.offers).toBeNull();
  });

  it('drops queued level-ups once the last upgrade is maxed', () => {
    const p = aProgression();
    maxAllExcept(p, ['veterans']);
    p.levels.veterans = 1; // one stack left
    p.addXp(5 + 7 + 8); // three level-ups, one card
    expect(p.offers!.map((o) => o.id)).toEqual(['veterans']);
    p.choose(0, host());
    expect(p.offers).toBeNull();
  });
});
