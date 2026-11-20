import type { SimEvent } from '../sim/world';

export type SoundId =
  | 'swing' | 'hit' | 'hitHeavy' | 'throw' | 'monsterDie' | 'knightHurt' | 'knightDie'
  | 'buildingHit' | 'buildingCollapse' | 'gem' | 'levelUp' | 'upgradePick' | 'uiClick'
  | 'rookieJoin' | 'rally' | 'arrow' | 'waveWarning' | 'bossArrive' | 'bossSlamWarn'
  | 'bossSlam' | 'bossCharge' | 'win' | 'lose';

export type MusicTrack = 'plan' | 'play';

export interface AudioSettings { master: number; sfx: number; music: number; muted: boolean }

export interface AudioManifest {
  sounds: Partial<Record<SoundId, string[]>>;
  music: Partial<Record<MusicTrack, string>>;
}

export const STORAGE_KEY = 'village-defender.audio';
const DEFAULT_SETTINGS: AudioSettings = { master: 0.8, sfx: 1, music: 0.5, muted: false };

/** Minimum ms between plays of the same id (swarm protection). */
export const RATE_LIMIT_MS: Partial<Record<SoundId, number>> = {
  swing: 60, hit: 50, hitHeavy: 50, throw: 80, monsterDie: 60, knightHurt: 100,
  buildingHit: 120, buildingCollapse: 150, gem: 40, arrow: 80, rookieJoin: 150,
};

/** Per-id base loudness (0..1) so loud/quiet sources sit together. */
const BASE_VOLUME: Partial<Record<SoundId, number>> = {
  swing: 0.35, hit: 0.5, hitHeavy: 0.6, throw: 0.4, monsterDie: 0.4, buildingHit: 0.5,
  gem: 0.35, arrow: 0.3, levelUp: 0.7, win: 0.8, lose: 0.8,
};

export interface PlannedSound { id: SoundId; volume?: number }

/** Maps sim events to sounds (no rate limiting). Unknown event types are ignored. */
export function planFor(events: readonly SimEvent[]): PlannedSound[] {
  const out: PlannedSound[] = [];
  for (const e of events as readonly { type: string; [k: string]: unknown }[]) {
    switch (e.type) {
      case 'swing': out.push({ id: e.weapon === 'axes' ? 'throw' : 'swing' }); break;
      case 'axeThrow': out.push({ id: 'throw' }); break;
      case 'hit': out.push({ id: typeof e.damage === 'number' && e.damage >= 20 ? 'hitHeavy' : 'hit' }); break;
      case 'death': out.push({ id: 'monsterDie' }); break;
      case 'playerHurt': out.push({ id: 'knightHurt' }); break;
      case 'playerDied': out.push({ id: 'knightDie' }); break;
      case 'buildingHit': out.push({ id: 'buildingHit' }); break;
      case 'buildingDestroyed': out.push({ id: 'buildingCollapse' }); break;
      case 'gemCollected': out.push({ id: 'gem' }); break;
      case 'levelUp': out.push({ id: 'levelUp' }); break;
      case 'upgradeChosen': out.push({ id: 'upgradePick' }); break;
      case 'rookieJoined': out.push({ id: 'rookieJoin' }); break;
      case 'rally': out.push({ id: 'rally' }); break;
      case 'shot': out.push({ id: 'arrow' }); break;
      case 'waveWarning': out.push({ id: 'waveWarning' }); break;
      case 'bossSpawn': out.push({ id: 'bossArrive' }); break;
      case 'bossSlamWarn': out.push({ id: 'bossSlamWarn' }); break;
      case 'bossBoulderWarn': out.push({ id: 'bossCharge' }); break;
      case 'bossBoulder': out.push({ id: 'bossSlam' }); break;
      case 'bossSlam': out.push({ id: 'bossSlam' }); break;
      case 'bossCharge': out.push({ id: 'bossCharge' }); break;
      case 'bossSummon': out.push({ id: 'waveWarning', volume: 0.5 }); break;
      case 'wailWarn': out.push({ id: 'bossSlamWarn', volume: 0.5 }); break;
      case 'wail': out.push({ id: 'bossSlam', volume: 0.5 }); break;
      case 'fuseLit': out.push({ id: 'bossSlamWarn', volume: 0.5 }); break;
      case 'explosion': out.push({ id: 'bossSlam', volume: 0.7 }); break;
      case 'monsterRaised': out.push({ id: 'waveWarning', volume: 0.3 }); break;
      case 'freezeWarn': out.push({ id: 'bossSlamWarn', volume: 0.4 }); break;
      case 'freeze': out.push({ id: 'hitHeavy', volume: 0.6 }); break;
      case 'monsterSplit': out.push({ id: 'hit', volume: 0.4 }); break;
      case 'levelEnd': out.push({ id: e.won ? 'win' : 'lose' }); break;
      default: break;
    }
  }
  return out;
}

/** Sound ids for a batch of events (see planFor). */
export function soundsFor(events: readonly SimEvent[]): SoundId[] {
  return planFor(events).map((p) => p.id);
}

/** Allows an id at most once per window; clock is injected for tests. */
export class RateLimiter {
  private readonly last = new Map<string, number>();
  constructor(
    private readonly now: () => number,
    private readonly limits: Partial<Record<string, number>> = RATE_LIMIT_MS,
  ) {}
  tryPlay(id: string): boolean {
    const gap = this.limits[id] ?? 0;
    const t = this.now();
    const prev = this.last.get(id);
    if (gap > 0 && prev !== undefined && t - prev < gap) return false;
    this.last.set(id, t);
    return true;
  }
}

/** Picks a random variant, never the same one twice in a row when there are 2+. */
export class VariantPicker {
  private readonly last = new Map<string, number>();
  constructor(private readonly random: () => number = Math.random) {}
  pick(id: string, variants: readonly string[]): string | undefined {
    if (variants.length === 0) return undefined;
    if (variants.length === 1) return variants[0];
    const prev = this.last.get(id);
    let i = Math.floor(this.random() * variants.length) % variants.length;
    if (i === prev) i = (i + 1 + Math.floor(this.random() * (variants.length - 1))) % variants.length;
    this.last.set(id, i);
    return variants[i];
  }
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadSettings(storage: StorageLike | null): AudioSettings {
  const s = { ...DEFAULT_SETTINGS };
  try {
    const raw = storage?.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<AudioSettings>;
      for (const k of ['master', 'sfx', 'music'] as const) {
        const v = p[k];
        if (typeof v === 'number' && Number.isFinite(v)) s[k] = Math.min(1, Math.max(0, v));
      }
      if (typeof p.muted === 'boolean') s.muted = p.muted;
    }
  } catch { /* ignore */ }
  return s;
}

export function saveSettings(storage: StorageLike | null, s: AudioSettings): void {
  try { storage?.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

export interface GameAudioDeps {
  now?: () => number;
  random?: () => number;
  storage?: StorageLike | null;
}

function defaultStorage(): StorageLike | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

const GEM_PITCH_WINDOW_MS = 500;
const MUSIC_FADE_MS = 600;

/** A looping sound whose volume can be faded. */
export interface LoopHandle {
  setVolume(volume: number, fadeMs: number): void;
  /** Fades out, then stops for good. */
  stop(fadeMs: number): void;
}

/** Where sounds actually come from (Web Audio in the game, a fake in tests). */
export interface AudioBackend {
  manifest(): AudioManifest | undefined;
  /** True once the file is decoded and playable. */
  has(file: string): boolean;
  play(file: string, volume: number, detune: number): void;
  loop(file: string, volume: number): LoopHandle | null;
  /** Calls `fn` once everything is loaded (immediately if it already is). */
  whenReady(fn: () => void): void;
}

export class GameAudio {
  settings: AudioSettings;
  private readonly limiter: RateLimiter;
  private readonly picker: VariantPicker;
  private readonly storage: StorageLike | null;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly warned = new Set<string>();
  private gemStreak = 0;
  private lastGem = -Infinity;
  private currentTrack: MusicTrack | null = null;
  private musicLoop: LoopHandle | null = null;
  private destroyed = false;

  constructor(private readonly backend: AudioBackend, deps: GameAudioDeps = {}) {
    this.now = deps.now ?? (() => Date.now());
    this.random = deps.random ?? Math.random;
    this.storage = deps.storage === undefined ? defaultStorage() : deps.storage;
    this.limiter = new RateLimiter(this.now);
    this.picker = new VariantPicker(this.random);
    this.settings = loadSettings(this.storage);
    // Music asked for before the files finished loading starts as soon as they have.
    backend.whenReady(() => {
      if (!this.destroyed && this.currentTrack && !this.musicLoop) this.startMusic(this.currentTrack);
    });
  }

  private warnOnce(what: string): void {
    if (this.warned.has(what)) return;
    this.warned.add(what);
    console.warn(`[audio] ${what}`);
  }

  play(id: SoundId, opts: { volume?: number; detune?: number } = {}): void {
    if (this.destroyed || this.settings.muted) return;
    try {
      const variants = (this.backend.manifest()?.sounds[id] ?? []).filter((f) => this.backend.has(f));
      const file = this.picker.pick(id, variants);
      if (!file) { this.warnOnce(`no audio loaded for "${id}"`); return; }
      const vol = (BASE_VOLUME[id] ?? 0.6) * (opts.volume ?? 1) * this.settings.sfx * this.settings.master;
      const detune = (opts.detune ?? 0) + (this.random() - 0.5) * 160;
      this.backend.play(file, Math.min(1, vol), detune);
    } catch (err) {
      this.warnOnce(`play "${id}" failed: ${String(err)}`);
    }
  }

  handleEvents(events: SimEvent[]): void {
    if (events.length === 0) return;
    for (const p of planFor(events)) {
      if (!this.limiter.tryPlay(p.id)) continue;
      let detune = 0;
      if (p.id === 'gem') {
        const t = this.now();
        this.gemStreak = t - this.lastGem < GEM_PITCH_WINDOW_MS ? Math.min(this.gemStreak + 1, 12) : 0;
        this.lastGem = t;
        detune = this.gemStreak * 40;
      }
      this.play(p.id, { volume: p.volume, detune });
    }
  }

  private musicVolume(): number {
    return this.settings.muted ? 0 : this.settings.music * this.settings.master;
  }

  music(track: MusicTrack | null): void {
    if (this.destroyed || track === this.currentTrack) return;
    this.currentTrack = track;
    this.musicLoop?.stop(MUSIC_FADE_MS);
    this.musicLoop = null;
    if (track) this.startMusic(track);
  }

  private startMusic(track: MusicTrack) {
    try {
      const file = this.backend.manifest()?.music[track];
      // Not loaded yet: whenReady (constructor) starts it later.
      if (!file || !this.backend.has(file)) return;
      this.musicLoop = this.backend.loop(file, 0);
      this.musicLoop?.setVolume(this.musicVolume(), MUSIC_FADE_MS);
    } catch (err) {
      this.warnOnce(`music "${track}" failed: ${String(err)}`);
    }
  }

  setSettings(p: Partial<AudioSettings>): void {
    this.settings = { ...this.settings, ...p };
    for (const k of ['master', 'sfx', 'music'] as const) {
      this.settings[k] = Math.min(1, Math.max(0, this.settings[k]));
    }
    saveSettings(this.storage, this.settings);
    this.musicLoop?.setVolume(this.musicVolume(), 0);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.musicLoop?.stop(MUSIC_FADE_MS);
    this.musicLoop = null;
  }
}
