import { describe, expect, it, vi } from 'vitest';
import {
  GameAudio, RateLimiter, STORAGE_KEY, VariantPicker, loadSettings, soundsFor,
  type AudioBackend, type MusicTrack, type SoundId, type StorageLike,
} from '../../src/audio/GameAudio';
import type { SimEvent } from '../../src/sim/world';

const ev = (e: object) => e as unknown as SimEvent;

class FakeStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(k: string) { return this.data.get(k) ?? null; }
  setItem(k: string, v: string) { this.data.set(k, v); }
}

/** Fake audio backend with a manifest; records plays and music loops. Not ready until `ready()` when `deferred`. */
function fakeBackend(sounds: Partial<Record<SoundId, string[]>> = {}, music: Partial<Record<MusicTrack, string>> = {}, deferred = false) {
  const played: { key: string; cfg: { volume: number; detune: number } }[] = [];
  const loops: { file: string; volumes: number[]; stopped: boolean }[] = [];
  const files = new Set([...Object.values(sounds).flat(), ...Object.values(music)] as string[]);
  let isReady = !deferred;
  const waiting: (() => void)[] = [];
  const backend: AudioBackend = {
    manifest: () => ({ sounds, music }),
    has: (f) => isReady && files.has(f),
    play: (key, volume, detune) => void played.push({ key, cfg: { volume, detune } }),
    loop: (file, volume) => {
      const l = { file, volumes: [volume], stopped: false };
      loops.push(l);
      return { setVolume: (v) => void l.volumes.push(v), stop: () => { l.stopped = true; } };
    },
    whenReady: (fn) => (isReady ? fn() : void waiting.push(fn)),
  };
  const ready = () => { isReady = true; waiting.splice(0).forEach((fn) => fn()); };
  return { backend, played, loops, ready };
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
    const a = new GameAudio(fakeBackend().backend, { storage });
    a.setSettings({ master: 0.3, muted: true });
    expect(JSON.parse(storage.data.get(STORAGE_KEY)!)).toMatchObject({ master: 0.3, muted: true });
    const b = new GameAudio(fakeBackend().backend, { storage });
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
    const a = new GameAudio(fakeBackend().backend, { storage: throwing });
    expect(() => a.setSettings({ sfx: 0.5 })).not.toThrow();
  });
});

describe('GameAudio.handleEvents', () => {
  it('rate-limits swarms and varies files', () => {
    let t = 0;
    const { backend: scene, played } = fakeBackend({ hit: ['h1.ogg', 'h2.ogg'] });
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
    const { backend: scene, played } = fakeBackend();
    const a = new GameAudio(scene, { storage: null });
    expect(() => a.handleEvents([ev({ type: 'levelUp' })])).not.toThrow();
    a.handleEvents([ev({ type: 'levelUp' })]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(played).toHaveLength(0);
    warn.mockRestore();
  });
  it('plays nothing when muted', () => {
    const { backend: scene, played } = fakeBackend({ levelUp: ['l.ogg'] });
    const a = new GameAudio(scene, { storage: null });
    a.setSettings({ muted: true });
    a.handleEvents([ev({ type: 'levelUp' })]);
    expect(played).toHaveLength(0);
  });
  it('raises gem pitch on rapid pickups', () => {
    let t = 0;
    const { backend: scene, played } = fakeBackend({ gem: ['g.ogg'] });
    const a = new GameAudio(scene, { now: () => t, random: () => 0.5, storage: null });
    for (let i = 0; i < 3; i++) { t += 100; a.handleEvents([ev({ type: 'gemCollected' })]); }
    expect(played[2].cfg.detune).toBeGreaterThan(played[0].cfg.detune);
  });
});

describe('GameAudio.music', () => {
  const MUSIC = { plan: 'plan.ogg', play: 'play.ogg' };

  it('fades a track in at the music volume', () => {
    const { backend, loops } = fakeBackend({}, MUSIC);
    const a = new GameAudio(backend, { storage: null });
    a.music('plan');
    expect(loops).toHaveLength(1);
    expect(loops[0].file).toBe('plan.ogg');
    expect(loops[0].volumes[0]).toBe(0);
    expect(loops[0].volumes.at(-1)).toBeCloseTo(a.settings.music * a.settings.master);
  });

  it('stops the old track when switching, and does nothing for the same track', () => {
    const { backend, loops } = fakeBackend({}, MUSIC);
    const a = new GameAudio(backend, { storage: null });
    a.music('plan');
    a.music('plan');
    expect(loops).toHaveLength(1);
    a.music('play');
    expect(loops[0].stopped).toBe(true);
    expect(loops[1].file).toBe('play.ogg');
    a.music(null);
    expect(loops[1].stopped).toBe(true);
  });

  it('starts a track asked for before loading finished, once it has', () => {
    const { backend, loops, ready } = fakeBackend({}, MUSIC, true);
    const a = new GameAudio(backend, { storage: null });
    a.music('play');
    expect(loops).toHaveLength(0);
    ready();
    expect(loops.map((l) => l.file)).toEqual(['play.ogg']);
  });

  it('does not start late music after the session ended', () => {
    const { backend, loops, ready } = fakeBackend({}, MUSIC, true);
    const a = new GameAudio(backend, { storage: null });
    a.music('play');
    a.destroy();
    ready();
    expect(loops).toHaveLength(0);
  });

  it('follows volume and mute settings', () => {
    const { backend, loops } = fakeBackend({}, MUSIC);
    const a = new GameAudio(backend, { storage: null });
    a.music('plan');
    a.setSettings({ muted: true });
    expect(loops[0].volumes.at(-1)).toBe(0);
    a.setSettings({ muted: false, music: 1, master: 1 });
    expect(loops[0].volumes.at(-1)).toBe(1);
  });
});
