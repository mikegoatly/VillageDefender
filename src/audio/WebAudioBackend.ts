// Plays the game's sounds with the Web Audio API: loads the manifest, decodes every file once,
// and unlocks the AudioContext on the first tap or key press (browsers start it suspended).

import type { AudioBackend, AudioManifest, LoopHandle } from './GameAudio';

const BASE = `${import.meta.env.BASE_URL}assets/audio/`;

export class WebAudioBackend implements AudioBackend {
  private readonly ctx: AudioContext;
  private readonly out: GainNode;
  private readonly buffers = new Map<string, AudioBuffer>();
  private data: AudioManifest | undefined;
  private ready = false;
  private readonly waiting: (() => void)[] = [];

  constructor() {
    this.ctx = new AudioContext();
    this.out = this.ctx.createGain();
    this.out.connect(this.ctx.destination);
    const unlock = () => {
      void this.ctx.resume();
      if (this.ctx.state === 'running') {
        removeEventListener('pointerdown', unlock, true);
        removeEventListener('keydown', unlock, true);
      }
    };
    addEventListener('pointerdown', unlock, true);
    addEventListener('keydown', unlock, true);
    void this.load();
  }

  manifest(): AudioManifest | undefined {
    return this.data;
  }

  has(file: string): boolean {
    return this.buffers.has(file);
  }

  whenReady(fn: () => void): void {
    if (this.ready) fn();
    else this.waiting.push(fn);
  }

  play(file: string, volume: number, detune: number): void {
    const buffer = this.buffers.get(file);
    if (!buffer || this.ctx.state !== 'running') return;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.detune.value = detune;
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(this.out);
    src.start();
  }

  loop(file: string, volume: number): LoopHandle | null {
    const buffer = this.buffers.get(file);
    if (!buffer) return null;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(gain).connect(this.out);
    src.start();
    const ramp = (to: number, ms: number) => {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      if (ms > 0) gain.gain.linearRampToValueAtTime(to, now + ms / 1000);
      else gain.gain.setValueAtTime(to, now);
    };
    return {
      setVolume: ramp,
      stop: (ms) => {
        ramp(0, ms);
        src.stop(ctx.currentTime + ms / 1000 + 0.05);
      },
    };
  }

  private async load() {
    try {
      const res = await fetch(`${BASE}manifest.json`);
      this.data = (await res.json()) as AudioManifest;
      const files = new Set<string>();
      for (const list of Object.values(this.data.sounds ?? {})) for (const f of list ?? []) files.add(f);
      for (const f of Object.values(this.data.music ?? {})) if (f) files.add(f);
      await Promise.all([...files].map(async (f) => {
        try {
          const bytes = await (await fetch(`${BASE}${f}`)).arrayBuffer();
          this.buffers.set(f, await this.ctx.decodeAudioData(bytes));
        } catch (err) {
          console.warn(`[audio] could not load ${f}: ${String(err)}`);
        }
      }));
    } catch (err) {
      console.warn(`[audio] could not load the manifest: ${String(err)}`);
    }
    this.ready = true;
    for (const fn of this.waiting.splice(0)) fn();
  }
}
