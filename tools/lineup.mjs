// Character close-ups for designing monster bodies (render3d/bodies.ts). Needs the dev server (port 5173).
//
//   node tools/lineup.mjs [--town <id>] <kind> [compare...]
//   node tools/lineup.mjs shieldbearer swordsman orc
//   node tools/lineup.mjs --town riverside zombie orc     (kinds as that town draws them: TownDef.looks)
//
// For each kind, one row: front, side, back (idle), mid-walk and mid-attack. Friendly kinds
// (knight, swordsman, archer) work too, for comparison. Saves screenshots/lineup-<kind>.png
// (lineup-<town>-<kind>.png with --town).

import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.VD_URL ?? 'http://localhost:5173/';
const args = process.argv.slice(2);
const townAt = args.indexOf('--town');
const town = townAt >= 0 ? args.splice(townAt, 2)[1] : null;
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
const GAP = 1.6;

mkdirSync('screenshots', { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const errors = [];
try {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  // Seed 1's town, paused (speed=0) so nothing moves on its own; the row stands on the open road.
  await page.goto(`${BASE}?seed=1&plan=0&god=1&speed=0&dpr=3${town ? `&town=${town}` : ''}`);
  await page.waitForFunction(() => typeof window.__vd?.step === 'function', null, { timeout: 30000 });
  await page.evaluate(() => window.__vd.startTown?.());

  for (const kind of kinds) {
    const boxes = await page.evaluate(({ kind, VIEWS, GAP }) => {
      const vd = window.__vd;
      const w = vd.world();
      // Clear the stage, then stand one copy per view in a row on the road south of the crossroads.
      w.monsters.length = 0;
      w.rookies.length = 0;
      const c = w.map.centre;
      const k = w.players[0];
      const friendly = ['knight', 'swordsman', 'archer'].includes(kind);
      const units = VIEWS.map((v, n) => {
        const x = c + 0.5;
        // Out past the houses, so no building hides a copy.
        const y = c + 9 + n * GAP;
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
      return units.filter(Boolean).map((u) => ({ id: u.id, ...vd.screenOf(u.x, u.y) }));
    }, { kind, VIEWS, GAP });
    // Let the walk/attack clips play a little, then capture each copy.
    await page.waitForTimeout(450);
    const xs = boxes.map((b) => b.x);
    const ys = boxes.map((b) => b.y);
    const pad = 90;
    const clip = {
      x: Math.max(0, Math.min(...xs) - pad), y: Math.max(0, Math.min(...ys) - 150),
      width: Math.max(...xs) - Math.min(...xs) + pad * 2, height: Math.max(...ys) - Math.min(...ys) + 200,
    };
    const path = `screenshots/lineup-${town ? `${town}-` : ''}${kind}.png`;
    await page.screenshot({ path, clip, scale: 'device' });
    console.log(path);
  }
} finally {
  await browser.close();
}
if (errors.length) {
  console.error('Page errors:\n' + errors.join('\n'));
  process.exit(1);
}
