// Frame-by-frame strips of the knight's attack, for checking animations. Requires `npm run dev`.
//
//   node tools/animframes.mjs [weapon] [times]
//   node tools/animframes.mjs spear
//   node tools/animframes.mjs hammer 0,0.1,0.2,0.3,0.4,0.55
//
// requestAnimationFrame is replaced by a fake clock pumped from here, so render time only advances
// when the script says: each frame is captured at an exact time into the attack, however slow the
// (software) renderer is. The sim is frozen (speed=0) one tick into the attack while the renderer
// plays the clip. Facing right, towards the camera and away from it.
//
// Output: screenshots/anim-<weapon>-<view>.png, one strip per view, frames labelled in seconds.
// Exits non-zero on page errors.

import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.VD_URL ?? 'http://localhost:5173/';
const weapon = process.argv[2] ?? 'spear';
const times = (process.argv[3] ?? '0,0.04,0.08,0.11,0.14,0.2,0.27,0.35').split(',').map(Number);
const VIEWS = { side: { x: 1, y: 0 }, down: { x: 0, y: 1 }, away: { x: -0.4, y: -1 } };
const FRAME = { width: 220, height: 170 };
const FPS = 60;

mkdirSync('screenshots', { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(() => {
    let now = 0;
    let queue = [];
    window.requestAnimationFrame = (cb) => { queue.push(cb); return queue.length; };
    /** Runs `n` animation frames of `ms` each. */
    window.__frames = (n = 1, ms = 1000 / 60) => {
      for (let k = 0; k < n; k++) {
        now += ms;
        const q = queue;
        queue = [];
        for (const cb of q) cb(now);
      }
    };
  });
  await page.goto(`${BASE}?seed=1&speed=0&god=1`);
  // The game starts on its first animation frame, so pump frames until the automation API is up.
  await page.waitForFunction(() => { window.__frames(1); return typeof window.__vd?.step === 'function'; }, null, { timeout: 30000, polling: 50 });
  const ok = await page.evaluate((w) => {
    const vd = window.__vd;
    if (!vd.world().setWeapon(w)) return false;
    vd.startTown();
    // Out from behind the houses at the town centre, onto open ground.
    const k = vd.world().players[0];
    k.x -= 2;
    k.y += 1;
    return true;
  }, weapon);
  if (!ok) throw new Error(`could not choose weapon "${weapon}"`);

  const idle = { move: { x: 0, y: 0 }, attack: false, dodge: false, ability1: false, ability2: false, rally: false, pause: false };
  for (const [view, dir] of Object.entries(VIEWS)) {
    // Turn to face `dir`, settle, then start one attack.
    await page.evaluate(({ idle, dir }) => {
      const vd = window.__vd;
      vd.setInput({ ...idle, move: dir }); vd.step(3);
      vd.setInput(idle); vd.step(30);
      window.__frames(40);
      vd.setInput({ ...idle, attack: true }); vd.step(1);
      vd.setInput(idle);
    }, { idle, dir });
    const shots = [];
    let t = 0;
    for (const target of times) {
      // At least one frame, so the attack's first frame is drawn for t = 0.
      const n = Math.round((target - t) * FPS);
      await page.evaluate(([n, ms]) => window.__frames(Math.max(1, n), n > 0 ? ms : 0.001), [n, 1000 / FPS]);
      t = target;
      const f = await page.evaluate(() => { const k = window.__vd.world().players[0]; return window.__vd.screenOf(k.x, k.y); });
      const png = await page.screenshot({ clip: { x: f.x - FRAME.width / 2, y: f.y - FRAME.height * 0.76, ...FRAME } });
      shots.push({ t: target, src: `data:image/png;base64,${png.toString('base64')}` });
    }
    await page.evaluate(() => { window.__vd.step(40); window.__frames(40); });
    await saveStrip(`screenshots/anim-${weapon}-${view}.png`, shots);
    console.log(`screenshots/anim-${weapon}-${view}.png`);
  }
} finally {
  await browser.close();
}
if (errors.length) {
  console.error('Page errors:\n' + errors.join('\n'));
  process.exit(1);
}

/** Lays the frames side by side, each labelled with its time, and saves the row. */
async function saveStrip(path, shots) {
  const page = await browser.newPage({ viewport: { width: FRAME.width * shots.length, height: FRAME.height } });
  const cells = shots.map(({ t, src }) =>
    `<div style="position:relative"><img src="${src}"><span style="position:absolute;left:4px;top:2px;font:12px sans-serif;background:#fffc;padding:0 3px">${t.toFixed(2)}s</span></div>`).join('');
  await page.setContent(`<body style="margin:0;display:flex">${cells}</body>`);
  await page.screenshot({ path });
  await page.close();
}
