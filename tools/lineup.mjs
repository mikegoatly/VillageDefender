// Character close-ups for designing monster bodies (render3d/bodies.ts). Needs the dev server (port 5173).
//
//   node tools/lineup.mjs [--town <id>] <kind> [compare...]
//   node tools/lineup.mjs shieldbearer swordsman orc
//   node tools/lineup.mjs --town riverside zombie orc     (kinds as that town draws them: TownDef.looks)
//   node tools/lineup.mjs --times 0,0.11,0.22,0.33,0.44,0.56 warlord   (also a walk/attack cycle sheet)
//
// For each kind, one row: front, side, back (idle), mid-walk and mid-attack. Friendly kinds
// (knight, swordsman, archer) work too, for comparison. Saves screenshots/lineup-<kind>.png
// (lineup-<town>-<kind>.png with --town).
//
// --times t1,t2,...: also a cycle sheet, screenshots/lineup-[<town>-]<kind>-cycle.png: one row per
// time (seconds into the clips; the walk loop is 0.67 s, the attack 0.42 s), each showing the walk
// from the front, side and 3/4 and the attack from the side and front, for checking that held
// items never pass through the head at any phase. Render time runs on a fake clock pumped from
// here (requestAnimationFrame is replaced), so frames land at exact times however slow the renderer.

import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.VD_URL ?? 'http://localhost:5173/';
const args = process.argv.slice(2);
const townAt = args.indexOf('--town');
const town = townAt >= 0 ? args.splice(townAt, 2)[1] : null;
const timesAt = args.indexOf('--times');
const times = timesAt >= 0 ? args.splice(timesAt, 2)[1].split(',').map(Number) : null;
const kinds = args;
if (!kinds.length) {
  console.error('Usage: node tools/lineup.mjs <kind> [compare...]');
  process.exit(1);
}
const viewport = { width: 1600, height: 900 };
/** Facings in ground space: towards the camera, its right side, away, then walk and attack (3/4 view). */
const VIEWS = [
  { name: 'front', facing: { x: 0.7071, y: 0.7071 } },
  { name: 'side', facing: { x: 0.7071, y: -0.7071 } },
  { name: 'back', facing: { x: -0.7071, y: -0.7071 } },
  { name: 'walk', facing: { x: 1, y: 0 }, state: 'walk' },
  { name: 'attack', facing: { x: 1, y: 0 }, state: 'attack' },
];
/** The cycle sheet's row: walk and attack from several sides. */
const CYCLE_VIEWS = [
  { name: 'walk front', facing: { x: 0.7071, y: 0.7071 }, state: 'walk' },
  { name: 'walk side', facing: { x: 0.7071, y: -0.7071 }, state: 'walk' },
  { name: 'walk 3/4', facing: { x: 1, y: 0 }, state: 'walk' },
  { name: 'attack side', facing: { x: 0.7071, y: -0.7071 }, state: 'attack' },
  { name: 'attack front', facing: { x: 0.7071, y: 0.7071 }, state: 'attack' },
];
const GAP = 1.6;
const FPS = 60;

mkdirSync('screenshots', { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
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
  // Seed 1's town, paused (speed=0) so nothing moves on its own; the row stands on the open road.
  await page.goto(`${BASE}?seed=1&plan=0&god=1&speed=0&dpr=3${town ? `&town=${town}` : ''}`);
  // The game starts on its first animation frame, so pump frames until the automation API is up.
  await page.waitForFunction(() => { window.__frames(1); return typeof window.__vd?.step === 'function'; }, null, { timeout: 30000, polling: 50 });
  await page.evaluate(() => { window.__vd.startTown?.(); window.__frames(2); });
  const frames = (n) => page.evaluate((n) => window.__frames(Math.max(1, n), n > 0 ? 1000 / 60 : 0.001), n);

  for (const kind of kinds) {
    const crop = await standRow(kind, VIEWS);
    // Let the walk/attack clips play a little (0.45 s), then capture each copy.
    await frames(27);
    const path = `screenshots/lineup-${town ? `${town}-` : ''}${kind}.png`;
    await page.screenshot({ path, clip: crop, scale: 'device' });
    console.log(path);
    if (!times) continue;
    // The cycle sheet: the same row of copies at each time into their clips.
    const cycleCrop = await standRow(kind, CYCLE_VIEWS);
    await frames(1);
    const shots = [];
    let t = 0;
    for (const target of times) {
      await frames(Math.round((target - t) * FPS));
      t = target;
      shots.push({ t: target, png: (await page.screenshot({ clip: cycleCrop })).toString('base64') });
    }
    const cyclePath = `screenshots/lineup-${town ? `${town}-` : ''}${kind}-cycle.png`;
    await sheet(cyclePath, `${kind}: ${CYCLE_VIEWS.map((v) => v.name).join(' · ')}`, shots);
    console.log(cyclePath);
  }

  /** Stacks the shots into one labelled image. */
  async function sheet(path, title, shots) {
    const p = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await p.setContent(`<body style="margin:0;background:#1e1e24;color:#fff;font:16px sans-serif">
      <div style="padding:6px 8px">${title}</div>
      ${shots.map((s) => `<div style="position:relative"><img style="display:block" src="data:image/png;base64,${s.png}"><span style="position:absolute;left:8px;top:6px;background:#0008;padding:2px 6px">t = ${s.t.toFixed(2)} s</span></div>`).join('')}
    </body>`);
    await p.screenshot({ path, fullPage: true });
    await p.close();
  }

  /** Clears the stage, stands one copy of `kind` per view in a row, and returns the crop around them. */
  async function standRow(kind, VIEWS) {
    const { boxes, scale } = await page.evaluate(async ({ kind, VIEWS, GAP }) => {
      const vd = window.__vd;
      // Bosses are drawn 2.4–2.8× bigger: space the copies (and pad the crop) by the draw scale.
      const { MONSTERS } = await import('/src/data/monsters.ts');
      const scale = Math.max(1, MONSTERS[kind]?.scale ?? 1);
      const w = vd.world();
      // Clear the stage, then stand one copy per view in a row on the road south of the crossroads.
      w.monsters.length = 0;
      w.rookies.length = 0;
      const c = w.map.centre;
      const k = w.players[0];
      const friendly = ['knight', 'swordsman', 'archer'].includes(kind);
      // Big units stand in a row across the screen (a column down it would run off the bottom).
      const o = vd.screenOf(c, c);
      const sx = vd.screenOf(c + 1, c);
      const sy = vd.screenOf(c, c + 1);
      let across = { x: sy.y - o.y, y: -(sx.y - o.y) };
      const len = Math.hypot(across.x, across.y);
      across = { x: across.x / len, y: across.y / len };
      if (across.x * (sx.x - o.x) + across.y * (sy.x - o.x) < 0) across = { x: -across.x, y: -across.y };
      const units = VIEWS.map((v, n) => {
        // Out past the houses, so no building hides a copy.
        // Shifted a little to the right: the left end would run off the screen.
        const along = (n - (VIEWS.length - 1) / 2 + 0.6) * GAP * scale * 0.7;
        const x = scale > 1 ? c + 0.5 + across.x * along : c + 0.5;
        const y = scale > 1 ? c + 9 + across.y * along : c + 9 + n * GAP;
        let u;
        if (kind === 'knight') {
          if (n > 0) return null;
          u = k;
          u.x = x; u.y = y;
        } else if (friendly) u = w.addRookie(x, y, kind);
        else {
          w.debugSpawn(kind, 1, { x, y });
          u = w.monsters[w.monsters.length - 1];
          u.x = x; u.y = y;
        }
        u.speed = 0;
        u.facing = v.facing;
        u.state = v.state ?? 'idle';
        u.moving = v.state === 'walk';
        u.stateTime = 0;
        return u;
      });
      if (kind !== 'knight') { k.x = c - 6; k.y = c - 6; }
      return { scale, boxes: units.filter(Boolean).map((u) => ({ id: u.id, ...vd.screenOf(u.x, u.y) })) };
    }, { kind, VIEWS, GAP });
    const xs = boxes.map((b) => b.x);
    const ys = boxes.map((b) => b.y);
    const pad = (scale > 1 ? 80 : 90) * scale;
    const x0 = Math.max(0, Math.min(...xs) - pad);
    const y0 = Math.max(0, Math.min(...ys) - (scale > 1 ? 120 : 150) * scale);
    return {
      x: x0, y: y0,
      width: Math.min(viewport.width - x0, Math.max(...xs) - x0 + pad), height: Math.min(viewport.height - y0, Math.max(...ys) - y0 + (scale > 1 ? 25 : 50) * scale),
    };
  }
} finally {
  await browser.close();
}
if (errors.length) {
  console.error('Page errors:\n' + errors.join('\n'));
  process.exit(1);
}
