// The app host: owns the canvas, the model cache and the audio for the whole app, and runs one
// GameController + ThreeRenderer per play session.
//
// Extra params: &stress=<monsters> (spawns them at once, implies god=1&plan=0, shows perf)
//               &perf=1 (perf overlay) &shadows=0 &sil=0 (no occlusion silhouettes) &dpr=<max ratio>
//               &lightning=0 (no lightning strikes in night towns) &lights=<n> (night point-light pool, default 8)
//               &dark=1 (every monster drawn as if out of the light) &eyes=1 (night eyes shown in the light too)

import { SIDES } from '../sim/map';
import type { MonsterKind } from '../data/monsters';
import { GameAudio } from '../audio/GameAudio';
import { WebAudioBackend } from '../audio/WebAudioBackend';
import { GameController } from '../game/GameController';
import { createSession, getProfile, type SessionData } from '../game/session';
import type { World } from '../sim/world';
import { ModelLibrary } from './assets';
import { preloadModels } from './preload';
import { Stage } from './Stage';
import { ThreeRenderer, type RenderPerf } from './ThreeRenderer';

export async function startThreeGame(root: HTMLElement) {
  const q = new URLSearchParams(location.search);
  const stress = Number(q.get('stress') ?? 0);
  const silhouettes = q.get('sil') !== '0';
  const lightning = q.get('lightning') !== '0';
  const lights = q.has('lights') ? Number(q.get('lights')) : undefined;
  const forceDark = q.get('dark') === '1';
  const eyesAlways = q.get('eyes') === '1';
  const stage = new Stage(root, { shadows: q.get('shadows') !== '0', maxPixelRatio: Number(q.get('dpr') ?? 2) });
  const library = new ModelLibrary();
  // Sounds load in the background while the models load; sessions share the decoded files.
  const sound = new WebAudioBackend();
  await library.load(preloadModels());
  // Stress runs skip the menu and planning, and the knight cannot die.
  const search = stress > 0 ? `${location.search}&god=1&plan=0` : location.search;

  let controller: GameController | null = null;
  let renderer: ThreeRenderer | null = null;
  let world: World | null = null;
  /** Restarts are applied between frames: the request may come from inside the controller. */
  let pendingRestart: SessionData | null = {};

  const start = (data: SessionData) => {
    controller?.destroy();
    const session = createSession(data, getProfile(), search);
    world = session.world;
    const audio = new GameAudio(sound);
    // Thunder: the slam sound, quieter and an octave down.
    const onThunder = () => audio.play('bossSlam', { volume: 0.35, detune: -1200 });
    renderer = new ThreeRenderer(stage, library, session.world, { silhouettes, lightning, onThunder, lights, forceDark, eyesAlways });
    controller = new GameController({
      session, renderer, audio, profile: getProfile(), root,
      host: { restart: (d) => { pendingRestart = d; } },
    });
    if (stress > 0 && !data.menu) spawnAtEdges(session.world, stress);
  };

  const meter = new PerfMeter(stress > 0 || q.get('perf') === '1');
  let last = performance.now();
  const frame = (now: number) => {
    requestAnimationFrame(frame);
    if (pendingRestart) {
      const d = pendingRestart;
      pendingRestart = null;
      start(d);
    }
    // A session that failed to start has thrown already; don't throw again every frame.
    if (!controller || !renderer || !world) return;
    const t0 = performance.now();
    controller.update(now - last);
    meter.frame(now - last, performance.now() - t0, renderer.perf(), world);
    last = now;
  };
  requestAnimationFrame(frame);

  const vd = ((window as unknown as { __vd: Record<string, unknown> }).__vd ??= {});
  vd.renderer = stage.renderer;
  vd.perf = () => meter.snapshot();
  vd.spawn = (n: number) => world && spawnAtEdges(world, n);
  /** Night towns: hold a lightning flash at its peak (screenshots); false lets it go. */
  vd.lightning = (hold = true) => renderer?.lightning(hold);
}

function spawnAtEdges(world: World, count: number) {
  const kinds: MonsterKind[] = ['zombie', 'orc', 'skeleton', 'zombie', 'ghost', 'vampire'];
  for (let k = 0; k < count; k++) world.debugSpawn(kinds[k % kinds.length], 1, SIDES[k % SIDES.length]);
}

/** Smoothed frame timings, optionally shown in a corner overlay. */
class PerfMeter {
  private frameMs = 16.7;
  private updateMs = 0;
  private renderMs = 0;
  private draw: RenderPerf = { renderMs: 0, calls: 0, triangles: 0, units: 0, particles: 0 };
  private el: HTMLPreElement | null = null;
  private lastText = 0;

  constructor(show: boolean) {
    if (!show) return;
    this.el = document.createElement('pre');
    this.el.style.cssText = 'position:fixed;left:8px;bottom:8px;margin:0;padding:6px 8px;font:12px/1.35 monospace;color:#fff;background:rgba(40,24,16,.7);border-radius:6px;pointer-events:none;z-index:50';
    document.body.appendChild(this.el);
  }

  frame(frameMs: number, updateMs: number, perf: RenderPerf, world: World) {
    const k = 0.05;
    this.frameMs += (Math.min(frameMs, 250) - this.frameMs) * k;
    this.updateMs += (updateMs - this.updateMs) * k;
    this.renderMs += (perf.renderMs - this.renderMs) * k;
    this.draw = perf;
    const now = performance.now();
    if (!this.el || now - this.lastText < 250) return;
    this.lastText = now;
    const s = this.snapshot();
    this.el.textContent =
      `${s.fps} fps  frame ${s.frameMs} ms\n` +
      `sim ${s.simMs} ms  render ${s.renderMs} ms (CPU)\n` +
      `draw calls ${s.calls}  tris ${Math.round(s.triangles / 1000)}k  units ${s.units}  fx ${s.particles}\n` +
      `wave ${world.wave}/${world.totalWaves}  ${world.status}`;
  }

  snapshot() {
    return {
      fps: Math.round(1000 / this.frameMs),
      frameMs: +this.frameMs.toFixed(2),
      simMs: +Math.max(0, this.updateMs - this.renderMs).toFixed(2),
      renderMs: +this.renderMs.toFixed(2),
      calls: this.draw.calls,
      triangles: this.draw.triangles,
      units: this.draw.units,
      particles: this.draw.particles,
    };
  }
}
