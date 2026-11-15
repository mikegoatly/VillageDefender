// SPIKE tool: measures the ?look=3d renderer. Requires `npm run dev` (port 5173).
// TODO: delete together with src/render3d/spike.ts once the 3D decision is made.
//
//   node tools/spike3d-measure.mjs
//
// Runs with the real GPU and vsync off, so frame times are uncapped. "cpu x4" throttles the main
// thread 4x (Chrome DevTools' mid-range phone approximation); it does not model a phone GPU.

import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.VD_URL ?? 'http://localhost:5173/';
const cases = [
  { name: 'wave 1', q: 'god=1' },
  { name: '300 per-object', q: 'stress=300&inst=0' },
  { name: '300 instanced', q: 'stress=300' },
  { name: '300 inst no shadow', q: 'stress=300&shadows=0' },
  { name: '600 instanced', q: 'stress=600' },
];

mkdirSync('screenshots', { recursive: true });
const browser = await chromium.launch({
  args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
});
try {
  for (const throttle of [1, 4]) {
    for (const c of cases) {
      const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => console.error('page error:', e.message));
      const cdp = await ctx.newCDPSession(page);
      await page.goto(`${BASE}?look=3d&seed=42&${c.q}`);
      await page.waitForFunction(() => window.__vd?.stats, null, { timeout: 30000 });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
      await page.waitForTimeout(8000);
      const s = await page.evaluate(() => {
        const gl = window.__vd.renderer.getContext();
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        return { ...window.__vd.stats(), gpu: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : '?' };
      });
      if (throttle === 1) await page.screenshot({ path: `screenshots/spike3d-${c.name.replace(/[^a-z0-9]+/gi, '_')}.png` });
      console.log(
        `cpu x${throttle}  ${c.name.padEnd(19)} frame ${String(s.frameMs).padStart(6)} ms  sim ${s.simMs}  anim+draw ${s.renderCpuMs}  ` +
        `calls ${s.calls}  tris ${s.tris}  units ${s.units}  | ${s.gpu}`,
      );
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
