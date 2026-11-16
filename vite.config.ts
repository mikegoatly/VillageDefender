import { configDefaults, defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
import { pwaPlugin } from './tools/pwa-plugin.mjs';

const GOLDEN = 'tests/sim/golden.test.ts';

export default defineConfig({
  // Relative asset URLs, so the build runs from any sub-path (GitHub Pages serves /VillageDefender/).
  base: './',
  plugins: [pwaPlugin()],
  server: { port: 5173, strictPort: true },
  build: {
    rollupOptions: {
      input: { main: resolve(import.meta.dirname, 'index.html') },
    },
  },
  test: {
    // `npm test` runs the fast "unit" project. The golden sim fingerprints play whole levels
    // (about half the suite's time): run them with `npm run test:golden` when changing the sim.
    projects: [
      { extends: true, test: { name: 'unit', exclude: [...configDefaults.exclude, GOLDEN] } },
      { extends: true, test: { name: 'golden', include: [GOLDEN], testTimeout: 30_000 } },
    ],
  },
});
