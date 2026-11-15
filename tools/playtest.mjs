// Scripted play-test against the running dev server (port 5173).
// Drives the sim through window.__vd (input override + deterministic stepping) and saves
// screenshots: full view plus a close-up around the knight.
//
//   node tools/playtest.mjs [query] [seconds] [shots]
//   node tools/playtest.mjs "seed=1&wave=3" 30 3
//
// The scripted input circles the town holding attack, dodging every few seconds.

import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.VD_URL ?? 'http://localhost:5173/';
const query = process.argv[2] ?? 'seed=1';
const seconds = Number(process.argv[3] ?? 30);
const shots = Number(process.argv[4] ?? 3);
const viewport = { width: 1600, height: 900 };

mkdirSync('screenshots', { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${BASE}?${query}&speed=0`);
  await page.waitForFunction(() => typeof window.__vd?.step === 'function', null, { timeout: 30000 });

  // Skip the planning phase (towns start paused for planning; ?plan=0 also skips it).
  await page.evaluate(() => window.__vd.startTown?.());
  const ticksPerShot = Math.round((seconds * 60) / shots);
  for (let s = 1; s <= shots; s++) {
    await page.evaluate((ticks) => {
      const vd = window.__vd;
      for (let t = 0; t < ticks; t++) {
        const w = vd.world();
        const time = w.time;
        // Circle: screen-space direction rotating slowly; dodge pulse every 3 s.
        const a = time * 0.6;
        const input = {
          move: { x: Math.cos(a), y: Math.sin(a) },
          attack: true,
          dodge: Math.floor(time * 60) % 180 < 2,
          ability1: false, ability2: false, rally: false, pause: false,
        };
        // Level-up choice: pick a pseudo-random card so runs exercise different upgrades.
        if (w.choosing) vd.choose(Math.floor(time * 7) % w.progression.offers.length);
        vd.setInput(input);
        vd.step(1);
        if (w.status !== 'playing') break;
      }
    }, ticksPerShot);
    await page.waitForTimeout(350); // let the renderer draw the synced state and hit flashes fade
    const stats = await page.evaluate(() => window.__vd.stats());
    const focus = await page.evaluate(() => {
      const sc = window.__vd.scene;
      const k = sc.world.players[0];
      const cam = sc.cameras.main;
      const p = { x: (k.x - k.y) * 116 * 0.65, y: (k.x + k.y) * 55 * 0.65 };
      return { x: (p.x - cam.worldView.x) * cam.zoom, y: (p.y - cam.worldView.y) * cam.zoom };
    });
    const base = `screenshots/playtest-${s}`;
    await page.screenshot({ path: `${base}.png` });
    const cw = 480, ch = 300;
    const clip = {
      x: Math.max(0, Math.min(viewport.width - cw, focus.x - cw / 2)),
      y: Math.max(0, Math.min(viewport.height - ch, focus.y - ch * 0.6)),
      width: cw, height: ch,
    };
    await page.screenshot({ path: `${base}-close.png`, clip });
    console.log(base, JSON.stringify(stats));
    if (stats.status !== 'playing') break;
  }
} finally {
  await browser.close();
}
if (errors.length) {
  console.error('Page errors:\n' + errors.join('\n'));
  process.exit(1);
}
