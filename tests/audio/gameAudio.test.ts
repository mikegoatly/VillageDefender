import { describe, expect, it, vi } from 'vitest';
import {
  GameAudio, RateLimiter, STORAGE_KEY, VariantPicker, loadSettings, soundsFor,
  type SoundId, type StorageLike,
} from '../../src/audio/GameAudio';
import type { SimEvent } from '../../src/sim/world';

const ev = (e: object) => e as unknown as SimEvent;

class FakeStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
}

/** Minimal fake Phaser scene with a manifest and recorded plays. */
function fakeScene(sounds: Partial<Record<SoundId, string[]>> = {}) {
  const played: { key: string; cfg: { volume: number; detune: number } }[] = [];
  const files = new Set(Object.values(sounds).flat().map((f) => `snd:${f}`));
  const scene = {
    cache: {
      json: { get: () => ({ sounds, music: {} }), exists: () => true },
      audio: { exists: (k: string) => files.has(k) },
    },
    sound: {
      play: (key: string, cfg: { volume: number; detune: number }) => { played.push({ key, cfg }); return true; },
      add: vi.fn(),
    },
    tweens: { add: vi.fn() },
  };
  return { scene: scene as unknown as ConstructorParameters<typeof GameAudio>[0], played };
}

describe('soundsFor', () => {
  it.each([
    [{ type: 'swing', unit: 1 }, ['swing']],
    [{ type: 'swing', unit: 1, weapon: 'axes' }, ['throw']],
    [{ type: 'hit', damage: 5 }, ['hit']],
    [{ type: 'hit', damage: 20 }, ['hitHeavy']],
    [{ type: 'death', unit: 1 }, ['monsterDie']],
    [{ type: 'playerHurt' }, ['knightHurt']],
    [{ type: 'playerDied' }, ['knightDie']],
    [{ type: 'buildingHit' }, ['buildingHit']],
    [{ type: 'buildingDestroyed' }, ['buildingCollapse']],
    [{ type: 'gemCollected' }, ['gem']],
    [{ type: 'levelUp' }, ['levelUp']],
    [{ type: 'upgradeChosen' }, ['upgradePick']],
    [{ type: 'rookieJoined' }, ['rookieJoin']],
    [{ type: 'rally' }, ['rally']],
    [{ type: 'shot' }, ['arrow']],
    [{ type: 'waveWarning' }, ['waveWarning']],
    [{ type: 'levelEnd', won: true }, ['win']],
    [{ type: 'levelEnd', won: false }, ['lose']],
    [{ type: 'bossSpawn' }, ['bossArrive']],
    [{ type: 'bossSlamWarn' }, ['bossSlamWarn']],
    [{ type: 'bossSlam' }, ['bossSlam']],
    [{ type: 'bossCharge' }, ['bossCharge']],
    [{ type: 'bossSummon' }, ['waveWarning']],
    [{ type: 'axeThrow' }, ['throw']],
    [{ type: 'waveStart' }, []],
    [{ type: 'somethingNew' }, []],
  ])('%j -> %j', (e, ids) => {
    expect(soundsFor([ev(e)])).toEqual(ids);
  });
});

describe('RateLimiter', () => {
  it('blocks repeats within the window, per id', () => {
    let t = 0;
    const r = new RateLimiter(() => t);
    expect(r.tryPlay('hit')).toBe(true);
    t = 49;
    expect(r.tryPlay('hit')).toBe(false);
    expect(r.tryPlay('swing')).toBe(true);
    t = 50;
    expect(r.tryPlay('hit')).toBe(true);
  });
  it('does not limit ids without a window', () => {
    const r = new RateLimiter(() => 0);
    expect(r.tryPlay('win')).toBe(true);
    expect(r.tryPlay('win')).toBe(true);
  });
});

describe('VariantPicker', () => {
  it('never repeats the same variant twice in a row', () => {
    let seed = 1;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const p = new VariantPicker(rnd);
    let prev: string | undefined;
    for (let i = 0; i < 500; i++) {
      const v = p.pick('x', ['a', 'b', 'c']);
      expect(v).not.toBe(prev);
      prev = v;
    }
  });
  it('handles one and zero variants', () => {
    const p = new VariantPicker();
    expect(p.pick('x', ['a'])).toBe('a');
    expect(p.pick('x', ['a'])).toBe('a');
    expect(p.pick('x', [])).toBeUndefined();
  });
});

describe('settings persistence', () => {
  it('round-trips through storage', () => {
    const storage = new FakeStorage();
    const a = new GameAudio(fakeScene().scene, { storage });
    a.setSettings({ master: 0.3, muted: true });
    expect(JSON.parse(storage.data.get(STORAGE_KEY)!)).toMatchObject({ master: 0.3, muted: true });
    const b = new GameAudio(fakeScene().scene, { storage });
    expect(b.settings).toMatchObject({ master: 0.3, muted: true });
  });
  it('survives corrupt or missing storage', () => {
    const storage = new FakeStorage();
    storage.setItem(STORAGE_KEY, '{nope');
    expect(loadSettings(storage).muted).toBe(false);
    expect(loadSettings(null).master).toBeGreaterThan(0);
    const throwing: StorageLike = {
      getItem() { throw new Error('x'); },
      setItem() { throw new Error('x'); },
    };
    const a = new GameAudio(fakeScene().scene, { storage: throwing });
    expect(() => a.setSettings({ sfx: 0.5 })).not.toThrow();
  });
});

describe('GameAudio.handleEvents', () => {
  it('rate-limits swarms and varies files', () => {
    let t = 0;
    const { scene, played } = fakeScene({ hit: ['h1.ogg', 'h2.ogg'] });
    const a = new GameAudio(scene, { now: () => t, storage: null });
    const hits = Array.from({ length: 10 }, () => ev({ type: 'hit', damage: 3 }));
    a.handleEvents(hits);
    expect(played).toHaveLength(1);
    t = 60;
    a.handleEvents(hits);
    expect(played).toHaveLength(2);
    expect(played[0].key).not.toBe(played[1].key);
  });
  it('does not throw for missing files, and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { scene, played } = fakeScene();
    const a = new GameAudio(scene, { storage: null });
    expect(() => a.handleEvents([ev({ type: 'levelUp' })])).not.toThrow();
    a.handleEvents([ev({ type: 'levelUp' })]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(played).toHaveLength(0);
    warn.mockRestore();
  });
  it('plays nothing when muted', () => {
    const { scene, played } = fakeScene({ levelUp: ['l.ogg'] });
    const a = new GameAudio(scene, { storage: null });
    a.setSettings({ muted: true });
    a.handleEvents([ev({ type: 'levelUp' })]);
    expect(played).toHaveLength(0);
  });
  it('raises gem pitch on rapid pickups', () => {
    let t = 0;
    const { scene, played } = fakeScene({ gem: ['g.ogg'] });
    const a = new GameAudio(scene, { now: () => t, random: () => 0.5, storage: null });
    for (let i = 0; i < 3; i++) { t += 100; a.handleEvents([ev({ type: 'gemCollected' })]); }
    expect(played[2].cfg.detune).toBeGreaterThan(played[0].cfg.detune);
  });
});
