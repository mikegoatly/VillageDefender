// Measures the three.js renderer (?look=3d). Requires `npm run dev` (port 5173), or VD_URL.
//
//   node tools/measure3d.mjs [options] ["<extra query>"]     e.g. "town=lanternwick&lightning=0"
//
// Options:
//   --swiftshader        software GPU (SwiftShader): fragment and shader cost shows up as frame time,
//                        a stand-in for a weak GPU. Without it, the real GPU with vsync off.
//   --towns              cases are the towns (village, frostpeak, lanternwick at wave 5) instead of the stress set
//   --case "<name>=<query>"  a case of your own (repeatable; replaces the default set)
//   --cpu 1,4            CPU throttle rates to run (default 1,4; "cpu x4" is DevTools' mid-range phone)
//   --scale <n>          deviceScaleFactor (default 1; 2 = a high-DPI screen, 4× the pixels, capped by &dpr)
//   --size <w>x<h>       viewport (default 1600x900)
//   --wait <s>           seconds to settle before reading the meter (default 8)
//   --shots              save screenshots/measure3d-<case>.png (full CPU only; default on without --swiftshader)
//
// Reports the wall-clock frame time (frames counted over the second half of the wait: with
// --swiftshader the GPU work bounds it), sim and render CPU time, draw calls and triangles. "gpu" is GPU time per frame from
// EXT_disjoint_timer_query_webgl2 when the browser exposes it (it usually doesn't), else "-".

import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.VD_URL ?? 'http://localhost:5173/';
const argv = process.argv.slice(2);
const flag = (name) => {
  const k = argv.indexOf(name);
  if (k < 0) return false;
  argv.splice(k, 1);
  return true;
};
const option = (name, fallback) => {
  const k = argv.indexOf(name);
  if (k < 0) return fallback;
  return argv.splice(k, 2)[1];
};
const swiftshader = flag('--swiftshader');
const towns = flag('--towns');
const shotsFlag = flag('--shots');
const own = [];
for (let c = option('--case'); c; c = option('--case')) {
  const at = c.indexOf('=');
  own.push({ name: c.slice(0, at), q: c.slice(at + 1) });
}
const throttles = option('--cpu', '1,4').split(',').map(Number);
const scale = Number(option('--scale', '1'));
const [width, height] = option('--size', '1600x900').split('x').map(Number);
const waitMs = Number(option('--wait', '8')) * 1000;
const shots = shotsFlag || !swiftshader;
/** Appended to every case's query (pick a town, a wave, turn lightning off...). */
const EXTRA = argv[0] ? `&${argv[0].replace(/^[?&]/, '')}` : '';

const STRESS = [
  { name: 'wave 1', q: 'god=1&plan=0&perf=1' },
  { name: '300 monsters', q: 'stress=300' },
  { name: '300 no shadows', q: 'stress=300&shadows=0' },
  { name: '300 no shadow/sil', q: 'stress=300&shadows=0&sil=0' },
  { name: '600 monsters', q: 'stress=600' },
];
const TOWNS = [
  { name: 'village', q: 'god=1&plan=0&perf=1&wave=5' },
  { name: 'frostpeak', q: 'god=1&plan=0&perf=1&wave=5&town=frostpeak' },
  { name: 'lanternwick', q: 'god=1&plan=0&perf=1&wave=5&town=lanternwick&lightning=0' },
];
const cases = own.length ? own : towns ? TOWNS : STRESS;

mkdirSync('screenshots', { recursive: true });
const browser = await chromium.launch({
  args: swiftshader
    ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit']
    : ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
});
let failed = false;
try {
  for (const throttle of throttles) {
    for (const c of cases) {
      const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => { failed = true; console.error('page error:', e.message); });
      const cdp = await ctx.newCDPSession(page);
      await page.goto(`${BASE}?look=3d&seed=42&${c.q}${EXTRA}`);
      await page.waitForFunction(() => window.__vd?.perf, null, { timeout: 60000 });
      await page.evaluate(gpuTimer);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
      await page.waitForTimeout(waitMs / 2);
      // Wall-clock frame time over the second half (rAF timestamps can bunch up when the GPU is the bottleneck).
      await page.evaluate(() => {
        const w = (window.__vdWall = { frames: 0, t0: performance.now() });
        const tick = () => { w.frames++; requestAnimationFrame(tick); };
        requestAnimationFrame(tick);
      });
      await page.waitForTimeout(waitMs / 2);
      const s = await page.evaluate(() => {
        const w = window.__vdWall;
        const wallMs = (performance.now() - w.t0) / Math.max(1, w.frames);
        const gl = window.__vd.renderer.getContext();
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const px = gl.drawingBufferWidth * gl.drawingBufferHeight;
        return { ...window.__vd.perf(), wallMs, gpuMs: window.__vdGpu?.ms ?? null, px, gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '?' };
      });
      if (throttle === 1 && shots) await page.screenshot({ path: `screenshots/measure3d-${c.name.replace(/[^a-z0-9]+/gi, '_')}.png` });
      console.log(
        `cpu x${throttle}  ${c.name.padEnd(22)} frame ${s.wallMs.toFixed(1).padStart(7)} ms  gpu ${s.gpuMs == null ? '-' : s.gpuMs.toFixed(2)}  ` +
        `sim ${s.simMs}  render ${s.renderMs}  calls ${s.calls}  tris ${s.triangles}  units ${s.units}  ${(s.px / 1e6).toFixed(2)} Mpx | ${s.gpu}`,
      );
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
if (failed) process.exit(1);

/** In the page: times each renderer.render on the GPU with a timer query, if the extension exists (smoothed into window.__vdGpu.ms). */
function gpuTimer() {
  const r = window.__vd.renderer;
  const gl = r.getContext();
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext) return;
  const out = (window.__vdGpu = { ms: null });
  const pending = [];
  const render = r.render.bind(r);
  r.render = (scene, camera) => {
    for (let k = pending.length - 1; k >= 0; k--) {
      const q = pending[k];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) continue;
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) {
        const ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
        out.ms = out.ms == null ? ms : out.ms + (ms - out.ms) * 0.05;
      }
      gl.deleteQuery(q);
      pending.splice(k, 1);
    }
    const q = gl.createQuery();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    render(scene, camera);
    gl.endQuery(ext.TIME_ELAPSED_EXT);
    pending.push(q);
  };
}
