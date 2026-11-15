import { defineConfig } from 'vite';
import { cpSync } from 'node:fs';
import { resolve } from 'node:path';

const root = import.meta.dirname;

export default defineConfig({
  // Relative asset URLs, so the build runs from any sub-path (GitHub Pages serves /VillageDefender/).
  base: './',
  server: { port: 5173, strictPort: true },
  build: {
    rollupOptions: {
      // The bake page is a dev-only tool; only the game is built.
      input: { main: resolve(root, 'index.html') },
    },
  },
  plugins: [
    {
      // The 3D renderer loads the GLB models at runtime; the dev server serves them from the
      // project root, the build needs its own copy. (Port plan phase 2 moves them to public/.)
      name: 'copy-models',
      apply: 'build',
      closeBundle() {
        cpSync(resolve(root, 'assets-src/models'), resolve(root, 'dist/assets-src/models'), { recursive: true });
      },
    },
  ],
});
