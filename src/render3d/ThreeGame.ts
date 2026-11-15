// Host for the three.js renderer (?look=3d): owns the canvas and the model cache for the whole
// app, and runs one GameController + ThreeRenderer per play session.
//
// Extra params: &stress=<monsters> (spawns them at once, implies god=1&plan=0, shows perf)
//               &perf=1 (perf overlay) &shadows=0 &sil=0 (no occlusion silhouettes) &dpr=<max ratio>

import { SIDES } from '../sim/map';
import type { MonsterKind } from '../data/monsters';
import { GameController, type AudioPort } from '../game/GameController';
import { createSession, getProfile, type SessionData } from '../game/session';
import type { World } from '../sim/world';
import { ModelLibrary } from './assets';
import { characterModelPaths } from './characters';
import { Stage } from './Stage';
import { ThreeRenderer } from './ThreeRenderer';
import { TOWN_MODELS } from './TownView';

export async function startThreeGame(root: HTMLElement) {
  const q = new URLSearchParams(location.search);
  const stress = Number(q.get('stress') ?? 0);
  const silhouettes = q.get('sil') !== '0';
  const stage = new Stage(root, { shadows: q.get('shadows') !== '0', maxPixelRatio: Number(q.get('dpr') ?? 2) });
  const library = new ModelLibrary();
  await library.load([...characterModelPaths(), ...TOWN_MODELS]);
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
    renderer = new ThreeRenderer(stage, library, session.world, { silhouettes });
    controller = new GameController({
      session, renderer, audio: silentAudio(), profile: getProfile(), root,
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
    const t0 = performance.now();
    controller!.update(now - last);
    meter.frame(now - last, performance.now() - t0, renderer!.perf(), world!);
    last = now;
  };
  requestAnimationFrame(frame);

  const vd = ((window as unknown as { __vd: Record<string, unknown> }).__vd ??= {});
  vd.renderer = stage.renderer;
  vd.perf = () => meter.snapshot();
  vd.spawn = (n: number) => world && spawnAtEdges(world, n);
}

/** Phase 5 moves GameAudio off Phaser; until then the 3D renderer is silent. */
function silentAudio(): AudioPort {
  return {
    settings: { master: 1, sfx: 1, music: 1, muted: false },
    music() {}, play() {}, handleEvents() {}, destroy() {},
    setSettings(p) { Object.assign(this.settings, p); },
  };
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
  private draw = { calls: 0, triangles: 0, units: 0 };
  private el: HTMLPreElement | null = null;
  private lastText = 0;

  constructor(show: boolean) {
    if (!show) return;
    this.el = document.createElement('pre');
    this.el.style.cssText = 'position:fixed;left:8px;bottom:8px;margin:0;padding:6px 8px;font:12px/1.35 monospace;color:#fff;background:rgba(40,24,16,.7);border-radius:6px;pointer-events:none;z-index:50';
    document.body.appendChild(this.el);
  }

  frame(frameMs: number, updateMs: number, perf: { renderMs: number; calls: number; triangles: number; units: number }, world: World) {
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
      `draw calls ${s.calls}  tris ${Math.round(s.triangles / 1000)}k  units ${s.units}\n` +
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
    };
  }
}
