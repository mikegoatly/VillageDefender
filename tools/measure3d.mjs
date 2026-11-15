// Measures the three.js renderer (?look=3d). Requires `npm run dev` (port 5173), or VD_URL.
//
//   node tools/measure3d.mjs
//
// Runs with the real GPU and vsync off, so frame times are uncapped. "cpu x4" throttles the main
// thread 4x (Chrome DevTools' mid-range phone approximation); it does not model a phone GPU.
// Screenshots: screenshots/measure3d-<case>.png (full CPU only).

import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.VD_URL ?? 'http://localhost:5173/';
const cases = [
  { name: 'wave 1', q: 'god=1&plan=0&perf=1' },
  { name: '300 monsters', q: 'stress=300' },
  { name: '300 no shadows', q: 'stress=300&shadows=0' },
  { name: '300 no shadow/sil', q: 'stress=300&shadows=0&sil=0' },
  { name: '600 monsters', q: 'stress=600' },
];

mkdirSync('screenshots', { recursive: true });
const browser = await chromium.launch({
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
});
let failed = false;
try {
  for (const throttle of [1, 4]) {
    for (const c of cases) {
      const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => { failed = true; console.error('page error:', e.message); });
      const cdp = await ctx.newCDPSession(page);
      await page.goto(`${BASE}?look=3d&seed=42&${c.q}`);
      await page.waitForFunction(() => window.__vd?.perf, null, { timeout: 30000 });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
      await page.waitForTimeout(8000);
      const s = await page.evaluate(() => {
        const gl = window.__vd.renderer.getContext();
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        return { ...window.__vd.perf(), gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '?' };
      });
      if (throttle === 1) await page.screenshot({ path: `screenshots/measure3d-${c.name.replace(/[^a-z0-9]+/gi, '_')}.png` });
      console.log(
        `cpu x${throttle}  ${c.name.padEnd(18)} frame ${String(s.frameMs).padStart(6)} ms  sim ${s.simMs}  render ${s.renderMs}  ` +
        `calls ${s.calls}  tris ${s.triangles}  units ${s.units}  | ${s.gpu}`,
      );
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
if (failed) process.exit(1);
