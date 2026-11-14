// Captures the running game at several viewports. Requires `npm run dev` (port 5173).
//
//   node tools/screenshot.mjs                      default query, all viewports
//   node tools/screenshot.mjs "look=kit" "look=sketch&cs=1"
//
// Output: screenshots/<query>-<viewport>.png. Exits non-zero on page errors.

import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.VD_URL ?? 'http://localhost:5173/';
const VIEWPORTS = {
  desktop: { width: 1600, height: 900 },
  tablet: { width: 1024, height: 768, isMobile: true, hasTouch: true },
  'phone-landscape': { width: 844, height: 390, isMobile: true, hasTouch: true },
  'phone-portrait': { width: 390, height: 844, isMobile: true, hasTouch: true },
};
const queries = process.argv.length > 2 ? process.argv.slice(2) : [''];
const waitMs = Number(process.env.VD_WAIT ?? 2500);

mkdirSync('screenshots', { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
try {
  for (const q of queries) {
    for (const [name, vp] of Object.entries(VIEWPORTS)) {
      const { width, height, ...rest } = vp;
      const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, ...rest });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(`${q} ${name}: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(`${q} ${name}: ${m.text()}`); });
      await page.goto(`${BASE}?${q}`);
      await page.waitForTimeout(waitMs);
      const file = `screenshots/${(q || 'default').replace(/[^a-z0-9=.-]+/gi, '_')}-${name}.png`;
      await page.screenshot({ path: file });
      const stats = await page.evaluate(() => window.__vd?.stats?.() ?? null);
      console.log(file, stats ? JSON.stringify(stats) : '');
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
if (errors.length) {
  console.error('Page errors:\n' + errors.join('\n'));
  process.exit(1);
}
