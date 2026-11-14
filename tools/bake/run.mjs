// Bakes GLB models into sprite sheets in public/assets/sprites.
//
//   npm run bake                 bake everything in specs.mjs
//   npm run bake -- knight orc   bake only the named specs
//   npm run bake -- --measure character-human mini-dungeon/...
//                                print world-space bounds of models (model paths)

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { globals, specs } from './specs.mjs';

const OUT = 'public/assets/sprites';
const args = process.argv.slice(2);
const measureMode = args[0] === '--measure';

const server = await createServer({ server: { port: 5199, strictPort: true }, logLevel: 'warn' });
await server.listen();
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

try {
  const page = await browser.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.error('[page]', m.text()); });
  page.on('pageerror', (e) => console.error('[page]', e.message));
  await page.goto('http://localhost:5199/tools/bake/page/index.html');
  await page.waitForFunction(() => window.bakeReady === true, null, { timeout: 30000 });

  if (measureMode) {
    for (const model of args.slice(1)) {
      const b = await page.evaluate((m) => window.measure(m), model);
      const size = b.max.map((v, i) => +(v - b.min[i]).toFixed(3));
      console.log(model, 'size', size, 'min', b.min.map((v) => +v.toFixed(3)));
    }
  } else {
    mkdirSync(OUT, { recursive: true });
    const selected = args.length ? specs.filter((s) => args.includes(s.name)) : specs;
    for (const spec of selected) {
      const t0 = Date.now();
      const result = await page.evaluate(([g, s]) => window.bake(g, s), [globals, spec]);
      const png = Buffer.from(result.png.split(',')[1], 'base64');
      writeFileSync(join(OUT, `${spec.name}.png`), png);
      writeFileSync(join(OUT, `${spec.name}.atlas.json`), JSON.stringify(result.atlas));
      writeFileSync(join(OUT, `${spec.name}.json`), JSON.stringify(result.meta, null, 2));
      console.log(`${spec.name}: ${result.meta.frameCount} frames, ${result.atlas.meta.size.w}x${result.atlas.meta.size.h} (${(result.atlas.meta.size.w * result.atlas.meta.size.h * 4 / 1048576).toFixed(2)} MB GPU), ${(png.length / 1024).toFixed(0)} KB, ${Date.now() - t0} ms`);
    }
  }
} finally {
  await browser.close();
  await server.close();
}
